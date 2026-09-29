import { and, eq } from "drizzle-orm";
import { formatLocalDate } from "../shared/billing";
import { installmentsToPayments, type InstallmentPayment, type ProposalInstallment } from "../shared/proposals";
import { contracts, leads, projects, proposals } from "../drizzle/schema";
import { createProject, getDb, getProjectById, updateProject } from "./db";
import {
  createContract,
  createContractPayment,
  createLead,
  getContractByProject,
  getPaymentsByContract,
  getProposal,
  updateLead,
} from "./operationalDb";

type LeadStatus = "prospecting" | "proposal" | "negotiation" | "won" | "lost";
type ContractStatus = "draft" | "active" | "completed" | "cancelled";

type ProposalRecord = {
  id: number;
  leadId: number | null;
  projectId: number | null;
  clientName: string;
  title: string;
  total: string;
  status: string;
  installments: ProposalInstallment[] | null;
};

type LeadRecord = { id: number; projectId: number | null; status: LeadStatus };
type ProjectRecord = { id: number; leadId: number | null; contractId: number | null; status: string };
type ContractRecord = { id: number; projectId: number | null; leadId: number | null; status: ContractStatus; startDate: Date | null };

export type IntegrationRepo = {
  getProposal(id: number): Promise<ProposalRecord | undefined>;
  findAcceptedProposalForLead(leadId: number): Promise<ProposalRecord | undefined>;
  getLead(id: number): Promise<LeadRecord | undefined>;
  getProject(id: number): Promise<ProjectRecord | undefined>;
  getContractByProject(projectId: number): Promise<ContractRecord | undefined>;
  countPayments(contractId: number): Promise<number>;
  allPaymentsReceived(contractId: number): Promise<boolean>;
  createLead(data: { clientName: string; title: string; estimatedValue: number; createdById: number }): Promise<number>;
  updateLead(id: number, data: { status?: LeadStatus; projectId?: number }): Promise<void>;
  createProject(data: { name: string; ownerId: number }): Promise<number>;
  updateProject(id: number, data: { leadId?: number; contractId?: number; status?: "completed" }): Promise<void>;
  updateProposalLinks(id: number, data: { leadId?: number; projectId?: number }): Promise<void>;
  createContract(data: { projectId: number; leadId: number; clientName: string; title: string; totalValue: number; createdById: number }): Promise<number>;
  updateContract(id: number, data: { totalValue?: number; leadId?: number; clientName?: string; status?: ContractStatus; startDate?: Date }): Promise<void>;
  createPayment(contractId: number, payment: InstallmentPayment): Promise<void>;
};

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db;
}

export const dbIntegrationRepo: IntegrationRepo = {
  getProposal,
  async findAcceptedProposalForLead(leadId) {
    const db = await requireDb();
    const [row] = await db
      .select()
      .from(proposals)
      .where(and(eq(proposals.leadId, leadId), eq(proposals.status, "accepted")))
      .limit(1);
    return row;
  },
  async getLead(id) {
    const db = await requireDb();
    const [row] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
    return row;
  },
  getProject: getProjectById,
  getContractByProject,
  async countPayments(contractId) {
    return (await getPaymentsByContract(contractId)).length;
  },
  async allPaymentsReceived(contractId) {
    const payments = (await getPaymentsByContract(contractId)).filter((p) => p.status !== "cancelled");
    return payments.length > 0 && payments.every((p) => p.paymentReceived);
  },
  createLead: (data) => createLead(data),
  async updateLead(id, data) {
    if (data.status) await updateLead(id, { status: data.status });
    if (data.projectId !== undefined) {
      const db = await requireDb();
      await db.update(leads).set({ projectId: data.projectId }).where(eq(leads.id, id));
    }
  },
  createProject: (data) => createProject({ ...data, area: "clientes" }),
  async updateProject(id, data) {
    if (data.status) await updateProject(id, { status: data.status });
    const links: Record<string, number> = {};
    if (data.leadId !== undefined) links.leadId = data.leadId;
    if (data.contractId !== undefined) links.contractId = data.contractId;
    if (Object.keys(links).length) {
      const db = await requireDb();
      await db.update(projects).set(links).where(eq(projects.id, id));
    }
  },
  async updateProposalLinks(id, data) {
    const db = await requireDb();
    await db.update(proposals).set(data).where(eq(proposals.id, id));
  },
  createContract: (data) => createContract(data),
  async updateContract(id, data) {
    const db = await requireDb();
    const update: Record<string, unknown> = {};
    if (data.totalValue !== undefined) update.totalValue = data.totalValue.toFixed(2);
    if (data.leadId !== undefined) update.leadId = data.leadId;
    if (data.clientName !== undefined) update.clientName = data.clientName;
    if (data.status !== undefined) update.status = data.status;
    if (data.startDate !== undefined) update.startDate = data.startDate;
    if (Object.keys(update).length) await db.update(contracts).set(update).where(eq(contracts.id, id));
  },
  async createPayment(contractId, payment) {
    await createContractPayment({ contractId, ...payment });
  },
};

