import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createBoard,
  createColumn,
  createInvite,
  createKpiCategory,
  createKpiEntry,
  createProject,
  createTask,
  deleteBoard,
  deleteColumn,
  deleteKpiEntry,
  deleteProject,
  deleteTask,
  getAllUsers,
  getBoardById,
  getBoardsByProject,
  getColumnsByBoard,
  getDashboardStats,
  getKpiCategories,
  getKpiEntries,
  getProjectById,
  getProjects,
  getTasksByBoard,
  getUpcomingTasks,
  getWorkload,
  reorderTasks,
  updateColumn,
  updateProject,
  updateTask,
} from "./db";

// ─── Projects ─────────────────────────────────────────────────────────────────
const projectsRouter = router({
  list: protectedProcedure.query(({ ctx }) => getProjects(ctx.user.id)),

  byId: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => getProjectById(input.id)),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      color: z.string().optional(),
    }))
    .mutation(({ input, ctx }) =>
      createProject({ ...input, ownerId: ctx.user.id })
    ),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      color: z.string().optional(),
      status: z.enum(["active", "completed", "archived"]).optional(),
    }))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return updateProject(id, data as any);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => deleteProject(input.id)),
});

// ─── Boards ───────────────────────────────────────────────────────────────────
const boardsRouter = router({
  byProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(({ input }) => getBoardsByProject(input.projectId)),

  byId: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => getBoardById(input.id)),

  create: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      name: z.string().min(1),
      description: z.string().optional(),
    }))
    .mutation(({ input }) => createBoard(input)),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => deleteBoard(input.id)),
});

// ─── Columns ──────────────────────────────────────────────────────────────────
const columnsRouter = router({
  byBoard: protectedProcedure
    .input(z.object({ boardId: z.number() }))
    .query(({ input }) => getColumnsByBoard(input.boardId)),

  create: protectedProcedure
    .input(z.object({
      boardId: z.number(),
      name: z.string().min(1),
      color: z.string().optional(),
      position: z.number().default(0),
    }))
    .mutation(({ input }) => createColumn(input)),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      color: z.string().optional(),
      position: z.number().optional(),
    }))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return updateColumn(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => deleteColumn(input.id)),
});

// ─── Tasks ────────────────────────────────────────────────────────────────────
const tasksRouter = router({
  byBoard: protectedProcedure
    .input(z.object({ boardId: z.number() }))
    .query(({ input }) => getTasksByBoard(input.boardId)),

  create: protectedProcedure
    .input(z.object({
      boardId: z.number(),
      columnId: z.number(),
      title: z.string().min(1),
      description: z.string().optional(),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
      status: z.enum(["todo", "in_progress", "in_review", "done"]).optional(),
      assigneeId: z.number().optional(),
      dueDate: z.string().optional(),
    }))
    .mutation(({ input, ctx }) =>
      createTask({ ...input, createdById: ctx.user.id })
    ),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
      status: z.enum(["todo", "in_progress", "in_review", "done"]).optional(),
      assigneeId: z.number().nullable().optional(),
      dueDate: z.string().nullable().optional(),
      columnId: z.number().optional(),
      position: z.number().optional(),
    }))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return updateTask(id, data as any);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => deleteTask(input.id)),

  reorder: protectedProcedure
    .input(z.object({
      updates: z.array(z.object({
        id: z.number(),
        position: z.number(),
        columnId: z.number(),
      })),
    }))
    .mutation(({ input }) => reorderTasks(input.updates)),
});

// ─── Team ─────────────────────────────────────────────────────────────────────
const teamRouter = router({
  listUsers: protectedProcedure.query(() => getAllUsers()),

  workload: protectedProcedure.query(() => getWorkload()),

  invite: protectedProcedure
    .input(z.object({
      email: z.string().email(),
      name: z.string().optional(),
      projectId: z.number(),
    }))
    .mutation(({ input, ctx }) =>
      createInvite({ ...input, invitedById: ctx.user.id })
    ),
});

// ─── KPI ──────────────────────────────────────────────────────────────────────
const kpiRouter = router({
  categories: protectedProcedure.query(() => getKpiCategories()),

  createCategory: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      type: z.enum(["revenue", "budget", "variance", "profitability"]),
      description: z.string().optional(),
    }))
    .mutation(({ input, ctx }) =>
      createKpiCategory({ ...input, createdById: ctx.user.id })
    ),

  entries: protectedProcedure
    .input(z.object({ periodType: z.string().optional() }).optional())
    .query(({ input }) => getKpiEntries(input?.periodType)),

  createEntry: protectedProcedure
    .input(z.object({
      categoryId: z.number(),
      period: z.string().min(1),
      periodType: z.enum(["monthly", "quarterly", "annual"]),
      label: z.string().optional(),
      actual: z.number().optional(),
      projected: z.number().optional(),
      budget: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(({ input, ctx }) =>
      createKpiEntry({ ...input, createdById: ctx.user.id })
    ),

  deleteEntry: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => deleteKpiEntry(input.id)),
});

// ─── Dashboard ────────────────────────────────────────────────────────────────
const dashboardRouter = router({
  stats: protectedProcedure.query(({ ctx }) => getDashboardStats(ctx.user.id)),

  recentProjects: protectedProcedure.query(({ ctx }) => getProjects(ctx.user.id)),

  upcomingTasks: protectedProcedure
    .input(z.object({ days: z.number().default(7) }))
    .query(({ input, ctx }) => getUpcomingTasks(ctx.user.id, input.days)),
});

// ─── App Router ───────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  projects: projectsRouter,
  boards: boardsRouter,
  columns: columnsRouter,
  tasks: tasksRouter,
  team: teamRouter,
  kpi: kpiRouter,
  dashboard: dashboardRouter,
});

export type AppRouter = typeof appRouter;
