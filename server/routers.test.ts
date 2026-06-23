import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

vi.mock("./email", () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
  inviteEmailHtml: vi.fn(),
  assignmentEmailHtml: vi.fn(),
  mentionEmailHtml: vi.fn(),
  inviteAcceptedEmailHtml: vi.fn(),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "test-key", url: "/uploads/test" }),
  storageGetSignedUrl: vi.fn().mockResolvedValue("/uploads/test"),
  storageGet: vi.fn().mockResolvedValue({ key: "test-key", url: "/uploads/test" }),
}));

vi.mock("./db", () => {
  const mockProject = {
    id: 1,
    name: "Test Project",
    description: "desc",
    color: "#6366f1",
    icon: null,
    status: "active" as const,
    ownerId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return {
  assertProjectAccess: vi.fn().mockResolvedValue("owner"),
  getProjectIdForBoard: vi.fn().mockResolvedValue(1),
  getProjectIdForTask: vi.fn().mockResolvedValue(1),
  getProjects: vi.fn().mockResolvedValue([mockProject]),
  getProjectById: vi.fn().mockResolvedValue(mockProject),
  createProject: vi.fn().mockResolvedValue(1),
  updateProject: vi.fn().mockResolvedValue(undefined),
  deleteProject: vi.fn().mockResolvedValue(undefined),
  getProjectMembers: vi.fn().mockResolvedValue([]),
  removeProjectMember: vi.fn().mockResolvedValue(undefined),
  updateProjectMemberRole: vi.fn().mockResolvedValue(undefined),
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
  getTaskById: vi.fn().mockResolvedValue({ id: 1, boardId: 1, columnId: 1, title: "Task", assigneeId: null }),
  createTask: vi.fn().mockResolvedValue(1),
  updateTask: vi.fn().mockResolvedValue(undefined),
  deleteTask: vi.fn().mockResolvedValue(undefined),
  reorderTasks: vi.fn().mockResolvedValue(undefined),
  getTaskComments: vi.fn().mockResolvedValue([]),
  createTaskComment: vi.fn().mockResolvedValue(1),
  getTaskActivity: vi.fn().mockResolvedValue([]),
  getTaskAttachments: vi.fn().mockResolvedValue([]),
  createTaskAttachment: vi.fn().mockResolvedValue(1),
  deleteTaskAttachment: vi.fn().mockResolvedValue(undefined),
  getTaskAttachmentById: vi.fn().mockResolvedValue(undefined),
  getUpcomingTasks: vi.fn().mockResolvedValue([]),
  getTaskCountsByStatus: vi.fn().mockResolvedValue({ todo: 3, in_progress: 2, done: 5 }),
  getAllUsers: vi.fn().mockResolvedValue([
    { id: 1, name: "Alice", email: "alice@example.com", role: "admin", department: null },
  ]),
  getUserById: vi.fn().mockResolvedValue({ id: 2, name: "Bob", email: "bob@example.com" }),
  getUserPreferences: vi.fn().mockResolvedValue({ emailOnAssignment: true, emailOnMention: true, emailOnInviteAccepted: true }),
  updateUserPreferences: vi.fn().mockResolvedValue(undefined),
  getWorkload: vi.fn().mockResolvedValue([]),
  createInvite: vi.fn().mockResolvedValue({ token: "abc123" }),
  getInviteByToken: vi.fn().mockResolvedValue(null),
  listInvites: vi.fn().mockResolvedValue([]),
  revokeInvite: vi.fn().mockResolvedValue(undefined),
  acceptInvite: vi.fn().mockResolvedValue({ projectId: 1, invitedById: 1 }),
  getKpiCategories: vi.fn().mockResolvedValue([
    { id: 1, name: "Product Revenue", type: "revenue", description: null, createdById: 1, createdAt: new Date() },
  ]),
  createKpiCategory: vi.fn().mockResolvedValue(1),
  getKpiEntries: vi.fn().mockResolvedValue([]),
  exportKpiCsv: vi.fn().mockResolvedValue("category,type,period\n"),
  createKpiEntry: vi.fn().mockResolvedValue(1),
  deleteKpiEntry: vi.fn().mockResolvedValue(undefined),
  getDashboardStats: vi.fn().mockResolvedValue({ totalProjects: 1, taskCounts: { todo: 3, in_progress: 2, done: 5 } }),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
  };
});

import * as db from "./db";
import { ENV } from "./_core/env";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeCtx(overrides?: Partial<AuthenticatedUser>): { ctx: TrpcContext; clearedCookies: Array<{ name: string; options: Record<string, unknown> }> } {
  const clearedCookies: Array<{ name: string; options: Record<string, unknown> }> = [];
  const user: AuthenticatedUser = {
    id: 1,
    openId: "google:user-1",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "google",
    role: "admin",
    avatarUrl: null,
    department: null,
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
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
  });

  describe("providers (runtime OAuth detection)", () => {
    const original = {
      googleClientId: ENV.googleClientId,
      googleClientSecret: ENV.googleClientSecret,
      microsoftClientId: ENV.microsoftClientId,
      microsoftClientSecret: ENV.microsoftClientSecret,
    };
    afterEach(() => Object.assign(ENV, original));

    it("reports google enabled when client id and secret are set at runtime", async () => {
      ENV.googleClientId = "gid";
      ENV.googleClientSecret = "gsecret";
      ENV.microsoftClientId = "";
      ENV.microsoftClientSecret = "";
      const caller = appRouter.createCaller(makeCtx().ctx);
      expect(await caller.auth.providers()).toEqual({ google: true, microsoft: false });
    });

    it("reports no providers when credentials are absent", async () => {
      ENV.googleClientId = "";
      ENV.googleClientSecret = "";
      ENV.microsoftClientId = "";
      ENV.microsoftClientSecret = "";
      const caller = appRouter.createCaller(makeCtx().ctx);
      expect(await caller.auth.providers()).toEqual({ google: false, microsoft: false });
    });
  });
});

