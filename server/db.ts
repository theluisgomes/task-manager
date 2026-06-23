import { and, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { nanoid } from "nanoid";
import {
  activityLog,
  boards,
  columns,
  InsertUser,
  kpiCategories,
  kpiEntries,
  projectMembers,
  projects,
  taskAttachments,
  taskComments,
  tasks,
  teamInvites,
  userPreferences,
  users,
  type ProjectRole,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { hasMinRole } from "./authz";

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

// ─── Authorization ────────────────────────────────────────────────────────────

export async function getProjectMemberRole(userId: number, projectId: number): Promise<ProjectRole | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

export async function assertProjectAccess(
  userId: number,
  projectId: number,
  minRole: ProjectRole = "member"
): Promise<ProjectRole> {
  const role = await getProjectMemberRole(userId, projectId);
  if (!role || !hasMinRole(role, minRole)) {
    throw new Error("FORBIDDEN");
  }
  return role;
}

export async function getProjectIdForBoard(boardId: number): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const [board] = await db.select({ projectId: boards.projectId }).from(boards).where(eq(boards.id, boardId)).limit(1);
  return board?.projectId ?? null;
}

export async function getProjectIdForTask(taskId: number): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const [task] = await db.select({ boardId: tasks.boardId }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) return null;
  return getProjectIdForBoard(task.boardId);
}

async function getProjectIdsForUser(userId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, userId));
  return rows.map((r) => r.projectId);
}

async function getBoardIdsForUser(userId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const projectIds = await getProjectIdsForUser(userId);
  if (!projectIds.length) return [];
  const userBoards = await db.select({ id: boards.id }).from(boards).where(inArray(boards.projectId, projectIds));
  return userBoards.map((b) => b.id);
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod", "avatarUrl", "department"] as const;
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

    const existing = await getUserByOpenId(user.openId);
    if (existing) {
      const [prefs] = await db.select().from(userPreferences).where(eq(userPreferences.userId, existing.id)).limit(1);
      if (!prefs) {
        await db.insert(userPreferences).values({ userId: existing.id });
      }
    }
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

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row;
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: users.id, name: users.name, email: users.email, role: users.role, department: users.department }).from(users);
}

export async function getUserPreferences(userId: number) {
  const db = await getDb();
  if (!db) return { emailOnAssignment: true, emailOnMention: true, emailOnInviteAccepted: true };
  const [row] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
  return row ?? { emailOnAssignment: true, emailOnMention: true, emailOnInviteAccepted: true };
}

export async function updateUserPreferences(
  userId: number,
  data: Partial<{ emailOnAssignment: boolean; emailOnMention: boolean; emailOnInviteAccepted: boolean }>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [existing] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
  if (existing) {
    await db.update(userPreferences).set(data).where(eq(userPreferences.userId, userId));
  } else {
    await db.insert(userPreferences).values({ userId, ...data });
  }
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function getProjects(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const memberRows = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, userId));
  if (!memberRows.length) return [];
  const ids = memberRows.map((r) => r.projectId);
  return db.select().from(projects).where(inArray(projects.id, ids)).orderBy(desc(projects.createdAt));
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
  const projectId = result[0].insertId;
  await db.insert(projectMembers).values({
    projectId,
    userId: data.ownerId,
    role: "owner",
  });
  return projectId;
}

export async function updateProject(id: number, data: Partial<{ name: string; description: string; color: string; status: "active" | "completed" | "archived" }>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(projects).set(data).where(eq(projects.id, id));
}

export async function deleteProject(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const projectBoards = await db.select({ id: boards.id }).from(boards).where(eq(boards.projectId, id));
  for (const board of projectBoards) {
    await deleteBoard(board.id);
  }
  await db.delete(projectMembers).where(eq(projectMembers.projectId, id));
  await db.delete(teamInvites).where(eq(teamInvites.projectId, id));
  await db.delete(projects).where(eq(projects.id, id));
}

// ─── Project Members ──────────────────────────────────────────────────────────

