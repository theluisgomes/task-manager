import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./_core/openRouter", () => ({ chatCompletion: vi.fn() }));

import { chatCompletion } from "./_core/openRouter";
import {
  buildDraftMessages,
  consumeAiQuota,
  generateDraft,
  resetAiQuota,
  rewriteText,
} from "./proposalAi";

const mockedChat = vi.mocked(chatCompletion);
const reply = (content: string) => ({ content, model: "qwen/test", totalTokens: 100 });

const briefing = {
  description: "Novo site institucional com CMS e blog",
  targetBudget: 18000,
  tone: "consultivo" as const,
  sections: ["intro", "items"] as Array<"intro" | "items">,
};
const context = { clientName: "Acme Ltda", title: "Redesign do site" };

describe("generateDraft", () => {
  beforeEach(() => {
    resetAiQuota();
    mockedChat.mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("parses the draft, strips think blocks and markdown, and drops unrequested sections", async () => {
    mockedChat.mockResolvedValueOnce(
      reply(
        '<think>ok</think>{"intro":"**Olá** Acme","scope":"1. extra","items":[{"description":"Design","quantity":1,"unitPrice":18000}]}'
      )
    );
    const draft = await generateDraft(1, briefing, context);
    expect(draft.intro).toBe("Olá Acme");
    expect(draft.scope).toBeUndefined();
    expect(draft.items).toEqual([{ description: "Design", quantity: 1, unitPrice: 18000 }]);
  });

  it("asks the model to fix invalid JSON once", async () => {
    mockedChat
      .mockResolvedValueOnce(reply("desculpe, aqui vai: {intro: sem aspas}"))
      .mockResolvedValueOnce(reply('{"intro":"Corrigido"}'));
    const draft = await generateDraft(1, briefing, context);
    expect(draft.intro).toBe("Corrigido");
    expect(mockedChat).toHaveBeenCalledTimes(2);
    const retryMessages = mockedChat.mock.calls[1][0].messages;
    expect(retryMessages.at(-1)?.content).toContain("JSON acima é inválido");
  });

  it("fails with invalid_output after two bad replies", async () => {
    mockedChat.mockResolvedValue(reply("nada de json"));
    await expect(generateDraft(1, briefing, context)).rejects.toMatchObject({ kind: "invalid_output" });
    expect(mockedChat).toHaveBeenCalledTimes(2);
  });

  it("blocks the 11th call within the window without calling the model", async () => {
    mockedChat.mockResolvedValue(reply('{"intro":"ok"}'));
    for (let i = 0; i < 10; i++) await generateDraft(7, briefing, context);
    mockedChat.mockClear();
    await expect(generateDraft(7, briefing, context)).rejects.toMatchObject({ kind: "rate_limited" });
    expect(mockedChat).not.toHaveBeenCalled();
  });
});

describe("consumeAiQuota", () => {
  beforeEach(() => resetAiQuota());

  it("frees quota after the 10-minute window", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 10; i++) consumeAiQuota(3, t0);
    expect(() => consumeAiQuota(3, t0 + 1000)).toThrow();
    expect(() => consumeAiQuota(3, t0 + 10 * 60 * 1000 + 1)).not.toThrow();
  });
});

describe("buildDraftMessages", () => {
  it("includes the budget rule and the requested sections", () => {
    const [system, user] = buildDraftMessages(briefing, context);
    expect(system.content).toContain("/no_think");
    expect(user.content).toMatch(/R\$\s18\.000,00/);
    expect(user.content).toContain("Apresentação, Itens de investimento");
    expect(user.content).toContain("Acme Ltda");
  });
});

describe("rewriteText", () => {
  beforeEach(() => {
    resetAiQuota();
    mockedChat.mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("returns the rewritten text", async () => {
    mockedChat.mockResolvedValueOnce(reply('{"text":"Texto melhorado"}'));
    const result = await rewriteText(1, {
      field: "intro",
      text: "texto ruim",
      tone: "formal",
      context,
    });
    expect(result.text).toBe("Texto melhorado");
  });
});
