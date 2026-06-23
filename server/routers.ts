import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { forbidden, notFound } from "./authz";
import {
  acceptInvite,
  addProjectMember,
  assertProjectAccess,
  createBoard,
  createColumn,
  createInvite,
  createKpiCategory,
  createKpiEntry,
  createProject,
  createTask,
  createTaskAttachment,
  createTaskComment,
  deleteBoard,
  deleteColumn,
  deleteKpiEntry,
  deleteProject,
  deleteTask,
  deleteTaskAttachment,
  exportKpiCsv,
  getAllUsers,
  getBoardById,
  getBoardsByProject,
  getColumnsByBoard,
  getDashboardStats,
  getInviteByToken,
  getKpiCategories,
  getKpiEntries,
  getProjectById,
  getProjectIdForBoard,
  getProjectIdForTask,
  getProjectMembers,
  getProjects,
  getTaskActivity,
  getTaskAttachmentById,
  getTaskAttachments,
  getTaskById,
  getTaskComments,
  getTasksByBoard,
  getUpcomingTasks,
  getUserById,
  getUserPreferences,
  getWorkload,
  listInvites,
  removeProjectMember,
  reorderTasks,
  revokeInvite,
  updateColumn,
  updateProject,
  updateProjectMemberRole,
  updateTask,
  updateUserPreferences,
} from "./db";
import {
  assignmentEmailHtml,
  inviteAcceptedEmailHtml,
  inviteEmailHtml,
  mentionEmailHtml,
  sendEmail,
} from "./email";
import { ENV } from "./_core/env";
import { storageGetSignedUrl, storagePut } from "./storage";

async function requireProjectAccess(userId: number, projectId: number, minRole: "member" | "admin" | "owner" = "member") {
  try {
    return await assertProjectAccess(userId, projectId, minRole);
  } catch {
    forbidden();
  }
}

async function requireBoardAccess(userId: number, boardId: number, minRole: "member" | "admin" | "owner" = "member") {
  const projectId = await getProjectIdForBoard(boardId);
  if (!projectId) notFound("Board not found");
  await requireProjectAccess(userId, projectId, minRole);
  return projectId;
}

async function requireTaskAccess(userId: number, taskId: number, minRole: "member" | "admin" | "owner" = "member") {
  const projectId = await getProjectIdForTask(taskId);
  if (!projectId) notFound("Task not found");
  await requireProjectAccess(userId, projectId, minRole);
  return projectId;
}

// ─── Projects ─────────────────────────────────────────────────────────────────
const projectsRouter = router({
  list: protectedProcedure.query(({ ctx }) => getProjects(ctx.user.id)),

  byId: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user.id, input.id);
      const project = await getProjectById(input.id);
      if (!project) notFound("Project not found");
      return project;
    }),

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
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user.id, input.id, "admin");
      const { id, ...data } = input;
      return updateProject(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user.id, input.id, "owner");
      return deleteProject(input.id);
    }),
});

// ─── Boards ───────────────────────────────────────────────────────────────────
const boardsRouter = router({
  byProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      return getBoardsByProject(input.projectId);
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireBoardAccess(ctx.user.id, input.id);
      const board = await getBoardById(input.id);
      if (!board) notFound("Board not found");
      return board;
    }),

  create: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      name: z.string().min(1),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user.id, input.projectId, "admin");
      return createBoard(input);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await requireBoardAccess(ctx.user.id, input.id, "admin");
      return deleteBoard(input.id);
    }),
});

