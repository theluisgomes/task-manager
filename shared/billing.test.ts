import { describe, expect, it } from "vitest";
import { appliedAmount, computeDueDateFromInput, formatRelativePaymentTerm } from "./billing";

describe("appliedAmount", () => {
  it("keeps the calculated amount when there is no override", () => {
    expect(appliedAmount(null, 20000)).toEqual({ amount: 20000, adjusted: false, computed: 20000 });
  });

  it("uses a stored override, including zero", () => {
    expect(appliedAmount("0.00", 20000)).toEqual({ amount: 0, adjusted: true, computed: 20000 });
    expect(appliedAmount(1500, 20000)).toEqual({ amount: 1500, adjusted: true, computed: 20000 });
  });
});

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
