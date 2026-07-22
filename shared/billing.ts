export type PaymentDueType = "fixed" | "relative";
export type PaymentBaseEventType = "assinatura" | "entrega";

export function fmtBrl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function parseLocalDate(value: string | Date): Date {
  if (value instanceof Date) {
    const local = new Date(value);
    local.setHours(0, 0, 0, 0);
    return local;
  }
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatLocalDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatRelativePaymentTerm(
  baseEventType: PaymentBaseEventType,
  daysAfterBase: number
): string {
  const label = baseEventType === "assinatura" ? "Assinatura" : "Entrega";
  return `${label} + ${daysAfterBase} dias`;
}

export function computeDueDateFromInput(input: {
  dueType: PaymentDueType;
  dueDate?: string | Date | null;
  baseEventDate?: string | Date | null;
  daysAfterBase?: number | null;
}): Date | null {
  if (
    input.dueType === "relative" &&
    input.baseEventDate != null &&
    input.daysAfterBase != null
  ) {
    const base = parseLocalDate(input.baseEventDate);
    base.setDate(base.getDate() + input.daysAfterBase);
    return base;
  }
  if (input.dueDate) {
    return parseLocalDate(input.dueDate);
  }
  return null;
}
