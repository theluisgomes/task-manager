import { z } from "zod";
import { proposalSubtotal, type ProposalItem } from "./proposals";

export const AI_TONES = [
  { id: "formal", label: "Formal" },
  { id: "consultivo", label: "Consultivo" },
  { id: "direto", label: "Direto" },
] as const;

export const AI_SECTIONS = [
  { id: "intro", label: "Apresentação" },
  { id: "scope", label: "Escopo" },
  { id: "items", label: "Itens de investimento" },
  { id: "paymentTerms", label: "Condições de pagamento" },
  { id: "deliveryTime", label: "Prazo de entrega" },
] as const;

export type AiTone = (typeof AI_TONES)[number]["id"];
export type AiSection = (typeof AI_SECTIONS)[number]["id"];

const toneSchema = z.enum(["formal", "consultivo", "direto"]);
const sectionSchema = z.enum(["intro", "scope", "items", "paymentTerms", "deliveryTime"]);

export const proposalAiBriefingSchema = z.object({
  description: z.string().trim().min(20).max(2000),
  targetBudget: z.number().min(0).optional(),
  tone: toneSchema,
  sections: z.array(sectionSchema).min(1),
});

export type ProposalAiBriefing = z.infer<typeof proposalAiBriefingSchema>;

export const proposalAiContextSchema = z.object({
  leadId: z.number().nullable().optional(),
  clientName: z.string().max(255),
  title: z.string().max(255),
  contactName: z.string().max(255).optional(),
  intro: z.string().max(3000).optional(),
  scope: z.string().max(5000).optional(),
  items: z
    .array(z.object({ description: z.string(), quantity: z.number(), unitPrice: z.number() }))
    .max(50)
    .optional(),
});

export type ProposalAiContext = z.infer<typeof proposalAiContextSchema>;

const aiItemSchema = z.object({
  description: z.string().trim().min(1).max(300),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0),
});

export const proposalAiDraftSchema = z.object({
  intro: z.string().trim().max(1500).optional(),
  scope: z.string().trim().max(3000).optional(),
  items: z.array(aiItemSchema).min(1).max(12).optional(),
  paymentTerms: z.string().trim().max(500).optional(),
  deliveryTime: z.string().trim().max(120).optional(),
});

export type ProposalAiDraft = z.infer<typeof proposalAiDraftSchema>;

export const proposalAiRewriteSchema = z.object({
  text: z.string().trim().min(1).max(3000),
});

/** JSON Schema shown to the model; kept in sync with proposalAiDraftSchema by hand. */
export const PROPOSAL_AI_DRAFT_JSON_SCHEMA = {
  type: "object",
  properties: {
    intro: { type: "string", maxLength: 1500 },
    scope: { type: "string", maxLength: 3000 },
    items: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          quantity: { type: "number" },
          unitPrice: { type: "number" },
        },
        required: ["description", "quantity", "unitPrice"],
      },
    },
    paymentTerms: { type: "string", maxLength: 500 },
    deliveryTime: { type: "string", maxLength: 120 },
  },
};

/**
 * Pulls the first JSON object out of a model reply, ignoring Qwen3 <think> blocks,
 * markdown fences and surrounding prose. Returns null when no parseable object exists.
 */
export function extractJson(text: string): unknown {
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "")
    .replace(/```(?:json)?/gi, "")
    .trim();
  const start = cleaned.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Strips markdown emphasis/headings the PDF would print literally. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^\s*[-*•]\s+/gm, "- ")
    .trim();
}

/** Relative deviation of the items total from the target budget, or null without a target. */
export function budgetDeviation(items: ProposalItem[], target?: number | null): number | null {
  if (!target || target <= 0) return null;
  return (proposalSubtotal(items) - target) / target;
}

export const BUDGET_TOLERANCE = 0.1;
