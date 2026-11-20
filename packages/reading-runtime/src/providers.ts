import { WorkspaceError } from "@task-copilot/contracts";
import { resolveApiKey, type ReadingProviderProfile } from "./config.ts";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  argumentsText: string;
}

export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCallRequest[] }
  | { role: "tool"; toolCallId: string; name: string; content: string; isError?: boolean };

export interface LlmTurnRequest {
  system: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  signal: AbortSignal;
}

export interface LlmTurnResult {
  text: string;
  toolCalls: ToolCallRequest[];
  finishReason: "stop" | "tool_calls" | "length" | "error";
}

export type FetchLike = typeof fetch;

function providerError(status: number, bodyText: string): WorkspaceError {
  const lower = bodyText.toLowerCase();
  if (status === 400 && (lower.includes("context") || lower.includes("token") || lower.includes("too long") || lower.includes("maximum"))) {
    return new WorkspaceError("READING_MODEL_CONTEXT_LIMIT");
  }
  if (status === 401 || status === 403) {
    return new WorkspaceError("READING_MODEL_AUTH_FAILED", `模型鉴权失败（HTTP ${status}），请检查 API Key。`);
  }
  if (status === 429) {
    return new WorkspaceError("READING_MODEL_RATE_LIMITED", "模型服务请求频率受限，请稍后重试。");
  }
  return new WorkspaceError("READING_MODEL_PROVIDER_FAILED", `模型请求失败（HTTP ${status}）。`);
}

function normalizeTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") return part.text;
        return "";
      })
      .join("");
  }
  return "";
}

async function callOpenAiCompatible(
  profile: ReadingProviderProfile,
  apiKey: string,
  request: LlmTurnRequest,
  fetchImpl: FetchLike
): Promise<LlmTurnResult> {
  const baseUrl = profile.baseUrl!.replace(/\/+$/u, "");
  const endpoint = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;
  const messages: Array<Record<string, unknown>> = [{ role: "system", content: request.system }];
  for (const message of request.messages) {
    if (message.role === "user") {
      messages.push({ role: "user", content: message.content });
    } else if (message.role === "assistant") {
      const entry: Record<string, unknown> = {
        role: "assistant",
        content: message.content || (message.toolCalls?.length ? null : ""),
      };
      if (message.toolCalls?.length) {
        entry.tool_calls = message.toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: call.argumentsText },
        }));
      }
      messages.push(entry);
    } else {
      messages.push({
        role: "tool",
        tool_call_id: message.toolCallId,
        content: message.content,
      });
    }
  }

  const payload: Record<string, unknown> = {
    model: profile.model,
    messages,
    max_tokens: request.maxTokens ?? profile.maxTokens ?? 8192,
    ...(profile.reasoningEffort ? { reasoning_effort: profile.reasoningEffort } : {}),
  };
  if (request.tools?.length) {
    payload.tools = request.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
    payload.tool_choice = "auto";
  }

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: request.signal,
    });
  } catch (error) {
    if (request.signal.aborted) throw new WorkspaceError("READING_MODEL_INTERRUPTED");
    throw new WorkspaceError("READING_MODEL_PROVIDER_FAILED", error instanceof Error ? error.message.slice(0, 240) : "Network error");
  }

  const rawText = await response.text().catch(() => "");
  if (!response.ok) throw providerError(response.status, rawText);

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    throw new WorkspaceError("READING_MODEL_OUTPUT");
  }

  const choice = Array.isArray(data.choices) ? (data.choices[0] as Record<string, unknown> | undefined) : undefined;
  const message = choice?.message && typeof choice.message === "object" ? (choice.message as Record<string, unknown>) : undefined;
  if (!choice || !message) throw new WorkspaceError("READING_MODEL_OUTPUT");

  const text = normalizeTextContent(message.content);
  const rawCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const toolCalls: ToolCallRequest[] = [];
  for (let index = 0; index < rawCalls.length; index++) {
    const raw = rawCalls[index] as Record<string, unknown>;
    const fn = raw?.function && typeof raw.function === "object" ? (raw.function as Record<string, unknown>) : null;
    if (!fn || typeof fn.name !== "string") continue;
    toolCalls.push({
      id: typeof raw.id === "string" && raw.id ? raw.id : `call_${index + 1}`,
      name: fn.name,
      argumentsText: typeof fn.arguments === "string" ? fn.arguments : JSON.stringify(fn.arguments ?? {}),
    });
  }

  const reason = typeof choice.finish_reason === "string" ? choice.finish_reason : "";
  const finishReason: LlmTurnResult["finishReason"] =
    toolCalls.length > 0
      ? "tool_calls"
      : reason === "length"
        ? "length"
        : reason === "stop" || reason === "" || reason === "tool_calls"
          ? "stop"
          : "error";

  return { text, toolCalls, finishReason };
}

