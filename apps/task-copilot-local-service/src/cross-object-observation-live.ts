import { pathToFileURL } from "node:url";

import type { CrossObjectObservationKind } from "@task-copilot/application";
import { StructuredError } from "@task-copilot/shared";

import {
  LocalLlmCrossObjectObservationGenerator,
  type CrossObjectObservationContextPackage,
} from "./cross-object-observation-provider.ts";
import type { StructuredProposalProvider } from "./llm-proposal.ts";
import { loadStructuredProviderFromEnvironment } from "./provider-runtime.ts";

type GoldenCaseId =
  | "task-cluster"
  | "legacy-handoff"
  | "interface-stale"
  | "unrelated-work"
  | "ownership-conflict";

interface CrossObjectGoldenCase {
  id: GoldenCaseId;
  context: CrossObjectObservationContextPackage;
  expected:
    | { decision: "NO_OBSERVATION" }
    | {
      decision: "OBSERVATIONS";
      kind: CrossObjectObservationKind;
      requiredSubjectRefs: string[];
      requiredFactCodes: string[];
    };
}

export interface CrossObjectObservationLiveReport {
  status: "PIPELINE_PASS";
  gate: "SHADOW_MODEL_QUALITY";
  evidenceSource: "SANITIZED_SYNTHETIC";
  provider: string;
  providerVersion: string;
  actualModels: string[];
  caseCount: 5;
  observationCount: 3;
  abstentionCount: 2;
  attempts: number;
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cases: Array<
    | { id: GoldenCaseId; decision: "NO_OBSERVATION" }
    | { id: GoldenCaseId; decision: "OBSERVATIONS"; kind: CrossObjectObservationKind }
  >;
  quality: {
    groundedKindsMatched: true;
    requiredEvidenceRetained: true;
    weakAndConflictingCasesAbstained: true;
    machineProvenanceApplied: true;
    frontstageStillClosed: true;
  };
  graphWrites: 0;
  formalStoreWrites: 0;
}

const observedAt = "2026-07-26T12:00:00.000Z";

function liveError(code: string, message: string): StructuredError {
  return new StructuredError({
    code,
    message,
    ruleRefs: ["D-127", "D-130", "D-140", "D-142", "D-207", "D-220"],
  });
}

