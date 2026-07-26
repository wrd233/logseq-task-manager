import { pathToFileURL } from "node:url";

import type { ProjectClosureEvidenceDraft } from "@task-copilot/application";
import type { V2ProjectClosure } from "@task-copilot/domain";
import { StructuredError } from "@task-copilot/shared";

import { LocalLlmProposalGenerator, type StructuredProposalProvider } from "./llm-proposal.ts";
import {
  buildProjectClosureProposalPrompt,
  validateGeneratedProjectClosureProposal,
} from "./project-closure-provider.ts";
import { loadStructuredProviderFromEnvironment } from "./provider-runtime.ts";
import { readTaskCopilotSkill } from "./skill-catalog.ts";

export interface ProjectClosureLiveReport {
  status: "PIPELINE_PASS";
  gate: "MODEL_CONTRACT_ONLY";
  evidenceSource: "SANITIZED_SYNTHETIC";
  provider: string;
  providerVersion: string;
  actualModel: string;
  requestId?: string;
  durationMs: number;
  attempts: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  proposal: {
    groupCount: 1;
    operationKinds: ["UPDATE_PROJECT_INTERFACE", "TRANSITION_LIFECYCLE"];
    readScopeCount: number;
    modifyScopeCount: 1;
    unresolvedQuestionCount: number;
    incompleteObjectiveCount: number;
  };
  quality: {
    evidenceGroundingValidated: true;
    objectiveCompletionNotInferred: true;
    machineIdentityAbsentFromFrontstage: true;
    unresolvedWorkRetained: true;
    reviewStillRequired: true;
  };
  graphWrites: 0;
  formalStoreWrites: 0;
}

function liveError(code: string, message: string): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-127", "D-130", "D-140", "D-207", "D-220"] });
}

export function buildSanitizedProjectClosureEvidence(): ProjectClosureEvidenceDraft {
  return {
    schemaVersion: "task-copilot-project-closure-evidence-v1",
    project: {
      objectId: "project-release-live",
      version: 4,
      text: "发布治理演练",
      currentSummary: "新版发布链路与恢复演练已有证据，历史回放仍待数据。",
      sourceRefs: ["object:project-release-live@v4"],
    },
    goalCandidates: [{
      text: "让发布与回退过程稳定、可复核",
      sourceRefs: ["object:project-release-live@v4#project-structure/objectives/objective-release"],
      evidenceKind: "PROJECT_STRUCTURE",
    }],
    deliverableCandidates: [{
      text: "发布与回退操作手册",
      sourceRefs: ["object:project-release-live@v4#project-structure/deliverables/runbook"],
      evidenceKind: "PROJECT_STRUCTURE",
    }],
    decisionCandidates: [{
      text: "保留人工回退开关直到历史回放完成",
      sourceRefs: ["object:decision-rollback-live@v2"],
      evidenceKind: "OWNED_OBJECT",
    }],
    completedWorkCandidates: [{
      text: "完成一次恢复演练并保留核对记录",
      sourceRefs: ["object:task-rehearsal-live@v3"],
      evidenceKind: "OWNED_OBJECT",
    }],
    unresolvedWork: [{
      text: "补齐历史发布事件回放",
      condition: "等待：脱敏历史数据；期待：可回放样本",
      lifecycle: "OPEN",
      sourceRefs: ["object:task-history-live@v5"],
      evidenceKind: "OWNED_OBJECT",
    }],
    objectiveJudgments: [{
      objective: {
        objectiveId: "objective-release",
        text: "让发布与回退过程稳定、可复核",
        priority: "PRIMARY",
        sourceRefs: ["object:project-release-live@v4#project-structure/objectives/objective-release"],
      },
      evidence: [{
        text: "恢复演练通过",
        sourceRefs: ["object:project-release-live@v4#project-structure/objective-evidence/objective-release/1"],
        evidenceKind: "PROJECT_STRUCTURE",
      }],
      disposition: "NEEDS_USER_JUDGMENT",
    }],
    userJudgments: [
      { judgment: "ACTUAL_RESULT", reason: "确认候选证据是否构成实际结果。" },
      { judgment: "OBJECTIVE_DISPOSITIONS", reason: "确认 Objective 仍未完成及其后续。" },
      { judgment: "LEGACY_DISPOSITION", reason: "确认历史回放的承接方式。" },
      { judgment: "FUTURE_SUMMARY", reason: "确认未来重入摘要。" },
    ],
    unknowns: [
      { code: "ACTUAL_RESULT_REQUIRES_CONFIRMATION", text: "实际结果仍需用户确认。" },
      { code: "OBJECTIVE_COMPLETION_NOT_INFERRED", text: "恢复演练证据不等于 Objective 已完成。" },
    ],
    evidenceScopeHash: "liveclosure1",
    authorityBoundary: "READ_ONLY_EVIDENCE_DRAFT",
  };
}

