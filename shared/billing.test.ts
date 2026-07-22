import { describe, expect, it } from "vitest";
import { computeDueDateFromInput, formatRelativePaymentTerm } from "./billing";

describe("formatRelativePaymentTerm", () => {
  it("formats assinatura term", () => {
    expect(formatRelativePaymentTerm("assinatura", 40)).toBe("Assinatura + 40 dias");
  });

  it("formats entrega term", () => {
    expect(formatRelativePaymentTerm("entrega", 30)).toBe("Entrega + 30 dias");
  });
});

describe("computeDueDateFromInput", () => {
  it("computes relative due date", () => {
    const result = computeDueDateFromInput({
      dueType: "relative",
      baseEventDate: "2026-01-01",
      daysAfterBase: 40,
    });
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2026);
    expect(result!.getMonth()).toBe(1);
    expect(result!.getDate()).toBe(10);
  });

  it("uses fixed due date", () => {
    const result = computeDueDateFromInput({
      dueType: "fixed",
      dueDate: "2026-03-15",
    });
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2026);
    expect(result!.getMonth()).toBe(2);
    expect(result!.getDate()).toBe(15);
  });
});
