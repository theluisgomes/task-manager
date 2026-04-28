import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  boards,
  columns,
  InsertUser,
  kpiCategories,
  kpiEntries,
  projectMembers,
  projects,
  tasks,
  teamInvites,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: users.id, name: users.name, email: users.email, role: users.role, department: users.department }).from(users);
}

// ─── Projects ─────────────────────────────────────────────────────────────────
export async function getProjects(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projects).where(eq(projects.ownerId, userId)).orderBy(desc(projects.createdAt));
}

export async function getProjectById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return result[0];
}

export async function createProject(data: { name: string; description?: string; color?: string; ownerId: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(projects).values({
    name: data.name,
    description: data.description ?? null,
    color: data.color ?? null,
    ownerId: data.ownerId,
    status: "active",
  });
  return result[0].insertId;
}

export async function updateProject(id: number, data: Partial<{ name: string; description: string; color: string; status: "active" | "completed" | "archived" }>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(projects).set(data).where(eq(projects.id, id));
}

export async function deleteProject(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(projects).where(eq(projects.id, id));
}

// ─── Boards ───────────────────────────────────────────────────────────────────
export async function getBoardsByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(boards).where(eq(boards.projectId, projectId)).orderBy(boards.createdAt);
}

export async function getBoardById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(boards).where(eq(boards.id, id)).limit(1);
  return result[0];
}

