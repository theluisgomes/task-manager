import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENV } from "./env";
import { chatCompletion, OpenRouterError } from "./openRouter";

const okResponse = (content: string) =>
  new Response(
    JSON.stringify({ model: "qwen/test", choices: [{ message: { content } }], usage: { total_tokens: 42 } }),
    { status: 200 }
  );

describe("chatCompletion", () => {
  const original = { ...ENV };

  beforeEach(() => {
    ENV.openRouterApiKey = "sk-or-v1-test";
    ENV.openRouterTimeoutMs = 50;
    ENV.openRouterModel = "qwen/qwen3-30b-a3b-instruct-2507";
    ENV.openRouterFallbackModel = "";
  });

  afterEach(() => {
    Object.assign(ENV, original);
    vi.unstubAllGlobals();
  });

  it("returns content, model and token usage", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse("olá"));
    vi.stubGlobal("fetch", fetchMock);
    const result = await chatCompletion({ messages: [{ role: "user", content: "oi" }], maxTokens: 10 });
    expect(result).toEqual({ content: "olá", model: "qwen/test", totalTokens: 42 });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body).model).toBe(ENV.openRouterModel);
    expect(init.headers.authorization).toBe("Bearer sk-or-v1-test");
  });

  it("fails fast when the key is the placeholder", async () => {
    ENV.openRouterApiKey = "sk-or-v1-your-key-here";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      chatCompletion({ messages: [{ role: "user", content: "oi" }], maxTokens: 10 })
    ).rejects.toMatchObject({ kind: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries once on a 5xx response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("boom", { status: 502 }))
      .mockResolvedValueOnce(okResponse("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const result = await chatCompletion({ messages: [{ role: "user", content: "oi" }], maxTokens: 10 });
    expect(result.content).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 4xx and maps 429 to rate_limited", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("slow down", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      chatCompletion({ messages: [{ role: "user", content: "oi" }], maxTokens: 10 })
    ).rejects.toMatchObject({ kind: "rate_limited" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the free fallback when the primary model is out of credit", async () => {
    ENV.openRouterFallbackModel = "google/gemma-4-31b-it:free";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("insufficient credits", { status: 402 }))
      .mockResolvedValueOnce(okResponse("rascunho"));
    vi.stubGlobal("fetch", fetchMock);
    const result = await chatCompletion({ messages: [{ role: "user", content: "oi" }], maxTokens: 10 });
    expect(result.content).toBe("rascunho");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const fallbackBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(fallbackBody.model).toBe("google/gemma-4-31b-it:free");
    expect(fallbackBody.reasoning).toEqual({ effort: "none" });
  });

  it("does not fall back on an invalid API key", async () => {
    ENV.openRouterFallbackModel = "google/gemma-4-31b-it:free";
    const fetchMock = vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      chatCompletion({ messages: [{ role: "user", content: "oi" }], maxTokens: 10 })
    ).rejects.toMatchObject({ kind: "upstream", status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("raises a timeout error when the request hangs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_, reject) =>
            init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
          )
      )
    );
    const error = await chatCompletion({ messages: [{ role: "user", content: "oi" }], maxTokens: 10 }).catch(
      (e) => e
    );
    expect(error).toBeInstanceOf(OpenRouterError);
    expect(error.kind).toBe("timeout");
  });
});
