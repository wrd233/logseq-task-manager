import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import type { V2Proposal, V2ProposalScopeTarget } from "@task-copilot/domain";
import { StructuredError, stableJson } from "@task-copilot/shared";

import { LocalLlmProposalGenerator, type LocalLlmGenerationResult, type StructuredProposalProvider, type V2PromptBundle } from "./llm-proposal.ts";
import { loadStructuredProviderFromEnvironment } from "./provider-runtime.ts";

export interface GoldenCase {
  id: string;
  category: string;
  input: string;
  expected: "PROPOSAL" | "NO_PROPOSAL";
  assertions: string[];
}

export interface GoldenRun {
  caseId: string;
  repetition: number;
}

export interface GoldenCaseReport {
  caseId: string;
  repetition: number;
  expected: GoldenCase["expected"];
  actual: LocalLlmGenerationResult["kind"] | "ERROR";
  status: "PASS" | "FAIL";
  code?: string;
  model?: string;
  durationMs?: number;
  attempts?: number;
  totalTokens?: number;
  proposal?: {
    objectTypes: string[];
    operationKinds: string[];
    groupCount: number;
    finalPreview: string;
    unresolvedQuestions: string[];
  };
  checks: string[];
  failureShape?: {
    topLevelKeys: string[];
    topLevelTypes: Record<string, string>;
    topLevelStringLengths: Record<string, number>;
    groupKeys: string[];
    patchKeys: string[];
    operationKeys: string[];
    scopeKeys: string[];
    readTargetKeys: string[];
    modifyTargetKeys: string[];
  };
}

export interface GoldenSuiteReport {
  status: "PIPELINE_PASS" | "FAIL";
  provider: string;
  providerVersion: string;
  plannedRequests: 22;
  executedRequests: number;
  passedRequests: number;
  failedRequests: number;
  stoppedEarly: boolean;
  graphWrites: 0;
  formalStoreWrites: 0;
  manualReviewRequired: true;
  cases: GoldenCaseReport[];
}

const coreCaseIds = new Set(["DS-01", "DS-03", "DS-04", "DS-07", "DS-12"]);
const expectedObjectType = new Map<string, string>([
  ["DS-01", "TASK"],
  ["DS-03", "MINI_PROJECT"],
  ["DS-04", "TASK"],
  ["DS-05", "DECISION"],
  ["DS-06", "OUTPUT"],
  ["DS-08", "TASK"],
  ["DS-09", "TASK"],
  ["DS-10", "TASK"],
  ["DS-11", "TASK"],
  ["DS-12", "TASK"],
]);
const requiredPreviewTerms = new Map<string, string[]>([
  ["DS-01", ["下周三", "值班同事"]],
  ["DS-03", ["三套", "交接说明"]],
  ["DS-04", ["告警治理", "两个系统"]],
  ["DS-05", ["不直接修改生产推送脚本", "真实事件样本"]],
  ["DS-06", ["告警负责人核对表", "差异说明"]],
  ["DS-08", ["周三", "值班同事"]],
  ["DS-10", ["明天", "评审"]],
  ["DS-12", ["周二", "未知"]],
]);

function goldenError(code: string, message: string): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-120", "D-127", "D-130", "D-136", "D-139", "D-142"] });
}

function targetFor(item: GoldenCase): V2ProposalScopeTarget {
  return { kind: "BLOCK", id: `golden-${item.id}`, version: 1 };
}

function expectedReadTargets(item: GoldenCase): V2ProposalScopeTarget[] {
  const target = targetFor(item);
  return item.id === "DS-04" ? [target, { kind: "OBJECT", id: "project-alert-governance", version: 3 }] : [target];
}

export function buildGoldenSchedule(cases: readonly GoldenCase[]): GoldenRun[] {
  const firstPass = cases.map((item) => ({ caseId: item.id, repetition: 1 }));
  const repeats = cases
    .filter((item) => coreCaseIds.has(item.id))
    .flatMap((item) => [{ caseId: item.id, repetition: 2 }, { caseId: item.id, repetition: 3 }]);
  const schedule = [...firstPass, ...repeats];
  if (schedule.length !== 22) throw goldenError("LLM_GOLDEN_MANIFEST_INVALID", "黄金案例必须产生固定的 22 次运行计划。");
  return schedule;
}