export async function getProjectMembers(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: projectMembers.id,
      projectId: projectMembers.projectId,
      userId: projectMembers.userId,
      role: projectMembers.role,
      createdAt: projectMembers.createdAt,
      name: users.name,
      email: users.email,
    })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(eq(projectMembers.projectId, projectId));
  return rows;
}

export async function addProjectMember(projectId: number, userId: number, role: ProjectRole = "member") {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [existing] = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);
  if (existing) return;
  await db.insert(projectMembers).values({ projectId, userId, role });
}

/** Grant a user access to every project (used for local dev login against a shared DB). */
export async function ensureUserAccessToAllProjects(userId: number, role: ProjectRole = "admin") {
  const db = await getDb();
  if (!db) return;
  const allProjects = await db.select({ id: projects.id }).from(projects);
  for (const { id } of allProjects) {
    await addProjectMember(id, userId, role);
  }
}

export async function removeProjectMember(projectId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [member] = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);
  if (member?.role === "owner") throw new Error("Cannot remove project owner");
  await db.delete(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
}

export async function updateProjectMemberRole(projectId: number, userId: number, role: ProjectRole) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (role === "owner") throw new Error("Cannot assign owner role via update");
  await db
    .update(projectMembers)
    .set({ role })
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
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
  const boardTasks = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.boardId, id));
  for (const t of boardTasks) {
    await db.delete(taskComments).where(eq(taskComments.taskId, t.id));
    await db.delete(taskAttachments).where(eq(taskAttachments.taskId, t.id));
    await db.delete(activityLog).where(eq(activityLog.taskId, t.id));
  }
  await db.delete(tasks).where(eq(tasks.boardId, id));
  await db.delete(columns).where(eq(columns.boardId, id));
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
  const [column] = await db.select().from(columns).where(eq(columns.id, id)).limit(1);
  if (!column) return;

  const otherColumns = await db
    .select()
    .from(columns)
    .where(and(eq(columns.boardId, column.boardId), ne(columns.id, id)))
    .orderBy(columns.position);

  const colTasks = await db.select().from(tasks).where(eq(tasks.columnId, id));

  if (colTasks.length > 0) {
    if (otherColumns.length === 0) {
      for (const task of colTasks) {
        await db.delete(taskComments).where(eq(taskComments.taskId, task.id));
        await db.delete(taskAttachments).where(eq(taskAttachments.taskId, task.id));
      }
      await db.delete(tasks).where(eq(tasks.columnId, id));
    } else {
      const targetCol = otherColumns[0];
      const existingInTarget = await db
        .select({ pos: tasks.position })
        .from(tasks)
        .where(eq(tasks.columnId, targetCol.id))
        .orderBy(desc(tasks.position))
        .limit(1);
      let nextPos = existingInTarget.length > 0 ? (existingInTarget[0].pos ?? 0) + 1 : 0;
      for (const task of colTasks) {
        await db.update(tasks).set({ columnId: targetCol.id, position: nextPos++ }).where(eq(tasks.id, task.id));
      }
    }
  }

  await db.delete(columns).where(eq(columns.id, id));
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function getTasksByBoard(boardId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tasks).where(eq(tasks.boardId, boardId)).orderBy(tasks.position);
}

export async function getTaskById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return row;
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
  const taskId = result[0].insertId;
  const projectId = await getProjectIdForBoard(data.boardId);
  await logActivity({
    taskId,
    projectId: projectId ?? undefined,
    userId: data.createdById,
    action: "task_created",
    details: data.title,
  });
  return taskId;
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
}>, actorId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [before] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
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

  if (actorId && before) {
    const projectId = await getProjectIdForBoard(before.boardId);
    if (data.assigneeId !== undefined && data.assigneeId !== before.assigneeId) {
      await logActivity({
        taskId: id,
        projectId: projectId ?? undefined,
        userId: actorId,
        action: "task_assigned",
        details: String(data.assigneeId ?? "unassigned"),
      });
    }
    if (data.columnId !== undefined && data.columnId !== before.columnId) {
      await logActivity({
        taskId: id,
        projectId: projectId ?? undefined,
        userId: actorId,
        action: "task_moved",
        details: `column:${data.columnId}`,
      });
    }
  }
}

