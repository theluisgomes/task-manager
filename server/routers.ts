import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { forbidden, notFound, assertFinanceAdmin } from "./authz";
import { canDeleteProject, hasMinRole, isGlobalAdmin } from "@shared/roles";
import {
  acceptInvite,
  addBoardMember,
  addProjectMember,
  assertBillableFinanceAccess,
  assertBoardAccess,
  assertProjectAccess,
  updateBoard,
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
  getBoardMembers,
  getBoardsByProject,
  getCollaboratorsForUser,
  getColumnsByBoard,
  getDashboardStats,
  getInviteByToken,
  getKpiCategories,
  getKpiEntries,
  getProjectById,
  getProjectIdForBoard,
  getProjectIdForTask,
  getProjectMemberRole,
  getProjectMembers,
  getProjects,
  getInviteProjectIds,
  projectHasExternalAccess,
  annotateProjectList,
  getTaskActivity,
  getTaskAttachmentById,
  getTaskAttachments,
  getWeeklyAccessLog,
  getTaskById,
  getTaskComments,
  getTasksByBoard,
  getTaskAssigneesByBoard,
  getUpcomingTasks,
  getUserById,
  getUserPreferences,
  getWorkload,
  listInvites,
  removeBoardMember,
  removeProjectMember,
  reorderTasks,
  revokeInvite,
  setBoardAccessMode,
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
import { PROJECT_AREA_IDS } from "@shared/projectAreas";
import {
  addTaskDependency,
  createAllocation,
  createContract,
  createContractPayment,
  createEmploymentContract,
  createLead,
  deleteAllocation,
  deleteEmploymentContract,
  deleteTimesheet,
  ensureProjectContract,
  getAcquisitionCost,
  getAlertSettings,
  getBlockedTaskIds,
  getCalendarEvents,
  getContractByProject,
  getContractPlReport,
  getFinanceSummaryForUser,
  getHoursCostBreakdown,
  getLeadByProject,
  getPaymentsByContract,
  getProjectFinanceSummary,
  getProjectHoursSummary,
  getStrategicOverview,
  getTaskDependencies,
  getTeamUtilization,
  getTimesheetsByProject,
  getMyWeekTimesheet,
  upsertMyTimesheet,
  getUpcomingAlerts,
  linkProspectToSale,
  listAllLeads,
  listAllocationsForAdmin,
  listEmploymentContracts,
  removeTaskDependency,
  sendPaymentDueReminders,
  updateProjectFinance,
  updateAlertSetting,
  updateAllocation,
  updateContract,
  updateContractPayment,
  updateEmploymentContract,
  updateLead,
  updateTimesheet,
  listProposals,
  getProposal,
  createProposal,
  updateProposal,
  setProposalStatus,
  deleteProposal,
  countProposalsByLead,
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEventById,
  getContractById,
  listCalendarEventsByContract,
  listContractsForUser,
  updateCalendarEvent,
} from "./operationalDb";
import { PROPOSAL_STATUS_IDS, leadStatusForProposal } from "@shared/proposals";
import {
  onLeadStatusChanged,
  onLeadValueChanged,
  onProposalAccepted,
  onProposalUpdated,
  syncProjectCompletion,
} from "./integrations";
import { proposalAiBriefingSchema, proposalAiContextSchema } from "@shared/proposalAi";
import { generateDraft, ProposalAiError, rewriteText } from "./proposalAi";
import { OpenRouterError } from "./_core/openRouter";
import { isOpenRouterConfigured } from "./_core/env";
import { storageGetSignedUrl, storagePut } from "./storage";

async function requireProjectAccess(
  userId: number,
  projectId: number,
  minRole: "member" | "admin" | "owner" = "member",
  globalAdmin = false
) {
  try {
    return await assertProjectAccess(userId, projectId, minRole, globalAdmin);
  } catch {
    forbidden();
  }
}

async function requireBoardAccess(
  userId: number,
  boardId: number,
  minRole: "member" | "admin" | "owner" = "member",
  globalAdmin = false
) {
  try {
    const { projectId } = await assertBoardAccess(userId, boardId, minRole, globalAdmin);
    return projectId;
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_FOUND") notFound("Board not found");
    forbidden();
  }
}

async function requireTaskAccess(
  userId: number,
  taskId: number,
  minRole: "member" | "admin" | "owner" = "member",
  globalAdmin = false
) {
  const projectId = await getProjectIdForTask(taskId);
  if (!projectId) notFound("Task not found");
  await requireProjectAccess(userId, projectId, minRole, globalAdmin);
  return projectId;
}

// ─── Projects ─────────────────────────────────────────────────────────────────
const projectsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await getProjects(ctx.user.id, isGlobalAdmin(ctx.user.role));
    return annotateProjectList(rows, ctx.user.id, isGlobalAdmin(ctx.user.role));
  }),

  byId: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user.id, input.id, "member", isGlobalAdmin(ctx.user.role));
      const project = await getProjectById(input.id);
      if (!project) notFound("Project not found");
      return project;
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      color: z.string().optional(),
      area: z.enum(PROJECT_AREA_IDS).optional(),
      strategicPriority: z.enum(["normal", "high", "very_high"]).optional(),
      acquisitionOwnerId: z.number().optional(),
      visibility: z.enum(["private", "shared"]).optional(),
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
      area: z.enum(PROJECT_AREA_IDS).optional(),
      status: z.enum(["active", "completed", "archived"]).optional(),
      strategicPriority: z.enum(["normal", "high", "very_high"]).optional(),
      linkedProjectId: z.number().nullable().optional(),
      acquisitionOwnerId: z.number().nullable().optional(),
      visibility: z.enum(["private", "shared"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (input.visibility) {
        await requireProjectAccess(ctx.user.id, input.id, "owner");
        if (input.visibility === "private" && await projectHasExternalAccess(input.id)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Projeto com outros membros não pode ser privado",
          });
        }
      } else {
        await requireProjectAccess(ctx.user.id, input.id, "admin");
      }
      const { id, ...data } = input;
      return updateProject(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const project = await getProjectById(input.id);
      if (!project) notFound("Project not found");
      const memberRole = await getProjectMemberRole(ctx.user.id, input.id);
      if (!canDeleteProject({
        userId: ctx.user.id,
        globalRole: ctx.user.role,
        ownerId: project.ownerId,
        memberRole,
        visibility: project.visibility ?? "private",
      })) {
        forbidden();
      }
      return deleteProject(input.id);
    }),

  strategicOverview: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(20).default(10) }).optional())
    .query(({ input, ctx }) =>
      getStrategicOverview(ctx.user.id, isGlobalAdmin(ctx.user.role), input?.limit ?? 10)
    ),

  hoursSummary: protectedProcedure.query(async ({ ctx }) => {
    const list = await getProjects(ctx.user.id, isGlobalAdmin(ctx.user.role));
    return getProjectHoursSummary(list.map((p) => p.id));
  }),

  linkProspectToSale: protectedProcedure
    .input(z.object({ prospectProjectId: z.number(), clientProjectId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      assertFinanceAdmin(ctx.user.role);
      await requireProjectAccess(ctx.user.id, input.prospectProjectId, "admin");
      await requireProjectAccess(ctx.user.id, input.clientProjectId, "admin");
      return linkProspectToSale(input.prospectProjectId, input.clientProjectId);
    }),

  acquisitionCost: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input, ctx }) => {
      assertFinanceAdmin(ctx.user.role);
      await requireProjectAccess(ctx.user.id, input.projectId);
      const project = await getProjectById(input.projectId);
      return getAcquisitionCost(input.projectId, project?.acquisitionOwnerId);
    }),

  financeSummary: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertBillableFinanceAccess(ctx.user.id, ctx.user.role, input.projectId);
      return getProjectFinanceSummary(input.projectId);
    }),

  listByArea: protectedProcedure.query(async ({ ctx }) => {
    const list = await annotateProjectList(
      await getProjects(ctx.user.id, isGlobalAdmin(ctx.user.role)),
      ctx.user.id,
      isGlobalAdmin(ctx.user.role)
    );
    const grouped: Record<string, typeof list> = {};
    for (const area of PROJECT_AREA_IDS) grouped[area] = [];
    for (const p of list) {
      const area = p.area ?? "clientes";
      grouped[area]?.push(p);
    }
    return grouped;
  }),
});