export function buildGoldenPrompt(item: GoldenCase): V2PromptBundle {
  const target = targetFor(item);
  const requiredTextPatchShape = { blockUuid: target.id, beforeText: item.input, afterText: "<完整最终正文>" };
  const requiredSemanticOperationShape = {
    operationId: "create-object",
    kind: "CREATE_OBJECT",
    target,
    summary: "<人类可读说明>",
    payload: { objectType: "<TASK|MINI_PROJECT|DECISION|OUTPUT>", text: "<与 afterText 完全相同的完整最终正文>" },
    preconditions: ["Block v1 未变化"],
  };
  const requiredScopeShape = { read: expectedReadTargets(item), modify: [target] };
  const requiredGroupShape = {
    groupId: "formalize",
    explanation: "<人类可读说明>",
    risk: "MEDIUM",
    independentlyAcceptable: true,
    dependencies: [],
    textPatches: [requiredTextPatchShape],
    semanticOperations: [requiredSemanticOperationShape],
    disposition: "PENDING",
  };
  const knownContext = item.id === "DS-04"
    ? { knownObjects: [{ kind: "OBJECT", id: "project-alert-governance", version: 3, objectType: "PROJECT", title: "告警治理" }] }
    : item.id === "DS-08"
      ? { currentIntent: { proposalId: "existing-proposal", objectType: "TASK", facts: ["周三期限", "发给值班同事"] } }
      : item.id === "DS-11"
        ? { ownershipCandidate: { ownerObjectId: "project-alert-governance", confirmed: false } }
        : {};
  return {
    core: {
      version: "task-copilot-v2-core-1",
      content: "模型只生成建议，不执行写入。不得声称已经修改 Logseq、SQLite、对象、Anchor、Lifecycle、Condition、Focus 或归属。普通记录或证据不足必须返回 NO_PROPOSAL。",
    },
    domain: {
      version: "task-copilot-v2-domain-7",
      content: [
        "六类对象固定为 AREA、PROJECT、MINI_PROJECT、TASK、DECISION、OUTPUT。本黄金案例只允许创建 TASK、MINI_PROJECT、DECISION、OUTPUT；不得创建 AREA/PROJECT，不得确认 Primary Ownership。",
        "最终正文必须使用既有显式语法开头：TASK 用 `[任务] `，MINI_PROJECT 用 `[MiniProject] `，DECISION 用 `[决策] `，OUTPUT 用 `[成果] `；禁止输出 `TASK:`、`MINI_PROJECT:` 等英文标签。",
        "TASK 是一个近期、可一次判断完成的承诺，可以包含为同一结果服务的相邻动作；不要只因为一句话含“并且”或先后两个动作就升级为 MINI_PROJECT。MINI_PROJECT 必须有多个可独立跟踪的步骤，并以一个有限结果收口。执行类型判别时，先逐项核对：(1) 两个以上并列处理对象（数量词如‘三套’、‘四组’也算）；(2) 至少两个可分别验收的处理阶段（如‘梳理/逐项验证’）；(3) 还要形成独立交付物（如‘交接说明’、‘移交清单’）。三项同时成立时，必须判为 MINI_PROJECT 并使用 `[MiniProject] ` 前缀，不得降为 TASK；只有缺少其中一项时才继续按近期单次承诺判断 TASK。DECISION 是已确认且持续影响后续行为的选择；出现‘已确认/已决定’并明确写出本轮采取或不采取的策略（例如‘不直接修改 X，先补齐 Y’）时，必须判为 DECISION 并使用 `[决策] ` 前缀，不得降为 TASK。OUTPUT 是已经产出的可复用成果。",
        "边界对比例：‘周四前核对一次发布范围并通知当班人员’是 TASK；‘本月内梳理四组权限、逐组验证并整理移交清单’是 MINI_PROJECT。不要复制示例正文，只应用边界。",
        "OUTPUT 必须有可追溯的产出者或来源；上下文未提供时只能放入 unresolvedQuestions，不能发明 produced_by。只要用户明确说‘已产出/已完成’但没有给出产出者或来源，unresolvedQuestions 必须至少包含一条询问产出者或来源的机器可读问题，不能留空。",
        "已知 Project 上出现明确、有限、可闭合的具体缺口时，可以为关闭该缺口提议一个局部 TASK，并把已知 Project 只放在 read scope；‘还缺/缺少/遗漏 N 个具体对象’是证据充分的明确缺口，必须生成局部 TASK Proposal，不得把它误判为普通背景或 NO_PROPOSAL。普通进展或背景状态仍返回 NO_PROPOSAL，绝不自动确认 Ownership。",
        "runtime 提供 currentIntent 时只修订同一意图并保留其中事实，不创建第二意图；runtime 提供 confirmed=false 的 ownershipCandidate 时，‘可能属于某个已知 Project，但尚未由我确认主归属’仍是证据充分的正式化候选，必须生成一个保留不确定性的局部 TASK Proposal，不输出 CHANGE_OWNERSHIP，也不得因未确认归属而返回 NO_PROPOSAL。未确认候选若没有带版本的可读目标，不能擅自把 owner 放进 scope；只在正文保留候选与未确认语义，scope 仍严格使用带版本的 required targets。",
        "输出 PROPOSAL 时必须严格包含 title/context/understanding/objective/logic/finalPreview/unresolvedQuestions/scope/preconditions/groups。不要输出 proposalId/schemaVersion/source/status/createdAt，这些由 Local Service 覆盖。",
        "只允许一个独立 MEDIUM group。group 必须含 groupId/explanation/risk/independentlyAcceptable/dependencies/textPatches/semanticOperations/disposition，disposition 固定 PENDING。",
        "正式化必须有一个 REWRITE_BLOCK textPatch 和一个同目标 Block 的 CREATE_OBJECT operation。textPatch 的 beforeText 必须逐字复制 runtime input，afterText 是完整最终正文；不要输出 hash，机器会计算。",
        "finalPreview 必须与 textPatch.afterText 及 CREATE_OBJECT payload.text 三者逐字相同；不得把解释、类型判断过程或引号包裹写入 finalPreview。",
        "CREATE_OBJECT payload 必须只表达 objectType 与完整最终正文 text。scope.modify 只能是 requiredModifyTarget；已知对象只能放 scope.read，不得作为 modify target。",
        "如果 evidence 不足，输出且只输出 {\"decision\":\"NO_PROPOSAL\",\"reason\":\"简洁理由\"}。明确缺少可识别对象、责任人和时间（例如‘那个接口’、‘找人处理’、‘时间还没定/待定’）时，证据不足必须返回 NO_PROPOSAL，不能用未决问题包装一个 TASK Proposal；只有用户已给出足够事实且未决项不阻碍正式化时才生成 Proposal。",
      ].join("\n"),
    },
    skill: {
      version: "deepseek-golden-formalize-2",
      content: [
        "保留原文事实、否定、时间和不确定性；不得发明人名、负责人、日期、系统、归属或完成状态。表达使用自然、紧凑中文，不加空模板。",
      ].filter(Boolean).join("\n"),
    },
    userSemantics: {
      version: "default-writing-profile-2",
      content: "使用高密度、自然、克制的中文。尽量保留用户原句；只做必要的显式对象标记，不添加管理术语或占位字段。",
    },
    runtimeContext: {
      version: `golden:${item.id}:r1`,
      content: stableJson({
        caseId: item.id,
        input: item.input,
        requiredModifyTarget: target,
        requiredScopeShape,
        requiredTextPatchShape,
        requiredSemanticOperationShape,
        requiredGroupShape,
        instruction: "逐字保留以上 key 与嵌套层级；scope 必须逐字使用 requiredScopeShape 的对象数组，禁止把 target 简写成 ID 字符串；groups 必须是只包含 requiredGroupShape 的数组。尖括号内容必须替换为案例值，不得输出尖括号占位符。",
        ...knownContext,
      }),
    },
  };
}

