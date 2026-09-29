import { fmtBrl } from "../shared/billing";
import {
  AI_SECTIONS,
  PROPOSAL_AI_DRAFT_JSON_SCHEMA,
  extractJson,
  proposalAiDraftSchema,
  proposalAiRewriteSchema,
  stripMarkdown,
  type AiTone,
  type ProposalAiBriefing,
  type ProposalAiContext,
  type ProposalAiDraft,
} from "../shared/proposalAi";
import { proposalSubtotal } from "../shared/proposals";
import { chatCompletion, type ChatMessage } from "./_core/openRouter";

export class ProposalAiError extends Error {
  constructor(
    message: string,
    readonly kind: "invalid_output" | "rate_limited"
  ) {
    super(message);
    this.name = "ProposalAiError";
  }
}

// ─── Rate limit ───────────────────────────────────────────────────────────────

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const usage = new Map<number, number[]>();

export function consumeAiQuota(userId: number, now = Date.now()) {
  const recent = (usage.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    usage.set(userId, recent);
    throw new ProposalAiError("AI rate limit reached", "rate_limited");
  }
  recent.push(now);
  usage.set(userId, recent);
}

export function resetAiQuota() {
  usage.clear();
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

const TONE_GUIDE: Record<AiTone, string> = {
  formal: "formal e institucional, frases completas, sem gírias",
  consultivo: "consultivo, mostrando entendimento do problema do cliente e o valor da solução",
  direto: "direto e objetivo, frases curtas, foco em entregáveis e resultados",
};

const SECTION_RULES: Record<string, string> = {
  intro: "intro: 2 a 3 parágrafos curtos apresentando o contexto do cliente e o objetivo da proposta.",
  scope:
    'scope: lista numerada das entregas e etapas, uma por linha, no formato "1. Etapa: detalhe".',
  items:
    "items: de 2 a 8 itens de investimento com description, quantity (número) e unitPrice (número em reais, sem símbolo).",
  paymentTerms: "paymentTerms: condições de pagamento em uma ou duas frases.",
  deliveryTime: 'deliveryTime: prazo curto, ex.: "45 dias úteis após a assinatura".',
};

function systemPrompt(extra: string) {
  return [
    "Você é um consultor comercial sênior brasileiro que escreve propostas comerciais claras, persuasivas e objetivas.",
    "Escreva sempre em português do Brasil.",
    "Não use markdown (sem #, **, tabelas ou bullets com *). O texto será impresso em PDF como texto puro.",
    extra,
    "/no_think",
  ].join("\n");
}

function describeContext(context: ProposalAiContext) {
  const lines = [
    `Cliente: ${context.clientName || "(não informado)"}`,
    `Título da proposta: ${context.title || "(não informado)"}`,
  ];
  if (context.contactName) lines.push(`Contato: ${context.contactName}`);
  if (context.intro?.trim()) lines.push(`Apresentação atual:\n${context.intro.trim()}`);
  if (context.scope?.trim()) lines.push(`Escopo atual:\n${context.scope.trim()}`);
  const items = (context.items ?? []).filter((i) => i.description.trim());
  if (items.length) {
    lines.push(
      "Itens atuais:\n" +
        items.map((i) => `- ${i.description} (${i.quantity} x ${fmtBrl(i.unitPrice)})`).join("\n")
    );
  }
  return lines.join("\n");
}

export function buildDraftMessages(
  briefing: ProposalAiBriefing,
  context: ProposalAiContext
): ChatMessage[] {
  const rules = briefing.sections.map((s) => `- ${SECTION_RULES[s]}`).join("\n");
  const budgetRule = briefing.targetBudget
    ? `A soma de quantity x unitPrice dos itens deve ficar próxima de ${fmtBrl(briefing.targetBudget)} (no máximo 10% de diferença).`
    : "Sugira valores realistas para o mercado brasileiro.";
  const system = systemPrompt(
    [
      "Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois, seguindo este JSON Schema:",
      JSON.stringify(PROPOSAL_AI_DRAFT_JSON_SCHEMA),
      "Inclua apenas as chaves pedidas pelo usuário.",
      "Valores monetários são números positivos, sem símbolo de moeda nem separador de milhar.",
    ].join("\n")
  );
  const sectionNames = briefing.sections
    .map((s) => AI_SECTIONS.find((x) => x.id === s)?.label ?? s)
    .join(", ");
  const user = [
    describeContext(context),
    "",
    `Briefing do que será entregue:\n${briefing.description.trim()}`,
    "",
    `Tom: ${TONE_GUIDE[briefing.tone]}.`,
    `Seções a gerar: ${sectionNames}.`,
    "Regras por chave:",
    rules,
    briefing.sections.includes("items") ? budgetRule : "",
    "Complemente o conteúdo atual sem contradizê-lo.",
  ]
    .filter(Boolean)
    .join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export function buildRewriteMessages(input: {
  field: "intro" | "scope";
  text: string;
  tone: AiTone;
  context: { clientName: string; title: string };
}): ChatMessage[] {
  const fieldRule =
    input.field === "scope"
      ? 'Mantenha o formato de lista numerada, uma entrega por linha ("1. ...").'
      : "Mantenha de 1 a 3 parágrafos curtos.";
  return [
    {
      role: "system",
      content: systemPrompt(
        'Reescreva o texto do usuário melhorando clareza, persuasão e correção gramatical, sem inventar fatos novos. Responda SOMENTE com JSON no formato {"text": "..."}.'
      ),
    },
    {
      role: "user",
      content: [
        `Cliente: ${input.context.clientName || "(não informado)"}`,
        `Proposta: ${input.context.title || "(não informado)"}`,
        `Tom: ${TONE_GUIDE[input.tone]}.`,
        fieldRule,
        "",
        `Texto original:\n${input.text.trim()}`,
      ].join("\n"),
    },
  ];
}

// ─── Generation ───────────────────────────────────────────────────────────────

async function completeJson<T>(
  messages: ChatMessage[],
  parse: (value: unknown) => { success: true; data: T } | { success: false; error: { message: string } },
  opts: { maxTokens: number; temperature: number; label: string }
): Promise<T> {
  const started = Date.now();
  let tokens = 0;
  let conversation = messages;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await chatCompletion({
      messages: conversation,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
    });
    tokens += result.totalTokens ?? 0;
    const parsed = parse(extractJson(result.content));
    if (parsed.success) {
      console.info(
        `[proposal-ai] ${opts.label} ok model=${result.model} tokens=${tokens} ms=${Date.now() - started} attempts=${attempt + 1}`
      );
      return parsed.data;
    }
    conversation = [
      ...messages,
      { role: "assistant", content: result.content.slice(0, 6000) },
      {
        role: "user",
        content: `O JSON acima é inválido: ${parsed.error.message.slice(0, 500)}. Retorne apenas o JSON corrigido. /no_think`,
      },
    ];
  }
  console.warn(`[proposal-ai] ${opts.label} invalid_output tokens=${tokens} ms=${Date.now() - started}`);
  throw new ProposalAiError("AI returned an invalid format", "invalid_output");
}

export async function generateDraft(
  userId: number,
  briefing: ProposalAiBriefing,
  context: ProposalAiContext
): Promise<ProposalAiDraft> {
  consumeAiQuota(userId);
  const draft = await completeJson(
    buildDraftMessages(briefing, context),
    (v) => proposalAiDraftSchema.safeParse(v),
    { maxTokens: 2500, temperature: 0.6, label: "draft" }
  );
  const wanted = new Set(briefing.sections);
  return {
    intro: wanted.has("intro") && draft.intro ? stripMarkdown(draft.intro) : undefined,
    scope: wanted.has("scope") && draft.scope ? stripMarkdown(draft.scope) : undefined,
    items: wanted.has("items") ? draft.items : undefined,
    paymentTerms:
      wanted.has("paymentTerms") && draft.paymentTerms ? stripMarkdown(draft.paymentTerms) : undefined,
    deliveryTime:
      wanted.has("deliveryTime") && draft.deliveryTime ? stripMarkdown(draft.deliveryTime) : undefined,
  };
}

export async function rewriteText(
  userId: number,
  input: Parameters<typeof buildRewriteMessages>[0]
): Promise<{ text: string }> {
  consumeAiQuota(userId);
  const result = await completeJson(
    buildRewriteMessages(input),
    (v) => proposalAiRewriteSchema.safeParse(v),
    { maxTokens: 1200, temperature: 0.4, label: "rewrite" }
  );
  return { text: stripMarkdown(result.text) };
}

export function draftSubtotal(draft: ProposalAiDraft) {
  return draft.items ? proposalSubtotal(draft.items) : 0;
}