export async function deleteTask(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(taskComments).where(eq(taskComments.taskId, id));
  await db.delete(taskAttachments).where(eq(taskAttachments.taskId, id));
  await db.delete(activityLog).where(eq(activityLog.taskId, id));
  await db.delete(tasks).where(eq(tasks.id, id));
}

export async function reorderTasks(updates: Array<{ id: number; position: number; columnId: number; status?: "todo" | "in_progress" | "in_review" | "done" }>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await Promise.all(
    updates.map((u) => {
      const set: Record<string, unknown> = { position: u.position, columnId: u.columnId };
      if (u.status !== undefined) set.status = u.status;
      return db.update(tasks).set(set).where(eq(tasks.id, u.id));
    })
  );
}

export async function getUpcomingTasks(userId: number, days: number) {
  const db = await getDb();
  if (!db) return [];
  const boardIds = await getBoardIdsForUser(userId);
  if (!boardIds.length) return [];
  const now = new Date();
  const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const result = await db
    .select()
    .from(tasks)
    .where(and(inArray(tasks.boardId, boardIds), lte(tasks.dueDate, future), gte(tasks.dueDate, now)))
    .orderBy(tasks.dueDate)
    .limit(10);
  return result;
}

export async function getTaskCountsByStatus(userId: number) {
  const db = await getDb();
  if (!db) return {};
  const boardIds = await getBoardIdsForUser(userId);
  if (!boardIds.length) return {};
  const rows = await db
    .select({ status: tasks.status, count: sql<number>`count(*)` })
    .from(tasks)
    .where(inArray(tasks.boardId, boardIds))
    .groupBy(tasks.status);
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
}

// ─── Comments & Activity ──────────────────────────────────────────────────────

export async function logActivity(data: {
  taskId?: number;
  projectId?: number;
  userId: number;
  action: string;
  details?: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(activityLog).values({
    taskId: data.taskId ?? null,
    projectId: data.projectId ?? null,
    userId: data.userId,
    action: data.action,
    details: data.details ?? null,
  });
}

export async function getTaskComments(taskId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: taskComments.id,
      taskId: taskComments.taskId,
      userId: taskComments.userId,
      content: taskComments.content,
      createdAt: taskComments.createdAt,
      updatedAt: taskComments.updatedAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(taskComments)
    .innerJoin(users, eq(taskComments.userId, users.id))
    .where(eq(taskComments.taskId, taskId))
    .orderBy(taskComments.createdAt);
}

export async function createTaskComment(data: { taskId: number; userId: number; content: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(taskComments).values({
    taskId: data.taskId,
    userId: data.userId,
    content: data.content,
  });
  const commentId = result[0].insertId;
  const task = await getTaskById(data.taskId);
  if (task) {
    const projectId = await getProjectIdForBoard(task.boardId);
    await logActivity({
      taskId: data.taskId,
      projectId: projectId ?? undefined,
      userId: data.userId,
      action: "comment_added",
      details: data.content.slice(0, 200),
    });
  }
  return commentId;
}

export async function getTaskActivity(taskId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: activityLog.id,
      action: activityLog.action,
      details: activityLog.details,
      createdAt: activityLog.createdAt,
      userName: users.name,
    })
    .from(activityLog)
    .innerJoin(users, eq(activityLog.userId, users.id))
    .where(eq(activityLog.taskId, taskId))
    .orderBy(desc(activityLog.createdAt));
}

// ─── Attachments ──────────────────────────────────────────────────────────────

export async function getTaskAttachments(taskId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(taskAttachments).where(eq(taskAttachments.taskId, taskId)).orderBy(desc(taskAttachments.createdAt));
}