export function buildSanitizedCrossObjectGoldenCases(): CrossObjectGoldenCase[] {
  return [{
    id: "task-cluster",
    context: {
      schemaVersion: "task-copilot-cross-object-context-v1",
      observedAt,
      scope: { kind: "PROJECT", rootRef: "object:project-release@v3" },
      objects: [{
        ref: "object:project-release@v3",
        objectType: "PROJECT",
        lifecycle: "OPEN",
        condition: "ACTIONABLE",
        summary: "发布准备项目，当前需要归拢相同交付物下的执行任务。",
      }, {
        ref: "object:task-checklist@v2",
        objectType: "TASK",
        lifecycle: "OPEN",
        condition: "ACTIONABLE",
        summary: "整理上线核对清单。",
      }, {
        ref: "object:task-rollback@v4",
        objectType: "TASK",
        lifecycle: "OPEN",
        condition: "ACTIONABLE",
        summary: "验证回退核对清单。",
      }],
      evidenceFacts: [{
        key: "cluster-shared-a",
        factCode: "SHARED_DELIVERABLE",
        sourceRef: "object:task-checklist@v2",
        observedAt,
        fingerprint: "11111111",
        statement: "任务指向同一份发布核对清单。",
      }, {
        key: "cluster-shared-b",
        factCode: "SHARED_DELIVERABLE",
        sourceRef: "object:task-rollback@v4",
        observedAt,
        fingerprint: "22222222",
        statement: "任务指向同一份发布核对清单。",
      }, {
        key: "cluster-owner-missing",
        factCode: "PRIMARY_OWNER_MISSING",
        sourceRef: "object:task-checklist@v2",
        observedAt,
        fingerprint: "33333333",
        statement: "当前没有正式 Primary Owner。",
      }],
    },
    expected: {
      decision: "OBSERVATIONS",
      kind: "TASK_CLUSTER_CANDIDATE",
      requiredSubjectRefs: [
        "object:project-release@v3",
        "object:task-checklist@v2",
        "object:task-rollback@v4",
      ],
      requiredFactCodes: ["SHARED_DELIVERABLE"],
    },
  }, {
    id: "legacy-handoff",
    context: {
      schemaVersion: "task-copilot-cross-object-context-v1",
      observedAt,
      scope: { kind: "PROJECT", rootRef: "object:project-archive@v8" },
      objects: [{
        ref: "object:project-archive@v8",
        objectType: "PROJECT",
        lifecycle: "COMPLETED",
        condition: "PAUSED",
        summary: "归档项目已经正式完成。",
      }, {
        ref: "object:task-followup@v2",
        objectType: "TASK",
        lifecycle: "OPEN",
        condition: "PAUSED",
        summary: "补录归档后的合规核对结果。",
      }],
      evidenceFacts: [{
        key: "legacy-project-completed",
        factCode: "PROJECT_COMPLETED",
        sourceRef: "object:project-archive@v8",
        observedAt,
        fingerprint: "44444444",
        statement: "正式 Project Lifecycle 已完成。",
      }, {
        key: "legacy-task-open",
        factCode: "UNFINISHED_DESCENDANT",
        sourceRef: "object:task-followup@v2",
        observedAt,
        fingerprint: "55555555",
        statement: "原项目范围内仍有 OPEN Task，尚无新承接对象。",
      }, {
        key: "legacy-no-owner",
        factCode: "PRIMARY_OWNER_MISSING",
        sourceRef: "object:task-followup@v2",
        observedAt,
        fingerprint: "66666666",
        statement: "该 Task 当前没有正式 Primary Owner。",
      }],
    },
    expected: {
      decision: "OBSERVATIONS",
      kind: "LEGACY_HANDOFF_CANDIDATE",
      requiredSubjectRefs: ["object:project-archive@v8", "object:task-followup@v2"],
      requiredFactCodes: ["PROJECT_COMPLETED", "UNFINISHED_DESCENDANT"],
    },
  }, {
    id: "interface-stale",
    context: {
      schemaVersion: "task-copilot-cross-object-context-v1",
      observedAt,
      scope: { kind: "PROJECT", rootRef: "object:project-migration@v5" },
      objects: [{
        ref: "object:project-migration@v5",
        objectType: "PROJECT",
        lifecycle: "OPEN",
        condition: "ACTIONABLE",
        summary: "当前接口仍写着等待切换演练。",
      }, {
        ref: "object:output-cutover@v3",
        objectType: "OUTPUT",
        lifecycle: "COMPLETED",
        condition: "ACTIONABLE",
        summary: "切换演练记录已经完成并通过复核。",
      }],
      evidenceFacts: [{
        key: "interface-older",
        factCode: "INTERFACE_PREDATES_EVIDENCE",
        sourceRef: "object:project-migration@v5",
        observedAt,
        fingerprint: "77777777",
        statement: "Project current interface 的版本早于已完成 Output。",
      }, {
        key: "interface-contradicted",
        factCode: "CURRENT_INTERFACE_CONTRADICTED",
        sourceRef: "object:output-cutover@v3",
        observedAt,
        fingerprint: "88888888",
        statement: "正式 Output 已完成，与仍等待演练的当前接口不一致。",
      }],
    },
    expected: {
      decision: "OBSERVATIONS",
      kind: "PROJECT_INTERFACE_STALE_CANDIDATE",
      requiredSubjectRefs: ["object:project-migration@v5", "object:output-cutover@v3"],
      requiredFactCodes: ["INTERFACE_PREDATES_EVIDENCE", "CURRENT_INTERFACE_CONTRADICTED"],
    },
  }, {
    id: "unrelated-work",
    context: {
      schemaVersion: "task-copilot-cross-object-context-v1",
      observedAt,
      scope: { kind: "PROJECT", rootRef: "object:project-a@v2" },
      objects: [{
        ref: "object:project-a@v2",
        objectType: "PROJECT",
        lifecycle: "OPEN",
        condition: "ACTIONABLE",
        summary: "整理内部培训材料。",
      }, {
        ref: "object:task-a@v1",
        objectType: "TASK",
        lifecycle: "OPEN",
        condition: "ACTIONABLE",
        summary: "发布培训讲义。",
      }, {
        ref: "object:task-b@v1",
        objectType: "TASK",
        lifecycle: "OPEN",
        condition: "ACTIONABLE",
        summary: "检查应用发布窗口。",
      }],
      evidenceFacts: [{
        key: "unrelated-term-a",
        factCode: "SURFACE_TERM_MATCH",
        sourceRef: "object:task-a@v1",
        observedAt,
        fingerprint: "99999999",
        statement: "正文出现“发布”，含义是分发培训讲义。",
      }, {
        key: "unrelated-term-b",
        factCode: "SURFACE_TERM_MATCH",
        sourceRef: "object:task-b@v1",
        observedAt,
        fingerprint: "aaaaaaaa",
        statement: "正文出现“发布”，含义是应用上线窗口。",
      }, {
        key: "unrelated-goals",
        factCode: "GOALS_DIFFER",
        sourceRef: "object:project-a@v2",
        observedAt,
        fingerprint: "bbbbbbbb",
        statement: "两个 Task 的目标与交付物不同。",
      }],
    },
    expected: { decision: "NO_OBSERVATION" },
  }, {
    id: "ownership-conflict",
    context: {
      schemaVersion: "task-copilot-cross-object-context-v1",
      observedAt,
      scope: { kind: "PROJECT", rootRef: "object:project-owner-a@v4" },
      objects: [{
        ref: "object:project-owner-a@v4",
        objectType: "PROJECT",
        lifecycle: "OPEN",
        condition: "ACTIONABLE",
        summary: "客户交付项目。",
      }, {
        ref: "object:project-owner-b@v2",
        objectType: "PROJECT",
        lifecycle: "OPEN",
        condition: "ACTIONABLE",
        summary: "内部能力建设项目。",
      }, {
        ref: "object:task-shared@v3",
        objectType: "TASK",
        lifecycle: "OPEN",
        condition: "BLOCKED",
        summary: "整理可复用的交付检查器。",
      }],
      evidenceFacts: [{
        key: "owner-candidate-a",
        factCode: "OWNERSHIP_EVIDENCE",
        sourceRef: "object:project-owner-a@v4",
        observedAt,
        fingerprint: "cccccccc",
        statement: "Task 的直接交付对象支持客户项目。",
      }, {
        key: "owner-candidate-b",
        factCode: "OWNERSHIP_EVIDENCE",
        sourceRef: "object:project-owner-b@v2",
        observedAt,
        fingerprint: "dddddddd",
        statement: "Task 的长期维护目标支持内部项目。",
      }, {
        key: "owner-conflict",
        factCode: "OWNERSHIP_CONFLICT",
        sourceRef: "object:task-shared@v3",
        observedAt,
        fingerprint: "eeeeeeee",
        statement: "两条证据不能确定唯一 Primary Owner。",
      }],
    },
    expected: { decision: "NO_OBSERVATION" },
  }];
}

