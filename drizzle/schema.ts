import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  date,
  unique,
} from "drizzle-orm/mysql-core";
import { PROJECT_AREA_IDS } from "../shared/projectAreas";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 128 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  avatarUrl: text("avatarUrl"),
  department: varchar("department", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const userPreferences = mysqlTable("user_preferences", {
  userId: int("userId").primaryKey(),
  emailOnAssignment: boolean("emailOnAssignment").default(true).notNull(),
  emailOnMention: boolean("emailOnMention").default(true).notNull(),
  emailOnInviteAccepted: boolean("emailOnInviteAccepted").default(true).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** One row per user per calendar day they used the platform (deduped visits). */
export const platformVisits = mysqlTable(
  "platform_visits",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    visitDate: date("visitDate", { mode: "string" }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [unique("platform_visits_user_date").on(table.userId, table.visitDate)]
);

export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 32 }),
  icon: varchar("icon", { length: 64 }),
  area: mysqlEnum("area", PROJECT_AREA_IDS).default("clientes").notNull(),
  status: mysqlEnum("status", ["active", "completed", "archived"]).default("active").notNull(),
  strategicPriority: mysqlEnum("strategicPriority", ["normal", "high", "very_high"])
    .default("normal")
    .notNull(),
  ownerId: int("ownerId").notNull(),
  leadId: int("leadId"),
  linkedProjectId: int("linkedProjectId"),
  contractId: int("contractId"),
  acquisitionOwnerId: int("acquisitionOwnerId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const projectMembers = mysqlTable("project_members", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["owner", "admin", "member"]).default("member").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const boards = mysqlTable("boards", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  accessMode: mysqlEnum("accessMode", ["project", "restricted"]).default("project").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const boardMembers = mysqlTable("board_members", {
  id: int("id").autoincrement().primaryKey(),
  boardId: int("boardId").notNull(),
  userId: int("userId").notNull(),
  addedById: int("addedById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const columns = mysqlTable("columns", {
  id: int("id").autoincrement().primaryKey(),
  boardId: int("boardId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  color: varchar("color", { length: 32 }),
  position: int("position").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  boardId: int("boardId").notNull(),
  columnId: int("columnId").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  status: mysqlEnum("status", ["todo", "in_progress", "in_review", "done"]).default("todo").notNull(),
  /** Primary assignee (compat); also mirrored in task_assignees. */
  assigneeId: int("assigneeId"),
  dueDate: timestamp("dueDate"),
  position: int("position").default(0).notNull(),
  tags: text("tags"),
  createdById: int("createdById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const taskAssignees = mysqlTable(
  "task_assignees",
  {
    id: int("id").autoincrement().primaryKey(),
    taskId: int("taskId").notNull(),
    userId: int("userId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [unique("task_assignees_task_user").on(table.taskId, table.userId)]
);

export const taskComments = mysqlTable("task_comments", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  userId: int("userId").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const taskAttachments = mysqlTable("task_attachments", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  fileName: varchar("fileName", { length: 512 }).notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  contentType: varchar("contentType", { length: 128 }),
  sizeBytes: int("sizeBytes"),
  uploadedById: int("uploadedById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const activityLog = mysqlTable("activity_log", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId"),
  projectId: int("projectId"),
  userId: int("userId").notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const teamInvites = mysqlTable("team_invites", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  name: text("name"),
  projectId: int("projectId").notNull(),
  boardId: int("boardId"),
  invitedById: int("invitedById").notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  status: mysqlEnum("status", ["pending", "accepted", "expired"]).default("pending").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const kpiCategories = mysqlTable("kpi_categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  type: mysqlEnum("type", ["revenue", "budget", "variance", "profitability"]).notNull(),
  description: text("description"),
  createdById: int("createdById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const taskDependencies = mysqlTable("task_dependencies", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  dependsOnTaskId: int("dependsOnTaskId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const timesheets = mysqlTable("timesheets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  projectId: int("projectId").notNull(),
  date: timestamp("date").notNull(),
  hours: decimal("hours", { precision: 6, scale: 2 }).notNull(),
  description: varchar("description", { length: 512 }),
  hourlyRate: decimal("hourlyRate", { precision: 10, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const userContractAllocations = mysqlTable("user_contract_allocations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  projectId: int("projectId").notNull(),
  availableHours: decimal("availableHours", { precision: 8, scale: 2 }).notNull(),
  hourlyRate: decimal("hourlyRate", { precision: 10, scale: 2 }),
  periodStart: timestamp("periodStart"),
  periodEnd: timestamp("periodEnd"),
  notes: text("notes"),
  createdById: int("createdById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Professional employment contract (hours/month + value for HH cost). */
export const userEmploymentContracts = mysqlTable("user_employment_contracts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  totalValue: decimal("totalValue", { precision: 18, scale: 2 }).notNull(),
  installments: int("installments").default(1).notNull(),
  availableHoursPerMonth: decimal("availableHoursPerMonth", { precision: 8, scale: 2 }).notNull(),
  hourlyRate: decimal("hourlyRate", { precision: 10, scale: 2 }),
  periodStart: timestamp("periodStart"),
  periodEnd: timestamp("periodEnd"),
  notes: text("notes"),
  createdById: int("createdById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const paymentReminderLog = mysqlTable(
  "payment_reminder_log",
  {
    id: int("id").autoincrement().primaryKey(),
    paymentId: int("paymentId").notNull(),
    sentTo: varchar("sentTo", { length: 320 }).notNull(),
    reminderDate: date("reminderDate", { mode: "string" }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [unique("payment_reminder_payment_date").on(table.paymentId, table.reminderDate)]
);

export const leads = mysqlTable("leads", {
  id: int("id").autoincrement().primaryKey(),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  clientId: int("clientId"),
  projectId: int("projectId"),
  title: varchar("title", { length: 255 }).notNull(),
  estimatedValue: decimal("estimatedValue", { precision: 18, scale: 2 }),
  probability: int("probability").default(50),
  status: mysqlEnum("status", ["prospecting", "proposal", "negotiation", "won", "lost"]).default("prospecting").notNull(),
  isHot: boolean("isHot").default(false).notNull(),
  dueDiligenceNotes: text("dueDiligenceNotes"),
  dueDiligenceCompletedAt: timestamp("dueDiligenceCompletedAt"),
  expectedCloseDate: timestamp("expectedCloseDate"),
  source: varchar("source", { length: 128 }),
  responsibleId: int("responsibleId"),
  notes: text("notes"),
  createdById: int("createdById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const contracts = mysqlTable("contracts", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId"),
  projectId: int("projectId"),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  totalValue: decimal("totalValue", { precision: 18, scale: 2 }).notNull(),
  actualRevenue: decimal("actualRevenue", { precision: 18, scale: 2 }),
  actualCost: decimal("actualCost", { precision: 18, scale: 2 }),
  budgetedCost: decimal("budgetedCost", { precision: 18, scale: 2 }),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  status: mysqlEnum("status", ["draft", "active", "completed", "cancelled"]).default("active").notNull(),
  notes: text("notes"),
  createdById: int("createdById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const contractPayments = mysqlTable("contract_payments", {
  id: int("id").autoincrement().primaryKey(),
  contractId: int("contractId").notNull(),
  description: varchar("description", { length: 255 }),
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
  dueType: mysqlEnum("dueType", ["fixed", "relative"]).default("fixed").notNull(),
  baseEventType: mysqlEnum("baseEventType", ["assinatura", "entrega"]),
  baseEventDate: timestamp("baseEventDate"),
  daysAfterBase: int("daysAfterBase"),
  dueDate: timestamp("dueDate"),
  paidAt: timestamp("paidAt"),
  status: mysqlEnum("status", ["pending", "paid", "overdue", "cancelled"]).default("pending").notNull(),
  deliveryCompleted: boolean("deliveryCompleted").default(false).notNull(),
  invoiceIssued: boolean("invoiceIssued").default(false).notNull(),
  paymentReceived: boolean("paymentReceived").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const alertSettings = mysqlTable("alert_settings", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["payment_due", "delivery_due", "hot_lead"]).notNull(),
  daysBefore: int("daysBefore").default(3).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  notifyAdmin: boolean("notifyAdmin").default(true).notNull(),
  updatedById: int("updatedById"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const kpiEntries = mysqlTable("kpi_entries", {
  id: int("id").autoincrement().primaryKey(),
  categoryId: int("categoryId").notNull(),
  period: varchar("period", { length: 32 }).notNull(),
  periodType: mysqlEnum("periodType", ["monthly", "quarterly", "annual"]).default("monthly").notNull(),
  label: varchar("label", { length: 64 }),
  actual: decimal("actual", { precision: 18, scale: 2 }),
  projected: decimal("projected", { precision: 18, scale: 2 }),
  budget: decimal("budget", { precision: 18, scale: 2 }),
  notes: text("notes"),
  createdById: int("createdById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type Board = typeof boards.$inferSelect;
export type BoardMember = typeof boardMembers.$inferSelect;
export type BoardAccessMode = "project" | "restricted";
export type Column = typeof columns.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type TaskAssignee = typeof taskAssignees.$inferSelect;
export type TaskComment = typeof taskComments.$inferSelect;
export type UserEmploymentContract = typeof userEmploymentContracts.$inferSelect;
export type PaymentReminderLog = typeof paymentReminderLog.$inferSelect;
export type TaskAttachment = typeof taskAttachments.$inferSelect;
export type ActivityLogEntry = typeof activityLog.$inferSelect;
export type TeamInvite = typeof teamInvites.$inferSelect;
export type KpiCategory = typeof kpiCategories.$inferSelect;
export type KpiEntry = typeof kpiEntries.$inferSelect;
export type UserPreferences = typeof userPreferences.$inferSelect;
export type PlatformVisit = typeof platformVisits.$inferSelect;

export type { ProjectRole } from "../shared/roles";
export type { ProjectArea } from "../shared/projectAreas";
export type TaskDependency = typeof taskDependencies.$inferSelect;
export type Timesheet = typeof timesheets.$inferSelect;
export type UserContractAllocation = typeof userContractAllocations.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Contract = typeof contracts.$inferSelect;
export type ContractPayment = typeof contractPayments.$inferSelect;
export type AlertSetting = typeof alertSettings.$inferSelect;