export async function createTaskAttachment(data: {
  taskId: number;
  fileName: string;
  storageKey: string;
  contentType?: string;
  sizeBytes?: number;
  uploadedById: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(taskAttachments).values({
    taskId: data.taskId,
    fileName: data.fileName,
    storageKey: data.storageKey,
    contentType: data.contentType ?? null,
    sizeBytes: data.sizeBytes ?? null,
    uploadedById: data.uploadedById,
  });
  return result[0].insertId;
}

export async function deleteTaskAttachment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(taskAttachments).where(eq(taskAttachments.id, id));
}

export async function getTaskAttachmentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select().from(taskAttachments).where(eq(taskAttachments.id, id)).limit(1);
  return row;
}

// ─── Team & Invites ───────────────────────────────────────────────────────────

export async function createInvite(data: {
  email: string;
  name?: string;
  projectId: number;
  invitedById: number;
}): Promise<{ token: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(teamInvites).values({
    email: data.email.toLowerCase(),
    name: data.name ?? null,
    projectId: data.projectId,
    invitedById: data.invitedById,
    token,
    status: "pending",
    expiresAt,
  });
  return { token };
}

export async function getInviteByToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select().from(teamInvites).where(eq(teamInvites.token, token)).limit(1);
  return row;
}

export async function listInvites(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(teamInvites).where(eq(teamInvites.projectId, projectId)).orderBy(desc(teamInvites.createdAt));
}

export async function revokeInvite(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(teamInvites).set({ status: "expired" }).where(eq(teamInvites.id, id));
}

export async function acceptInvite(token: string, userId: number, userEmail: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const invite = await getInviteByToken(token);
  if (!invite || invite.status !== "pending") throw new Error("Invalid invite");
  if (invite.expiresAt < new Date()) {
    await db.update(teamInvites).set({ status: "expired" }).where(eq(teamInvites.id, invite.id));
    throw new Error("Invite expired");
  }
  if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
    throw new Error("Email mismatch");
  }
  await addProjectMember(invite.projectId, userId, "member");
  await db.update(teamInvites).set({ status: "accepted" }).where(eq(teamInvites.id, invite.id));
  return invite;
}

export async function acceptPendingInvitesForEmail(email: string, openId: string) {
  const db = await getDb();
  if (!db) return;
  const user = await getUserByOpenId(openId);
  if (!user) return;
  const pending = await db
    .select()
    .from(teamInvites)
    .where(and(eq(teamInvites.email, email.toLowerCase()), eq(teamInvites.status, "pending")));
  for (const invite of pending) {
    if (invite.expiresAt >= new Date()) {
      await addProjectMember(invite.projectId, user.id, "member");
      await db.update(teamInvites).set({ status: "accepted" }).where(eq(teamInvites.id, invite.id));
    }
  }
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
  if (periodType) {
    return db.select().from(kpiEntries).where(eq(kpiEntries.periodType, periodType as "monthly" | "quarterly" | "annual")).orderBy(kpiEntries.period);
  }
  return db.select().from(kpiEntries).orderBy(desc(kpiEntries.period));
}

export async function exportKpiCsv(): Promise<string> {
  const db = await getDb();
  if (!db) return "category,period,periodType,actual,projected,budget,notes\n";
  const rows = await db
    .select({
      categoryName: kpiCategories.name,
      categoryType: kpiCategories.type,
      period: kpiEntries.period,
      periodType: kpiEntries.periodType,
      actual: kpiEntries.actual,
      projected: kpiEntries.projected,
      budget: kpiEntries.budget,
      notes: kpiEntries.notes,
    })
    .from(kpiEntries)
    .innerJoin(kpiCategories, eq(kpiEntries.categoryId, kpiCategories.id))
    .orderBy(kpiEntries.period);
  const header = "category,type,period,periodType,actual,projected,budget,notes\n";
  const body = rows
    .map((r) =>
      [r.categoryName, r.categoryType, r.period, r.periodType, r.actual, r.projected, r.budget, r.notes]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");
  return header + body;
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
  const projectIds = await getProjectIdsForUser(userId);
  const totalProjects = projectIds.length;
  const taskCounts = await getTaskCountsByStatus(userId);
  return { totalProjects, taskCounts };
}
