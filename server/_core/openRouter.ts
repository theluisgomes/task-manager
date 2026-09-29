import { ENV, isOpenRouterConfigured } from "./env";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatCompletionResult = {
  content: string;
  model: string;
  totalTokens: number | null;
};

export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly kind: "not_configured" | "timeout" | "upstream" | "rate_limited",
    readonly fallbackable = false,
    readonly status?: number
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

const RETRYABLE_STATUS = new Set([408, 500, 502, 503, 504]);
const FALLBACK_STATUS = new Set([402, 404, 408, 429, 500, 502, 503, 504]);

type ModelCall = {
  model: string;
  attempts: number;
  disableReasoning?: boolean;
};

export async function chatCompletion(params: {
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  signal?: AbortSignal;
}): Promise<ChatCompletionResult> {
  if (!isOpenRouterConfigured()) {
    throw new OpenRouterError("OPENROUTER_API_KEY is not configured", "not_configured");
  }

  const primary = ENV.openRouterModel;
  const fallback = ENV.openRouterFallbackModel.trim();
  try {
    return await completeWithModel(params, { model: primary, attempts: 2 });
  } catch (err) {
    if (params.signal?.aborted) throw err;
    if (!(err instanceof OpenRouterError) || !err.fallbackable || !fallback || fallback === primary) {
      throw err;
    }
    console.warn(`[openrouter] ${primary} failed (${err.kind}); trying fallback ${fallback}`);
    try {
      return await completeWithModel(params, { model: fallback, attempts: 1, disableReasoning: true });
    } catch (fallbackErr) {
      if (fallbackErr instanceof OpenRouterError && fallbackErr.status === 400) {
        return await completeWithModel(params, { model: fallback, attempts: 1 });
      }
      throw fallbackErr;
    }
  }
}

async function completeWithModel(
  params: {
    messages: ChatMessage[];
    maxTokens: number;
    temperature?: number;
    signal?: AbortSignal;
  },
  call: ModelCall
): Promise<ChatCompletionResult> {
  const body: Record<string, unknown> = {
    model: call.model,
    messages: params.messages,
    max_tokens: params.maxTokens,
    temperature: params.temperature ?? 0.6,
  };
  if (call.disableReasoning) body.reasoning = { effort: "none" };

  let lastError: unknown;
  for (let attempt = 0; attempt < call.attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ENV.openRouterTimeoutMs);
    const onAbort = () => controller.abort();
    params.signal?.addEventListener("abort", onAbort);
    try {
      const response = await fetch(`${ENV.openRouterBaseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ENV.openRouterApiKey}`,
          "HTTP-Referer": ENV.oauthRedirectBaseUrl || "http://localhost:3000",
          "X-Title": "Task Manager",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300);
        const fallbackable = FALLBACK_STATUS.has(response.status);
        const error =
          response.status === 429
            ? new OpenRouterError("OpenRouter rate limit reached", "rate_limited", true, 429)
            : new OpenRouterError(
                `OpenRouter request failed: ${response.status} ${detail}`,
                "upstream",
                fallbackable,
                response.status
              );
        if (RETRYABLE_STATUS.has(response.status) && attempt < call.attempts - 1) {
          lastError = error;
          continue;
        }
        throw error;
      }

      const json = (await response.json()) as {
        model?: string;
        choices?: Array<{ message?: { content?: string | null } }>;
        usage?: { total_tokens?: number };
        error?: { message?: string };
      };
      if (json.error) {
        throw new OpenRouterError(
          `OpenRouter error: ${json.error.message ?? "unknown"}`,
          "upstream",
          true
        );
      }
      return {
        content: json.choices?.[0]?.message?.content ?? "",
        model: json.model ?? call.model,
        totalTokens: json.usage?.total_tokens ?? null,
      };
    } catch (err) {
      if (err instanceof OpenRouterError) throw err;
      if (params.signal?.aborted) throw err;
      if (controller.signal.aborted) {
        throw new OpenRouterError("OpenRouter request timed out", "timeout", true);
      }
      lastError = err;
      if (attempt === call.attempts - 1) break;
    } finally {
      clearTimeout(timer);
      params.signal?.removeEventListener("abort", onAbort);
    }
  }
  throw new OpenRouterError(
    `OpenRouter request failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    "upstream",
    true
  );
}
