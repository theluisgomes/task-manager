import { and, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { computeDueDateFromInput, formatLocalDate, parseLocalDate } from "../shared/billing";
import { hasMinRole } from "../shared/roles";
import {
  alertSettings,
  boards,
  contractPayments,
  contracts,
  leads,
  paymentReminderLog,
  projectMembers,
  projects,
  taskAssignees,
  taskDependencies,
  tasks,
  timesheets,
  userContractAllocations,
  userEmploymentContracts,
  users,
} from "../drizzle/schema";
import { getDb, getProjectById, getProjectIdsForUser, getTaskById } from "./db";
import { sendEmail } from "./email";

function parseDecimal(value: string | null | undefined): number {
  if (value == null) return 0;
  const n = parseFloat(value);
  return Number.isNaN(n) ? 0 : n;
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
    date: new Date(data.date),
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
  if (data.date !== undefined) update.date = new Date(data.date);
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
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const rows = await db
    .select({
      projectId: timesheets.projectId,
      total: sql<string>`COALESCE(SUM(${timesheets.hours}), 0)`,
    })
    .from(timesheets)
    .where(and(inArray(timesheets.projectId, projectIds), gte(timesheets.date, start)))
    .groupBy(timesheets.projectId);
  return Object.fromEntries(rows.map((r) => [r.projectId, parseDecimal(r.total)]));
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

export async function createLead(data: { clientName: string; title: string; projectId?: number; estimatedValue?: number; createdById: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(leads).values({
    clientName: data.clientName,
    title: data.title,
    projectId: data.projectId ?? null,
    estimatedValue: data.estimatedValue?.toString() ?? null,
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

export async function updateLead(id: number, data: Partial<{ isHot: boolean; dueDiligenceNotes: string; dueDiligenceCompletedAt: Date | null; status: "prospecting" | "proposal" | "negotiation" | "won" | "lost"; estimatedValue: number }>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const update: Record<string, unknown> = {};
  if (data.isHot !== undefined) update.isHot = data.isHot;
  if (data.dueDiligenceNotes !== undefined) update.dueDiligenceNotes = data.dueDiligenceNotes;
  if (data.dueDiligenceCompletedAt !== undefined) update.dueDiligenceCompletedAt = data.dueDiligenceCompletedAt;
  if (data.status !== undefined) update.status = data.status;
  if (data.estimatedValue !== undefined) update.estimatedValue = data.estimatedValue.toString();
  await db.update(leads).set(update).where(eq(leads.id, id));
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

export async function updateContract(id: number, data: Partial<{ totalValue: number; actualRevenue: number; actualCost: number; budgetedCost: number; status: "draft" | "active" | "completed" | "cancelled" }>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const update: Record<string, unknown> = {};
  if (data.totalValue !== undefined) update.totalValue = data.totalValue.toString();
  if (data.actualRevenue !== undefined) update.actualRevenue = data.actualRevenue.toString();
  if (data.actualCost !== undefined) update.actualCost = data.actualCost.toString();
  if (data.budgetedCost !== undefined) update.budgetedCost = data.budgetedCost.toString();
  if (data.status !== undefined) update.status = data.status;
  await db.update(contracts).set(update).where(eq(contracts.id, id));
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
  let hours = 0;
  let cost = 0;
  for (const row of rows) {
    const h = parseDecimal(row.hours);
    hours += h;
    cost += h * parseDecimal(row.hourlyRate);
  }
  return { hours, cost };
}

export async function getProjectFinanceSummary(projectId: number) {
  const contract = await getContractByProject(projectId);
  const costRows = await getTimesheetsByProject(projectId);
  let computedActualCost = 0;
  for (const r of costRows) computedActualCost += parseDecimal(r.hours) * parseDecimal(r.hourlyRate);
  if (!contract) {
    return { budgetedRevenue: 0, actualRevenue: 0, budgetedCost: 0, actualCost: computedActualCost, budgetedProfit: 0, actualProfit: -computedActualCost };
  }
  const payments = await getPaymentsByContract(contract.id);
  const budgetedRevenue = parseDecimal(contract.totalValue);
  const budgetedCost = parseDecimal(contract.budgetedCost);
  const computedActualRevenue = payments.filter((p) => p.paymentReceived).reduce((s, p) => s + parseDecimal(p.amount), 0);
  const actualRevenue = contract.actualRevenue != null ? parseDecimal(contract.actualRevenue) : computedActualRevenue;
  const actualCost = contract.actualCost != null ? parseDecimal(contract.actualCost) : computedActualCost;
  return {
    budgetedRevenue,
    actualRevenue,
    budgetedCost,
    actualCost,
    budgetedProfit: budgetedRevenue - budgetedCost,
    actualProfit: actualRevenue - actualCost,
  };
}

export async function updateProjectFinance(
  projectId: number,
  userId: number,
  data: { budgetedRevenue?: number; actualRevenue?: number; actualCost?: number }
) {
  const contractId = await ensureProjectContract(projectId, userId);
  const update: Partial<{ totalValue: number; actualRevenue: number; actualCost: number }> = {};
  if (data.budgetedRevenue !== undefined) update.totalValue = data.budgetedRevenue;
  if (data.actualRevenue !== undefined) update.actualRevenue = data.actualRevenue;
  if (data.actualCost !== undefined) update.actualCost = data.actualCost;
  await updateContract(contractId, update);
}

export async function getFinanceSummaryForUser(userId: number, isAdmin: boolean) {
  const projectIds = await getProjectIdsForUser(userId, isAdmin);
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
    })
    .from(timesheets)
    .where(inArray(timesheets.projectId, projectIds))
    .groupBy(timesheets.userId, timesheets.projectId);
  const workedMap = new Map(worked.map((w) => [`${w.userId}-${w.projectId}`, parseDecimal(w.totalHours)]));
  return allocations.map((a) => ({
    ...a,
    availableHours: parseDecimal(a.availableHours),
    hourlyRate: parseDecimal(a.hourlyRate),
    workedHours: workedMap.get(`${a.userId}-${a.projectId}`) ?? 0,
  }));
}

export async function getCalendarEvents(userId: number, isAdmin: boolean, start: Date, end: Date) {
  const db = await getDb();
  if (!db) return [];
  const projectIds = await getProjectIdsForUser(userId, isAdmin);
  if (!projectIds.length) return [];
  const managedProjectIds = await getManagedProjectIds(userId);
  const projectRows = await db.select().from(projects).where(inArray(projects.id, projectIds));
  const projectsById = new Map(projectRows.map((p) => [p.id, p]));
  const events: Array<{
    id: string;
    type: "payment" | "task";
    title: string;
    date: Date;
    projectId?: number;
    projectName?: string;
    amount?: number;
    paymentId?: number;
    taskId?: number;
    dueType?: "fixed" | "relative";
    baseEventType?: "assinatura" | "entrega" | null;
    daysAfterBase?: number | null;
    deliveryCompleted?: boolean;
    invoiceIssued?: boolean;
    paymentReceived?: boolean;
    canManagePayment?: boolean;
  }> = [];
  const projectContracts = await db.select().from(contracts).where(inArray(contracts.projectId, projectIds));
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
      totalHours: sql<string>`COALESCE(SUM(${timesheets.hours}), 0)`,
      totalCost: sql<string>`COALESCE(SUM(${timesheets.hours} * COALESCE(${timesheets.hourlyRate}, 0)), 0)`,
    })
    .from(timesheets)
    .where(inArray(timesheets.projectId, topIds))
    .groupBy(timesheets.projectId);
  const hoursByProject = new Map(
    timesheetAgg.map((r) => [r.projectId, { hours: parseDecimal(r.totalHours), cost: parseDecimal(r.totalCost) }])
  );

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
    const projectedRevenue = contract ? parseDecimal(contract.totalValue) : 0;
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
    const received = plist.filter((p) => p.paymentReceived).reduce((s, p) => s + parseDecimal(p.amount), 0);
    const pending = plist.filter((p) => !p.paymentReceived).reduce((s, p) => s + parseDecimal(p.amount), 0);
    const budgetedRevenue = parseDecimal(contract.totalValue);
    const actualRevenue = parseDecimal(contract.actualRevenue) || received;
    const budgetedCost = parseDecimal(contract.budgetedCost) || (projectSummary?.budgetedCost ?? 0);
    const actualCost = parseDecimal(contract.actualCost) || (projectSummary?.actualCost ?? 0);
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
      budgetedCost,
      actualCost,
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
  if (isAdmin) {
    return db
      .select({
        lead: leads,
        projectName: projects.name,
        responsibleName: users.name,
      })
      .from(leads)
      .leftJoin(projects, eq(leads.projectId, projects.id))
      .leftJoin(users, eq(leads.responsibleId, users.id))
      .orderBy(desc(leads.updatedAt));
  }
  const projectIds = await getProjectIdsForUser(userId, false);
  if (!projectIds.length) {
    return db
      .select({
        lead: leads,
        projectName: projects.name,
        responsibleName: users.name,
      })
      .from(leads)
      .leftJoin(projects, eq(leads.projectId, projects.id))
      .leftJoin(users, eq(leads.responsibleId, users.id))
      .where(eq(leads.createdById, userId))
      .orderBy(desc(leads.updatedAt));
  }
  return db
    .select({
      lead: leads,
      projectName: projects.name,
      responsibleName: users.name,
    })
    .from(leads)
    .leftJoin(projects, eq(leads.projectId, projects.id))
    .leftJoin(users, eq(leads.responsibleId, users.id))
    .where(or(inArray(leads.projectId, projectIds), eq(leads.createdById, userId)))
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

function format(d: Date, pattern: string): string {
  // Lightweight local formatter to avoid date-fns dependency in this module path
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  if (pattern === "dd/MM/yyyy") return `${dd}/${mm}/${yyyy}`;
  return d.toISOString();
}
