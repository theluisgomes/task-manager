import { describe, expect, it } from "vitest";
import {
  budgetDeviation,
  extractJson,
  proposalAiBriefingSchema,
  proposalAiDraftSchema,
  stripMarkdown,
} from "./proposalAi";

describe("extractJson", () => {
  it("parses a plain object", () => {
    expect(extractJson('{"intro":"Olá"}')).toEqual({ intro: "Olá" });
  });

  it("ignores Qwen3 think blocks and markdown fences", () => {
    const reply = '<think>raciocínio {não é json}</think>\n```json\n{"scope":"1. A"}\n```';
    expect(extractJson(reply)).toEqual({ scope: "1. A" });
  });

  it("handles braces inside strings and trailing prose", () => {
    expect(extractJson('Aqui está: {"intro":"use {chaves}"} espero ter ajudado')).toEqual({
      intro: "use {chaves}",
    });
  });

  it("returns null for invalid or missing JSON", () => {
    expect(extractJson("sem json aqui")).toBeNull();
    expect(extractJson('{"intro": }')).toBeNull();
    expect(extractJson("<think>só pensando {")).toBeNull();
  });
});

describe("proposalAiDraftSchema", () => {
  it("coerces numeric strings in items", () => {
    const parsed = proposalAiDraftSchema.parse({
      items: [{ description: "Design", quantity: "2", unitPrice: "1500" }],
    });
    expect(parsed.items?.[0]).toEqual({ description: "Design", quantity: 2, unitPrice: 1500 });
  });

  it("rejects negative prices and empty item lists", () => {
    expect(
      proposalAiDraftSchema.safeParse({ items: [{ description: "X", quantity: 1, unitPrice: -1 }] })
        .success
    ).toBe(false);
    expect(proposalAiDraftSchema.safeParse({ items: [] }).success).toBe(false);
  });
});

describe("proposalAiBriefingSchema", () => {
  it("requires a description of at least 20 chars and one section", () => {
    const base = { tone: "formal" as const, sections: ["intro" as const] };
    expect(proposalAiBriefingSchema.safeParse({ ...base, description: "curto" }).success).toBe(false);
    expect(
      proposalAiBriefingSchema.safeParse({ ...base, description: "x".repeat(20), sections: [] })
        .success
    ).toBe(false);
    expect(proposalAiBriefingSchema.safeParse({ ...base, description: "x".repeat(20) }).success).toBe(
      true
    );
  });
});

describe("budgetDeviation", () => {
  const items = [{ description: "A", quantity: 2, unitPrice: 550 }];

  it("returns relative deviation from target", () => {
    expect(budgetDeviation(items, 1000)).toBeCloseTo(0.1);
  });

  it("returns null without a target", () => {
    expect(budgetDeviation(items, 0)).toBeNull();
    expect(budgetDeviation(items, undefined)).toBeNull();
  });
});

describe("stripMarkdown", () => {
  it("removes headings and bold markers", () => {
    expect(stripMarkdown("## Escopo\n**1. Design**")).toBe("Escopo\n1. Design");
  });
});