// ─── Boards ───────────────────────────────────────────────────────────────────
const boardsRouter = router({
  byProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user.id, input.projectId, "member", isGlobalAdmin(ctx.user.role));
      return getBoardsByProject(input.projectId, ctx.user.id, isGlobalAdmin(ctx.user.role));
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

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireBoardAccess(ctx.user.id, input.id, "admin");
      const { id, ...data } = input;
      return updateBoard(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await requireBoardAccess(ctx.user.id, input.id, "admin");
      return deleteBoard(input.id);
    }),

  listMembers: protectedProcedure
    .input(z.object({ boardId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireBoardAccess(ctx.user.id, input.boardId);
      return getBoardMembers(input.boardId);
    }),

  addMember: protectedProcedure
    .input(z.object({ boardId: z.number(), userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const projectId = await requireBoardAccess(ctx.user.id, input.boardId, "admin");
      const memberRole = await getProjectMemberRole(input.userId, projectId);
      if (!memberRole) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "User must be a project member first" });
      }
      await addBoardMember(input.boardId, input.userId, ctx.user.id);
    }),

  removeMember: protectedProcedure
    .input(z.object({ boardId: z.number(), userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await requireBoardAccess(ctx.user.id, input.boardId, "admin");
      return removeBoardMember(input.boardId, input.userId);
    }),

  updateAccess: protectedProcedure
    .input(z.object({
      boardId: z.number(),
      accessMode: z.enum(["project", "restricted"]),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireBoardAccess(ctx.user.id, input.boardId, "admin");
      return setBoardAccessMode(input.boardId, input.accessMode);
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

  assigneesByBoard: protectedProcedure
    .input(z.object({ boardId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireBoardAccess(ctx.user.id, input.boardId);
      return getTaskAssigneesByBoard(input.boardId);
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
      assigneeIds: z.array(z.number()).optional(),
      dueDate: z.string().optional(),
      tags: z.string().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireBoardAccess(ctx.user.id, input.boardId);
      const taskId = await createTask({ ...input, createdById: ctx.user.id });
      const assigneeIds = input.assigneeIds?.length
        ? input.assigneeIds
        : input.assigneeId
          ? [input.assigneeId]
          : [];
      if (assigneeIds.length) {
        const projectId = await getProjectIdForBoard(input.boardId);
        const project = projectId ? await getProjectById(projectId) : null;
        const base = ENV.oauthRedirectBaseUrl || "http://localhost:3000";
        for (const aid of assigneeIds) {
          const assignee = await getUserById(aid);
          const prefs = assignee ? await getUserPreferences(assignee.id) : null;
          if (assignee?.email && prefs?.emailOnAssignment !== false && project) {
            await sendEmail({
              to: assignee.email,
              subject: `Assigned: ${input.title}`,
              html: assignmentEmailHtml({
                taskTitle: input.title,
                projectName: project.name,
                boardUrl: `${base}/projects/${projectId}/board/${input.boardId}`,
              }),
            });
          }
        }
      }
      return taskId;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
      status: z.enum(["todo", "in_progress", "in_review", "done"]).optional(),
      assigneeId: z.number().nullable().optional(),
      assigneeIds: z.array(z.number()).optional(),
      dueDate: z.string().nullable().optional(),
      columnId: z.number().optional(),
      position: z.number().optional(),
      tags: z.string().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const task = await getTaskById(input.id);
      if (!task) notFound("Task not found");
      const projectId = await requireTaskAccess(ctx.user.id, input.id);
      const { id, ...data } = input;
      const prevAssignee = task.assigneeId;
      try {
        await updateTask(id, data, ctx.user.id);
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("DEPENDENCY_BLOCKED:")) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Complete dependencies first: ${err.message.replace("DEPENDENCY_BLOCKED:", "")}`,
          });
        }
        throw err;
      }

      const newAssigneeIds = data.assigneeIds?.length
        ? data.assigneeIds
        : data.assigneeId
          ? [data.assigneeId]
          : [];
      const toNotify = newAssigneeIds.filter((aid) => aid !== prevAssignee);
      if (toNotify.length) {
        const project = await getProjectById(projectId);
        const base = ENV.oauthRedirectBaseUrl || "http://localhost:3000";
        for (const aid of toNotify) {
          const assignee = await getUserById(aid);
          const prefs = assignee ? await getUserPreferences(assignee.id) : null;
          if (assignee?.email && prefs?.emailOnAssignment !== false && project) {
            await sendEmail({
              to: assignee.email,
              subject: `Assigned: ${data.title ?? task.title}`,
              html: assignmentEmailHtml({
                taskTitle: data.title ?? task.title,
                projectName: project.name,
                boardUrl: `${base}/projects/${projectId}/board/${task.boardId}`,
              }),
            });
          }
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
      try {
        return await reorderTasks(input.updates);
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("DEPENDENCY_BLOCKED:")) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Complete dependencies first: ${err.message.replace("DEPENDENCY_BLOCKED:", "")}`,
          });
        }
        throw err;
      }
    }),

  blockedIds: protectedProcedure
    .input(z.object({ boardId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireBoardAccess(ctx.user.id, input.boardId);
      return getBlockedTaskIds(input.boardId);
    }),

  listDependencies: protectedProcedure
    .input(z.object({ taskId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireTaskAccess(ctx.user.id, input.taskId);
      return getTaskDependencies(input.taskId);
    }),

  addDependency: protectedProcedure
    .input(z.object({ taskId: z.number(), dependsOnTaskId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await requireTaskAccess(ctx.user.id, input.taskId);
      try {
        return await addTaskDependency(input.taskId, input.dependsOnTaskId);
      } catch (err) {
        if (err instanceof Error) {
          if (err.message === "CYCLE") throw new TRPCError({ code: "BAD_REQUEST", message: "Circular dependency" });
          if (err.message === "DIFFERENT_BOARD") throw new TRPCError({ code: "BAD_REQUEST", message: "Tasks must be on the same board" });
        }
        throw err;
      }
    }),

  removeDependency: protectedProcedure
    .input(z.object({ id: z.number(), taskId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await requireTaskAccess(ctx.user.id, input.taskId);
      return removeTaskDependency(input.id);
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
          url: await storageGetSignedUrl(a.storageKey).catch(() => `/storage/${a.storageKey}`),
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

  workload: protectedProcedure
    .input(z.object({ projectId: z.number().optional() }).optional())
    .query(({ input }) => getWorkload(input?.projectId)),

  listCollaborators: protectedProcedure
    .input(z.object({ projectId: z.number().optional() }).optional())
    .query(({ input, ctx }) => getCollaboratorsForUser(ctx.user.id, input?.projectId)),

  addMember: protectedProcedure
    .input(z.object({ projectId: z.number(), userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user.id, input.projectId, "admin");
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You are already a member" });
      }
      await addProjectMember(input.projectId, input.userId, "member");
      return { success: true };
    }),

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
      projectId: z.number().optional(),
      projectIds: z.array(z.number()).optional(),
      area: z.enum(PROJECT_AREA_IDS).optional(),
      boardId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      let projectIds: number[] = [];
      if (input.area) {
        const mine = await getProjects(ctx.user.id, false);
        for (const project of mine) {
          if (project.area !== input.area || project.status !== "active") continue;
          const role = await getProjectMemberRole(ctx.user.id, project.id);
          if (role && hasMinRole(role, "admin")) projectIds.push(project.id);
        }
      } else {
        projectIds = Array.from(new Set(input.projectIds?.length ? input.projectIds : input.projectId != null ? [input.projectId] : []));
        for (const projectId of projectIds) {
          await requireProjectAccess(ctx.user.id, projectId, "admin");
        }
      }
      if (!projectIds.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione pelo menos um projeto" });
      }
      if (input.boardId) {
        if (projectIds.length !== 1) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Board invite requires a single project" });
        }
        const board = await getBoardById(input.boardId);
        if (!board || board.projectId !== projectIds[0]) notFound("Board not found");
      }
      const { token } = await createInvite({
        email: input.email,
        name: input.name,
        projectId: projectIds[0],
        projectIds,
        boardId: input.boardId,
        invitedById: ctx.user.id,
      });
      const names: string[] = [];
      for (const projectId of projectIds) {
        const project = await getProjectById(projectId);
        if (project) names.push(project.name);
      }
      const projectName = names.length ? names.join(", ") : "a project";
      const base = ENV.oauthRedirectBaseUrl || "http://localhost:3000";
      const inviteUrl = `${base}/invite/${token}`;
      const emailResult = await sendEmail({
        to: input.email,
        subject: names.length > 1 ? `Invitation to join ${names.length} projects` : `Invitation to join ${projectName}`,
        html: inviteEmailHtml({
          inviterName: ctx.user.name ?? "A team member",
          projectName,
          inviteUrl,
        }),
      });
      return {
        token,
        inviteUrl,
        emailSent: emailResult.sent,
        emailError: emailResult.error,
        projectIds,
      };
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
      if (!invite) {
        return { status: "invalid" as const };
      }
      if (invite.status === "expired" || invite.expiresAt < new Date()) {
        return { status: "expired" as const };
      }
      const projectIds = await getInviteProjectIds(invite.id);
      const ids = projectIds.length ? projectIds : [invite.projectId];
      const projects = [];
      for (const id of ids) {
        const project = await getProjectById(id);
        if (project) projects.push({ id: project.id, name: project.name });
      }
      const info = {
        email: invite.email,
        name: invite.name,
        projectName: projects.map((p) => p.name).join(", ") || "Project",
        projectId: ids[0],
        projects,
      };
      if (invite.status === "accepted") {
        return { status: "accepted" as const, ...info };
      }
      if (invite.status === "pending") {
        return { status: "pending" as const, ...info };
      }
      return { status: "invalid" as const };
    }),

  acceptInvite: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Your account has no email address" });
      }
      let invite;
      try {
        invite = await acceptInvite(input.token, ctx.user.id, ctx.user.email);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to accept invitation";
        throw new TRPCError({ code: "BAD_REQUEST", message });
      }
      const projectId = invite.projectIds?.[0] ?? invite.projectId;
      const names = invite.projectIds?.length
        ? (await Promise.all(invite.projectIds.map((id) => getProjectById(id)))).flatMap((p) => p ? [p.name] : [])
        : [((await getProjectById(projectId))?.name ?? "your project")];
      const projectName = names.join(", ") || "your project";
      const inviter = await getUserById(invite.invitedById);
      if (inviter?.email) {
        const prefs = await getUserPreferences(inviter.id);
        if (prefs.emailOnInviteAccepted !== false) {
          await sendEmail({
            to: inviter.email,
            subject: `${ctx.user.name ?? "Someone"} joined ${projectName}`,
            html: inviteAcceptedEmailHtml({
              memberName: ctx.user.name ?? ctx.user.email ?? "A user",
              projectName,
            }),
          });
        }
      }
      return { projectId };
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

const timesheetsRouter = router({
  listByProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user.id, input.projectId, "member", isGlobalAdmin(ctx.user.role));
      return getTimesheetsByProject(input.projectId);
    }),

  log: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      date: z.string(),
      hours: z.number().positive(),
      description: z.string().optional(),
      hourlyRate: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user.id, input.projectId, "member", isGlobalAdmin(ctx.user.role));
      return upsertMyTimesheet(ctx.user.id, input.projectId, input.date, input.hours, {
        mode: "add",
        description: input.description,
      });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      projectId: z.number(),
      date: z.string().optional(),
      hours: z.number().positive().optional(),
      description: z.string().optional(),
      hourlyRate: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      const { id, projectId: _, ...data } = input;
      return updateTimesheet(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number(), projectId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      return deleteTimesheet(input.id);
    }),

  myWeek: protectedProcedure
    .input(z.object({
      weekStart: z.string(),
      weekEnd: z.string(),
    }))
    .query(({ input, ctx }) => getMyWeekTimesheet(ctx.user.id, input.weekStart, input.weekEnd)),

  upsert: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      date: z.string(),
      hours: z.number().min(0),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user.id, input.projectId, "member", isGlobalAdmin(ctx.user.role));
      return upsertMyTimesheet(ctx.user.id, input.projectId, input.date, input.hours, { mode: "set" });
    }),
});

