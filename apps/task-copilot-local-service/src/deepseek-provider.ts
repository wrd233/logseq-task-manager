import { StructuredError } from "@task-copilot/shared";

export interface DeepSeekProviderConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs?: number;
  maxResponseChars?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  maxOutputTokens?: number;
}

export interface DeepSeekProviderReferenceConfig extends Omit<DeepSeekProviderConfig, "apiKey"> {
  apiKeyRef: string;
}

export interface StructuredChatRequest {
  system: string;
  user: string;
  signal?: AbortSignal;
}

export interface StructuredCompletionMetadata {
  requestId?: string;
  model: string;
  finishReason?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  durationMs: number;
  attempts: number;
}

export interface StructuredCompletion {
  value: unknown;
  metadata: StructuredCompletionMetadata;
}

export interface DeepSeekProviderTransport {
  fetch(input: string | URL, init?: RequestInit): Promise<Response>;
  sleep?(milliseconds: number, signal: AbortSignal): Promise<void>;
  now?(): number;
}

export interface ProviderSecretResolver {
  resolve(reference: string): string | undefined | Promise<string | undefined>;
}

export class DeepSeekProviderError extends StructuredError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super({ code, message, ruleRefs: ["D-125", "D-127", "D-130", "D-139"], ...(details ? { details } : {}) });
  }
}

function requireConfig(config: DeepSeekProviderConfig): Required<DeepSeekProviderConfig> {
  const baseUrl = config.baseUrl.trim().replace(/\/+$/, "");
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(baseUrl);
  } catch {
    throw new DeepSeekProviderError("LLM_CONFIG_INVALID", "Provider Base URL 必须是合法 HTTP(S) 地址。");
  }
  if (!baseUrl || !["http:", "https:"].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash) {
    throw new DeepSeekProviderError("LLM_CONFIG_INVALID", "Provider Base URL 必须是无凭据、查询和片段的 HTTP(S) 地址。");
  }
  const model = config.model.trim();
  const apiKey = config.apiKey.trim();
  if (!model || model.length > 256 || /[\r\n]/.test(model)) throw new DeepSeekProviderError("LLM_CONFIG_INVALID", "Provider Model ID 无效。");
  if (!apiKey || apiKey.length > 512 || /[\r\n]/.test(apiKey)) throw new DeepSeekProviderError("LLM_CONFIG_INVALID", "Provider 凭据未配置。");
  const timeoutMs = config.timeoutMs ?? 20_000;
  const maxResponseChars = config.maxResponseChars ?? 200_000;
  const maxRetries = config.maxRetries ?? 1;
  const retryBaseDelayMs = config.retryBaseDelayMs ?? 250;
  const maxOutputTokens = config.maxOutputTokens ?? 2_048;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000
    || !Number.isSafeInteger(maxResponseChars) || maxResponseChars < 1_024 || maxResponseChars > 2_000_000
    || !Number.isSafeInteger(maxRetries) || maxRetries < 0 || maxRetries > 2
    || !Number.isSafeInteger(retryBaseDelayMs) || retryBaseDelayMs < 0 || retryBaseDelayMs > 5_000
    || !Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 256 || maxOutputTokens > 8_192) {
    throw new DeepSeekProviderError("LLM_CONFIG_INVALID", "Provider timeout、响应大小、重试或输出限制无效。");
  }
  return { baseUrl, model, apiKey, timeoutMs, maxResponseChars, maxRetries, retryBaseDelayMs, maxOutputTokens };
}

export async function resolveDeepSeekProviderConfig(
  config: DeepSeekProviderReferenceConfig,
  resolver: ProviderSecretResolver,
): Promise<DeepSeekProviderConfig> {
  const reference = config.apiKeyRef.trim();
  if (!reference || reference.length > 256) throw new DeepSeekProviderError("LLM_SECRET_REFERENCE_INVALID", "Provider 凭据引用无效。");
  const apiKey = await resolver.resolve(reference);
  if (!apiKey?.trim()) throw new DeepSeekProviderError("LLM_SECRET_UNAVAILABLE", "Provider 凭据引用无法解析。");
  return requireConfig({ ...config, apiKey });
}