function operations(proposal: V2Proposal): V2Proposal["groups"][number]["semanticOperations"] {
  return proposal.groups.flatMap((group) => group.semanticOperations);
}

function sameTarget(left: V2ProposalScopeTarget | undefined, right: V2ProposalScopeTarget): boolean {
  return left?.kind === right.kind && left.id === right.id && left.version === right.version;
}

export function evaluateGoldenResult(item: GoldenCase, result: LocalLlmGenerationResult): { checks: string[]; failures: string[] } {
  const checks: string[] = [];
  const failures: string[] = [];
  if (result.kind !== item.expected) {
    failures.push(`expected_${item.expected.toLowerCase()}`);
    return { checks, failures };
  }
  checks.push("expected_decision");
  if (result.kind === "NO_PROPOSAL") {
    checks.push("bounded_no_proposal");
    return { checks, failures };
  }
  const proposal = result.proposal;
  const semanticOperations = operations(proposal);
  const objectTypes = semanticOperations
    .filter((operation) => operation.kind === "CREATE_OBJECT")
    .map((operation) => String(operation.payload.objectType));
  const target = targetFor(item);
  if (proposal.groups.length !== 1) failures.push("single_group");
  else checks.push("single_group");
  if (proposal.scope.modify.length !== 1 || !sameTarget(proposal.scope.modify[0], target)) failures.push("exact_modify_scope");
  else checks.push("exact_modify_scope");
  const expectedReads = expectedReadTargets(item);
  if (proposal.scope.read.length !== expectedReads.length || !expectedReads.every((expected) => proposal.scope.read.some((candidate) => sameTarget(candidate, expected)))) failures.push("exact_read_scope");
  else checks.push("exact_read_scope");
  if (semanticOperations.some((operation) => !["CREATE_OBJECT"].includes(operation.kind))) failures.push("no_authority_or_high_impact_operation");
  else checks.push("no_authority_or_high_impact_operation");
  const group = proposal.groups[0];
  const patch = group?.textPatches[0];
  const create = semanticOperations[0];
  if (!group || group.textPatches.length !== 1 || semanticOperations.length !== 1 || !patch || !create
    || patch.blockUuid !== target.id || patch.beforeText !== item.input || patch.afterText !== proposal.finalPreview
    || !sameTarget(create.target, target) || create.payload.text !== patch.afterText) {
    failures.push("exact_patch_operation_preview_consistency");
  } else checks.push("exact_patch_operation_preview_consistency");
  const expectedType = expectedObjectType.get(item.id);
  if (expectedType && (objectTypes.length !== 1 || objectTypes[0] !== expectedType)) failures.push(`object_type_${expectedType.toLowerCase()}`);
  else if (expectedType) checks.push(`object_type_${expectedType.toLowerCase()}`);
  const expectedPrefix = expectedType ? new Map([["TASK", "[任务] "], ["MINI_PROJECT", "[MiniProject] "], ["DECISION", "[决策] "], ["OUTPUT", "[成果] "]]).get(expectedType) : undefined;
  if (expectedPrefix && !proposal.finalPreview.startsWith(expectedPrefix)) failures.push("explicit_logseq_syntax");
  else if (expectedPrefix) checks.push("explicit_logseq_syntax");
  if (objectTypes.includes("PROJECT") || semanticOperations.some((operation) => operation.kind === "CHANGE_OWNERSHIP")) failures.push("no_duplicate_project_or_confirmed_ownership");
  else checks.push("no_duplicate_project_or_confirmed_ownership");
  const missingTerm = (requiredPreviewTerms.get(item.id) ?? []).find((term) => !proposal.finalPreview.includes(term));
  if (missingTerm) failures.push(`preserve_term:${missingTerm}`);
  else if (requiredPreviewTerms.has(item.id)) checks.push("required_facts_preserved");
  if (item.id === "DS-09" && semanticOperations.filter((operation) => operation.kind === "CREATE_OBJECT").length !== 1) failures.push("single_object");
  else if (item.id === "DS-09") checks.push("single_object");
  if (item.id === "DS-11" && !/(可能|候选|尚未|未确认|是否)/.test(proposal.finalPreview)) failures.push("ownership_uncertainty_preserved");
  else if (item.id === "DS-11") checks.push("ownership_uncertainty_preserved");
  if (item.id === "DS-01" && /由[^，。；\n]{1,20}(?:负责|执行)/.test(proposal.finalPreview)) failures.push("no_invented_owner");
  else if (item.id === "DS-01") checks.push("no_invented_owner");
  if (item.id === "DS-04" && !proposal.scope.read.some((candidate) => candidate.kind === "OBJECT" && candidate.id === "project-alert-governance" && candidate.version === 3)) failures.push("prefer_existing_project_read_scope");
  else if (item.id === "DS-04") checks.push("prefer_existing_project_read_scope");
  if (item.id === "DS-06" && !proposal.unresolvedQuestions.some((question) => /produced_by|产出者|由谁产出|产出来源/.test(question))) failures.push("produced_by_unresolved");
  else if (item.id === "DS-06") checks.push("produced_by_unresolved");
  if (item.id === "DS-08" && proposal.finalPreview.length > 32) failures.push("concise_revision");
  else if (item.id === "DS-08") checks.push("concise_revision");
  if (item.id === "DS-10" && (proposal.finalPreview.length > 80 || /<[^>]+>|待补|模板|字段[:：]/.test(proposal.finalPreview))) failures.push("restrained_structure");
  else if (item.id === "DS-10") checks.push("restrained_structure");
  return { checks, failures };
}