function caseErrorCode(id: GoldenCaseId): string {
  return `LLM_CROSS_OBJECT_LIVE_${id.replaceAll("-", "_").toUpperCase()}_UNEXPECTED`;
}

export async function runCrossObjectObservationLiveGate(
  environment: NodeJS.ProcessEnv,
  provider: StructuredProposalProvider,
): Promise<CrossObjectObservationLiveReport> {
  if (environment.RUN_LIVE_LLM_CROSS_OBJECT_TESTS !== "1") {
    throw liveError(
      "LLM_CROSS_OBJECT_LIVE_GATE_DISABLED",
      "未显式开启跨对象 live gate；没有解析凭据或发起网络请求。",
    );
  }
  const generator = new LocalLlmCrossObjectObservationGenerator(provider);
  const results: CrossObjectObservationLiveReport["cases"] = [];
  let attempts = 0;
  let durationMs = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let hasPromptTokens = true;
  let hasCompletionTokens = true;
  let hasTotalTokens = true;
  const models = new Set<string>();

  for (const item of buildSanitizedCrossObjectGoldenCases()) {
    let generated;
    try {
      generated = await generator.generate(item.context);
    } catch (error) {
      const structuralCode = error instanceof StructuredError
        ? error.code.replaceAll(/[^A-Z0-9_]/g, "_")
        : "UNCLASSIFIED";
      throw liveError(
        `${caseErrorCode(item.id)}_${structuralCode}`,
        "跨对象 live gate 的 Provider 输出未通过结构校验；没有开放前台。",
      );
    }
    attempts += generated.provider.attempts;
    durationMs += generated.provider.durationMs;
    models.add(generated.provider.model);
    if (generated.provider.promptTokens === undefined) hasPromptTokens = false;
    else promptTokens += generated.provider.promptTokens;
    if (generated.provider.completionTokens === undefined) hasCompletionTokens = false;
    else completionTokens += generated.provider.completionTokens;
    if (generated.provider.totalTokens === undefined) hasTotalTokens = false;
    else totalTokens += generated.provider.totalTokens;

    if (item.expected.decision === "NO_OBSERVATION") {
      if (generated.decision !== "NO_OBSERVATION" || generated.drafts.length !== 0) {
        throw liveError(caseErrorCode(item.id), "跨对象 live gate 的低证据场景未保持克制；没有开放前台。");
      }
      results.push({ id: item.id, decision: "NO_OBSERVATION" });
      continue;
    }
    const draft = generated.drafts[0];
    const factCodes = new Set(draft?.evidenceFacts.map(({ factCode }) => factCode));
    if (
      generated.decision !== "OBSERVATIONS"
      || generated.drafts.length !== 1
      || !draft
      || draft.kind !== item.expected.kind
      || item.expected.requiredSubjectRefs.some((ref) => !draft.subjectRefs.includes(ref))
      || item.expected.requiredFactCodes.some((code) => !factCodes.has(code))
    ) {
      throw liveError(caseErrorCode(item.id), "跨对象 live gate 的观察类型、scope 或证据不符合质量门；没有开放前台。");
    }
    results.push({ id: item.id, decision: "OBSERVATIONS", kind: draft.kind });
  }

  return {
    status: "PIPELINE_PASS",
    gate: "SHADOW_MODEL_QUALITY",
    evidenceSource: "SANITIZED_SYNTHETIC",
    provider: provider.providerId,
    providerVersion: provider.providerVersion,
    actualModels: [...models].sort(),
    caseCount: 5,
    observationCount: 3,
    abstentionCount: 2,
    attempts,
    durationMs,
    ...(hasPromptTokens ? { promptTokens } : {}),
    ...(hasCompletionTokens ? { completionTokens } : {}),
    ...(hasTotalTokens ? { totalTokens } : {}),
    cases: results,
    quality: {
      groundedKindsMatched: true,
      requiredEvidenceRetained: true,
      weakAndConflictingCasesAbstained: true,
      machineProvenanceApplied: true,
      frontstageStillClosed: true,
    },
    graphWrites: 0,
    formalStoreWrites: 0,
  };
}

async function main(): Promise<void> {
  if (process.env.RUN_LIVE_LLM_CROSS_OBJECT_TESTS !== "1") {
    throw liveError(
      "LLM_CROSS_OBJECT_LIVE_GATE_DISABLED",
      "未显式开启跨对象 live gate；没有解析凭据或发起网络请求。",
    );
  }
  const provider = await loadStructuredProviderFromEnvironment();
  if (!provider) throw liveError("LLM_PROVIDER_DISABLED", "未配置 DeepSeek Provider；没有发起网络请求。");
  const report = await runCrossObjectObservationLiveGate(process.env, provider);
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    const code = error instanceof StructuredError ? error.code : "LLM_CROSS_OBJECT_LIVE_FAILED";
    process.stderr.write(`${JSON.stringify({ status: "FAIL", code })}\n`);
    process.exitCode = 2;
  }
}