function parseJsonContent(value: unknown): unknown {
  if (typeof value !== "string" || !value.trim()) throw new DeepSeekProviderError("LLM_RESPONSE_EMPTY", "Provider 没有返回可审阅的文本内容。");
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(fenced) as unknown;
  } catch {
    throw new DeepSeekProviderError("LLM_RESPONSE_INVALID_JSON", "Provider 返回内容不是合法 JSON；没有创建 Proposal 或执行写入。");
  }
}

function asOptionalInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : undefined;
}

function parseResponse(body: unknown, headers: Headers, durationMs: number, attempts: number): StructuredCompletion {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new DeepSeekProviderError("LLM_RESPONSE_SHAPE_INVALID", "Provider 响应外形无效；没有创建 Proposal 或执行写入。");
  const record = body as Record<string, unknown>;
  const choices = record.choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") throw new DeepSeekProviderError("LLM_RESPONSE_SHAPE_INVALID", "Provider 响应缺少 choices；没有创建 Proposal 或执行写入。");
  const choice = choices[0] as Record<string, unknown>;
  const message = choice.message;
  if (!message || typeof message !== "object") throw new DeepSeekProviderError("LLM_RESPONSE_SHAPE_INVALID", "Provider 响应缺少 message；没有创建 Proposal 或执行写入。");
  const finishReason = typeof choice.finish_reason === "string" ? choice.finish_reason : undefined;
  if (finishReason === "length") throw new DeepSeekProviderError("LLM_OUTPUT_TRUNCATED", "Provider 输出达到长度限制；没有创建 Proposal 或执行写入。", { retryable: false });
  const usage = record.usage && typeof record.usage === "object" && !Array.isArray(record.usage) ? record.usage as Record<string, unknown> : {};
  const model = typeof record.model === "string" && record.model.trim() ? record.model : undefined;
  const requestId = [headers.get("x-request-id"), typeof record.id === "string" ? record.id : null].find((value) => value?.trim()) ?? undefined;
  const promptTokens = asOptionalInteger(usage.prompt_tokens);
  const completionTokens = asOptionalInteger(usage.completion_tokens);
  const totalTokens = asOptionalInteger(usage.total_tokens);
  return {
    value: parseJsonContent((message as Record<string, unknown>).content),
    metadata: {
      ...(requestId ? { requestId } : {}),
      model: model ?? "unknown",
      ...(finishReason ? { finishReason } : {}),
      ...(promptTokens !== undefined ? { promptTokens } : {}),
      ...(completionTokens !== undefined ? { completionTokens } : {}),
      ...(totalTokens !== undefined ? { totalTokens } : {}),
      durationMs,
      attempts,
    },
  };
}

function timeoutSignal(timeoutMs: number, external?: AbortSignal): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);
  const abort = (): void => controller.abort(external?.reason ?? "cancelled");
  if (external?.aborted) abort();
  else external?.addEventListener("abort", abort, { once: true });
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout);
      external?.removeEventListener("abort", abort);
    },
  };
}

function defaultSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const abort = (): void => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
  });
}

function httpError(response: Response): DeepSeekProviderError {
  if (response.status === 401 || response.status === 403) return new DeepSeekProviderError("LLM_AUTH_FAILED", "Provider 认证失败；没有创建 Proposal 或执行写入。", { status: response.status, retryable: false });
  if (response.status === 404) return new DeepSeekProviderError("LLM_MODEL_OR_ENDPOINT_NOT_FOUND", "Provider Endpoint 或模型不可用；没有创建 Proposal 或执行写入。", { status: response.status, retryable: false });
  if (response.status === 429) return new DeepSeekProviderError("LLM_RATE_LIMITED", "Provider 当前限流；没有创建 Proposal 或执行写入。", { status: response.status, retryable: true });
  return new DeepSeekProviderError("LLM_HTTP_ERROR", "Provider 请求失败；没有创建 Proposal 或执行写入。", { status: response.status, retryable: response.status === 408 || response.status >= 500 });
}

function retryable(error: DeepSeekProviderError): boolean {
  return error.details?.retryable === true;
}

