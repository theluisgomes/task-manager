import { and, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { appliedAmount, computeDueDateFromInput, formatLocalDate, parseLocalDate } from "../shared/billing";
import { hasMinRole } from "../shared/roles";
import {
  nextProposalNumber,
  proposalTotal,
  type ProposalInstallment,
  type ProposalItem,
  type ProposalStatus,
} from "../shared/proposals";
import {
  alertSettings,
  boards,
  calendarEvents,
  contractPayments,
  contracts,
  leads,
  paymentReminderLog,
  projectMembers,
  proposals,
  projects,
  taskAssignees,
  taskDependencies,
  tasks,
  timesheets,
  userContractAllocations,
  userEmploymentContracts,
  users,
} from "../drizzle/schema";
import { getDb, getProjectById, getProjectIdsForUser, getTaskById, getUserById } from "./db";
import { sendEmail } from "./email";

function parseDecimal(value: string | null | undefined): number {
  if (value == null) return 0;
  const n = parseFloat(value);
  return Number.isNaN(n) ? 0 : n;
}

function workDate(value: string) {
  return value.slice(0, 10);
}

function monthStart(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}-01`;
}

function formatWorkDate(date: Date | string) {
  if (typeof date === "string") return date.slice(0, 10);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function loadEmploymentRates() {
  const rows = await listEmploymentContracts();
  const rates = new Map<number, number>();
  for (const row of rows) {
    if (rates.has(row.userId)) continue;
    const rate = parseDecimal(row.hourlyRate);
    if (rate) rates.set(row.userId, rate);
  }
  return rates;
}

function rateForHours(lineRate: string | null | undefined, userId: number, employmentRates: Map<number, number>) {
  return parseDecimal(lineRate) || employmentRates.get(userId) || 0;
}

async function getManagedProjectIds(userId: number): Promise<Set<number>> {
  const db = await getDb();
  if (!db) return new Set();
  const rows = await db
    .select({ projectId: projectMembers.projectId, role: projectMembers.role })
    .from(projectMembers)
    .where(eq(projectMembers.userId, userId));
  return new Set(rows.filter((r) => hasMinRole(r.role, "admin")).map((r) => r.projectId));
}

// ─── Task Dependencies ────────────────────────────────────────────────────────

export async function getTaskDependencies(taskId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: taskDependencies.id,
      taskId: taskDependencies.taskId,
      dependsOnTaskId: taskDependencies.dependsOnTaskId,
      blockerTitle: tasks.title,
      blockerStatus: tasks.status,
    })
    .from(taskDependencies)
    .innerJoin(tasks, eq(taskDependencies.dependsOnTaskId, tasks.id))
    .where(eq(taskDependencies.taskId, taskId));
}

export async function getBlockedTaskIds(boardId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const boardTasks = await db.select({ id: tasks.id, status: tasks.status }).from(tasks).where(eq(tasks.boardId, boardId));
  const taskMap = new Map(boardTasks.map((t) => [t.id, t.status]));
  const deps = await db
    .select({ taskId: taskDependencies.taskId, dependsOnTaskId: taskDependencies.dependsOnTaskId })
    .from(taskDependencies)
    .where(inArray(taskDependencies.taskId, boardTasks.map((t) => t.id)));
  const blocked: number[] = [];
  for (const dep of deps) {
    if (taskMap.get(dep.dependsOnTaskId) !== "done") blocked.push(dep.taskId);
  }
  return Array.from(new Set(blocked));
}

async function wouldCreateCycle(taskId: number, dependsOnTaskId: number, boardId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return true;
  if (taskId === dependsOnTaskId) return true;
  // Every dependency edge connects two tasks on the same board (enforced in addTaskDependency),
  // so it's safe to scope the cycle search to this board instead of scanning all dependencies.
  const allDeps = await db
    .select({ taskId: taskDependencies.taskId, dependsOnTaskId: taskDependencies.dependsOnTaskId })
    .from(taskDependencies)
    .innerJoin(tasks, eq(taskDependencies.taskId, tasks.id))
    .where(eq(tasks.boardId, boardId));
  const graph = new Map<number, number[]>();
  for (const d of allDeps) {
    const list = graph.get(d.taskId) ?? [];
    list.push(d.dependsOnTaskId);
    graph.set(d.taskId, list);
  }
  const visit = (current: number, target: number, seen: Set<number>): boolean => {
    if (current === target) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    for (const next of graph.get(current) ?? []) {
      if (visit(next, target, seen)) return true;
    }
    return false;
  };
  return visit(dependsOnTaskId, taskId, new Set());
}

export async function assertTaskCanComplete(taskId: number): Promise<void> {
  const deps = await getTaskDependencies(taskId);
  const incomplete = deps.filter((d) => d.blockerStatus !== "done");
  if (incomplete.length > 0) {
    throw new Error(`DEPENDENCY_BLOCKED:${incomplete.map((d) => d.blockerTitle).join(", ")}`);
  }
}

export async function addTaskDependency(taskId: number, dependsOnTaskId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [task, blocker] = await Promise.all([getTaskById(taskId), getTaskById(dependsOnTaskId)]);
  if (!task || !blocker) throw new Error("NOT_FOUND");
  if (task.boardId !== blocker.boardId) throw new Error("DIFFERENT_BOARD");
  if (await wouldCreateCycle(taskId, dependsOnTaskId, task.boardId)) throw new Error("CYCLE");
  const result = await db.insert(taskDependencies).values({ taskId, dependsOnTaskId });
  return result[0].insertId;
}

export async function removeTaskDependency(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(taskDependencies).where(eq(taskDependencies.id, id));
}

export async function deleteTaskDependenciesForTask(taskId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(taskDependencies).where(
    or(eq(taskDependencies.taskId, taskId), eq(taskDependencies.dependsOnTaskId, taskId))
  );
}

// ─── Timesheets ───────────────────────────────────────────────────────────────

export async function createTimesheet(data: {
  userId: number;
  projectId: number;
  date: string;
  hours: number;
  description?: string;
  hourlyRate?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(timesheets).values({
    userId: data.userId,
    projectId: data.projectId,
    date: workDate(data.date),
    hours: data.hours.toString(),
    description: data.description ?? null,
    hourlyRate: data.hourlyRate?.toString() ?? null,
  });
  return result[0].insertId;
}

export async function updateTimesheet(id: number, data: Partial<{ date: string; hours: number; description: string; hourlyRate: number }>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const update: Record<string, unknown> = {};
  if (data.date !== undefined) update.date = workDate(data.date);
  if (data.hours !== undefined) update.hours = data.hours.toString();
  if (data.description !== undefined) update.description = data.description;
  if (data.hourlyRate !== undefined) update.hourlyRate = data.hourlyRate.toString();
  await db.update(timesheets).set(update).where(eq(timesheets.id, id));
}

export async function deleteTimesheet(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(timesheets).where(eq(timesheets.id, id));
}

export async function getTimesheetsByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: timesheets.id,
      userId: timesheets.userId,
      projectId: timesheets.projectId,
      date: timesheets.date,
      hours: timesheets.hours,
      description: timesheets.description,
      hourlyRate: timesheets.hourlyRate,
      userName: users.name,
    })
    .from(timesheets)
    .leftJoin(users, eq(timesheets.userId, users.id))
    .where(eq(timesheets.projectId, projectId))
    .orderBy(desc(timesheets.date));
}

export async function getProjectHoursSummary(projectIds: number[]) {
  const db = await getDb();
  if (!db || !projectIds.length) return {} as Record<number, number>;
  const rows = await db
    .select({
      projectId: timesheets.projectId,
      total: sql<string>`COALESCE(SUM(${timesheets.hours}), 0)`,
    })
    .from(timesheets)
    .where(and(inArray(timesheets.projectId, projectIds), gte(timesheets.date, monthStart())))
    .groupBy(timesheets.projectId);
  return Object.fromEntries(rows.map((r) => [r.projectId, parseDecimal(r.total)]));
}

export async function getMyWeekTimesheet(userId: number, weekStart: string, weekEnd: string) {
  const db = await getDb();
  if (!db) return { projects: [], cells: {} as Record<string, number> };
  const user = await getUserById(userId);
  const memberships = user?.role === "admin"
    ? await db
        .select({ id: projects.id, name: projects.name, color: projects.color })
        .from(projects)
        .where(eq(projects.status, "active"))
        .orderBy(projects.name)
    : await db
        .select({ id: projects.id, name: projects.name, color: projects.color })
        .from(projectMembers)
        .innerJoin(projects, eq(projectMembers.projectId, projects.id))
        .where(and(eq(projectMembers.userId, userId), eq(projects.status, "active")))
        .orderBy(projects.name);
  const rows = memberships.length
    ? await db
        .select()
        .from(timesheets)
        .where(and(
          eq(timesheets.userId, userId),
          inArray(timesheets.projectId, memberships.map((m) => m.id)),
          gte(timesheets.date, workDate(weekStart)),
          lte(timesheets.date, workDate(weekEnd)),
        ))
    : [];
  const cells: Record<string, number> = {};
  for (const row of rows) {
    const key = `${row.projectId}:${formatWorkDate(row.date)}`;
    cells[key] = (cells[key] ?? 0) + parseDecimal(row.hours);
  }
  return { projects: memberships, cells };
}

export async function upsertMyTimesheet(
  userId: number,
  projectId: number,
  date: string,
  hours: number,
  options?: { mode?: "set" | "add"; description?: string }
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const mode = options?.mode ?? "set";
  const day = workDate(date);
  const existing = await db
    .select({
      id: timesheets.id,
      hours: timesheets.hours,
      description: timesheets.description,
      hourlyRate: timesheets.hourlyRate,
    })
    .from(timesheets)
    .where(and(
      eq(timesheets.userId, userId),
      eq(timesheets.projectId, projectId),
      eq(timesheets.date, day),
    ));
  const current = existing.reduce((sum, row) => sum + parseDecimal(row.hours), 0);
  const next = mode === "add" ? current + hours : hours;
  const description = options?.description?.trim()
    ? options.description.trim()
    : existing.find((row) => row.description)?.description ?? null;
  const hourlyRate = existing.find((row) => row.hourlyRate)?.hourlyRate ?? null;
  if (existing.length) {
    await db.delete(timesheets).where(inArray(timesheets.id, existing.map((row) => row.id)));
  }
  if (next <= 0) return { hours: 0 };
  await db.insert(timesheets).values({
    userId,
    projectId,
    date: day,
    hours: next.toString(),
    description,
    hourlyRate,
  });
  return { hours: next };
}

// ─── Allocations ──────────────────────────────────────────────────────────────

export async function createAllocation(data: {
  userId: number;
  projectId: number;
  availableHours: number;
  hourlyRate?: number;
  periodStart?: string;
  periodEnd?: string;
  notes?: string;
  createdById: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(userContractAllocations).values({
    userId: data.userId,
    projectId: data.projectId,
    availableHours: data.availableHours.toString(),
    hourlyRate: data.hourlyRate?.toString() ?? null,
    periodStart: data.periodStart ? new Date(data.periodStart) : null,
    periodEnd: data.periodEnd ? new Date(data.periodEnd) : null,
    notes: data.notes ?? null,
    createdById: data.createdById,
  });
  return result[0].insertId;
}

export async function updateAllocation(id: number, data: Partial<{ availableHours: number; hourlyRate: number; periodStart: string; periodEnd: string; notes: string }>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const update: Record<string, unknown> = {};
  if (data.availableHours !== undefined) update.availableHours = data.availableHours.toString();
  if (data.hourlyRate !== undefined) update.hourlyRate = data.hourlyRate.toString();
  if (data.periodStart !== undefined) update.periodStart = data.periodStart ? new Date(data.periodStart) : null;
  if (data.periodEnd !== undefined) update.periodEnd = data.periodEnd ? new Date(data.periodEnd) : null;
  if (data.notes !== undefined) update.notes = data.notes;
  await db.update(userContractAllocations).set(update).where(eq(userContractAllocations.id, id));
}

export async function deleteAllocation(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(userContractAllocations).where(eq(userContractAllocations.id, id));
}

export async function getAllocationsByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: userContractAllocations.id,
      userId: userContractAllocations.userId,
      projectId: userContractAllocations.projectId,
      availableHours: userContractAllocations.availableHours,
      hourlyRate: userContractAllocations.hourlyRate,
      periodStart: userContractAllocations.periodStart,
      periodEnd: userContractAllocations.periodEnd,
      notes: userContractAllocations.notes,
      userName: users.name,
    })
    .from(userContractAllocations)
    .leftJoin(users, eq(userContractAllocations.userId, users.id))
    .where(eq(userContractAllocations.projectId, projectId));
}

// ─── Leads & Contracts ────────────────────────────────────────────────────────

export async function createLead(data: { clientName: string; title: string; projectId?: number; estimatedValue?: number; notes?: string | null; createdById: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(leads).values({
    clientName: data.clientName,
    title: data.title,
    projectId: data.projectId ?? null,
    estimatedValue: data.estimatedValue?.toString() ?? null,
    notes: data.notes ?? null,
    createdById: data.createdById,
  });
  const leadId = result[0].insertId;
  if (data.projectId) await db.update(projects).set({ leadId }).where(eq(projects.id, data.projectId));
  return leadId;
}

export async function getLeadByProject(projectId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select().from(leads).where(eq(leads.projectId, projectId)).limit(1);
  return row;
}

export async function updateLead(id: number, data: Partial<{ isHot: boolean; dueDiligenceNotes: string; dueDiligenceCompletedAt: Date | null; status: "prospecting" | "proposal" | "negotiation" | "won" | "lost"; estimatedValue: number | null; clientName: string; title: string; notes: string | null; projectId: number | null }>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const update: Record<string, unknown> = {};
  if (data.isHot !== undefined) update.isHot = data.isHot;
  if (data.dueDiligenceNotes !== undefined) update.dueDiligenceNotes = data.dueDiligenceNotes;
  if (data.dueDiligenceCompletedAt !== undefined) update.dueDiligenceCompletedAt = data.dueDiligenceCompletedAt;
  if (data.status !== undefined) update.status = data.status;
  if (data.estimatedValue !== undefined) update.estimatedValue = data.estimatedValue == null ? null : data.estimatedValue.toString();
  if (data.clientName !== undefined) update.clientName = data.clientName;
  if (data.title !== undefined) update.title = data.title;
  if (data.notes !== undefined) update.notes = data.notes;
  if (data.projectId !== undefined) update.projectId = data.projectId;
  await db.update(leads).set(update).where(eq(leads.id, id));
  if (data.projectId !== undefined) {
    await db.update(projects).set({ leadId: null }).where(eq(projects.leadId, id));
    if (data.projectId) await db.update(projects).set({ leadId: id }).where(eq(projects.id, data.projectId));
  }
}

export async function createContract(data: { projectId: number; clientName: string; title: string; totalValue: number; budgetedCost?: number; leadId?: number; createdById: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(contracts).values({
    projectId: data.projectId,
    clientName: data.clientName,
    title: data.title,
    totalValue: data.totalValue.toString(),
    budgetedCost: data.budgetedCost?.toString() ?? null,
    leadId: data.leadId ?? null,
    createdById: data.createdById,
  });
  const contractId = result[0].insertId;
  await db.update(projects).set({ contractId }).where(eq(projects.id, data.projectId));
  return contractId;
}

export async function getContractByProject(projectId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const project = await getProjectById(projectId);
  if (project?.contractId) {
    const [row] = await db.select().from(contracts).where(eq(contracts.id, project.contractId)).limit(1);
    if (row) return row;
  }
  const [direct] = await db.select().from(contracts).where(eq(contracts.projectId, projectId)).limit(1);
  return direct;
}

export async function updateContract(id: number, data: Partial<{ totalValue: number; actualRevenue: number | null; actualCost: number | null; budgetedCost: number; status: "draft" | "active" | "completed" | "cancelled" }>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const update: Record<string, unknown> = {};
  if (data.totalValue !== undefined) update.totalValue = data.totalValue.toString();
  if (data.actualRevenue !== undefined) update.actualRevenue = data.actualRevenue == null ? null : data.actualRevenue.toString();
  if (data.actualCost !== undefined) update.actualCost = data.actualCost == null ? null : data.actualCost.toString();
  if (data.budgetedCost !== undefined) update.budgetedCost = data.budgetedCost.toString();
  if (data.status !== undefined) update.status = data.status;
  await db.update(contracts).set(update).where(eq(contracts.id, id));
}

/** Fills a blank contract total from its installments. A total already set by hand stays put. */
export async function syncContractTotalFromPayments(contractId: number) {
  const contract = await getContractById(contractId);
  if (!contract || parseDecimal(contract.totalValue) > 0) return;
  const payments = await getPaymentsByContract(contractId);
  const total = payments
    .filter((payment) => payment.status !== "cancelled")
    .reduce((sum, payment) => sum + parseDecimal(payment.amount), 0);
  if (total <= 0) return;
  await updateContract(contractId, { totalValue: total });
}

export async function ensureProjectContract(projectId: number, userId: number) {
  const existing = await getContractByProject(projectId);
  if (existing) return existing.id;
  const project = await getProjectById(projectId);
  if (!project) throw new Error("NOT_FOUND");
  return createContract({
    projectId,
    clientName: project.name,
    title: project.name,
    totalValue: 0,
    createdById: userId,
  });
}

export async function createContractPayment(data: {
  contractId: number;
  description?: string;
  amount: number;
  dueType?: "fixed" | "relative";
  dueDate?: string;
  baseEventType?: "assinatura" | "entrega";
  baseEventDate?: string;
  daysAfterBase?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const dueType = data.dueType ?? "fixed";
  const computedDueDate = computeDueDateFromInput({
    dueType,
    dueDate: data.dueDate,
    baseEventDate: data.baseEventDate,
    daysAfterBase: data.daysAfterBase,
  });
  const result = await db.insert(contractPayments).values({
    contractId: data.contractId,
    description: data.description ?? null,
    amount: data.amount.toString(),
    dueType,
    baseEventType: dueType === "relative" ? (data.baseEventType ?? null) : null,
    baseEventDate: dueType === "relative" && data.baseEventDate ? parseLocalDate(data.baseEventDate) : null,
    daysAfterBase: dueType === "relative" ? (data.daysAfterBase ?? null) : null,
    dueDate: computedDueDate,
  });
  await syncContractTotalFromPayments(data.contractId);
  return result[0].insertId;
}

export async function updateContractPayment(id: number, data: Partial<{
  description: string;
  amount: number;
  dueType: "fixed" | "relative";
  dueDate: string | null;
  baseEventType: "assinatura" | "entrega" | null;
  baseEventDate: string | null;
  daysAfterBase: number | null;
  deliveryCompleted: boolean;
  invoiceIssued: boolean;
  paymentReceived: boolean;
  paidAt: Date | null;
  status: "pending" | "paid" | "overdue" | "cancelled";
}>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [existing] = await db.select().from(contractPayments).where(eq(contractPayments.id, id)).limit(1);
  if (!existing) throw new Error("NOT_FOUND");

  const dueType = data.dueType ?? existing.dueType ?? "fixed";
  const baseEventType = data.baseEventType !== undefined ? data.baseEventType : existing.baseEventType;
  const baseEventDateRaw = data.baseEventDate !== undefined
    ? data.baseEventDate
    : existing.baseEventDate ? formatLocalDate(existing.baseEventDate) : null;
  const daysAfterBase = data.daysAfterBase !== undefined ? data.daysAfterBase : existing.daysAfterBase;
  const dueDateRaw = data.dueDate !== undefined
    ? data.dueDate
    : existing.dueDate ? formatLocalDate(existing.dueDate) : null;

  const computedDueDate = computeDueDateFromInput({
    dueType,
    dueDate: dueDateRaw,
    baseEventDate: baseEventDateRaw,
    daysAfterBase,
  });

  const update: Record<string, unknown> = {};
  if (data.description !== undefined) update.description = data.description;
  if (data.amount !== undefined) update.amount = data.amount.toString();
  if (
    data.dueType !== undefined ||
    data.dueDate !== undefined ||
    data.baseEventType !== undefined ||
    data.baseEventDate !== undefined ||
    data.daysAfterBase !== undefined
  ) {
    update.dueType = dueType;
    update.dueDate = computedDueDate;
    if (dueType === "relative") {
      update.baseEventType = baseEventType;
      update.baseEventDate = baseEventDateRaw ? parseLocalDate(baseEventDateRaw) : null;
      update.daysAfterBase = daysAfterBase;
    } else {
      update.baseEventType = null;
      update.baseEventDate = null;
      update.daysAfterBase = null;
    }
  }
  if (data.deliveryCompleted !== undefined) update.deliveryCompleted = data.deliveryCompleted;
  if (data.invoiceIssued !== undefined) update.invoiceIssued = data.invoiceIssued;
  if (data.paymentReceived !== undefined) {
    update.paymentReceived = data.paymentReceived;
    if (data.paymentReceived) {
      update.status = "paid";
      update.paidAt = data.paidAt ?? new Date();
    }
  }
  if (data.status !== undefined) update.status = data.status;
  if (data.paidAt !== undefined) update.paidAt = data.paidAt;
  await db.update(contractPayments).set(update).where(eq(contractPayments.id, id));
  await syncContractTotalFromPayments(existing.contractId);
}

export async function getPaymentsByContract(contractId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(contractPayments).where(eq(contractPayments.contractId, contractId)).orderBy(contractPayments.dueDate);
}

export async function linkProspectToSale(prospectProjectId: number, clientProjectId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(projects).set({ linkedProjectId: clientProjectId }).where(eq(projects.id, prospectProjectId));
}

export async function getAcquisitionCost(prospectProjectId: number, acquisitionOwnerId?: number | null) {
  const db = await getDb();
  if (!db) return { hours: 0, cost: 0 };
  const conditions = [eq(timesheets.projectId, prospectProjectId)];
  if (acquisitionOwnerId) conditions.push(eq(timesheets.userId, acquisitionOwnerId));
  const rows = await db.select().from(timesheets).where(and(...conditions));
  const employmentRates = await loadEmploymentRates();
  let hours = 0;
  let cost = 0;
  for (const row of rows) {
    const h = parseDecimal(row.hours);
    hours += h;
    cost += h * rateForHours(row.hourlyRate, row.userId, employmentRates);
  }
  return { hours, cost };
}

export async function getProjectFinanceSummary(projectId: number) {
  const contract = await getContractByProject(projectId);
  const costRows = await getTimesheetsByProject(projectId);
  const employmentRates = await loadEmploymentRates();
  let totalHours = 0;
  let computedActualCost = 0;
  for (const r of costRows) {
    const hours = parseDecimal(r.hours);
    totalHours += hours;
    computedActualCost += hours * rateForHours(r.hourlyRate, r.userId, employmentRates);
  }
  const payments = contract ? await getPaymentsByContract(contract.id) : [];
  const openPayments = payments.filter((payment) => payment.status !== "cancelled");
  const paymentTotal = openPayments.reduce((sum, payment) => sum + parseDecimal(payment.amount), 0);
  const computedActualRevenue = openPayments
    .filter((payment) => payment.paymentReceived)
    .reduce((sum, payment) => sum + parseDecimal(payment.amount), 0);
  const revenue = appliedAmount(contract?.actualRevenue, computedActualRevenue);
  const cost = appliedAmount(contract?.actualCost, computedActualCost);
  const budgetedRevenue = contract ? parseDecimal(contract.totalValue) || paymentTotal : 0;
  const budgetedCost = contract ? parseDecimal(contract.budgetedCost) : 0;
  return {
    budgetedRevenue,
    actualRevenue: revenue.amount,
    computedActualRevenue,
    revenueAdjusted: revenue.adjusted,
    budgetedCost,
    actualCost: cost.amount,
    computedActualCost,
    costAdjusted: cost.adjusted,
    budgetedProfit: budgetedRevenue - budgetedCost,
    actualProfit: revenue.amount - cost.amount,
    totalHours,
  };
}

export async function updateProjectFinance(
  projectId: number,
  userId: number,
  data: { budgetedRevenue?: number; actualRevenue?: number | null; actualCost?: number | null }
) {
  const contractId = await ensureProjectContract(projectId, userId);
  const update: Partial<{ totalValue: number; actualRevenue: number | null; actualCost: number | null }> = {};
  if (data.budgetedRevenue !== undefined) update.totalValue = data.budgetedRevenue;
  if (data.actualRevenue !== undefined) update.actualRevenue = data.actualRevenue;
  if (data.actualCost !== undefined) update.actualCost = data.actualCost;
  await updateContract(contractId, update);
}

export async function getFinanceSummaryForUser(userId: number, isAdmin: boolean) {
  let projectIds = await getProjectIdsForUser(userId, isAdmin);
  if (!isAdmin) {
    const managed = await getManagedProjectIds(userId);
    projectIds = projectIds.filter((id) => managed.has(id));
  }
  const summaries = await Promise.all(
    projectIds.map(async (id) => {
      const [project, summary] = await Promise.all([getProjectById(id), getProjectFinanceSummary(id)]);
      return { projectId: id, projectName: project?.name ?? "", area: project?.area ?? "clientes", ...summary };
    })
  );
  const totals = summaries.reduce(
    (acc, s) => ({
      budgetedRevenue: acc.budgetedRevenue + s.budgetedRevenue,
      actualRevenue: acc.actualRevenue + s.actualRevenue,
      budgetedCost: acc.budgetedCost + s.budgetedCost,
      actualCost: acc.actualCost + s.actualCost,
      budgetedProfit: acc.budgetedProfit + s.budgetedProfit,
      actualProfit: acc.actualProfit + s.actualProfit,
    }),
    { budgetedRevenue: 0, actualRevenue: 0, budgetedCost: 0, actualCost: 0, budgetedProfit: 0, actualProfit: 0 }
  );
  return { projects: summaries, totals };
}

export async function getTeamUtilization(userId: number, isAdmin: boolean) {
  const db = await getDb();
  if (!db) return [];
  const projectIds = await getProjectIdsForUser(userId, isAdmin);
  if (!projectIds.length) return [];
  const allocations = await db
    .select({
      userId: userContractAllocations.userId,
      projectId: userContractAllocations.projectId,
      availableHours: userContractAllocations.availableHours,
      hourlyRate: userContractAllocations.hourlyRate,
      userName: users.name,
      projectName: projects.name,
    })
    .from(userContractAllocations)
    .leftJoin(users, eq(userContractAllocations.userId, users.id))
    .leftJoin(projects, eq(userContractAllocations.projectId, projects.id))
    .where(inArray(userContractAllocations.projectId, projectIds));
  const worked = await db
    .select({
      userId: timesheets.userId,
      projectId: timesheets.projectId,
      totalHours: sql<string>`COALESCE(SUM(${timesheets.hours}), 0)`,
      userName: users.name,
      projectName: projects.name,
    })
    .from(timesheets)
    .leftJoin(users, eq(timesheets.userId, users.id))
    .leftJoin(projects, eq(timesheets.projectId, projects.id))
    .where(inArray(timesheets.projectId, projectIds))
    .groupBy(timesheets.userId, timesheets.projectId, users.name, projects.name);
  const workedMap = new Map(worked.map((w) => [`${w.userId}-${w.projectId}`, w]));
  const rows = allocations.map((a) => ({
    userId: a.userId,
    projectId: a.projectId,
    userName: a.userName,
    projectName: a.projectName,
    availableHours: parseDecimal(a.availableHours),
    hourlyRate: parseDecimal(a.hourlyRate),
    workedHours: parseDecimal(workedMap.get(`${a.userId}-${a.projectId}`)?.totalHours),
  }));
  const covered = new Set(rows.map((row) => `${row.userId}-${row.projectId}`));
  for (const entry of worked) {
    const key = `${entry.userId}-${entry.projectId}`;
    if (covered.has(key)) continue;
    rows.push({
      userId: entry.userId,
      projectId: entry.projectId,
      userName: entry.userName,
      projectName: entry.projectName,
      availableHours: 0,
      hourlyRate: 0,
      workedHours: parseDecimal(entry.totalHours),
    });
  }
  return rows;
}

export type CalendarEventType =
  | "payment"
  | "task"
  | "lead_close"
  | "proposal_valid"
  | "contract_start"
  | "contract_end"
  | "contract_event";

export async function getCalendarEvents(userId: number, isAdmin: boolean, start: Date, end: Date) {
  const db = await getDb();
  if (!db) return [];
  const inRange = (d: Date | null | undefined): d is Date => d != null && d >= start && d <= end;
  const events: Array<{
    id: string;
    type: CalendarEventType;
    title: string;
    date: Date;
    endDate?: Date | null;
    description?: string | null;
    projectId?: number;
    projectName?: string;
    amount?: number;
    paymentId?: number;
    taskId?: number;
    leadId?: number;
    proposalId?: number;
    contractId?: number;
    calendarEventId?: number;
    kind?: "reuniao" | "entrega" | "marco" | "outro";
    allDay?: boolean;
    dueType?: "fixed" | "relative";
    baseEventType?: "assinatura" | "entrega" | null;
    daysAfterBase?: number | null;
    deliveryCompleted?: boolean;
    invoiceIssued?: boolean;
    paymentReceived?: boolean;
    canManagePayment?: boolean;
  }> = [];

  const openLeads = (await listAllLeads(userId, isAdmin)).filter(
    ({ lead }) => lead.status !== "won" && lead.status !== "lost" && inRange(lead.expectedCloseDate)
  );
  for (const { lead, projectName } of openLeads) {
    events.push({
      id: `lead-${lead.id}`,
      type: "lead_close",
      title: `Fechamento previsto: ${lead.clientName} · ${lead.title}`,
      date: lead.expectedCloseDate!,
      leadId: lead.id,
      projectId: lead.projectId ?? undefined,
      projectName: projectName ?? undefined,
    });
  }

  const sentProposals = await listProposals(userId, isAdmin, { status: "sent" });
  for (const { proposal } of sentProposals) {
    if (!inRange(proposal.validUntil)) continue;
    events.push({
      id: `proposal-${proposal.id}`,
      type: "proposal_valid",
      title: `Validade da proposta ${proposal.number}: ${proposal.clientName}`,
      date: proposal.validUntil,
      proposalId: proposal.id,
      leadId: proposal.leadId ?? undefined,
      projectId: proposal.projectId ?? undefined,
    });
  }

  const projectIds = await getProjectIdsForUser(userId, isAdmin);
  if (!projectIds.length) return events.sort((a, b) => a.date.getTime() - b.date.getTime());
  const managedProjectIds = await getManagedProjectIds(userId);
  const projectRows = await db.select().from(projects).where(inArray(projects.id, projectIds));
  const projectsById = new Map(projectRows.map((p) => [p.id, p]));
  const projectContracts = await db.select().from(contracts).where(inArray(contracts.projectId, projectIds));
  const contractsById = new Map(projectContracts.map((c) => [c.id, c]));
  for (const contract of projectContracts) {
    if (contract.status === "cancelled") continue;
    const projectName = contract.projectId ? projectsById.get(contract.projectId)?.name : undefined;
    const base = { contractId: contract.id, projectId: contract.projectId ?? undefined, projectName };
    if (inRange(contract.startDate)) {
      events.push({ ...base, id: `contract-start-${contract.id}`, type: "contract_start", title: `Início do contrato: ${contract.title}`, date: contract.startDate });
    }
    if (inRange(contract.endDate)) {
      events.push({ ...base, id: `contract-end-${contract.id}`, type: "contract_end", title: `Fim do contrato: ${contract.title}`, date: contract.endDate });
    }
  }
  if (contractsById.size) {
    const manual = await db
      .select()
      .from(calendarEvents)
      .where(and(
        inArray(calendarEvents.contractId, Array.from(contractsById.keys())),
        lte(calendarEvents.startAt, end),
        or(gte(calendarEvents.startAt, start), gte(calendarEvents.endAt, start))
      ));
    for (const ev of manual) {
      const contract = contractsById.get(ev.contractId);
      const projectId = ev.projectId ?? contract?.projectId ?? undefined;
      events.push({
        id: `event-${ev.id}`,
        type: "contract_event",
        title: ev.title,
        description: ev.description,
        date: ev.startAt,
        endDate: ev.endAt,
        allDay: ev.allDay,
        kind: ev.kind,
        calendarEventId: ev.id,
        contractId: ev.contractId,
        projectId,
        projectName: projectId ? projectsById.get(projectId)?.name : undefined,
      });
    }
  }
  const contractIds = projectContracts.map((c) => c.id);
  const allPayments = contractIds.length
    ? await db.select().from(contractPayments).where(inArray(contractPayments.contractId, contractIds)).orderBy(contractPayments.dueDate)
    : [];
  const paymentsByContract = new Map<number, typeof allPayments>();
  for (const p of allPayments) {
    const list = paymentsByContract.get(p.contractId) ?? [];
    list.push(p);
    paymentsByContract.set(p.contractId, list);
  }
  for (const contract of projectContracts) {
    const payments = paymentsByContract.get(contract.id) ?? [];
    const project = contract.projectId ? projectsById.get(contract.projectId) : undefined;
    const canSeeAmount = isAdmin || (contract.projectId != null && managedProjectIds.has(contract.projectId));
    const canManagePayment = canSeeAmount;
    for (const p of payments) {
      if (p.dueDate && p.dueDate >= start && p.dueDate <= end) {
        events.push({
          id: `payment-${p.id}`,
          type: "payment",
          title: p.description ?? contract.title,
          date: p.dueDate,
          projectId: contract.projectId ?? undefined,
          projectName: project?.name,
          amount: canSeeAmount ? parseDecimal(p.amount) : undefined,
          paymentId: p.id,
          dueType: p.dueType ?? "fixed",
          baseEventType: p.baseEventType,
          daysAfterBase: p.daysAfterBase,
          deliveryCompleted: p.deliveryCompleted,
          invoiceIssued: p.invoiceIssued,
          paymentReceived: p.paymentReceived,
          canManagePayment,
        });
      }
    }
  }
  const userBoards = await db.select({ id: boards.id, projectId: boards.projectId }).from(boards).where(inArray(boards.projectId, projectIds));
  if (userBoards.length) {
    const taskRows = await db
      .select({ task: tasks, projectId: boards.projectId })
      .from(tasks)
      .innerJoin(boards, eq(tasks.boardId, boards.id))
      .where(and(inArray(tasks.boardId, userBoards.map((b) => b.id)), gte(tasks.dueDate, start), lte(tasks.dueDate, end)));
    for (const row of taskRows) {
      if (!row.task.dueDate) continue;
      const project = projectsById.get(row.projectId);
      events.push({
        id: `task-${row.task.id}`,
        type: "task",
        title: row.task.title,
        date: row.task.dueDate,
        projectId: row.projectId,
        projectName: project?.name,
        taskId: row.task.id,
      });
    }
  }
  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}

// ─── Calendar events (manual, per contract) ───────────────────────────────────

export type CalendarEventInput = {
  title: string;
  description?: string | null;
  startAt: string;
  endAt?: string | null;
  allDay?: boolean;
  kind?: "reuniao" | "entrega" | "marco" | "outro";
};

function calendarEventValues(data: CalendarEventInput) {
  return {
    title: data.title,
    description: data.description ?? null,
    startAt: data.allDay === false ? new Date(data.startAt) : parseLocalDate(data.startAt),
    endAt: data.endAt ? (data.allDay === false ? new Date(data.endAt) : parseLocalDate(data.endAt)) : null,
    allDay: data.allDay ?? true,
    kind: data.kind ?? "outro",
  };
}

export async function getContractById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
  return row;
}

export async function getCalendarEventById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, id)).limit(1);
  return row;
}

export async function listCalendarEventsByContract(contractId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(calendarEvents).where(eq(calendarEvents.contractId, contractId)).orderBy(calendarEvents.startAt);
}

async function completeDeliveryPayments(contractId: number, eventStart: Date) {
  const payments = await getPaymentsByContract(contractId);
  const day = formatLocalDate(eventStart);
  for (const payment of payments) {
    if (payment.status === "cancelled" || payment.baseEventType !== "entrega") continue;
    if (payment.deliveryCompleted && payment.baseEventDate) continue;
    await updateContractPayment(payment.id, {
      deliveryCompleted: true,
      ...(payment.baseEventDate
        ? {}
        : {
            dueType: "relative",
            baseEventType: "entrega",
            baseEventDate: day,
            daysAfterBase: payment.daysAfterBase ?? undefined,
          }),
    });
  }
}

export async function createCalendarEvent(data: CalendarEventInput & { contractId: number; projectId: number | null; createdById: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const values = calendarEventValues(data);
  const result = await db.insert(calendarEvents).values({
    ...values,
    contractId: data.contractId,
    projectId: data.projectId,
    createdById: data.createdById,
  });
  if (values.kind === "entrega") await completeDeliveryPayments(data.contractId, values.startAt);
  return result[0].insertId;
}

export async function updateCalendarEvent(id: number, data: CalendarEventInput) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await getCalendarEventById(id);
  const values = calendarEventValues(data);
  await db.update(calendarEvents).set(values).where(eq(calendarEvents.id, id));
  if (values.kind === "entrega" && existing) await completeDeliveryPayments(existing.contractId, values.startAt);
}

export async function deleteCalendarEvent(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
}

/** Contracts the user can attach calendar events to, labelled with their project. */
export async function listContractsForUser(userId: number, isAdmin: boolean) {
  const db = await getDb();
  if (!db) return [];
  const projectIds = await getProjectIdsForUser(userId, isAdmin);
  if (!projectIds.length) return [];
  return db
    .select({ id: contracts.id, title: contracts.title, clientName: contracts.clientName, status: contracts.status, projectId: contracts.projectId, projectName: projects.name })
    .from(contracts)
    .leftJoin(projects, eq(contracts.projectId, projects.id))
    .where(inArray(contracts.projectId, projectIds))
    .orderBy(projects.name);
}

export async function getAlertSettings() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(alertSettings);
}

export async function updateAlertSetting(id: number, data: Partial<{ daysBefore: number; enabled: boolean; notifyAdmin: boolean }>, updatedById: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(alertSettings).set({ ...data, updatedById }).where(eq(alertSettings.id, id));
}

export async function getUpcomingAlerts(isAdmin: boolean) {
  if (!isAdmin) return [];
  const db = await getDb();
  if (!db) return [];
  const settings = await getAlertSettings();
  const paymentSetting = settings.find((s) => s.type === "payment_due" && s.enabled);
  const daysBefore = paymentSetting?.daysBefore ?? 3;
  const now = new Date();
  const threshold = new Date(now.getTime() + daysBefore * 24 * 60 * 60 * 1000);
  const allPayments = await db
    .select()
    .from(contractPayments)
    .where(and(eq(contractPayments.paymentReceived, false), lte(contractPayments.dueDate, threshold)));
  const alerts: Array<{ type: string; paymentId?: number; leadId?: number; dueDate?: Date; amount?: number; title?: string }> = [];
  for (const p of allPayments) {
    if (p.dueDate && p.dueDate <= threshold && p.dueDate >= now) {
      alerts.push({ type: "payment_due", paymentId: p.id, dueDate: p.dueDate, amount: parseDecimal(p.amount) });
    }
    if (p.dueDate && p.dueDate < now && !p.paymentReceived) {
      alerts.push({ type: "payment_overdue", paymentId: p.id, dueDate: p.dueDate, amount: parseDecimal(p.amount) });
    }
    if (p.dueDate && p.dueDate <= threshold && !p.deliveryCompleted) {
      alerts.push({ type: "delivery_due", paymentId: p.id, dueDate: p.dueDate });
    }
    if (p.dueDate && p.dueDate <= threshold && p.deliveryCompleted && !p.invoiceIssued) {
      alerts.push({ type: "invoice_due", paymentId: p.id, dueDate: p.dueDate });
    }
  }
  const hotLeads = await db.select().from(leads).where(and(eq(leads.isHot, true), eq(leads.status, "prospecting")));
  for (const lead of hotLeads) {
    alerts.push({ type: "hot_lead", leadId: lead.id, title: lead.title });
  }
  return alerts;
}

const PRIORITY_RANK: Record<string, number> = { very_high: 0, high: 1, normal: 2 };

export async function getStrategicOverview(userId: number, isAdmin: boolean, limit = 10) {
  const db = await getDb();
  if (!db) return [];
  const projectIds = await getProjectIdsForUser(userId, isAdmin);
  if (!projectIds.length) return [];

  const activeProjects = await db
    .select()
    .from(projects)
    .where(and(inArray(projects.id, projectIds), eq(projects.status, "active")));

  activeProjects.sort((a, b) => {
    const ra = PRIORITY_RANK[a.strategicPriority ?? "normal"] ?? 2;
    const rb = PRIORITY_RANK[b.strategicPriority ?? "normal"] ?? 2;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });

  const top = activeProjects.slice(0, limit);
  if (!top.length) return [];

  const topIds = top.map((p) => p.id);
  const allBoards = await db
    .select()
    .from(boards)
    .where(inArray(boards.projectId, topIds))
    .orderBy(boards.createdAt);
  const canonicalByProject = new Map<number, (typeof allBoards)[0]>();
  for (const b of allBoards) {
    if (!canonicalByProject.has(b.projectId)) canonicalByProject.set(b.projectId, b);
  }

  const boardIds = Array.from(canonicalByProject.values()).map((b) => b.id);
  const boardTasks = boardIds.length
    ? await db.select().from(tasks).where(inArray(tasks.boardId, boardIds))
    : [];
  const tasksByBoard = new Map<number, typeof boardTasks>();
  for (const t of boardTasks) {
    const list = tasksByBoard.get(t.boardId) ?? [];
    list.push(t);
    tasksByBoard.set(t.boardId, list);
  }

  const taskIds = boardTasks.map((t) => t.id);
  const deps = taskIds.length
    ? await db
        .select({ taskId: taskDependencies.taskId, dependsOnTaskId: taskDependencies.dependsOnTaskId })
        .from(taskDependencies)
        .where(inArray(taskDependencies.taskId, taskIds))
    : [];
  const statusById = new Map(boardTasks.map((t) => [t.id, t.status]));
  const blockedSet = new Set<number>();
  for (const d of deps) {
    if (statusById.get(d.dependsOnTaskId) !== "done") blockedSet.add(d.taskId);
  }

  const assigneeRows = taskIds.length
    ? await db
        .select({ taskId: taskAssignees.taskId, userId: taskAssignees.userId, name: users.name })
        .from(taskAssignees)
        .leftJoin(users, eq(taskAssignees.userId, users.id))
        .where(inArray(taskAssignees.taskId, taskIds))
    : [];
  const assigneesByTask = new Map<number, Array<{ id: number; name: string | null }>>();
  for (const row of assigneeRows) {
    const list = assigneesByTask.get(row.taskId) ?? [];
    list.push({ id: row.userId, name: row.name });
    assigneesByTask.set(row.taskId, list);
  }

  const projectContracts = await db.select().from(contracts).where(inArray(contracts.projectId, topIds));
  const contractByProject = new Map<number, (typeof projectContracts)[0]>();
  for (const c of projectContracts) {
    if (c.projectId != null && !contractByProject.has(c.projectId)) contractByProject.set(c.projectId, c);
  }
  const contractIds = projectContracts.map((c) => c.id);
  const payments = contractIds.length
    ? await db.select().from(contractPayments).where(inArray(contractPayments.contractId, contractIds))
    : [];
  const paymentsByContract = new Map<number, typeof payments>();
  for (const p of payments) {
    const list = paymentsByContract.get(p.contractId) ?? [];
    list.push(p);
    paymentsByContract.set(p.contractId, list);
  }

  const timesheetAgg = await db
    .select({
      projectId: timesheets.projectId,
      userId: timesheets.userId,
      totalHours: sql<string>`COALESCE(SUM(${timesheets.hours}), 0)`,
      lineRate: sql<string | null>`MAX(${timesheets.hourlyRate})`,
    })
    .from(timesheets)
    .where(inArray(timesheets.projectId, topIds))
    .groupBy(timesheets.projectId, timesheets.userId);
  const employmentRates = await loadEmploymentRates();
  const hoursByProject = new Map<number, { hours: number; cost: number }>();
  for (const row of timesheetAgg) {
    const current = hoursByProject.get(row.projectId) ?? { hours: 0, cost: 0 };
    const hours = parseDecimal(row.totalHours);
    current.hours += hours;
    current.cost += hours * rateForHours(row.lineRate, row.userId, employmentRates);
    hoursByProject.set(row.projectId, current);
  }

  const allocationRates = await db
    .select({
      projectId: userContractAllocations.projectId,
      hourlyRate: userContractAllocations.hourlyRate,
    })
    .from(userContractAllocations)
    .where(inArray(userContractAllocations.projectId, topIds));
  const avgRateByProject = new Map<number, number>();
  const rateBuckets = new Map<number, number[]>();
  for (const a of allocationRates) {
    const rate = parseDecimal(a.hourlyRate);
    if (!rate) continue;
    const list = rateBuckets.get(a.projectId) ?? [];
    list.push(rate);
    rateBuckets.set(a.projectId, list);
  }
  for (const [pid, rates] of Array.from(rateBuckets.entries())) {
    avgRateByProject.set(pid, rates.reduce((s: number, r: number) => s + r, 0) / rates.length);
  }

  return top.map((project) => {
    const board = canonicalByProject.get(project.id) ?? null;
    const boardTaskList = board ? tasksByBoard.get(board.id) ?? [] : [];
    const openWithDue = boardTaskList
      .filter((t) => t.status !== "done" && t.dueDate)
      .sort((a, b) => (a.dueDate!.getTime() - b.dueDate!.getTime()));
    const nearest = openWithDue[0] ?? null;
    const completedWithDue = boardTaskList
      .filter((t) => t.status === "done" && t.dueDate)
      .sort((a, b) => (b.dueDate!.getTime() - a.dueDate!.getTime()));
    const lastCompleted = completedWithDue[0] ?? null;
    const nearestAssignees =
      nearest
        ? assigneesByTask.get(nearest.id) ??
          (nearest.assigneeId
            ? [{ id: nearest.assigneeId, name: null as string | null }]
            : [])
        : [];
    const isBlocked = nearest ? blockedSet.has(nearest.id) : false;

    const contract = contractByProject.get(project.id);
    const contractPaymentsList = contract ? paymentsByContract.get(contract.id) ?? [] : [];
    const paymentTotal = contractPaymentsList
      .filter((payment) => payment.status !== "cancelled")
      .reduce((sum, payment) => sum + parseDecimal(payment.amount), 0);
    const projectedRevenue = contract ? parseDecimal(contract.totalValue) || paymentTotal : 0;
    const received = contractPaymentsList
      .filter((p) => p.paymentReceived)
      .reduce((s, p) => s + parseDecimal(p.amount), 0);
    const hoursInfo = hoursByProject.get(project.id) ?? { hours: 0, cost: 0 };
    let hhCost = hoursInfo.cost;
    if (!hhCost && hoursInfo.hours) {
      const rate = avgRateByProject.get(project.id) ?? 0;
      hhCost = hoursInfo.hours * rate;
    }

    return {
      id: project.id,
      name: project.name,
      color: project.color,
      area: project.area,
      strategicPriority: project.strategicPriority ?? "normal",
      canonicalBoardId: board?.id ?? null,
      nearestDeadline: nearest
        ? { taskId: nearest.id, title: nearest.title, dueDate: nearest.dueDate }
        : null,
      lastCompletedDeadline: lastCompleted
        ? { taskId: lastCompleted.id, title: lastCompleted.title, dueDate: lastCompleted.dueDate }
        : null,
      assignees: nearestAssignees,
      isBlocked,
      finance: isAdmin
        ? {
            projectedRevenue,
            received,
            hhCost,
            workedHours: hoursInfo.hours,
          }
        : null,
    };
  });
}

export async function getContractPlReport(userId: number, isAdmin: boolean) {
  const summaries = await getFinanceSummaryForUser(userId, isAdmin);
  const db = await getDb();
  if (!db) return { ...summaries, contracts: [] };
  const projectIds = summaries.projects.map((p) => p.projectId);
  if (!projectIds.length) return { ...summaries, contracts: [] };

  const rows = await db
    .select({
      contract: contracts,
      projectName: projects.name,
      projectArea: projects.area,
    })
    .from(contracts)
    .leftJoin(projects, eq(contracts.projectId, projects.id))
    .where(inArray(contracts.projectId, projectIds));

  const contractIds = rows.map((r) => r.contract.id);
  const payments = contractIds.length
    ? await db.select().from(contractPayments).where(inArray(contractPayments.contractId, contractIds))
    : [];
  const paymentsByContract = new Map<number, typeof payments>();
  for (const p of payments) {
    const list = paymentsByContract.get(p.contractId) ?? [];
    list.push(p);
    paymentsByContract.set(p.contractId, list);
  }

  const contractsReport = rows.map(({ contract, projectName, projectArea }) => {
    const projectSummary = summaries.projects.find((p) => p.projectId === contract.projectId);
    const plist = paymentsByContract.get(contract.id) ?? [];
    const received = plist.filter((p) => p.paymentReceived && p.status !== "cancelled").reduce((s, p) => s + parseDecimal(p.amount), 0);
    const pending = plist.filter((p) => !p.paymentReceived && p.status !== "cancelled").reduce((s, p) => s + parseDecimal(p.amount), 0);
    const budgetedRevenue = parseDecimal(contract.totalValue) || received + pending;
    const revenue = appliedAmount(contract.actualRevenue, received);
    const cost = appliedAmount(contract.actualCost, projectSummary?.computedActualCost ?? 0);
    const budgetedCost = parseDecimal(contract.budgetedCost) || (projectSummary?.budgetedCost ?? 0);
    const actualRevenue = revenue.amount;
    const actualCost = cost.amount;
    return {
      id: contract.id,
      title: contract.title,
      clientName: contract.clientName,
      projectId: contract.projectId,
      projectName,
      projectArea,
      status: contract.status,
      budgetedRevenue,
      actualRevenue,
      revenueAdjusted: revenue.adjusted,
      budgetedCost,
      actualCost,
      costAdjusted: cost.adjusted,
      computedActualCost: projectSummary?.computedActualCost ?? 0,
      budgetedProfit: budgetedRevenue - budgetedCost,
      actualProfit: actualRevenue - actualCost,
      received,
      pending,
      payments: plist.map((p) => ({
        id: p.id,
        description: p.description,
        amount: parseDecimal(p.amount),
        dueDate: p.dueDate,
        paymentReceived: p.paymentReceived,
        invoiceIssued: p.invoiceIssued,
      })),
    };
  });

  return { ...summaries, contracts: contractsReport };
}

export async function listAllLeads(userId: number, isAdmin: boolean) {
  const db = await getDb();
  if (!db) return [];
  let scope;
  if (!isAdmin) {
    const projectIds = await getProjectIdsForUser(userId, false);
    scope = projectIds.length
      ? or(inArray(leads.projectId, projectIds), eq(leads.createdById, userId))
      : eq(leads.createdById, userId);
  }
  return db
    .select({
      lead: leads,
      projectName: projects.name,
      responsibleName: users.name,
      contractId: contracts.id,
      contractStatus: contracts.status,
      contractValue: contracts.totalValue,
    })
    .from(leads)
    .leftJoin(projects, eq(leads.projectId, projects.id))
    .leftJoin(contracts, eq(projects.contractId, contracts.id))
    .leftJoin(users, eq(leads.responsibleId, users.id))
    .where(scope)
    .orderBy(desc(leads.updatedAt));
}

export async function createEmploymentContract(data: {
  userId: number;
  totalValue: number;
  installments: number;
  availableHoursPerMonth: number;
  hourlyRate?: number;
  periodStart?: string;
  periodEnd?: string;
  notes?: string;
  createdById: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const derivedRate =
    data.hourlyRate ??
    (data.installments > 0 && data.availableHoursPerMonth > 0
      ? data.totalValue / (data.installments * data.availableHoursPerMonth)
      : undefined);
  const result = await db.insert(userEmploymentContracts).values({
    userId: data.userId,
    totalValue: data.totalValue.toString(),
    installments: data.installments,
    availableHoursPerMonth: data.availableHoursPerMonth.toString(),
    hourlyRate: derivedRate != null ? derivedRate.toFixed(2) : null,
    periodStart: data.periodStart ? new Date(data.periodStart) : null,
    periodEnd: data.periodEnd ? new Date(data.periodEnd) : null,
    notes: data.notes ?? null,
    createdById: data.createdById,
  });
  return result[0].insertId;
}

export async function updateEmploymentContract(
  id: number,
  data: Partial<{
    totalValue: number;
    installments: number;
    availableHoursPerMonth: number;
    hourlyRate: number | null;
    periodStart: string | null;
    periodEnd: string | null;
    notes: string;
  }>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const update: Record<string, unknown> = {};
  if (data.totalValue !== undefined) update.totalValue = data.totalValue.toString();
  if (data.installments !== undefined) update.installments = data.installments;
  if (data.availableHoursPerMonth !== undefined) {
    update.availableHoursPerMonth = data.availableHoursPerMonth.toString();
  }
  if (data.hourlyRate !== undefined) {
    update.hourlyRate = data.hourlyRate != null ? data.hourlyRate.toString() : null;
  }
  if (data.periodStart !== undefined) {
    update.periodStart = data.periodStart ? new Date(data.periodStart) : null;
  }
  if (data.periodEnd !== undefined) {
    update.periodEnd = data.periodEnd ? new Date(data.periodEnd) : null;
  }
  if (data.notes !== undefined) update.notes = data.notes;
  await db.update(userEmploymentContracts).set(update).where(eq(userEmploymentContracts.id, id));
}

export async function deleteEmploymentContract(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(userEmploymentContracts).where(eq(userEmploymentContracts.id, id));
}

export async function listEmploymentContracts() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: userEmploymentContracts.id,
      userId: userEmploymentContracts.userId,
      totalValue: userEmploymentContracts.totalValue,
      installments: userEmploymentContracts.installments,
      availableHoursPerMonth: userEmploymentContracts.availableHoursPerMonth,
      hourlyRate: userEmploymentContracts.hourlyRate,
      periodStart: userEmploymentContracts.periodStart,
      periodEnd: userEmploymentContracts.periodEnd,
      notes: userEmploymentContracts.notes,
      userName: users.name,
      userEmail: users.email,
    })
    .from(userEmploymentContracts)
    .leftJoin(users, eq(userEmploymentContracts.userId, users.id))
    .orderBy(desc(userEmploymentContracts.createdAt));
}

export async function getHoursCostBreakdown(userId: number, isAdmin: boolean) {
  const db = await getDb();
  if (!db) return { byUser: [], byProject: [] };
  const projectIds = await getProjectIdsForUser(userId, isAdmin);
  if (!projectIds.length) return { byUser: [], byProject: [] };

  const employment = await listEmploymentContracts();
  const rateByUser = new Map<number, number>();
  for (const e of employment) {
    rateByUser.set(e.userId, parseDecimal(e.hourlyRate));
  }

  const allocations = await db
    .select()
    .from(userContractAllocations)
    .where(inArray(userContractAllocations.projectId, projectIds));
  for (const a of allocations) {
    if (!rateByUser.has(a.userId) && a.hourlyRate) {
      rateByUser.set(a.userId, parseDecimal(a.hourlyRate));
    }
  }

  const worked = await db
    .select({
      userId: timesheets.userId,
      projectId: timesheets.projectId,
      totalHours: sql<string>`COALESCE(SUM(${timesheets.hours}), 0)`,
      userName: users.name,
      projectName: projects.name,
    })
    .from(timesheets)
    .leftJoin(users, eq(timesheets.userId, users.id))
    .leftJoin(projects, eq(timesheets.projectId, projects.id))
    .where(inArray(timesheets.projectId, projectIds))
    .groupBy(timesheets.userId, timesheets.projectId, users.name, projects.name);

  const byUserMap = new Map<number, { userId: number; userName: string | null; hours: number; cost: number }>();
  const byProjectMap = new Map<number, { projectId: number; projectName: string | null; hours: number; cost: number }>();

  for (const row of worked) {
    const hours = parseDecimal(row.totalHours);
    const rate = rateByUser.get(row.userId) ?? 0;
    const cost = hours * rate;
    const u = byUserMap.get(row.userId) ?? {
      userId: row.userId,
      userName: row.userName,
      hours: 0,
      cost: 0,
    };
    u.hours += hours;
    u.cost += cost;
    byUserMap.set(row.userId, u);

    const p = byProjectMap.get(row.projectId) ?? {
      projectId: row.projectId,
      projectName: row.projectName,
      hours: 0,
      cost: 0,
    };
    p.hours += hours;
    p.cost += cost;
    byProjectMap.set(row.projectId, p);
  }

  return {
    byUser: Array.from(byUserMap.values()),
    byProject: Array.from(byProjectMap.values()),
  };
}

export async function listAllocationsForAdmin(userId: number, isAdmin: boolean) {
  const db = await getDb();
  if (!db) return [];
  const projectIds = await getProjectIdsForUser(userId, isAdmin);
  if (!projectIds.length) return [];
  return db
    .select({
      id: userContractAllocations.id,
      userId: userContractAllocations.userId,
      projectId: userContractAllocations.projectId,
      availableHours: userContractAllocations.availableHours,
      hourlyRate: userContractAllocations.hourlyRate,
      periodStart: userContractAllocations.periodStart,
      periodEnd: userContractAllocations.periodEnd,
      notes: userContractAllocations.notes,
      userName: users.name,
      projectName: projects.name,
    })
    .from(userContractAllocations)
    .leftJoin(users, eq(userContractAllocations.userId, users.id))
    .leftJoin(projects, eq(userContractAllocations.projectId, projects.id))
    .where(inArray(userContractAllocations.projectId, projectIds));
}

/** Send payment due reminders for today (and overdue unpaid). Idempotent per payment/day. */
export async function sendPaymentDueReminders() {
  const db = await getDb();
  if (!db) return { sent: 0, skipped: 0 };
  const to = process.env.PAYMENT_REMINDER_EMAIL || "rodrigo@wisemetrics.in";
  const today = formatLocalDate(new Date());
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const duePayments = await db
    .select({
      payment: contractPayments,
      contractTitle: contracts.title,
      clientName: contracts.clientName,
    })
    .from(contractPayments)
    .innerJoin(contracts, eq(contractPayments.contractId, contracts.id))
    .where(
      and(
        eq(contractPayments.paymentReceived, false),
        lte(contractPayments.dueDate, endOfToday)
      )
    );

  let sent = 0;
  let skipped = 0;
  for (const row of duePayments) {
    const payment = row.payment;
    if (!payment.dueDate) {
      skipped++;
      continue;
    }
    const [existing] = await db
      .select()
      .from(paymentReminderLog)
      .where(
        and(
          eq(paymentReminderLog.paymentId, payment.id),
          eq(paymentReminderLog.reminderDate, today)
        )
      )
      .limit(1);
    if (existing) {
      skipped++;
      continue;
    }

    const amount = parseDecimal(payment.amount);
    const dueStr = format(payment.dueDate, "dd/MM/yyyy");
    const result = await sendEmail({
      to,
      subject: `[Task Manager] Vencimento: ${row.contractTitle} — ${row.clientName}`,
      html: `<p>Parcela a vencer/vencida:</p>
        <ul>
          <li><strong>Contrato:</strong> ${row.contractTitle}</li>
          <li><strong>Cliente:</strong> ${row.clientName}</li>
          <li><strong>Descrição:</strong> ${payment.description ?? "—"}</li>
          <li><strong>Valor:</strong> R$ ${amount.toFixed(2)}</li>
          <li><strong>Vencimento:</strong> ${dueStr}</li>
        </ul>`,
    });

    if (result.sent) {
      await db.insert(paymentReminderLog).values({
        paymentId: payment.id,
        sentTo: to,
        reminderDate: today,
      });
      sent++;
    } else {
      skipped++;
    }
  }
  return { sent, skipped, to };
}

// ─── Proposals ────────────────────────────────────────────────────────────────

export type ProposalInput = {
  leadId?: number | null;
  projectId?: number | null;
  clientName: string;
  contactName?: string | null;
  contactEmail?: string | null;
  title: string;
  intro?: string | null;
  scope?: string | null;
  items: ProposalItem[];
  discount?: number;
  paymentTerms?: string | null;
  installments?: ProposalInstallment[] | null;
  deliveryTime?: string | null;
  validUntil?: string | null;
  notes?: string | null;
};

function proposalValues(data: ProposalInput) {
  const discount = data.discount ?? 0;
  return {
    leadId: data.leadId ?? null,
    projectId: data.projectId ?? null,
    clientName: data.clientName,
    contactName: data.contactName ?? null,
    contactEmail: data.contactEmail ?? null,
    title: data.title,
    intro: data.intro ?? null,
    scope: data.scope ?? null,
    items: data.items,
    discount: discount.toFixed(2),
    total: proposalTotal(data.items, discount).toFixed(2),
    paymentTerms: data.paymentTerms ?? null,
    installments: data.installments?.length ? data.installments : null,
    deliveryTime: data.deliveryTime ?? null,
    validUntil: data.validUntil ? parseLocalDate(data.validUntil) : null,
    notes: data.notes ?? null,
  };
}

export async function listProposals(
  userId: number,
  isAdmin: boolean,
  filters: { leadId?: number; status?: ProposalStatus } = {}
) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (!isAdmin) {
    const projectIds = await getProjectIdsForUser(userId, false);
    conditions.push(
      projectIds.length
        ? or(eq(proposals.createdById, userId), inArray(proposals.projectId, projectIds))
        : eq(proposals.createdById, userId)
    );
  }
  if (filters.leadId) conditions.push(eq(proposals.leadId, filters.leadId));
  if (filters.status) conditions.push(eq(proposals.status, filters.status));
  return db
    .select({ proposal: proposals, leadTitle: leads.title, projectName: projects.name })
    .from(proposals)
    .leftJoin(leads, eq(proposals.leadId, leads.id))
    .leftJoin(projects, eq(proposals.projectId, projects.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(proposals.updatedAt));
}

export async function getProposal(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select().from(proposals).where(eq(proposals.id, id)).limit(1);
  return row;
}

export async function createProposal(data: ProposalInput & { createdById: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const year = new Date().getFullYear();
  const existing = await db
    .select({ number: proposals.number })
    .from(proposals)
    .where(sql`${proposals.number} LIKE ${`PROP-${year}-%`}`);
  const result = await db.insert(proposals).values({
    ...proposalValues(data),
    number: nextProposalNumber(existing.map((r) => r.number), year),
    createdById: data.createdById,
  });
  return result[0].insertId;
}

export async function updateProposal(id: number, data: ProposalInput) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(proposals).set(proposalValues(data)).where(eq(proposals.id, id));
}

export async function setProposalStatus(id: number, status: ProposalStatus) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(proposals).set({ status }).where(eq(proposals.id, id));
}

export async function deleteProposal(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(proposals).where(eq(proposals.id, id));
}

export async function countProposalsByLead(userId: number, isAdmin: boolean) {
  const rows = await listProposals(userId, isAdmin);
  const counts: Record<number, number> = {};
  for (const { proposal } of rows) {
    if (proposal.leadId) counts[proposal.leadId] = (counts[proposal.leadId] ?? 0) + 1;
  }
  return counts;
}

function format(d: Date, pattern: string): string {
  // Lightweight local formatter to avoid date-fns dependency in this module path
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  if (pattern === "dd/MM/yyyy") return `${dd}/${mm}/${yyyy}`;
  return d.toISOString();
}