// ─── Columns ──────────────────────────────────────────────────────────────────
const columnsRouter = router({
  byBoard: protectedProcedure
    .input(z.object({ boardId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireBoardAccess(ctx.user.id, input.boardId);
      return getColumnsByBoard(input.boardId);
    }),

  create: protectedProcedure
    .input(z.object({
      boardId: z.number(),
      name: z.string().min(1),
      color: z.string().optional(),
      position: z.number().default(0),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireBoardAccess(ctx.user.id, input.boardId, "admin");
      return createColumn(input);
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      color: z.string().optional(),
      position: z.number().optional(),
      boardId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireBoardAccess(ctx.user.id, input.boardId, "admin");
      const { id, boardId: _, ...data } = input;
      return updateColumn(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number(), boardId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await requireBoardAccess(ctx.user.id, input.boardId, "admin");
      return deleteColumn(input.id);
    }),
});

// ─── Tasks ────────────────────────────────────────────────────────────────────
const tasksRouter = router({
  byBoard: protectedProcedure
    .input(z.object({ boardId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireBoardAccess(ctx.user.id, input.boardId);
      return getTasksByBoard(input.boardId);
    }),

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
    .mutation(async ({ input, ctx }) => {
      await requireBoardAccess(ctx.user.id, input.boardId);
      return createTask({ ...input, createdById: ctx.user.id });
    }),

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
    .mutation(async ({ input, ctx }) => {
      const task = await getTaskById(input.id);
      if (!task) notFound("Task not found");
      const projectId = await requireTaskAccess(ctx.user.id, input.id);
      const { id, ...data } = input;
      const prevAssignee = task.assigneeId;
      await updateTask(id, data, ctx.user.id);

      if (data.assigneeId && data.assigneeId !== prevAssignee) {
        const assignee = await getUserById(data.assigneeId);
        const prefs = assignee ? await getUserPreferences(assignee.id) : null;
        const project = await getProjectById(projectId);
        if (assignee?.email && prefs?.emailOnAssignment !== false && project) {
          const base = ENV.oauthRedirectBaseUrl || "http://localhost:3000";
          await sendEmail({
            to: assignee.email,
            subject: `Assigned: ${task.title}`,
            html: assignmentEmailHtml({
              taskTitle: task.title,
              projectName: project.name,
              boardUrl: `${base}/projects/${projectId}/board/${task.boardId}`,
            }),
          });
        }
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await requireTaskAccess(ctx.user.id, input.id, "admin");
      return deleteTask(input.id);
    }),

  reorder: protectedProcedure
    .input(z.object({
      boardId: z.number(),
      updates: z.array(z.object({
        id: z.number(),
        position: z.number(),
        columnId: z.number(),
        status: z.enum(["todo", "in_progress", "in_review", "done"]).optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireBoardAccess(ctx.user.id, input.boardId);
      return reorderTasks(input.updates);
    }),

  comments: protectedProcedure
    .input(z.object({ taskId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireTaskAccess(ctx.user.id, input.taskId);
      return getTaskComments(input.taskId);
    }),

  addComment: protectedProcedure
    .input(z.object({ taskId: z.number(), content: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const task = await getTaskById(input.taskId);
      if (!task) notFound("Task not found");
      const projectId = await requireTaskAccess(ctx.user.id, input.taskId);
      await createTaskComment({ taskId: input.taskId, userId: ctx.user.id, content: input.content });

      const mentionMatch = input.content.match(/@(\S+@\S+\.\S+)/g);
      if (mentionMatch) {
        const project = await getProjectById(projectId);
        const allUsers = await getAllUsers();
        for (const m of mentionMatch) {
          const email = m.slice(1);
          const mentioned = allUsers.find((u) => u.email?.toLowerCase() === email.toLowerCase());
          if (mentioned?.email && mentioned.id !== ctx.user.id) {
            const prefs = await getUserPreferences(mentioned.id);
            if (prefs.emailOnMention !== false && project) {
              const base = ENV.oauthRedirectBaseUrl || "http://localhost:3000";
              await sendEmail({
                to: mentioned.email,
                subject: `Mentioned in ${task.title}`,
                html: mentionEmailHtml({
                  commenterName: ctx.user.name ?? "Someone",
                  taskTitle: task.title,
                  boardUrl: `${base}/projects/${projectId}/board/${task.boardId}`,
                }),
              });
            }
          }
        }
      }
    }),

  activity: protectedProcedure
    .input(z.object({ taskId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireTaskAccess(ctx.user.id, input.taskId);
      return getTaskActivity(input.taskId);
    }),

  attachments: protectedProcedure
    .input(z.object({ taskId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireTaskAccess(ctx.user.id, input.taskId);
      const attachments = await getTaskAttachments(input.taskId);
      return Promise.all(
        attachments.map(async (a) => ({
          ...a,
          url: await storageGetSignedUrl(a.storageKey).catch(() => `/manus-storage/${a.storageKey}`),
        }))
      );
    }),

  uploadAttachment: protectedProcedure
    .input(z.object({
      taskId: z.number(),
      fileName: z.string().min(1),
      contentType: z.string().optional(),
      dataBase64: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireTaskAccess(ctx.user.id, input.taskId);
      const buffer = Buffer.from(input.dataBase64, "base64");
      const { key } = await storagePut(
        `tasks/${input.taskId}/${input.fileName}`,
        buffer,
        input.contentType ?? "application/octet-stream"
      );
      return createTaskAttachment({
        taskId: input.taskId,
        fileName: input.fileName,
        storageKey: key,
        contentType: input.contentType,
        sizeBytes: buffer.length,
        uploadedById: ctx.user.id,
      });
    }),

  deleteAttachment: protectedProcedure
    .input(z.object({ id: z.number(), taskId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await requireTaskAccess(ctx.user.id, input.taskId, "admin");
      const attachment = await getTaskAttachmentById(input.id);
      if (!attachment || attachment.taskId !== input.taskId) notFound("Attachment not found");
      return deleteTaskAttachment(input.id);
    }),
});

// ─── Team ─────────────────────────────────────────────────────────────────────
const teamRouter = router({
  listUsers: protectedProcedure.query(() => getAllUsers()),

  workload: protectedProcedure.query(() => getWorkload()),

  listMembers: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      return getProjectMembers(input.projectId);
    }),

  removeMember: protectedProcedure
    .input(z.object({ projectId: z.number(), userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user.id, input.projectId, "admin");
      if (input.userId === ctx.user.id) forbidden("Cannot remove yourself");
      return removeProjectMember(input.projectId, input.userId);
    }),

  updateMemberRole: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      userId: z.number(),
      role: z.enum(["admin", "member"]),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user.id, input.projectId, "owner");
      return updateProjectMemberRole(input.projectId, input.userId, input.role);
    }),

  listInvites: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user.id, input.projectId, "admin");
      return listInvites(input.projectId);
    }),

  invite: protectedProcedure
    .input(z.object({
      email: z.string().email(),
      name: z.string().optional(),
      projectId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user.id, input.projectId, "admin");
      const { token } = await createInvite({ ...input, invitedById: ctx.user.id });
      const project = await getProjectById(input.projectId);
      const base = ENV.oauthRedirectBaseUrl || "http://localhost:3000";
      const inviteUrl = `${base}/invite/${token}`;
      await sendEmail({
        to: input.email,
        subject: `Invitation to join ${project?.name ?? "a project"}`,
        html: inviteEmailHtml({
          inviterName: ctx.user.name ?? "A team member",
          projectName: project?.name ?? "Project",
          inviteUrl,
        }),
      });
      return { token };
    }),

  revokeInvite: protectedProcedure
    .input(z.object({ id: z.number(), projectId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user.id, input.projectId, "admin");
      return revokeInvite(input.id);
    }),

  inviteInfo: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const invite = await getInviteByToken(input.token);
      if (!invite || invite.status !== "pending" || invite.expiresAt < new Date()) {
        return null;
      }
      const project = await getProjectById(invite.projectId);
      return {
        email: invite.email,
        name: invite.name,
        projectName: project?.name ?? "Project",
        projectId: invite.projectId,
      };
    }),

  acceptInvite: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Your account has no email address" });
      }
      const invite = await acceptInvite(input.token, ctx.user.id, ctx.user.email);
      const project = await getProjectById(invite.projectId);
      const inviter = await getUserById(invite.invitedById);
      if (inviter?.email) {
        const prefs = await getUserPreferences(inviter.id);
        if (prefs.emailOnInviteAccepted !== false) {
          await sendEmail({
            to: inviter.email,
            subject: `${ctx.user.name ?? "Someone"} joined ${project?.name ?? "your project"}`,
            html: inviteAcceptedEmailHtml({
              memberName: ctx.user.name ?? ctx.user.email ?? "A user",
              projectName: project?.name ?? "Project",
            }),
          });
        }
      }
      return { projectId: invite.projectId };
    }),
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

  exportCsv: protectedProcedure.query(() => exportKpiCsv()),
});

// ─── Dashboard ────────────────────────────────────────────────────────────────
const dashboardRouter = router({
  stats: protectedProcedure.query(({ ctx }) => getDashboardStats(ctx.user.id)),

  recentProjects: protectedProcedure.query(({ ctx }) => getProjects(ctx.user.id)),

  upcomingTasks: protectedProcedure
    .input(z.object({ days: z.number().default(7) }))
    .query(({ input, ctx }) => getUpcomingTasks(ctx.user.id, input.days)),
});

// ─── User preferences ─────────────────────────────────────────────────────────
const preferencesRouter = router({
  get: protectedProcedure.query(({ ctx }) => getUserPreferences(ctx.user.id)),

  update: protectedProcedure
    .input(z.object({
      emailOnAssignment: z.boolean().optional(),
      emailOnMention: z.boolean().optional(),
      emailOnInviteAccepted: z.boolean().optional(),
    }))
    .mutation(({ input, ctx }) => updateUserPreferences(ctx.user.id, input)),
});

// ─── App Router ───────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,
  auth: router({
    providers: publicProcedure.query(() => ({
      google: Boolean(ENV.googleClientId && ENV.googleClientSecret),
      microsoft: Boolean(ENV.microsoftClientId && ENV.microsoftClientSecret),
    })),
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
  preferences: preferencesRouter,
});

export type AppRouter = typeof appRouter;