export type ProposalAcceptedResult = {
  leadId: number;
  projectId: number;
  contractId: number;
  paymentsCreated: number;
};

/**
 * Accepting a proposal wins the lead and materializes the delivery side:
 * project, contract with the proposal total, and payment installments.
 * Safe to run repeatedly: existing links are reused and payments are only created once.
 */
export async function onProposalAccepted(
  proposalId: number,
  userId: number,
  repo: IntegrationRepo = dbIntegrationRepo,
  today: Date = new Date()
): Promise<ProposalAcceptedResult> {
  const proposal = await repo.getProposal(proposalId);
  if (!proposal) throw new Error("NOT_FOUND");
  const total = parseFloat(proposal.total) || 0;

  let lead = proposal.leadId ? await repo.getLead(proposal.leadId) : undefined;
  const leadId = lead?.id ?? await repo.createLead({
    clientName: proposal.clientName,
    title: proposal.title,
    estimatedValue: total,
    createdById: userId,
  });
  if (!lead) lead = await repo.getLead(leadId);

  let projectId = proposal.projectId ?? lead?.projectId ?? null;
  if (projectId && !(await repo.getProject(projectId))) projectId = null;
  if (!projectId) {
    projectId = await repo.createProject({ name: `${proposal.clientName} · ${proposal.title}`, ownerId: userId });
  }

  if (lead?.status !== "won") await repo.updateLead(leadId, { status: "won" });
  if (lead?.projectId !== projectId) await repo.updateLead(leadId, { projectId });
  if (proposal.leadId !== leadId || proposal.projectId !== projectId) {
    await repo.updateProposalLinks(proposal.id, { leadId, projectId });
  }

  const existingContract = await repo.getContractByProject(projectId);
  let contractId: number;
  if (existingContract) {
    contractId = existingContract.id;
    await repo.updateContract(contractId, {
      totalValue: total,
      leadId,
      clientName: proposal.clientName,
      status: existingContract.status === "completed" ? "completed" : "active",
      startDate: existingContract.startDate ? undefined : today,
    });
  } else {
    contractId = await repo.createContract({
      projectId,
      leadId,
      clientName: proposal.clientName,
      title: proposal.title,
      totalValue: total,
      createdById: userId,
    });
    await repo.updateContract(contractId, { status: "active", startDate: today });
  }

  const project = await repo.getProject(projectId);
  const projectLinks: { leadId?: number; contractId?: number } = {};
  if (project?.leadId !== leadId) projectLinks.leadId = leadId;
  if (project?.contractId !== contractId) projectLinks.contractId = contractId;
  if (Object.keys(projectLinks).length) await repo.updateProject(projectId, projectLinks);

  let paymentsCreated = 0;
  if ((await repo.countPayments(contractId)) === 0 && total > 0) {
    const payments = installmentsToPayments(total, proposal.installments, formatLocalDate(today));
    for (const payment of payments) {
      await repo.createPayment(contractId, payment);
      paymentsCreated++;
    }
  }

  return { leadId, projectId, contractId, paymentsCreated };
}

export async function onLeadStatusChanged(
  leadId: number,
  status: LeadStatus,
  userId: number,
  repo: IntegrationRepo = dbIntegrationRepo
): Promise<ProposalAcceptedResult | null> {
  if (status === "won") {
    const accepted = await repo.findAcceptedProposalForLead(leadId);
    return accepted ? onProposalAccepted(accepted.id, userId, repo) : null;
  }
  if (status === "lost") {
    const lead = await repo.getLead(leadId);
    if (!lead?.projectId) return null;
    const contract = await repo.getContractByProject(lead.projectId);
    if (contract?.status === "draft") await repo.updateContract(contract.id, { status: "cancelled" });
  }
  return null;
}

export async function onLeadValueChanged(
  leadId: number,
  estimatedValue: number,
  repo: IntegrationRepo = dbIntegrationRepo
) {
  const lead = await repo.getLead(leadId);
  if (!lead?.projectId) return;
  const contract = await repo.getContractByProject(lead.projectId);
  if (contract?.status === "draft") await repo.updateContract(contract.id, { totalValue: estimatedValue });
}

export async function onProposalUpdated(proposalId: number, repo: IntegrationRepo = dbIntegrationRepo) {
  const proposal = await repo.getProposal(proposalId);
  if (proposal?.status !== "accepted" || !proposal.projectId) return;
  const contract = await repo.getContractByProject(proposal.projectId);
  if (contract && contract.status !== "cancelled") {
    await repo.updateContract(contract.id, { totalValue: parseFloat(proposal.total) || 0 });
  }
}

/** Closes the project once its contract is completed and every installment was received. */
export async function syncProjectCompletion(projectId: number, repo: IntegrationRepo = dbIntegrationRepo) {
  const contract = await repo.getContractByProject(projectId);
  if (contract?.status !== "completed") return false;
  if (!(await repo.allPaymentsReceived(contract.id))) return false;
  const project = await repo.getProject(projectId);
  if (!project || project.status === "completed") return false;
  await repo.updateProject(projectId, { status: "completed" });
  return true;
}