const crmRouter = router({
  getLead: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      return getLeadByProject(input.projectId);
    }),

  createLead: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      clientName: z.string().min(1),
      title: z.string().min(1),
      estimatedValue: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertBillableFinanceAccess(ctx.user.id, ctx.user.role, input.projectId);
      return createLead({ ...input, createdById: ctx.user.id });
    }),

  updateLead: protectedProcedure
    .input(z.object({
      id: z.number(),
      projectId: z.number().optional(),
      isHot: z.boolean().optional(),
      dueDiligenceNotes: z.string().optional(),
      completeDueDiligence: z.boolean().optional(),
      status: z.enum(["prospecting", "proposal", "negotiation", "won", "lost"]).optional(),
      estimatedValue: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (input.projectId) {
        await assertBillableFinanceAccess(ctx.user.id, ctx.user.role, input.projectId);
      } else if (ctx.user.role !== "admin") {
        // Standalone lead without project: only creator or admin
        const rows = await listAllLeads(ctx.user.id, false);
        const owned = rows.find((r) => r.lead.id === input.id);
        if (!owned || owned.lead.createdById !== ctx.user.id) {
          forbidden("Not allowed to update this lead");
        }
      }
      const { id, projectId: _, completeDueDiligence, ...data } = input;
      await updateLead(id, {
        ...data,
        dueDiligenceCompletedAt: completeDueDiligence ? new Date() : undefined,
      });
      if (data.estimatedValue !== undefined) await onLeadValueChanged(id, data.estimatedValue);
      const integration = data.status ? await onLeadStatusChanged(id, data.status, ctx.user.id) : null;
      return { integration };
    }),

  getContract: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertBillableFinanceAccess(ctx.user.id, ctx.user.role, input.projectId);
      return getContractByProject(input.projectId);
    }),

  createContract: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      clientName: z.string().min(1),
      title: z.string().min(1),
      totalValue: z.number(),
      budgetedCost: z.number().optional(),
      leadId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertBillableFinanceAccess(ctx.user.id, ctx.user.role, input.projectId);
      return createContract({ ...input, createdById: ctx.user.id });
    }),

  updateContract: protectedProcedure
    .input(z.object({
      id: z.number(),
      projectId: z.number(),
      totalValue: z.number().optional(),
      budgetedCost: z.number().optional(),
      status: z.enum(["draft", "active", "completed", "cancelled"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertBillableFinanceAccess(ctx.user.id, ctx.user.role, input.projectId);
      const { id, projectId, ...data } = input;
      await updateContract(id, data);
      const projectCompleted = await syncProjectCompletion(projectId);
      return { projectCompleted };
    }),

  listPayments: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertBillableFinanceAccess(ctx.user.id, ctx.user.role, input.projectId);
      const contract = await getContractByProject(input.projectId);
      if (!contract) return [];
      return getPaymentsByContract(contract.id);
    }),

  createPayment: protectedProcedure
    .input(z.object({
      contractId: z.number().optional(),
      projectId: z.number(),
      description: z.string().optional(),
      amount: z.number(),
      dueType: z.enum(["fixed", "relative"]).default("fixed"),
      dueDate: z.string().optional(),
      baseEventType: z.enum(["assinatura", "entrega"]).optional(),
      baseEventDate: z.string().optional(),
      daysAfterBase: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertBillableFinanceAccess(ctx.user.id, ctx.user.role, input.projectId);
      const contractId = input.contractId ?? await ensureProjectContract(input.projectId, ctx.user.id);
      const { projectId: _, contractId: __, ...data } = input;
      return createContractPayment({ ...data, contractId });
    }),

  updatePayment: protectedProcedure
    .input(z.object({
      id: z.number(),
      projectId: z.number(),
      description: z.string().optional(),
      amount: z.number().optional(),
      dueType: z.enum(["fixed", "relative"]).optional(),
      dueDate: z.string().nullable().optional(),
      baseEventType: z.enum(["assinatura", "entrega"]).nullable().optional(),
      baseEventDate: z.string().nullable().optional(),
      daysAfterBase: z.number().nullable().optional(),
      deliveryCompleted: z.boolean().optional(),
      invoiceIssued: z.boolean().optional(),
      paymentReceived: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertBillableFinanceAccess(ctx.user.id, ctx.user.role, input.projectId);
      const { id, projectId, ...data } = input;
      await updateContractPayment(id, data);
      const projectCompleted = await syncProjectCompletion(projectId);
      return { projectCompleted };
    }),

  createAllocation: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      userId: z.number(),
      availableHours: z.number(),
      hourlyRate: z.number().optional(),
      periodStart: z.string().optional(),
      periodEnd: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertFinanceAdmin(ctx.user.role);
      await requireProjectAccess(ctx.user.id, input.projectId, "admin");
      return createAllocation({ ...input, createdById: ctx.user.id });
    }),

  updateAllocation: protectedProcedure
    .input(z.object({
      id: z.number(),
      projectId: z.number(),
      availableHours: z.number().optional(),
      hourlyRate: z.number().optional(),
      periodStart: z.string().optional(),
      periodEnd: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertFinanceAdmin(ctx.user.role);
      await requireProjectAccess(ctx.user.id, input.projectId, "admin");
      const { id, projectId: _, ...data } = input;
      return updateAllocation(id, data);
    }),

  deleteAllocation: protectedProcedure
    .input(z.object({ id: z.number(), projectId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      assertFinanceAdmin(ctx.user.role);
      await requireProjectAccess(ctx.user.id, input.projectId, "admin");
      return deleteAllocation(input.id);
    }),

  listAllocations: protectedProcedure.query(({ ctx }) => {
    assertFinanceAdmin(ctx.user.role);
    return listAllocationsForAdmin(ctx.user.id, true);
  }),

  listLeads: protectedProcedure.query(({ ctx }) =>
    listAllLeads(ctx.user.id, ctx.user.role === "admin")
  ),

  createStandaloneLead: protectedProcedure
    .input(z.object({
      clientName: z.string().min(1),
      title: z.string().min(1),
      estimatedValue: z.number().optional(),
      projectId: z.number().optional(),
      isHot: z.boolean().optional(),
      status: z.enum(["prospecting", "proposal", "negotiation", "won", "lost"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (input.projectId) {
        await assertBillableFinanceAccess(ctx.user.id, ctx.user.role, input.projectId);
      }
      const id = await createLead({
        clientName: input.clientName,
        title: input.title,
        estimatedValue: input.estimatedValue,
        projectId: input.projectId,
        createdById: ctx.user.id,
      });
      if (input.isHot != null || input.status) {
        await updateLead(id, {
          isHot: input.isHot,
          status: input.status,
        });
      }
      return id;
    }),

  listEmploymentContracts: protectedProcedure.query(({ ctx }) => {
    assertFinanceAdmin(ctx.user.role);
    return listEmploymentContracts();
  }),

  createEmploymentContract: protectedProcedure
    .input(z.object({
      userId: z.number(),
      totalValue: z.number(),
      installments: z.number().min(1).default(1),
      availableHoursPerMonth: z.number(),
      hourlyRate: z.number().optional(),
      periodStart: z.string().optional(),
      periodEnd: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(({ input, ctx }) => {
      assertFinanceAdmin(ctx.user.role);
      return createEmploymentContract({ ...input, createdById: ctx.user.id });
    }),

  updateEmploymentContract: protectedProcedure
    .input(z.object({
      id: z.number(),
      totalValue: z.number().optional(),
      installments: z.number().optional(),
      availableHoursPerMonth: z.number().optional(),
      hourlyRate: z.number().nullable().optional(),
      periodStart: z.string().nullable().optional(),
      periodEnd: z.string().nullable().optional(),
      notes: z.string().optional(),
    }))
    .mutation(({ input, ctx }) => {
      assertFinanceAdmin(ctx.user.role);
      const { id, ...data } = input;
      return updateEmploymentContract(id, data);
    }),

  deleteEmploymentContract: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input, ctx }) => {
      assertFinanceAdmin(ctx.user.role);
      return deleteEmploymentContract(input.id);
    }),
});

const proposalItemSchema = z.object({
  description: z.string().max(500),
  quantity: z.number().min(0),
  unitPrice: z.number().min(0),
});

const proposalInputSchema = z.object({
  leadId: z.number().nullable().optional(),
  projectId: z.number().nullable().optional(),
  clientName: z.string().min(1).max(255),
  contactName: z.string().max(255).nullable().optional(),
  contactEmail: z.string().max(320).nullable().optional(),
  title: z.string().min(1).max(255),
  intro: z.string().nullable().optional(),
  scope: z.string().nullable().optional(),
  items: z.array(proposalItemSchema).max(100),
  discount: z.number().min(0).optional(),
  paymentTerms: z.string().nullable().optional(),
  installments: z
    .array(
      z.object({
        description: z.string().max(255),
        percent: z.number().min(0).max(100),
        dueType: z.enum(["fixed", "relative"]),
        dueDate: z.string().nullable().optional(),
        baseEventType: z.enum(["assinatura", "entrega"]).nullable().optional(),
        daysAfterBase: z.number().int().min(0).nullable().optional(),
      })
    )
    .max(24)
    .nullable()
    .optional(),
  deliveryTime: z.string().max(255).nullable().optional(),
  validUntil: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

type AuthUser = { id: number; role: string };

async function assertLinkAccess(
  user: AuthUser,
  links: { leadId?: number | null; projectId?: number | null }
) {
  const isAdmin = user.role === "admin";
  if (links.projectId) {
    await assertBillableFinanceAccess(user.id, user.role, links.projectId);
  }
  if (links.leadId && !isAdmin) {
    const leads = await listAllLeads(user.id, false);
    if (!leads.some((r) => r.lead.id === links.leadId)) forbidden("Not allowed to use this lead");
  }
}

async function requireProposal(user: AuthUser, id: number) {
  const proposal = await getProposal(id);
  if (!proposal) notFound("Proposal not found");
  if (user.role === "admin" || proposal.createdById === user.id) return proposal;
  if (proposal.projectId) {
    await requireProjectAccess(user.id, proposal.projectId);
    return proposal;
  }
  forbidden("Not allowed to access this proposal");
}

function requireAiConfigured() {
  if (!isOpenRouterConfigured()) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Assistente de IA não configurado. Defina OPENROUTER_API_KEY no .env.",
    });
  }
}

function toAiTrpcError(err: unknown): never {
  if (err instanceof ProposalAiError) {
    if (err.kind === "rate_limited") {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Limite de uso da IA atingido. Aguarde alguns minutos.",
      });
    }
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: "A IA não retornou um formato válido. Tente novamente.",
    });
  }
  if (err instanceof OpenRouterError) {
    const messages = {
      not_configured: "Assistente de IA não configurado. Defina OPENROUTER_API_KEY no .env.",
      timeout: "A IA demorou demais para responder. Tente novamente.",
      rate_limited: "O provedor de IA está sobrecarregado. Tente em instantes.",
      upstream: "Falha ao falar com o provedor de IA. Tente novamente.",
    } as const;
    console.warn(`[proposal-ai] ${err.kind}: ${err.message.slice(0, 200)}`);
    throw new TRPCError({
      code: err.kind === "timeout" ? "TIMEOUT" : err.kind === "not_configured" ? "PRECONDITION_FAILED" : "BAD_GATEWAY",
      message: messages[err.kind],
    });
  }
  throw err;
}