function proposalSummary(result: LocalLlmGenerationResult): GoldenCaseReport["proposal"] | undefined {
  if (result.kind !== "PROPOSAL") return undefined;
  const semanticOperations = operations(result.proposal);
  return {
    objectTypes: semanticOperations.filter((operation) => operation.kind === "CREATE_OBJECT").map((operation) => String(operation.payload.objectType)),
    operationKinds: semanticOperations.map((operation) => operation.kind),
    groupCount: result.proposal.groups.length,
    finalPreview: result.proposal.finalPreview,
    unresolvedQuestions: result.proposal.unresolvedQuestions,
  };
}

function recordKeys(value: unknown): string[] {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value as Record<string, unknown>).sort() : [];
}

function shapeType(value: unknown): string {
  return Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
}

export function summarizeGoldenFailureShape(value: unknown): NonNullable<GoldenCaseReport["failureShape"]> {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const group = Array.isArray(record.groups) ? record.groups[0] : undefined;
  const groupRecord = group && typeof group === "object" && !Array.isArray(group) ? group as Record<string, unknown> : {};
  const scope = record.scope && typeof record.scope === "object" && !Array.isArray(record.scope) ? record.scope as Record<string, unknown> : {};
  return {
    topLevelKeys: recordKeys(record),
    topLevelTypes: Object.fromEntries(Object.entries(record).map(([key, item]) => [key, shapeType(item)])),
    topLevelStringLengths: Object.fromEntries(Object.entries(record).filter((entry): entry is [string, string] => typeof entry[1] === "string").map(([key, item]) => [key, item.length])),
    groupKeys: recordKeys(group),
    patchKeys: recordKeys(Array.isArray(groupRecord.textPatches) ? groupRecord.textPatches[0] : undefined),
    operationKeys: recordKeys(Array.isArray(groupRecord.semanticOperations) ? groupRecord.semanticOperations[0] : undefined),
    scopeKeys: recordKeys(scope),
    readTargetKeys: recordKeys(Array.isArray(scope.read) ? scope.read[0] : undefined),
    modifyTargetKeys: recordKeys(Array.isArray(scope.modify) ? scope.modify[0] : undefined),
  };
}

