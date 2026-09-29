import { formatLocalDate } from "@shared/billing";
import {
  DEFAULT_VALIDITY_DAYS,
  INSTALLMENT_PRESETS,
  type ProposalInstallment,
  type ProposalItem,
} from "@shared/proposals";

export type ProposalFormState = {
  leadId: number | null;
  projectId: number | null;
  clientName: string;
  contactName: string;
  contactEmail: string;
  title: string;
  intro: string;
  scope: string;
  items: ProposalItem[];
  discount: number;
  paymentTerms: string;
  installments: ProposalInstallment[];
  deliveryTime: string;
  validUntil: string;
  notes: string;
};

type ProposalRow = {
  leadId: number | null;
  projectId: number | null;
  clientName: string;
  contactName: string | null;
  contactEmail: string | null;
  title: string;
  intro: string | null;
  scope: string | null;
  items: ProposalItem[];
  discount: string | number;
  paymentTerms: string | null;
  installments?: ProposalInstallment[] | null;
  deliveryTime: string | null;
  validUntil: Date | string | null;
  notes: string | null;
};

export function emptyProposalForm(): ProposalFormState {
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + DEFAULT_VALIDITY_DAYS);
  return {
    leadId: null,
    projectId: null,
    clientName: "",
    contactName: "",
    contactEmail: "",
    title: "",
    intro: "",
    scope: "",
    items: [{ description: "", quantity: 1, unitPrice: 0 }],
    discount: 0,
    paymentTerms: "50% na assinatura e 50% na entrega.",
    installments: INSTALLMENT_PRESETS.find((p) => p.id === "half")!.installments.map((i) => ({ ...i })),
    deliveryTime: "",
    validUntil: formatLocalDate(validUntil),
    notes: "",
  };
}

export function formFromProposal(row: ProposalRow): ProposalFormState {
  const validUntil =
    row.validUntil == null
      ? ""
      : typeof row.validUntil === "string"
        ? row.validUntil.slice(0, 10)
        : formatLocalDate(row.validUntil);
  return {
    leadId: row.leadId,
    projectId: row.projectId,
    clientName: row.clientName,
    contactName: row.contactName ?? "",
    contactEmail: row.contactEmail ?? "",
    title: row.title,
    intro: row.intro ?? "",
    scope: row.scope ?? "",
    items: row.items?.length ? row.items : [],
    discount: parseFloat(String(row.discount)) || 0,
    paymentTerms: row.paymentTerms ?? "",
    installments: row.installments ?? [],
    deliveryTime: row.deliveryTime ?? "",
    validUntil,
    notes: row.notes ?? "",
  };
}

export function formToInput(form: ProposalFormState) {
  const blank = (v: string) => (v.trim() ? v.trim() : null);
  return {
    leadId: form.leadId,
    projectId: form.projectId,
    clientName: form.clientName.trim(),
    contactName: blank(form.contactName),
    contactEmail: blank(form.contactEmail),
    title: form.title.trim(),
    intro: blank(form.intro),
    scope: blank(form.scope),
    items: form.items
      .filter((i) => i.description.trim() || i.unitPrice > 0)
      .map((i) => ({ ...i, description: i.description.trim() })),
    discount: form.discount || 0,
    paymentTerms: blank(form.paymentTerms),
    installments: form.installments.length ? form.installments : null,
    deliveryTime: blank(form.deliveryTime),
    validUntil: form.validUntil || null,
    notes: blank(form.notes),
  };
}
