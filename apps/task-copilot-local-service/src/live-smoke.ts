import { pathToFileURL } from "node:url";

import { StructuredError } from "@task-copilot/shared";

import type { StructuredCompletion } from "./deepseek-provider.ts";
import type { StructuredProposalProvider } from "./llm-proposal.ts";
import { loadStructuredProviderFromEnvironment } from "./provider-runtime.ts";

export interface LiveSmokeReport {
  status: "PASS";
  provider: string;
  providerVersion: string;
  actualModel: string;
  requestId?: string;
  durationMs: number;
  attempts: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  structuredJsonValid: true;
  graphWrites: 0;
  formalStoreWrites: 0;
}

function smokeError(code: string, message: string): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-127", "D-130", "D-140", "D-142"] });
}

function validateSmokeValue(completion: StructuredCompletion): void {
  const value = completion.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw smokeError("LLM_LIVE_SCHEMA_INVALID", "Live smoke 返回值不是 JSON object。");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["language", "status", "summary"].includes(key))
    || record.language !== "zh" || record.status !== "ok" || typeof record.summary !== "string" || !record.summary.trim() || record.summary.length > 200) {
    throw smokeError("LLM_LIVE_SCHEMA_INVALID", "Live smoke JSON 不符合有界中文 Schema。");
  }
}

export async function runDeepSeekLiveSmoke(
  environment: NodeJS.ProcessEnv,
  provider: StructuredProposalProvider,
): Promise<LiveSmokeReport> {
  if (environment.RUN_LIVE_LLM_TESTS !== "1") throw smokeError("LLM_LIVE_GATE_DISABLED", "未显式开启 RUN_LIVE_LLM_TESTS=1；没有发起网络请求。");
  const completion = await provider.completeStructured({
    system: "只返回 JSON object，字段必须是 language、status、summary。language 固定 zh，status 固定 ok，summary 用一句简洁中文说明结构化输出可用。",
    user: "验证中文 Structured Output；不要引用任何外部事实。",
  });
  validateSmokeValue(completion);
  return {
    status: "PASS",
    provider: provider.providerId,
    providerVersion: provider.providerVersion,
    actualModel: completion.metadata.model,
    ...(completion.metadata.requestId ? { requestId: completion.metadata.requestId } : {}),
    durationMs: completion.metadata.durationMs,
    attempts: completion.metadata.attempts,
    ...(completion.metadata.promptTokens !== undefined ? { promptTokens: completion.metadata.promptTokens } : {}),
    ...(completion.metadata.completionTokens !== undefined ? { completionTokens: completion.metadata.completionTokens } : {}),
    ...(completion.metadata.totalTokens !== undefined ? { totalTokens: completion.metadata.totalTokens } : {}),
    structuredJsonValid: true,
    graphWrites: 0,
    formalStoreWrites: 0,
  };
}

async function main(): Promise<void> {
  if (process.env.RUN_LIVE_LLM_TESTS !== "1") throw smokeError("LLM_LIVE_GATE_DISABLED", "未显式开启 RUN_LIVE_LLM_TESTS=1；没有解析凭据或发起网络请求。");
  const provider = await loadStructuredProviderFromEnvironment();
  if (!provider) throw smokeError("LLM_PROVIDER_DISABLED", "未配置 DeepSeek Provider；没有发起网络请求。");
  const report = await runDeepSeekLiveSmoke(process.env, provider);
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    const code = error instanceof StructuredError ? error.code : "LLM_LIVE_SMOKE_FAILED";
    const message = error instanceof Error ? error.message : "Live smoke 失败。";
    process.stderr.write(`${JSON.stringify({ status: "FAIL", code, message })}\n`);
    process.exitCode = 2;
  }
}