export async function runDeepSeekGoldenSuite(
  environment: NodeJS.ProcessEnv,
  provider: StructuredProposalProvider,
  cases: readonly GoldenCase[],
): Promise<GoldenSuiteReport> {
  if (environment.RUN_LIVE_LLM_GOLDEN_TESTS !== "1") throw goldenError("LLM_GOLDEN_GATE_DISABLED", "未显式开启 RUN_LIVE_LLM_GOLDEN_TESTS=1；没有发起网络请求。");
  const schedule = buildGoldenSchedule(cases);
  const byId = new Map(cases.map((item) => [item.id, item]));
  const reports: GoldenCaseReport[] = [];
  let lastStructuredValue: unknown;
  const diagnosticProvider: StructuredProposalProvider = {
    providerId: provider.providerId,
    providerVersion: provider.providerVersion,
    completeStructured: async (request) => {
      const completion = await provider.completeStructured(request);
      lastStructuredValue = completion.value;
      return completion;
    },
  };
  const generator = new LocalLlmProposalGenerator(diagnosticProvider);
  for (const run of schedule) {
    const item = byId.get(run.caseId);
    if (!item) throw goldenError("LLM_GOLDEN_MANIFEST_INVALID", `缺少固定案例 ${run.caseId}。`);
    try {
      lastStructuredValue = undefined;
      const result = await generator.generate({
        proposalId: `golden_${item.id.replace("-", "_")}_r${run.repetition}`,
        createdAt: new Date(Date.UTC(2026, 6, 22, 0, reports.length, 0)).toISOString(),
        prompt: buildGoldenPrompt(item),
      });
      const evaluated = evaluateGoldenResult(item, result);
      const status = evaluated.failures.length === 0 ? "PASS" : "FAIL";
      const summary = proposalSummary(result);
      reports.push({
        caseId: item.id,
        repetition: run.repetition,
        expected: item.expected,
        actual: result.kind,
        status,
        ...(evaluated.failures.length ? { code: evaluated.failures.join(",") } : {}),
        model: result.provider.model,
        durationMs: result.provider.durationMs,
        attempts: result.provider.attempts,
        ...(result.provider.totalTokens !== undefined ? { totalTokens: result.provider.totalTokens } : {}),
        ...(summary ? { proposal: summary } : {}),
        checks: evaluated.checks,
      });
      if (status === "FAIL") break;
    } catch (error) {
      reports.push({
        caseId: item.id,
        repetition: run.repetition,
        expected: item.expected,
        actual: "ERROR",
        status: "FAIL",
        code: error instanceof StructuredError ? error.code : "LLM_GOLDEN_CASE_FAILED",
        checks: [],
        failureShape: summarizeGoldenFailureShape(lastStructuredValue),
      });
      break;
    }
  }
  const failedRequests = reports.filter((item) => item.status === "FAIL").length;
  return {
    status: reports.length === schedule.length && failedRequests === 0 ? "PIPELINE_PASS" : "FAIL",
    provider: provider.providerId,
    providerVersion: provider.providerVersion,
    plannedRequests: 22,
    executedRequests: reports.length,
    passedRequests: reports.length - failedRequests,
    failedRequests,
    stoppedEarly: reports.length < schedule.length,
    graphWrites: 0,
    formalStoreWrites: 0,
    manualReviewRequired: true,
    cases: reports,
  };
}