export async function createBoard(data: { projectId: number; name: string; description?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(boards).values({
    projectId: data.projectId,
    name: data.name,
    description: data.description ?? null,
  });
  const boardId = result[0].insertId;
  // Create default columns
  await db.insert(columns).values([
    { boardId, name: "To Do", color: "#94a3b8", position: 0 },
    { boardId, name: "In Progress", color: "#3b82f6", position: 1 },
    { boardId, name: "In Review", color: "#f59e0b", position: 2 },
    { boardId, name: "Done", color: "#22c55e", position: 3 },
  ]);
  return boardId;
}

export async function deleteBoard(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(boards).where(eq(boards.id, id));
}

// ─── Columns ──────────────────────────────────────────────────────────────────
export async function getColumnsByBoard(boardId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(columns).where(eq(columns.boardId, boardId)).orderBy(columns.position);
}

export async function createColumn(data: { boardId: number; name: string; color?: string; position: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(columns).values({
    boardId: data.boardId,
    name: data.name,
    color: data.color ?? null,
    position: data.position,
  });
  return result[0].insertId;
}

export async function updateColumn(id: number, data: Partial<{ name: string; color: string; position: number }>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(columns).set(data).where(eq(columns.id, id));
}

export async function deleteColumn(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(columns).where(eq(columns.id, id));
}

// ─── Tasks ────────────────────────────────────────────────────────────────────
export async function getTasksByBoard(boardId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tasks).where(eq(tasks.boardId, boardId)).orderBy(tasks.position);
}

export async function createTask(data: {
  boardId: number;
  columnId: number;
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  status?: "todo" | "in_progress" | "in_review" | "done";
  assigneeId?: number;
  dueDate?: string;
  createdById: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await db.select({ pos: tasks.position }).from(tasks).where(eq(tasks.columnId, data.columnId)).orderBy(desc(tasks.position)).limit(1);
  const position = existing.length > 0 ? (existing[0].pos ?? 0) + 1 : 0;
  const result = await db.insert(tasks).values({
    boardId: data.boardId,
    columnId: data.columnId,
    title: data.title,
    description: data.description ?? null,
    priority: data.priority ?? "medium",
    status: data.status ?? "todo",
    assigneeId: data.assigneeId ?? null,
    dueDate: data.dueDate ? new Date(data.dueDate) : null,
    position,
    createdById: data.createdById,
  });
  return result[0].insertId;
}

export async function updateTask(id: number, data: Partial<{
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "todo" | "in_progress" | "in_review" | "done";
  assigneeId: number | null;
  dueDate: string | null;
  columnId: number;
  position: number;
}>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const update: Record<string, unknown> = {};
  if (data.title !== undefined) update.title = data.title;
  if (data.description !== undefined) update.description = data.description;
  if (data.priority !== undefined) update.priority = data.priority;
  if (data.status !== undefined) update.status = data.status;
  if (data.assigneeId !== undefined) update.assigneeId = data.assigneeId;
  if (data.dueDate !== undefined) update.dueDate = data.dueDate ? new Date(data.dueDate) : null;
  if (data.columnId !== undefined) update.columnId = data.columnId;
  if (data.position !== undefined) update.position = data.position;
  await db.update(tasks).set(update).where(eq(tasks.id, id));
}

export async function deleteTask(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(tasks).where(eq(tasks.id, id));
}

export async function reorderTasks(updates: Array<{ id: number; position: number; columnId: number }>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await Promise.all(
    updates.map((u) => db.update(tasks).set({ position: u.position, columnId: u.columnId }).where(eq(tasks.id, u.id)))
  );
}

export async function getUpcomingTasks(userId: number, days: number) {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return db
    .select()
    .from(tasks)
    .where(and(lte(tasks.dueDate, future), gte(tasks.dueDate, now)))
    .orderBy(tasks.dueDate)
    .limit(10);
}

export async function getTaskCountsByStatus(userId: number) {
  const db = await getDb();
  if (!db) return {};
  const userProjects = await db.select({ id: projects.id }).from(projects).where(eq(projects.ownerId, userId));
  if (!userProjects.length) return {};
  const projectIds = userProjects.map((p) => p.id);
  const userBoards = await db.select({ id: boards.id }).from(boards).where(inArray(boards.projectId, projectIds));
  if (!userBoards.length) return {};
  const boardIds = userBoards.map((b) => b.id);
  const rows = await db
    .select({ status: tasks.status, count: sql<number>`count(*)` })
    .from(tasks)
    .where(inArray(tasks.boardId, boardIds))
    .groupBy(tasks.status);
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
}

// ─── Team ─────────────────────────────────────────────────────────────────────
export async function createInvite(data: { email: string; name?: string; projectId: number; invitedById: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(teamInvites).values({
    email: data.email,
    name: data.name ?? null,
    projectId: data.projectId,
    invitedById: data.invitedById,
    status: "pending",
  });
}

export async function getWorkload() {
  const db = await getDb();
  if (!db) return [];
  const allUsers = await db.select({ id: users.id, name: users.name, email: users.email }).from(users);
  const result = await Promise.all(
    allUsers.map(async (u) => {
      const rows = await db
        .select({ status: tasks.status, count: sql<number>`count(*)` })
        .from(tasks)
        .where(eq(tasks.assigneeId, u.id))
        .groupBy(tasks.status);
      const counts = Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
      return {
        user: u,
        todo: counts.todo ?? 0,
        in_progress: counts.in_progress ?? 0,
        in_review: counts.in_review ?? 0,
        done: counts.done ?? 0,
        total: Object.values(counts).reduce((a, b) => a + b, 0),
      };
    })
  );
  return result.filter((r) => r.total > 0);
}

// ─── KPI ──────────────────────────────────────────────────────────────────────
export async function getKpiCategories() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(kpiCategories).orderBy(kpiCategories.name);
}

export async function createKpiCategory(data: { name: string; type: "revenue" | "budget" | "variance" | "profitability"; description?: string; createdById: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(kpiCategories).values({
    name: data.name,
    type: data.type,
    description: data.description ?? null,
    createdById: data.createdById,
  });
  return result[0].insertId;
}

export async function getKpiEntries(periodType?: string) {
  const db = await getDb();
  if (!db) return [];
  const query = db.select().from(kpiEntries).orderBy(desc(kpiEntries.period));
  if (periodType) {
    return db.select().from(kpiEntries).where(eq(kpiEntries.periodType, periodType as any)).orderBy(kpiEntries.period);
  }
  return query;
}

export async function createKpiEntry(data: {
  categoryId: number;
  period: string;
  periodType: "monthly" | "quarterly" | "annual";
  label?: string;
  actual?: number;
  projected?: number;
  budget?: number;
  notes?: string;
  createdById: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(kpiEntries).values({
    categoryId: data.categoryId,
    period: data.period,
    periodType: data.periodType,
    label: data.label ?? null,
    actual: data.actual?.toString() ?? null,
    projected: data.projected?.toString() ?? null,
    budget: data.budget?.toString() ?? null,
    notes: data.notes ?? null,
    createdById: data.createdById,
  });
  return result[0].insertId;
}

export async function deleteKpiEntry(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(kpiEntries).where(eq(kpiEntries.id, id));
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export async function getDashboardStats(userId: number) {
  const db = await getDb();
  if (!db) return { totalProjects: 0, taskCounts: {} };
  const userProjects = await db.select({ id: projects.id }).from(projects).where(eq(projects.ownerId, userId));
  const totalProjects = userProjects.length;
  const taskCounts = await getTaskCountsByStatus(userId);
  return { totalProjects, taskCounts };
}
