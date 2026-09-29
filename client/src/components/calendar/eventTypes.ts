export type CalendarEventType =
  | "payment"
  | "task"
  | "lead_close"
  | "proposal_valid"
  | "contract_start"
  | "contract_end"
  | "contract_event";

export const CALENDAR_EVENT_TYPES: Array<{ id: CalendarEventType; label: string; dot: string }> = [
  { id: "payment", label: "Faturamento", dot: "bg-data-1" },
  { id: "task", label: "Tarefas", dot: "bg-data-6" },
  { id: "lead_close", label: "Fechamento (CRM)", dot: "bg-data-3" },
  { id: "proposal_valid", label: "Validade de proposta", dot: "bg-data-4" },
  { id: "contract_start", label: "Início de contrato", dot: "bg-data-5" },
  { id: "contract_end", label: "Fim de contrato", dot: "bg-data-2" },
  { id: "contract_event", label: "Eventos do contrato", dot: "bg-primary" },
];

export const CALENDAR_EVENT_KINDS = [
  { id: "reuniao", label: "Reunião" },
  { id: "entrega", label: "Entrega" },
  { id: "marco", label: "Marco" },
  { id: "outro", label: "Outro" },
] as const;

export type CalendarEventKind = (typeof CALENDAR_EVENT_KINDS)[number]["id"];

export function calendarEventTypeMeta(type: CalendarEventType) {
  return CALENDAR_EVENT_TYPES.find((t) => t.id === type) ?? CALENDAR_EVENT_TYPES[0];
}

export function calendarEventKindLabel(kind: string | null | undefined) {
  return CALENDAR_EVENT_KINDS.find((k) => k.id === kind)?.label ?? "Evento";
}

/** Where each event type lives in the app. */
export function calendarEventHref(ev: {
  type: CalendarEventType;
  projectId?: number;
  proposalId?: number;
  leadId?: number;
}): { href: string; label: string } | null {
  switch (ev.type) {
    case "lead_close":
      return { href: "/crm", label: "Abrir no CRM" };
    case "proposal_valid":
      return ev.proposalId ? { href: `/proposals/${ev.proposalId}`, label: "Abrir proposta" } : null;
    case "task":
      return ev.projectId ? { href: `/projects/${ev.projectId}`, label: "Abrir projeto" } : null;
    default:
      return ev.projectId ? { href: `/projects/${ev.projectId}?tab=faturamento`, label: "Abrir faturamento do projeto" } : null;
  }
}