describe("projects", () => {
  beforeEach(() => {
    vi.mocked(db.assertProjectAccess).mockResolvedValue("owner");
  });

  it("list returns projects for the current user", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.projects.list();
    expect(result[0]?.name).toBe("Test Project");
  });

  it("byId returns a project when authorized", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.projects.byId({ id: 1 });
    expect(result?.id).toBe(1);
  });

  it("byId throws FORBIDDEN when unauthorized", async () => {
    vi.mocked(db.assertProjectAccess).mockRejectedValue(new Error("FORBIDDEN"));
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.projects.byId({ id: 99 })).rejects.toThrow(TRPCError);
  });

  it("create creates a new project", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.projects.create({ name: "New Project" });
    expect(result).toBe(1);
  });
});

describe("team", () => {
  beforeEach(() => {
    vi.mocked(db.assertProjectAccess).mockResolvedValue("admin");
  });

  it("invite creates an invite and returns token", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.team.invite({ email: "new@example.com", projectId: 1 });
    expect(result.token).toBe("abc123");
  });

  it("listMembers returns members", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.team.listMembers({ projectId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("kpi", () => {
  it("exportCsv returns CSV string", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.kpi.exportCsv();
    expect(result).toContain("category");
  });
});

describe("preferences", () => {
  it("get returns user preferences", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.preferences.get();
    expect(result.emailOnAssignment).toBe(true);
  });
});

describe("tasks", () => {
  beforeEach(() => {
    vi.mocked(db.assertProjectAccess).mockResolvedValue("member");
    vi.mocked(db.getProjectIdForBoard).mockResolvedValue(1);
    vi.mocked(db.getProjectIdForTask).mockResolvedValue(1);
  });

  it("reorder requires boardId", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.tasks.reorder({ boardId: 1, updates: [{ id: 1, position: 0, columnId: 1 }] })
    ).resolves.not.toThrow();
  });

  it("addComment creates a comment", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.tasks.addComment({ taskId: 1, content: "Hello team" })
    ).resolves.not.toThrow();
  });
});

describe("dashboard", () => {
  it("stats returns project count and task counts", async () => {
    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.dashboard.stats();
    expect(result.totalProjects).toBe(1);
  });
});
