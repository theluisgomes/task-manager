import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB ──────────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getProjects: vi.fn().mockResolvedValue([
    { id: 1, name: "Test Project", description: "desc", color: "#6366f1", status: "active", ownerId: 1, createdAt: new Date(), updatedAt: new Date() },
  ]),
  getProjectById: vi.fn().mockResolvedValue({ id: 1, name: "Test Project", description: null, color: "#6366f1", status: "active", ownerId: 1, createdAt: new Date(), updatedAt: new Date() }),
  createProject: vi.fn().mockResolvedValue(1),
  updateProject: vi.fn().mockResolvedValue(undefined),
  deleteProject: vi.fn().mockResolvedValue(undefined),
  getBoardsByProject: vi.fn().mockResolvedValue([]),
  getBoardById: vi.fn().mockResolvedValue({ id: 1, projectId: 1, name: "Main Board", description: null, createdAt: new Date(), updatedAt: new Date() }),
  createBoard: vi.fn().mockResolvedValue(1),
  deleteBoard: vi.fn().mockResolvedValue(undefined),
  getColumnsByBoard: vi.fn().mockResolvedValue([
    { id: 1, boardId: 1, name: "To Do", color: "#94a3b8", position: 0, createdAt: new Date() },
  ]),
  createColumn: vi.fn().mockResolvedValue(1),
  updateColumn: vi.fn().mockResolvedValue(undefined),
  deleteColumn: vi.fn().mockResolvedValue(undefined),
  getTasksByBoard: vi.fn().mockResolvedValue([]),
  createTask: vi.fn().mockResolvedValue(1),
  updateTask: vi.fn().mockResolvedValue(undefined),
  deleteTask: vi.fn().mockResolvedValue(undefined),
  reorderTasks: vi.fn().mockResolvedValue(undefined),
  getUpcomingTasks: vi.fn().mockResolvedValue([]),
  getTaskCountsByStatus: vi.fn().mockResolvedValue({ todo: 3, in_progress: 2, done: 5 }),
  getAllUsers: vi.fn().mockResolvedValue([
    { id: 1, name: "Alice", email: "alice@example.com", role: "admin", department: null },
  ]),
  getWorkload: vi.fn().mockResolvedValue([]),
  createInvite: vi.fn().mockResolvedValue(undefined),
  getKpiCategories: vi.fn().mockResolvedValue([
    { id: 1, name: "Product Revenue", type: "revenue", description: null, createdById: 1, createdAt: new Date() },
  ]),
  createKpiCategory: vi.fn().mockResolvedValue(1),
  getKpiEntries: vi.fn().mockResolvedValue([]),
  createKpiEntry: vi.fn().mockResolvedValue(1),
  deleteKpiEntry: vi.fn().mockResolvedValue(undefined),
  getDashboardStats: vi.fn().mockResolvedValue({ totalProjects: 1, taskCounts: { todo: 3, in_progress: 2, done: 5 } }),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
}));

// ─── Context Factory ──────────────────────────────────────────────────────────
type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeCtx(overrides?: Partial<AuthenticatedUser>): { ctx: TrpcContext; clearedCookies: Array<{ name: string; options: Record<string, unknown> }> } {
  const clearedCookies: Array<{ name: string; options: Record<string, unknown> }> = [];
  const user: AuthenticatedUser = {
    id: 1,
    openId: "user-1",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };
  return { ctx, clearedCookies };
}

// ─── Auth Tests ───────────────────────────────────────────────────────────────
describe("auth", () => {
  it("me returns the current user", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result?.email).toBe("test@example.com");
  });

  it("logout clears the session cookie", async () => {
    const { ctx, clearedCookies } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({ maxAge: -1 });
  });
});

// ─── Projects Tests ───────────────────────────────────────────────────────────
describe("projects", () => {
  it("list returns projects for the current user", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.projects.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]?.name).toBe("Test Project");
  });

  it("byId returns a project by id", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.projects.byId({ id: 1 });
    expect(result?.id).toBe(1);
  });

  it("create creates a new project and returns its id", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.projects.create({ name: "New Project", color: "#6366f1" });
    expect(result).toBe(1);
  });

  it("delete removes a project", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.projects.delete({ id: 1 })).resolves.not.toThrow();
  });
});

// ─── Boards Tests ─────────────────────────────────────────────────────────────
describe("boards", () => {
  it("byProject returns boards for a project", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.boards.byProject({ projectId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("create creates a board and returns its id", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.boards.create({ projectId: 1, name: "Sprint Board" });
    expect(result).toBe(1);
  });
});

// ─── Columns Tests ────────────────────────────────────────────────────────────
describe("columns", () => {
  it("byBoard returns columns sorted by position", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.columns.byBoard({ boardId: 1 });
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]?.name).toBe("To Do");
  });

  it("create creates a column", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.columns.create({ boardId: 1, name: "Backlog", position: 0 });
    expect(result).toBe(1);
  });
});

// ─── Tasks Tests ──────────────────────────────────────────────────────────────
describe("tasks", () => {
  it("byBoard returns tasks for a board", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.tasks.byBoard({ boardId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("create creates a task", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.tasks.create({
      boardId: 1,
      columnId: 1,
      title: "Fix login bug",
      priority: "high",
    });
    expect(result).toBe(1);
  });

  it("reorder accepts task position updates", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.tasks.reorder({ updates: [{ id: 1, position: 0, columnId: 1 }] })
    ).resolves.not.toThrow();
  });
});

// ─── Team Tests ───────────────────────────────────────────────────────────────
describe("team", () => {
  it("listUsers returns all users", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.team.listUsers();
    expect(result[0]?.name).toBe("Alice");
  });

  it("workload returns workload data", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.team.workload();
    expect(Array.isArray(result)).toBe(true);
  });

  it("invite creates an invite", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.team.invite({ email: "new@example.com", projectId: 1 })
    ).resolves.not.toThrow();
  });
});

// ─── KPI Tests ────────────────────────────────────────────────────────────────
describe("kpi", () => {
  it("categories returns KPI categories", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.kpi.categories();
    expect(result[0]?.name).toBe("Product Revenue");
  });

  it("createCategory creates a category", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.kpi.createCategory({ name: "COGS", type: "budget" });
    expect(result).toBe(1);
  });

  it("createEntry creates a KPI entry", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.kpi.createEntry({
      categoryId: 1,
      period: "2024-01",
      periodType: "monthly",
      actual: 150000,
      projected: 140000,
      budget: 130000,
    });
    expect(result).toBe(1);
  });

  it("deleteEntry removes a KPI entry", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.kpi.deleteEntry({ id: 1 })).resolves.not.toThrow();
  });
});

// ─── Dashboard Tests ──────────────────────────────────────────────────────────
describe("dashboard", () => {
  it("stats returns project count and task counts", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.dashboard.stats();
    expect(result.totalProjects).toBe(1);
    expect((result.taskCounts as Record<string, number>).done).toBe(5);
  });

  it("upcomingTasks returns tasks due within days", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.dashboard.upcomingTasks({ days: 7 });
    expect(Array.isArray(result)).toBe(true);
  });
});