const proposalsRouter = router({
  aiStatus: protectedProcedure.query(() => ({
    enabled: isOpenRouterConfigured(),
    model: ENV.openRouterModel,
  })),

  aiDraft: protectedProcedure
    .input(z.object({ briefing: proposalAiBriefingSchema, context: proposalAiContextSchema }))
    .mutation(async ({ input, ctx }) => {
      requireAiConfigured();
      await assertLinkAccess(ctx.user, { leadId: input.context.leadId });
      try {
        return await generateDraft(ctx.user.id, input.briefing, input.context);
      } catch (err) {
        toAiTrpcError(err);
      }
    }),

  aiRewrite: protectedProcedure
    .input(
      z.object({
        field: z.enum(["intro", "scope"]),
        text: z.string().trim().min(1).max(3000),
        tone: proposalAiBriefingSchema.shape.tone,
        context: z.object({ clientName: z.string().max(255), title: z.string().max(255) }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      requireAiConfigured();
      try {
        return await rewriteText(ctx.user.id, input);
      } catch (err) {
        toAiTrpcError(err);
      }
    }),

  list: protectedProcedure
    .input(
      z
        .object({
          leadId: z.number().optional(),
          status: z.enum(PROPOSAL_STATUS_IDS).optional(),
        })
        .optional()
    )
    .query(({ input, ctx }) =>
      listProposals(ctx.user.id, ctx.user.role === "admin", input ?? {})
    ),

  countsByLead: protectedProcedure.query(({ ctx }) =>
    countProposalsByLead(ctx.user.id, ctx.user.role === "admin")
  ),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input, ctx }) => requireProposal(ctx.user, input.id)),

  create: protectedProcedure.input(proposalInputSchema).mutation(async ({ input, ctx }) => {
    await assertLinkAccess(ctx.user, input);
    return createProposal({ ...input, createdById: ctx.user.id });
  }),

  update: protectedProcedure
    .input(proposalInputSchema.extend({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await requireProposal(ctx.user, input.id);
      await assertLinkAccess(ctx.user, input);
      const { id, ...data } = input;
      await updateProposal(id, data);
      await onProposalUpdated(id);
      return id;
    }),

  setStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(PROPOSAL_STATUS_IDS) }))
    .mutation(async ({ input, ctx }) => {
      const proposal = await requireProposal(ctx.user, input.id);
      await setProposalStatus(input.id, input.status);
      if (input.status === "accepted") {
        const integration = await onProposalAccepted(input.id, ctx.user.id);
        return { leadUpdated: true, integration };
      }
      const leadStatus = leadStatusForProposal(input.status);
      if (proposal.leadId && leadStatus) {
        await updateLead(proposal.leadId, { status: leadStatus });
        await onLeadStatusChanged(proposal.leadId, leadStatus, ctx.user.id);
      }
      return { leadUpdated: Boolean(proposal.leadId && leadStatus), integration: null };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await requireProposal(ctx.user, input.id);
      await deleteProposal(input.id);
      return { success: true };
    }),
});