function frontstageText(proposal: Awaited<ReturnType<LocalLlmProposalGenerator["generate"]>> & { kind: "PROPOSAL" }): string {
  const closure = proposal.proposal.groups[0]!.semanticOperations[0]!.payload.closure as V2ProjectClosure;
  return [
    proposal.proposal.title,
    proposal.proposal.context,
    proposal.proposal.understanding,
    proposal.proposal.objective,
    proposal.proposal.logic,
    proposal.proposal.finalPreview,
    ...proposal.proposal.unresolvedQuestions,
    closure.originalGoal,
    closure.actualResult,
    ...closure.majorDeliverables,
    ...closure.incompleteObjectives.flatMap(({ objective, reason, nextStep }) => [objective, reason, nextStep]),
    closure.legacyDisposition,
    ...closure.keyDecisions,
    closure.futureSummary,
  ].join("\n");
}

export async function runProjectClosureLiveGate(
  environment: NodeJS.ProcessEnv,
  provider: StructuredProposalProvider,
): Promise<ProjectClosureLiveReport> {
  if (environment.RUN_LIVE_LLM_TESTS !== "1") {
    throw liveError("PROJECT_CLOSURE_LIVE_GATE_DISABLED", "未显式开启 Project Closure live gate；没有解析凭据或发起网络请求。");
  }
  const evidence = buildSanitizedProjectClosureEvidence();
  const [coreSkill, designProjectSkill] = await Promise.all([
    readTaskCopilotSkill("task-copilot-core"),
    readTaskCopilotSkill("design-project"),
  ]);
  if (!coreSkill || !designProjectSkill) throw liveError("PROJECT_CLOSURE_LIVE_SKILL_UNAVAILABLE", "Project Closure live gate 缺少内置 Skill。");
  const generator = new LocalLlmProposalGenerator(provider);
  const generated = await generator.generate({
    proposalId: "prop_project_closure_live",
    createdAt: "2026-07-26T08:00:00.000Z",
    prompt: buildProjectClosureProposalPrompt({ evidence, coreSkill, designProjectSkill }),
  });
  if (generated.kind !== "PROPOSAL") {
    throw liveError("PROJECT_CLOSURE_LIVE_EXPECTED_PROPOSAL", "脱敏充分证据没有产生可审阅 Closure Proposal。");
  }
  validateGeneratedProjectClosureProposal(generated.proposal, evidence);
  const group = generated.proposal.groups[0]!;
  const closure = group.semanticOperations[0]!.payload.closure as V2ProjectClosure;
  const visible = frontstageText(generated);
  const forbiddenIdentity = [
    evidence.project.objectId,
    "decision-rollback-live",
    "task-rehearsal-live",
    "task-history-live",
    evidence.evidenceScopeHash,
  ];
  if (forbiddenIdentity.some((value) => visible.includes(value))) {
    throw liveError("PROJECT_CLOSURE_LIVE_FRONTSTAGE_IDENTITY_LEAK", "用户层 Closure 文案泄露机器 identity。");
  }
  if (!visible.includes("补齐历史发布事件回放")) {
    throw liveError("PROJECT_CLOSURE_LIVE_UNRESOLVED_WORK_DROPPED", "用户层 Closure 草稿遗漏了正式未决工作。");
  }
  return {
    status: "PIPELINE_PASS",
    gate: "MODEL_CONTRACT_ONLY",
    evidenceSource: "SANITIZED_SYNTHETIC",
    provider: provider.providerId,
    providerVersion: provider.providerVersion,
    actualModel: generated.provider.model,
    ...(generated.provider.requestId ? { requestId: generated.provider.requestId } : {}),
    durationMs: generated.provider.durationMs,
    attempts: generated.provider.attempts,
    ...(generated.provider.promptTokens !== undefined ? { promptTokens: generated.provider.promptTokens } : {}),
    ...(generated.provider.completionTokens !== undefined ? { completionTokens: generated.provider.completionTokens } : {}),
    ...(generated.provider.totalTokens !== undefined ? { totalTokens: generated.provider.totalTokens } : {}),
    proposal: {
      groupCount: 1,
      operationKinds: ["UPDATE_PROJECT_INTERFACE", "TRANSITION_LIFECYCLE"],
      readScopeCount: generated.proposal.scope.read.length,
      modifyScopeCount: 1,
      unresolvedQuestionCount: generated.proposal.unresolvedQuestions.length,
      incompleteObjectiveCount: closure.incompleteObjectives.length,
    },
    quality: {
      evidenceGroundingValidated: true,
      objectiveCompletionNotInferred: true,
      machineIdentityAbsentFromFrontstage: true,
      unresolvedWorkRetained: true,
      reviewStillRequired: true,
    },
    graphWrites: 0,
    formalStoreWrites: 0,
  };
}

async function main(): Promise<void> {
  if (process.env.RUN_LIVE_LLM_TESTS !== "1") {
    throw liveError("PROJECT_CLOSURE_LIVE_GATE_DISABLED", "未显式开启 Project Closure live gate；没有解析凭据或发起网络请求。");
  }
  const provider = await loadStructuredProviderFromEnvironment();
  if (!provider) throw liveError("LLM_PROVIDER_DISABLED", "未配置 DeepSeek Provider；没有发起网络请求。");
  const report = await runProjectClosureLiveGate(process.env, provider);
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    const code = error instanceof StructuredError ? error.code : "PROJECT_CLOSURE_LIVE_FAILED";
    process.stderr.write(`${JSON.stringify({ status: "FAIL", code })}\n`);
    process.exitCode = 2;
  }
}
