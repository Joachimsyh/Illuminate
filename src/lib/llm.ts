/**
 * LLM client: NVIDIA NIM (primary) → OpenRouter (fallback).
 * OpenAI-compatible chat completions.
 */

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export class LlmError extends Error {
  constructor(
    message: string,
    public provider?: "nvidia" | "openrouter",
    public status?: number
  ) {
    super(message);
    this.name = "LlmError";
  }
}

type Provider = {
  id: "nvidia" | "openrouter";
  baseUrl: string;
  apiKey: string;
  model: string;
  extraHeaders?: Record<string, string>;
};

function getProviders(): Provider[] {
  const providers: Provider[] = [];

  const nvidiaKey = process.env.NVIDIA_API_KEY?.trim();
  if (nvidiaKey) {
    providers.push({
      id: "nvidia",
      baseUrl:
        process.env.NVIDIA_BASE_URL?.trim() ||
        "https://integrate.api.nvidia.com/v1",
      apiKey: nvidiaKey,
      model: process.env.NVIDIA_MODEL?.trim() || "z-ai/glm-5.2",
    });
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (openRouterKey) {
    providers.push({
      id: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: openRouterKey,
      model: process.env.OPENROUTER_MODEL?.trim() || "openai/gpt-4o-mini",
      extraHeaders: {
        "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000",
        "X-Title": "Illuminate",
      },
    });
  }

  return providers;
}

async function chatOnce(
  provider: Provider,
  {
    messages,
    temperature,
    maxTokens,
    topP,
    seed,
    responseFormat,
  }: {
    messages: ChatMessage[];
    temperature: number;
    maxTokens: number;
    topP: number;
    seed?: number;
    responseFormat?: { type: "json_object" };
  }
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
        ...(provider.extraHeaders || {}),
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        temperature,
        top_p: topP,
        max_tokens: maxTokens,
        ...(typeof seed === "number" ? { seed } : {}),
        // NVIDIA/GLM may ignore this; OpenRouter often honors it
        ...(responseFormat ? { response_format: responseFormat } : {}),
        stream: false,
      }),
      signal: controller.signal,
    });

    const data = (await res.json().catch(() => null)) as {
      error?: { message?: string };
      choices?: { message?: { content?: string | null } }[];
    } | null;

    if (!res.ok) {
      throw new LlmError(
        data?.error?.message || `${provider.id} request failed (${res.status})`,
        provider.id,
        res.status
      );
    }

    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new LlmError(`${provider.id} returned an empty response`, provider.id);
    }
    return content;
  } catch (err) {
    if (err instanceof LlmError) throw err;
    const message =
      err instanceof Error ? err.message : `${provider.id} request failed`;
    throw new LlmError(message, provider.id);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Chat with NVIDIA first, then OpenRouter if primary fails.
 */
export async function llmChat({
  messages,
  temperature = 0.2,
  maxTokens = 2048,
  topP = 1,
  seed,
  responseFormat,
}: {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  seed?: number;
  responseFormat?: { type: "json_object" };
}): Promise<{ content: string; provider: "nvidia" | "openrouter" }> {
  const providers = getProviders();
  if (!providers.length) {
    throw new LlmError(
      "No LLM configured. Set NVIDIA_API_KEY and/or OPENROUTER_API_KEY."
    );
  }

  let lastError: LlmError | null = null;

  for (const provider of providers) {
    try {
      const content = await chatOnce(provider, {
        messages,
        temperature,
        maxTokens,
        topP,
        seed,
        responseFormat,
      });
      return { content, provider: provider.id };
    } catch (err) {
      lastError =
        err instanceof LlmError
          ? err
          : new LlmError(
              err instanceof Error ? err.message : "LLM failed",
              provider.id
            );
      console.warn(
        `[llm] ${provider.id} failed, trying next:`,
        lastError.message
      );
    }
  }

  throw lastError || new LlmError("All LLM providers failed");
}
