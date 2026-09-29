import { describe, expect, it } from "vitest";
import {
  onLeadStatusChanged,
  onProposalAccepted,
  syncProjectCompletion,
  type IntegrationRepo,
} from "./integrations";

type Row = Record<string, any>;

function memoryRepo(seed: { proposals?: Row[]; leads?: Row[]; projects?: Row[]; contracts?: Row[] } = {}) {
  const state = {
    proposals: seed.proposals ?? [],
    leads: seed.leads ?? [],
    projects: seed.projects ?? [],
    contracts: seed.contracts ?? [],
    payments: [] as Row[],
  };
  const nextId = (rows: Row[]) => rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
  const find = (rows: Row[], id: number) => rows.find((r) => r.id === id);
  const repo: IntegrationRepo = {
    async getProposal(id) { return find(state.proposals, id) as any; },
    async findAcceptedProposalForLead(leadId) {
      return state.proposals.find((p) => p.leadId === leadId && p.status === "accepted") as any;
    },
    async getLead(id) { return find(state.leads, id) as any; },
    async getProject(id) { return find(state.projects, id) as any; },
    async getContractByProject(projectId) { return state.contracts.find((c) => c.projectId === projectId) as any; },
    async countPayments(contractId) { return state.payments.filter((p) => p.contractId === contractId).length; },
    async allPaymentsReceived(contractId) {
      const list = state.payments.filter((p) => p.contractId === contractId);
      return list.length > 0 && list.every((p) => p.paymentReceived);
    },
    async createLead(data) {
      const id = nextId(state.leads);
      state.leads.push({ id, projectId: null, status: "prospecting", ...data });
      return id;
    },
    async updateLead(id, data) { Object.assign(find(state.leads, id)!, data); },
    async createProject(data) {
      const id = nextId(state.projects);
      state.projects.push({ id, leadId: null, contractId: null, status: "active", ...data });
      return id;
    },
    async updateProject(id, data) { Object.assign(find(state.projects, id)!, data); },
    async updateProposalLinks(id, data) { Object.assign(find(state.proposals, id)!, data); },
    async createContract(data) {
      const id = nextId(state.contracts);
      state.contracts.push({ id, status: "active", startDate: null, ...data });
      find(state.projects, data.projectId)!.contractId = id;
      return id;
    },
    async updateContract(id, data) {
      const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
      Object.assign(find(state.contracts, id)!, clean);
    },
    async createPayment(contractId, payment) {
      state.payments.push({ id: state.payments.length + 1, contractId, paymentReceived: false, ...payment });
    },
  };
  return { repo, state };
}

const today = new Date(2026, 8, 1);

function proposal(overrides: Row = {}): Row {
  return {
    id: 1,
    leadId: null,
    projectId: null,
    clientName: "Acme",
    title: "Site",
    total: "1000.00",
    status: "accepted",
    installments: null,
    ...overrides,
  };
}

describe("onProposalAccepted", () => {
  it("creates lead, project, contract and payments when nothing is linked", async () => {
    const { repo, state } = memoryRepo({ proposals: [proposal()] });
    const result = await onProposalAccepted(1, 7, repo, today);

    expect(result.paymentsCreated).toBe(1);
    expect(state.leads).toHaveLength(1);
    expect(state.leads[0]).toMatchObject({ status: "won", projectId: result.projectId });
    expect(state.projects[0]).toMatchObject({ leadId: result.leadId, contractId: result.contractId, ownerId: 7 });
    expect(state.contracts[0]).toMatchObject({ totalValue: 1000, leadId: result.leadId, status: "active" });
    expect(state.proposals[0]).toMatchObject({ leadId: result.leadId, projectId: result.projectId });
    expect(state.payments[0]).toMatchObject({ amount: 1000, baseEventDate: "2026-09-01" });
  });

  it("is idempotent: accepting twice does not duplicate contract or payments", async () => {
    const { repo, state } = memoryRepo({ proposals: [proposal()] });
    const first = await onProposalAccepted(1, 7, repo, today);
    const second = await onProposalAccepted(1, 7, repo, today);

    expect(second).toMatchObject({ projectId: first.projectId, contractId: first.contractId, paymentsCreated: 0 });
    expect(state.projects).toHaveLength(1);
    expect(state.contracts).toHaveLength(1);
    expect(state.payments).toHaveLength(1);
  });

  it("reuses the lead's project and existing contract", async () => {
    const { repo, state } = memoryRepo({
      proposals: [proposal({ leadId: 3 })],
      leads: [{ id: 3, projectId: 5, status: "proposal" }],
      projects: [{ id: 5, leadId: 3, contractId: 9, status: "active" }],
      contracts: [{ id: 9, projectId: 5, leadId: null, status: "draft", startDate: null, totalValue: 0 }],
    });
    const result = await onProposalAccepted(1, 7, repo, today);

    expect(result).toMatchObject({ leadId: 3, projectId: 5, contractId: 9, paymentsCreated: 1 });
    expect(state.contracts[0]).toMatchObject({ totalValue: 1000, status: "active", leadId: 3 });
    expect(state.leads[0].status).toBe("won");
  });
});

describe("onLeadStatusChanged", () => {
  it("runs the accepted-proposal flow when a lead is won", async () => {
    const { repo, state } = memoryRepo({
      proposals: [proposal({ leadId: 3 })],
      leads: [{ id: 3, projectId: null, status: "won" }],
    });
    const result = await onLeadStatusChanged(3, "won", 7, repo);
    expect(result?.contractId).toBeDefined();
    expect(state.contracts).toHaveLength(1);
  });

  it("cancels a draft contract when the lead is lost", async () => {
    const { repo, state } = memoryRepo({
      leads: [{ id: 3, projectId: 5, status: "lost" }],
      contracts: [{ id: 9, projectId: 5, status: "draft", startDate: null }],
    });
    await onLeadStatusChanged(3, "lost", 7, repo);
    expect(state.contracts[0].status).toBe("cancelled");
  });
});

describe("syncProjectCompletion", () => {
  it("completes the project once the contract is completed and all payments received", async () => {
    const { repo, state } = memoryRepo({
      projects: [{ id: 5, leadId: null, contractId: 9, status: "active" }],
      contracts: [{ id: 9, projectId: 5, status: "completed", startDate: null }],
    });
    await repo.createPayment(9, { description: "x", amount: 10, dueType: "fixed" });
    expect(await syncProjectCompletion(5, repo)).toBe(false);

    state.payments[0].paymentReceived = true;
    expect(await syncProjectCompletion(5, repo)).toBe(true);
    expect(state.projects[0].status).toBe("completed");
  });
});
