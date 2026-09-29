import { describe, expect, it } from "vitest";
import {
  INSTALLMENT_PRESETS,
  installmentsAreValid,
  installmentsToPayments,
  leadStatusForProposal,
  nextProposalNumber,
  proposalSubtotal,
  proposalTotal,
} from "./proposals";

const items = [
  { description: "Design", quantity: 2, unitPrice: 1500.5 },
  { description: "Dev", quantity: 10, unitPrice: 120 },
];

describe("proposal totals", () => {
  it("sums quantity times unit price", () => {
    expect(proposalSubtotal(items)).toBe(4201);
  });

  it("applies discount", () => {
    expect(proposalTotal(items, 201)).toBe(4000);
  });

  it("clamps discount to subtotal and ignores negatives", () => {
    expect(proposalTotal(items, 99999)).toBe(0);
    expect(proposalTotal(items, -50)).toBe(4201);
  });
});

describe("nextProposalNumber", () => {
  it("starts at 001 for a new year", () => {
    expect(nextProposalNumber(["PROP-2025-007"], 2026)).toBe("PROP-2026-001");
  });

  it("increments the highest sequence of the year", () => {
    expect(nextProposalNumber(["PROP-2026-002", "PROP-2026-010"], 2026)).toBe("PROP-2026-011");
  });
});

describe("leadStatusForProposal", () => {
  it("maps proposal status to pipeline status", () => {
    expect(leadStatusForProposal("sent")).toBe("proposal");
    expect(leadStatusForProposal("accepted")).toBe("won");
    expect(leadStatusForProposal("rejected")).toBe("lost");
    expect(leadStatusForProposal("draft")).toBeNull();
  });
});

describe("installmentsToPayments", () => {
  it("falls back to a single payment on signature", () => {
    const payments = installmentsToPayments(1000, null, "2026-09-01");
    expect(payments).toEqual([
      {
        description: "Parcela única",
        amount: 1000,
        dueType: "relative",
        baseEventType: "assinatura",
        baseEventDate: "2026-09-01",
        daysAfterBase: 0,
      },
    ]);
  });

  it("splits by percent and keeps the sum exact", () => {
    const three = INSTALLMENT_PRESETS.find((p) => p.id === "three")!.installments;
    const payments = installmentsToPayments(1000, three, "2026-09-01");
    expect(payments.map((p) => p.amount)).toEqual([333.4, 333.3, 333.3]);
    expect(payments.reduce((s, p) => s + p.amount, 0)).toBeCloseTo(1000, 2);
    expect(payments[2].daysAfterBase).toBe(60);
  });

  it("leaves delivery-based terms without a base date", () => {
    const half = INSTALLMENT_PRESETS.find((p) => p.id === "half")!.installments;
    const payments = installmentsToPayments(500, half, "2026-09-01");
    expect(payments[1]).toMatchObject({ amount: 250, baseEventType: "entrega", baseEventDate: undefined });
  });

  it("ignores invalid installments that do not sum to 100%", () => {
    const invalid = [{ description: "A", percent: 40, dueType: "fixed" as const, dueDate: "2026-10-01" }];
    expect(installmentsAreValid(invalid)).toBe(false);
    expect(installmentsToPayments(100, invalid, "2026-09-01")).toHaveLength(1);
    expect(installmentsToPayments(100, invalid, "2026-09-01")[0].description).toBe("Parcela única");
  });
});