const financeRouter = router({
  summary: protectedProcedure.query(({ ctx }) =>
    getFinanceSummaryForUser(ctx.user.id, ctx.user.role === "admin")
  ),

  contractPl: protectedProcedure.query(({ ctx }) =>
    getContractPlReport(ctx.user.id, ctx.user.role === "admin")
  ),

  teamUtilization: protectedProcedure.query(({ ctx }) =>
    getTeamUtilization(ctx.user.id, ctx.user.role === "admin")
  ),

  hoursCostBreakdown: protectedProcedure.query(({ ctx }) => {
    assertFinanceAdmin(ctx.user.role);
    return getHoursCostBreakdown(ctx.user.id, true);
  }),

  alertSettings: protectedProcedure.query(({ ctx }) => {
    assertFinanceAdmin(ctx.user.role);
    return getAlertSettings();
  }),

  updateAlertSetting: protectedProcedure
    .input(z.object({
      id: z.number(),
      daysBefore: z.number().optional(),
      enabled: z.boolean().optional(),
      notifyAdmin: z.boolean().optional(),
    }))
    .mutation(({ input, ctx }) => {
      assertFinanceAdmin(ctx.user.role);
      const { id, ...data } = input;
      return updateAlertSetting(id, data, ctx.user.id);
    }),

  updateProjectFinance: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      budgetedRevenue: z.number().optional(),
      actualRevenue: z.number().nullable().optional(),
      actualCost: z.number().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertBillableFinanceAccess(ctx.user.id, ctx.user.role, input.projectId);
      const { projectId, ...data } = input;
      return updateProjectFinance(projectId, ctx.user.id, data);
    }),

  sendPaymentReminders: protectedProcedure.mutation(({ ctx }) => {
    assertFinanceAdmin(ctx.user.role);
    return sendPaymentDueReminders();
  }),
});

const calendarEventInputSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
  startAt: z.string().min(1),
  endAt: z.string().nullable().optional(),
  allDay: z.boolean().optional(),
  kind: z.enum(["reuniao", "entrega", "marco", "outro"]).optional(),
});

async function requireContractAccess(user: AuthUser, contractId: number) {
  const contract = await getContractById(contractId);
  if (!contract) notFound("Contrato não encontrado");
  if (!contract.projectId) {
    if (user.role !== "admin") forbidden("Contrato sem projeto vinculado");
    return contract;
  }
  await requireProjectAccess(user.id, contract.projectId, "member", user.role === "admin");
  return contract;
}

const calendarRouter = router({
  events: protectedProcedure
    .input(z.object({ start: z.string(), end: z.string() }))
    .query(({ input, ctx }) =>
      getCalendarEvents(
        ctx.user.id,
        ctx.user.role === "admin",
        new Date(input.start),
        new Date(input.end)
      )
    ),

  contracts: protectedProcedure.query(({ ctx }) =>
    listContractsForUser(ctx.user.id, ctx.user.role === "admin")
  ),

  listByContract: protectedProcedure
    .input(z.object({ contractId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireContractAccess(ctx.user, input.contractId);
      return listCalendarEventsByContract(input.contractId);
    }),

  createEvent: protectedProcedure
    .input(calendarEventInputSchema.extend({ contractId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const contract = await requireContractAccess(ctx.user, input.contractId);
      const { contractId, ...data } = input;
      return createCalendarEvent({ ...data, contractId, projectId: contract.projectId, createdById: ctx.user.id });
    }),

  updateEvent: protectedProcedure
    .input(calendarEventInputSchema.extend({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const event = await getCalendarEventById(input.id);
      if (!event) notFound("Evento não encontrado");
      await requireContractAccess(ctx.user, event.contractId);
      const { id, ...data } = input;
      await updateCalendarEvent(id, data);
      return id;
    }),

  deleteEvent: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const event = await getCalendarEventById(input.id);
      if (!event) notFound("Evento não encontrado");
      await requireContractAccess(ctx.user, event.contractId);
      await deleteCalendarEvent(input.id);
      return { success: true };
    }),
});

// ─── Dashboard ────────────────────────────────────────────────────────────────
const dashboardRouter = router({
  stats: protectedProcedure.query(({ ctx }) =>
    getDashboardStats(ctx.user.id, isGlobalAdmin(ctx.user.role))
  ),

  recentProjects: protectedProcedure.query(({ ctx }) =>
    getProjects(ctx.user.id, isGlobalAdmin(ctx.user.role))
  ),

  upcomingTasks: protectedProcedure
    .input(z.object({ days: z.number().default(7), limit: z.number().min(1).max(100).default(50) }))
    .query(({ input, ctx }) =>
      getUpcomingTasks(ctx.user.id, input.days, isGlobalAdmin(ctx.user.role), input.limit)
    ),

  alerts: protectedProcedure.query(({ ctx }) =>
    getUpcomingAlerts(ctx.user.role === "admin")
  ),

  weeklyAccess: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(7) }).optional())
    .query(({ input, ctx }) => {
      assertFinanceAdmin(ctx.user.role);
      return getWeeklyAccessLog(input?.days ?? 7);
    }),

  strategicOverview: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(20).default(10) }).optional())
    .query(({ input, ctx }) =>
      getStrategicOverview(ctx.user.id, isGlobalAdmin(ctx.user.role), input?.limit ?? 10)
    ),
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
  timesheets: timesheetsRouter,
  crm: crmRouter,
  proposals: proposalsRouter,
  finance: financeRouter,
  calendar: calendarRouter,
  dashboard: dashboardRouter,
  preferences: preferencesRouter,
});

export type AppRouter = typeof appRouter;
