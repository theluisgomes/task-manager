/**
 * CRM / contracts / timesheets schema — deferred, not migrated yet.
 * Kept separate to avoid migration drift with the active app schema.
 */
import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
} from "drizzle-orm/mysql-core";

export const clients = mysqlTable("clients", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["agency", "startup", "enterprise", "individual", "other"]).default("other"),
  contactName: varchar("contactName", { length: 255 }),
  contactEmail: varchar("contactEmail", { length: 320 }),
  contactPhone: varchar("contactPhone", { length: 64 }),
  notes: text("notes"),
  createdById: int("createdById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const leads = mysqlTable("leads", {
  id: int("id").autoincrement().primaryKey(),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  clientId: int("clientId"),
  title: varchar("title", { length: 255 }).notNull(),
  estimatedValue: decimal("estimatedValue", { precision: 18, scale: 2 }),
  probability: int("probability").default(50),
  status: mysqlEnum("status", ["prospecting", "proposal", "negotiation", "won", "lost"]).default("prospecting").notNull(),
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
  clientId: int("clientId"),
  projectId: int("projectId"),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  totalValue: decimal("totalValue", { precision: 18, scale: 2 }).notNull(),
  budgetedCost: decimal("budgetedCost", { precision: 18, scale: 2 }),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  status: mysqlEnum("status", ["draft", "active", "completed", "cancelled"]).default("active").notNull(),
  workStarted: boolean("workStarted").default(false).notNull(),
  workStartedAt: timestamp("workStartedAt"),
  isRecurring: boolean("isRecurring").default(false).notNull(),
  recurringMonthlyValue: decimal("recurringMonthlyValue", { precision: 18, scale: 2 }),
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
  dueDate: timestamp("dueDate"),
  paidAt: timestamp("paidAt"),
  status: mysqlEnum("status", ["pending", "paid", "overdue", "cancelled"]).default("pending").notNull(),
  invoiceIssued: boolean("invoiceIssued").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const timesheets = mysqlTable("timesheets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  contractId: int("contractId"),
  projectId: int("projectId"),
  clientName: varchar("clientName", { length: 255 }),
  date: timestamp("date").notNull(),
  hours: decimal("hours", { precision: 6, scale: 2 }).notNull(),
  description: varchar("description", { length: 512 }),
  hourlyRate: decimal("hourlyRate", { precision: 10, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const transactionCategories = mysqlTable("transaction_categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  type: mysqlEnum("type", ["receita", "despesa"]).notNull(),
  color: varchar("color", { length: 32 }),
  kpiRole: mysqlEnum("kpiRole", ["team_cost", "marketing", "tax", "rent", "supplier", "recurring_revenue", "other"]).default("other"),
  createdById: int("createdById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const bankTransactions = mysqlTable("bank_transactions", {
  id: int("id").autoincrement().primaryKey(),
  date: timestamp("date").notNull(),
  description: varchar("description", { length: 512 }).notNull(),
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
  type: mysqlEnum("type", ["credit", "debit"]).notNull(),
  categoryId: int("categoryId"),
  contractId: int("contractId"),
  source: varchar("source", { length: 64 }).default("manual").notNull(),
  importBatch: varchar("importBatch", { length: 64 }),
  notes: text("notes"),
  createdById: int("createdById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