async function loadCases(): Promise<GoldenCase[]> {
  const raw = JSON.parse(await readFile(new URL("./deepseek-golden-cases.json", import.meta.url), "utf8")) as unknown;
  if (!Array.isArray(raw)) throw goldenError("LLM_GOLDEN_MANIFEST_INVALID", "黄金案例文件不是数组。");
  return raw as GoldenCase[];
}

async function main(): Promise<void> {
  if (process.env.RUN_LIVE_LLM_GOLDEN_TESTS !== "1") throw goldenError("LLM_GOLDEN_GATE_DISABLED", "未显式开启 RUN_LIVE_LLM_GOLDEN_TESTS=1；没有解析凭据或发起网络请求。");
  const provider = await loadStructuredProviderFromEnvironment();
  if (!provider) throw goldenError("LLM_PROVIDER_DISABLED", "未配置 DeepSeek Provider；没有发起网络请求。");
  const report = await runDeepSeekGoldenSuite(process.env, provider, await loadCases());
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (report.status !== "PIPELINE_PASS") process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    const code = error instanceof StructuredError ? error.code : "LLM_GOLDEN_SUITE_FAILED";
    const message = error instanceof Error ? error.message : "黄金案例运行失败。";
    process.stderr.write(`${JSON.stringify({ status: "FAIL", code, message })}\n`);
    process.exitCode = 2;
  }
}