export class DeepSeekStructuredProvider {
  readonly providerId = "deepseek";
  readonly providerVersion = "chat-completions-v1";
  readonly enabled = true;

  private readonly config: Required<DeepSeekProviderConfig>;
  private readonly transport: DeepSeekProviderTransport;

  constructor(config: DeepSeekProviderConfig, transport: DeepSeekProviderTransport = { fetch: globalThis.fetch }) {
    this.config = requireConfig(config);
    this.transport = transport;
  }

  async completeStructured(request: StructuredChatRequest): Promise<StructuredCompletion> {
    if (!request.system.trim() || !request.user.trim() || request.system.length + request.user.length > 200_000) {
      throw new DeepSeekProviderError("LLM_REQUEST_INVALID", "Structured 请求的 system 和 user 不能为空或超过安全上限。");
    }
    const bounded = timeoutSignal(this.config.timeoutMs, request.signal);
    const body = JSON.stringify({
      model: this.config.model,
      temperature: 0,
      max_tokens: this.config.maxOutputTokens,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: request.system }, { role: "user", content: request.user }],
    });
    const startedAt = this.transport.now?.() ?? Date.now();
    let attempts = 0;
    try {
      while (attempts <= this.config.maxRetries) {
        if (bounded.signal.aborted) {
          throw new DeepSeekProviderError(request.signal?.aborted ? "LLM_CANCELLED" : "LLM_TIMEOUT", request.signal?.aborted ? "Provider 请求已取消。" : "Provider 请求超时。", { retryable: false });
        }
        attempts += 1;
        try {
          const response = await this.transport.fetch(`${this.config.baseUrl}/chat/completions`, {
            method: "POST",
            signal: bounded.signal,
            headers: { authorization: `Bearer ${this.config.apiKey}`, "content-type": "application/json" },
            body,
          });
          if (!response.ok) throw httpError(response);
          const text = await response.text();
          if (text.length > this.config.maxResponseChars) throw new DeepSeekProviderError("LLM_RESPONSE_TOO_LARGE", "Provider 响应超过安全上限；没有创建 Proposal 或执行写入。", { retryable: false });
          let parsed: unknown;
          try {
            parsed = JSON.parse(text) as unknown;
          } catch {
            throw new DeepSeekProviderError("LLM_RESPONSE_INVALID_JSON", "Provider HTTP 响应不是合法 JSON；没有创建 Proposal 或执行写入。", { retryable: false });
          }
          const finishedAt = this.transport.now?.() ?? Date.now();
          const completion = parseResponse(parsed, response.headers, Math.max(0, finishedAt - startedAt), attempts);
          if (completion.metadata.model === "unknown") completion.metadata.model = this.config.model;
          return completion;
        } catch (error) {
          let mapped: DeepSeekProviderError;
          if (error instanceof DeepSeekProviderError) mapped = error;
          else if (bounded.signal.aborted) mapped = new DeepSeekProviderError(request.signal?.aborted ? "LLM_CANCELLED" : "LLM_TIMEOUT", request.signal?.aborted ? "Provider 请求已取消。" : "Provider 请求超时。", { retryable: false });
          else mapped = new DeepSeekProviderError("LLM_UNAVAILABLE", "Provider 当前不可用；没有创建 Proposal 或执行写入。", { retryable: true, cause: error instanceof Error ? error.name : "unknown" });
          if (!retryable(mapped) || attempts > this.config.maxRetries) throw mapped;
          try {
            await (this.transport.sleep ?? defaultSleep)(this.config.retryBaseDelayMs * 2 ** (attempts - 1), bounded.signal);
          } catch {
            throw new DeepSeekProviderError(request.signal?.aborted ? "LLM_CANCELLED" : "LLM_TIMEOUT", request.signal?.aborted ? "Provider 请求已取消。" : "Provider 请求超时。", { retryable: false });
          }
        }
      }
      throw new DeepSeekProviderError("LLM_RETRY_EXHAUSTED", "Provider 重试上限已耗尽；没有创建 Proposal 或执行写入。", { retryable: false });
    } finally {
      bounded.dispose();
    }
  }
}
