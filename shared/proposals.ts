export type ProposalItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type ProposalInstallment = {
  description: string;
  percent: number;
  dueType: "fixed" | "relative";
  dueDate?: string | null;
  baseEventType?: "assinatura" | "entrega" | null;
  daysAfterBase?: number | null;
};

export type InstallmentPayment = {
  description: string;
  amount: number;
  dueType: "fixed" | "relative";
  dueDate?: string;
  baseEventType?: "assinatura" | "entrega";
  baseEventDate?: string;
  daysAfterBase?: number;
};

export const DEFAULT_INSTALLMENTS: ProposalInstallment[] = [
  { description: "Parcela única", percent: 100, dueType: "relative", baseEventType: "assinatura", daysAfterBase: 0 },
];

export const INSTALLMENT_PRESETS: Array<{ id: string; label: string; installments: ProposalInstallment[] }> = [
  { id: "single", label: "100% na assinatura", installments: DEFAULT_INSTALLMENTS },
  {
    id: "half",
    label: "50/50 (assinatura e entrega)",
    installments: [
      { description: "Entrada (50%)", percent: 50, dueType: "relative", baseEventType: "assinatura", daysAfterBase: 0 },
      { description: "Entrega (50%)", percent: 50, dueType: "relative", baseEventType: "entrega", daysAfterBase: 0 },
    ],
  },
  {
    id: "three",
    label: "3x mensal",
    installments: [
      { description: "Parcela 1/3", percent: 33.34, dueType: "relative", baseEventType: "assinatura", daysAfterBase: 0 },
      { description: "Parcela 2/3", percent: 33.33, dueType: "relative", baseEventType: "assinatura", daysAfterBase: 30 },
      { description: "Parcela 3/3", percent: 33.33, dueType: "relative", baseEventType: "assinatura", daysAfterBase: 60 },
    ],
  },
];

export function installmentsPercentTotal(installments: ProposalInstallment[]): number {
  return round2(installments.reduce((sum, i) => sum + (Number.isFinite(i.percent) ? i.percent : 0), 0));
}

export function installmentsAreValid(installments: ProposalInstallment[]): boolean {
  return (
    installments.length > 0 &&
    installments.every((i) => i.percent > 0) &&
    Math.abs(installmentsPercentTotal(installments) - 100) < 0.01
  );
}

/**
 * Splits the proposal total into contract payments. The last installment absorbs rounding
 * so amounts always sum to the total. Relative "assinatura" terms are anchored on signatureDate;
 * "entrega" terms stay open until the delivery date is known.
 */
export function installmentsToPayments(
  total: number,
  installments: ProposalInstallment[] | null | undefined,
  signatureDate: string
): InstallmentPayment[] {
  const list = installments && installmentsAreValid(installments) ? installments : DEFAULT_INSTALLMENTS;
  let allocated = 0;
  return list.map((inst, index) => {
    const isLast = index === list.length - 1;
    const amount = isLast ? round2(total - allocated) : round2((total * inst.percent) / 100);
    allocated = round2(allocated + amount);
    if (inst.dueType === "fixed") {
      return { description: inst.description, amount, dueType: "fixed", dueDate: inst.dueDate ?? undefined };
    }
    const baseEventType = inst.baseEventType ?? "assinatura";
    return {
      description: inst.description,
      amount,
      dueType: "relative",
      baseEventType,
      baseEventDate: baseEventType === "assinatura" ? signatureDate : undefined,
      daysAfterBase: inst.daysAfterBase ?? 0,
    };
  });
}

export const PROPOSAL_STATUSES = [
  { id: "draft", label: "Rascunho" },
  { id: "sent", label: "Enviada" },
  { id: "accepted", label: "Aceita" },
  { id: "rejected", label: "Recusada" },
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]["id"];

export const PROPOSAL_STATUS_IDS = PROPOSAL_STATUSES.map((s) => s.id) as [
  ProposalStatus,
  ...ProposalStatus[],
];

export function getProposalStatusLabel(status: string): string {
  return PROPOSAL_STATUSES.find((s) => s.id === status)?.label ?? status;
}

/** Lead status the CRM pipeline should move to when a proposal reaches this status. */
export function leadStatusForProposal(
  status: ProposalStatus
): "proposal" | "won" | "lost" | null {
  if (status === "sent") return "proposal";
  if (status === "accepted") return "won";
  if (status === "rejected") return "lost";
  return null;
}

export const PROPOSAL_ISSUER = {
  companyName: "Task Manager",
  tagline: "Proposta comercial",
  accentColor: "#1DB5A3",
  footer: "Esta proposta é confidencial e destinada exclusivamente ao cliente indicado.",
};

export const DEFAULT_VALIDITY_DAYS = 15;

export function itemTotal(item: ProposalItem): number {
  const qty = Number.isFinite(item.quantity) ? item.quantity : 0;
  const price = Number.isFinite(item.unitPrice) ? item.unitPrice : 0;
  return round2(qty * price);
}

export function proposalSubtotal(items: ProposalItem[]): number {
  return round2(items.reduce((sum, item) => sum + itemTotal(item), 0));
}

export function proposalTotal(items: ProposalItem[], discount: number): number {
  const subtotal = proposalSubtotal(items);
  const safeDiscount = Math.min(Math.max(discount || 0, 0), subtotal);
  return round2(subtotal - safeDiscount);
}

export function formatProposalNumber(year: number, sequence: number): string {
  return `PROP-${year}-${String(sequence).padStart(3, "0")}`;
}

export function nextProposalNumber(existing: string[], year: number): string {
  const prefix = `PROP-${year}-`;
  const max = existing
    .filter((n) => n.startsWith(prefix))
    .map((n) => parseInt(n.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return formatProposalNumber(year, max + 1);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