async function callAnthropic(
  profile: ReadingProviderProfile,
  apiKey: string,
  request: LlmTurnRequest,
  fetchImpl: FetchLike
): Promise<LlmTurnResult> {
  const baseUrl = profile.baseUrl!.replace(/\/+$/u, "");
  const endpoint = baseUrl.endsWith("/messages") ? baseUrl : `${baseUrl}/v1/messages`;

  const messages: Array<{ role: "user" | "assistant"; content: unknown }> = [];
  for (const message of request.messages) {
    if (message.role === "user") {
      messages.push({ role: "user", content: message.content });
    } else if (message.role === "assistant") {
      const blocks: Array<Record<string, unknown>> = [];
      if (message.content) blocks.push({ type: "text", text: message.content });
      for (const call of message.toolCalls ?? []) {
        let parsedInput: unknown;
        try {
          parsedInput = JSON.parse(call.argumentsText);
        } catch {
          parsedInput = {};
        }
        blocks.push({ type: "tool_use", id: call.id, name: call.name, input: parsedInput });
      }
      messages.push({ role: "assistant", content: blocks.length ? blocks : "" });
    } else {
      const toolBlock = {
        type: "tool_result",
        tool_use_id: message.toolCallId,
        content: message.content,
        ...(message.isError ? { is_error: true } : {}),
      };
      const previous = messages.at(-1);
      if (previous && previous.role === "user" && Array.isArray(previous.content)) {
        previous.content.push(toolBlock);
      } else {
        messages.push({ role: "user", content: [toolBlock] });
      }
    }
  }

  const payload: Record<string, unknown> = {
    model: profile.model,
    system: request.system,
    messages,
    max_tokens: request.maxTokens ?? profile.maxTokens ?? 8192,
  };
  if (request.tools?.length) {
    payload.tools = request.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        ...(apiKey ? { "x-api-key": apiKey } : {}),
      },
      body: JSON.stringify(payload),
      signal: request.signal,
    });
  } catch (error) {
    if (request.signal.aborted) throw new WorkspaceError("READING_MODEL_INTERRUPTED");
    throw new WorkspaceError("READING_MODEL_PROVIDER_FAILED", error instanceof Error ? error.message.slice(0, 240) : "Network error");
  }

  const rawText = await response.text().catch(() => "");
  if (!response.ok) throw providerError(response.status, rawText);

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    throw new WorkspaceError("READING_MODEL_OUTPUT");
  }

  const blocks = Array.isArray(data.content) ? data.content : [];
  let text = "";
  const toolCalls: ToolCallRequest[] = [];
  for (const raw of blocks) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    if (item.type === "text" && typeof item.text === "string") text += item.text;
    if (item.type === "tool_use" && typeof item.id === "string" && typeof item.name === "string") {
      toolCalls.push({
        id: item.id,
        name: item.name,
        argumentsText: JSON.stringify(item.input ?? {}),
      });
    }
  }

  const stop = typeof data.stop_reason === "string" ? data.stop_reason : "";
  const finishReason: LlmTurnResult["finishReason"] =
    toolCalls.length > 0
      ? "tool_calls"
      : stop === "max_tokens"
        ? "length"
        : stop === "end_turn" || stop === "stop_sequence" || stop === "tool_use" || stop === ""
          ? "stop"
          : "error";

  return { text, toolCalls, finishReason };
}

export async function callProviderTurn(
  profile: ReadingProviderProfile,
  env: Record<string, string | undefined>,
  request: LlmTurnRequest,
  fetchImpl: FetchLike = fetch
): Promise<LlmTurnResult> {
  if (profile.kind === "dsh") {
    throw new WorkspaceError("READING_MODEL_PROVIDER_FAILED", "DSH profile must be invoked via DSH adapter.");
  }
  const key = resolveApiKey(profile.apiKey, env);
  if (profile.locality === "remote" && !key.value) {
    throw new WorkspaceError("READING_MODEL_NOT_CONFIGURED", "尚未配置可用的模型 API Key。");
  }
  if (profile.kind === "anthropic") {
    return callAnthropic(profile, key.value, request, fetchImpl);
  }
  return callOpenAiCompatible(profile, key.value, request, fetchImpl);
}

export async function testProviderProfile(
  profile: ReadingProviderProfile,
  env: Record<string, string | undefined> = process.env,
  fetchImpl: FetchLike = fetch
): Promise<{ ok: true; latencyMs: number; preview: string }> {
  const started = Date.now();
  const result = await callProviderTurn(
    profile,
    env,
    {
      system: "Reply with exactly OK.",
      messages: [{ role: "user", content: "OK?" }],
      maxTokens: 16,
      signal: AbortSignal.timeout(20_000),
    },
    fetchImpl
  );
  return {
    ok: true,
    latencyMs: Date.now() - started,
    preview: result.text.trim().slice(0, 60),
  };
}
