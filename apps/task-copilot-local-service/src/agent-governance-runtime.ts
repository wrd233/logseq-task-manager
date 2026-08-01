import type { AgentGovernanceApplication } from "@task-copilot/application";
import {
  agentGovernanceSemanticText,
  classifyAgentGovernanceChange,
  routeAgentDecision,
  validateAgentStructuredDecisionOutput,
  type AgentDecision,
  type AgentGateBlock,
  type AgentGovernanceRule,
  type AgentGovernanceRuntimeMode,
  type AgentRuleAuthorization,
} from "@task-copilot/domain";
import type { ServiceGraphReadQuery, ServiceGraphReadResult, ServiceGraphSnapshot } from "@task-copilot/service-client";
import { StructuredError, checksum, stableJson } from "@task-copilot/shared";

import { buildAgentGovernanceContextPackage, buildContextPackage, type ContextPackageSource } from "./context-package.ts";
import type { AgentGovernanceSkillDocument } from "./skill-catalog.ts";

export interface AgentGovernanceRuntimeProvider {
  completeStructured(request: { system: string; user: string; signal?: AbortSignal }): Promise<{
    value: unknown;
    metadata: { model: string; promptTokens?: number; completionTokens?: number; durationMs: number; attempts: number };
  }>;
}

export interface AgentGovernanceRuntimeGraph {
  read(query: ServiceGraphReadQuery): Promise<ServiceGraphReadResult>;
}

export interface AgentGovernanceObservation {
  changedBlockId: string;
  changedBlockCount: number;
}

export interface AgentGovernanceObservationResult {
  status: "IGNORED" | "DEFERRED" | "UNCHANGED" | "RECORDED";
  gateAction: "IGNORE_THIS_CHANGE" | "UPDATE_REVIEW_SIGNAL" | "RUN_LOCAL" | "RUN_EXPANDED" | "DEFER_TO_BATCH";
  decision?: AgentDecision;
}

export interface AgentGovernanceRuntimeOptions {
  graphId: string;
  source: ContextPackageSource & {
    listCandidates(): Array<{ sourceAnchorId: string }>;
  };
  application: AgentGovernanceApplication;
  graph: AgentGovernanceRuntimeGraph;
  skill: AgentGovernanceSkillDocument;
  provider?: AgentGovernanceRuntimeProvider;
  runtimeMode: AgentGovernanceRuntimeMode;
  guardedAutomationEnabled: boolean;
  globalWritesPaused?: () => boolean;
  degraded?: () => boolean;
  now?: () => Date;
}

function runtimeError(code: string, message: string): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["ADG-GATE-01", "ADG-SHADOW-01"] });
}

function requireBlockSnapshot(result: ServiceGraphReadResult, target: string): ServiceGraphSnapshot {
  if (result.status === "NOT_FOUND") throw runtimeError("AGENT_SOURCE_NOT_FOUND", "Agent 观察来源已不存在；没有使用缓存或写入正式状态。");
  if (result.status === "ERROR") throw runtimeError("AGENT_GRAPH_READ_FAILED", "Agent 无法读取当前 Graph 证据；没有调用 Provider 或写入正式状态。");
  if (result.snapshot.kind !== "BLOCK" || result.snapshot.requestedTarget !== target) throw runtimeError("AGENT_GRAPH_READ_MISMATCH", "Agent Graph 读取结果与观察目标不匹配。");
  return result.snapshot;
}

function lineageFromSnapshot(snapshot: ServiceGraphSnapshot): AgentGateBlock[] {
  const root = snapshot.blocks.find(({ relation }) => relation === "ROOT");
  if (!root) throw runtimeError("AGENT_SOURCE_ROOT_MISSING", "Agent Graph Snapshot 缺少变更 Block。");
  const parents = snapshot.blocks.filter(({ relation }) => relation === "PARENT").sort((left, right) => left.depth - right.depth);
  const values = [root, ...parents];
  return values.map((block, index) => ({
    externalId: block.uuid,
    content: block.content,
    ...(values[index + 1] ? { parentExternalId: values[index + 1]!.uuid } : {}),
    ...(block.pageName ? { pageName: block.pageName } : {}),
  }));
}

function sourceSnapshotHash(snapshot: ServiceGraphSnapshot): string {
  return checksum(snapshot.blocks.map(({ uuid, relation, depth, parentUuid, content }) => ({
    uuid,
    relation,
    depth,
    ...(parentUuid ? { parentUuid } : {}),
    content: agentGovernanceSemanticText(content),
  })));
}

function ruleForGate(
  rules: readonly AgentGovernanceRule[],
  gateReason: string,
  sourceRoot: AgentGateBlock,
  current?: AgentDecision,
): AgentGovernanceRule | undefined {
  if (current) return rules.find(({ id }) => id === current.rule.id);
  if (gateReason === "WEAK_SIGNAL" || gateReason === "REPEATED_WEAK_SIGNAL") return rules.find(({ id }) => id === "REVIEW-SIGNAL-01");
  if (gateReason === "FORMAL_OBJECT_UPDATE") return rules.find(({ id }) => id === "WORKSITE-CONTEXT-01");
  if (/^(?:TODO|NOW|DOING)\b|^\[(?:Task|任务)\]/iu.test(agentGovernanceSemanticText(sourceRoot.content))) return rules.find(({ id }) => id === "EXPLICIT-TASK-01");
  return undefined;
}

function presentEvidenceFor(rule: AgentGovernanceRule, sourceRoot: AgentGateBlock, hasSameSourceFormalState: boolean): string[] {
  const present = new Set<string>(["SOURCE_ROOT_CAPTURED", "SOURCE_STILL_EXISTS", "SINGLE_OBJECT_IMPACT", "NO_SOURCE_TEXT_WRITE"]);
  if (/^(?:TODO|NOW|DOING)\b|^\[(?:Task|任务)\]/iu.test(agentGovernanceSemanticText(sourceRoot.content))) present.add("SOURCE_ROOT_EXPLICIT_TASK_MARKER");
  if (!hasSameSourceFormalState) present.add("NO_DUPLICATE");
  if (rule.id === "REVIEW-SIGNAL-01") present.add("WEAK_SIGNAL_EXPRESSION");
  if (rule.id === "WORKSITE-CONTEXT-01" && hasSameSourceFormalState) {
    present.add("UNIQUE_OWNING_OBJECT");
    present.add("SOURCE_IN_WORKSITE");
  }
  return [...present].sort();
}

export class AgentGovernanceRuntime {
  private readonly now: () => Date;

  constructor(private readonly options: AgentGovernanceRuntimeOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async observe(observation: AgentGovernanceObservation, signal?: AbortSignal): Promise<AgentGovernanceObservationResult> {
    const changedBlockId = observation.changedBlockId.trim();
    if (!changedBlockId || changedBlockId.length > 512 || !Number.isSafeInteger(observation.changedBlockCount) || observation.changedBlockCount < 1 || observation.changedBlockCount > 1_024) {
      throw runtimeError("AGENT_OBSERVATION_INVALID", "Agent observation 必须包含受控 Block 身份与变更数量。");
    }
    if (signal?.aborted) throw runtimeError("AGENT_OBSERVATION_CANCELLED", "Agent observation 已被更新的来源版本取消。");
    const observedAt = this.now();
    await this.registerRules(observedAt);
    const initial = requireBlockSnapshot(await this.options.graph.read({ kind: "BLOCK", target: changedBlockId, includeChildren: true, parents: 8 }), changedBlockId);
    if (signal?.aborted) throw runtimeError("AGENT_OBSERVATION_CANCELLED", "Agent observation 已被更新的来源版本取消。");
    const lineage = lineageFromSnapshot(initial);
    const decisions = await this.options.application.listDecisions({ limit: 100 });
    const activeSignals = await this.options.application.listReviewSignals({ status: "ACTIVE", limit: 100 });
    const formalSourceIds = new Set(this.options.source.listObjects()
      .map(({ objectId }) => this.options.source.getActivePrimaryAnchorByObject(objectId)?.externalId)
      .filter((value): value is string => value !== undefined));
    const candidates = this.options.source.listCandidates();
    const insideFormalObject = lineage.some(({ externalId }) => formalSourceIds.has(externalId));
    const lineageIds = new Set(lineage.map(({ externalId }) => externalId));
    const candidateTargetCount = candidates.filter(({ sourceAnchorId }) => lineageIds.has(sourceAnchorId)).length;
    const priorWeakOccurrences = activeSignals.find(({ sourceRoot }) => lineageIds.has(sourceRoot.externalId))?.occurrenceCount ?? 0;
    const currentForChanged = decisions.find(({ sourceRoot }) => sourceRoot.externalId === changedBlockId);
    const gate = classifyAgentGovernanceChange({
      changed: lineage[0]!,
      lineage,
      changedBlockCount: observation.changedBlockCount,
      weakSignalOccurrences30d: priorWeakOccurrences + 1,
      candidateTargetCount,
      hasExistingDecisionThread: currentForChanged !== undefined,
      insideFormalObject,
    });
    if (gate.action === "IGNORE_THIS_CHANGE") return { status: "IGNORED", gateAction: gate.action };
    if (gate.action === "DEFER_TO_BATCH") return { status: "DEFERRED", gateAction: gate.action };

    const sourceSnapshot = gate.sourceRoot.externalId === changedBlockId
      ? initial
      : requireBlockSnapshot(await this.options.graph.read({ kind: "BLOCK", target: gate.sourceRoot.externalId, includeChildren: true, parents: 8 }), gate.sourceRoot.externalId);
    if (signal?.aborted) throw runtimeError("AGENT_OBSERVATION_CANCELLED", "Agent observation 已被更新的来源版本取消。");
    const current = decisions.find(({ sourceRoot }) => sourceRoot.externalId === gate.sourceRoot.externalId);
    const snapshotHash = sourceSnapshotHash(sourceSnapshot);
    if (current?.sourceSnapshotHash === snapshotHash) return { status: "UNCHANGED", gateAction: gate.action, decision: current };
    const rule = ruleForGate(this.options.skill.manifest.rules, gate.reason, gate.sourceRoot, current);
    if (!rule) return { status: "IGNORED", gateAction: gate.action };
    const authorization = await this.requireAuthorization(rule.id);
    const hasSameSourceFormalState = formalSourceIds.has(gate.sourceRoot.externalId)
      || candidates.some(({ sourceAnchorId }) => sourceAnchorId === gate.sourceRoot.externalId);
    const presentEvidence = presentEvidenceFor(rule, gate.sourceRoot, hasSameSourceFormalState);
    const contextPackage = buildContextPackage(this.options.source, [], { kind: "block", id: gate.sourceRoot.externalId }, observedAt, sourceSnapshot);
    const context = buildAgentGovernanceContextPackage(contextPackage, {
      tier: gate.action === "RUN_EXPANDED" ? "EXPANDED" : "LOCAL",
      tokenBudget: gate.action === "RUN_EXPANDED" ? 24_000 : 12_000,
      rule,
      counterSignals: [],
      recentFeedback: [],
    });
    if (gate.action === "UPDATE_REVIEW_SIGNAL") {
      return this.recordDeterministicReviewSignal(gate.action, gate.sourceRoot, snapshotHash, rule, context, observedAt);
    }
    if (!this.options.provider) return this.recordProviderFailure(gate.action, gate.sourceRoot, sourceSnapshot, snapshotHash, rule, context, "PROVIDER_DISABLED", observedAt);

    try {
      const allowedEvidenceRefs = new Set([`source:${gate.sourceRoot.externalId}`, `rule:${rule.id}`]);
      const completion = await this.options.provider.completeStructured({
        system: `${this.options.skill.content}\n\nUse only the supplied bounded Context. Return exactly one JSON object and no prose.`,
        user: stableJson({ context, rule, deterministicEvidence: presentEvidence, allowedEvidenceRefs: [...allowedEvidenceRefs] }),
        ...(signal ? { signal } : {}),
      });
      if (signal?.aborted) throw runtimeError("AGENT_OBSERVATION_CANCELLED", "Agent observation 已被更新的来源版本取消。");
      const output = validateAgentStructuredDecisionOutput(completion.value);
      if (output.ruleId !== rule.id) throw runtimeError("AGENT_PROVIDER_RULE_MISMATCH", "Provider 返回了未选中的 Rule ID。");
      if (![rule.recommendedOutcome, "NEEDS_MORE_CONTEXT", "NEEDS_HUMAN"].includes(output.outcome)) throw runtimeError("AGENT_PROVIDER_OUTCOME_NOT_ALLOWED", "Provider 返回了 Skill 未允许的 Outcome。");
      if (output.evidenceRefs.some((reference) => !allowedEvidenceRefs.has(reference))) throw runtimeError("AGENT_PROVIDER_EVIDENCE_INVENTED", "Provider 返回了 Context 中不存在的 Evidence Ref。");
      const routing = routeAgentDecision({
        riskLevel: rule.riskLevel,
        authorization,
        runtimeMode: this.options.runtimeMode,
        guardedAutomationEnabled: this.options.guardedAutomationEnabled,
        globalWritesPaused: this.options.globalWritesPaused?.() ?? false,
        degraded: this.options.degraded?.() ?? false,
        skillValid: true,
        skillVersionMatches: authorization.skillVersion === this.options.skill.version && authorization.skillHash === this.options.skill.sha256,
        requiredEvidence: rule.requiredEvidence,
        presentEvidence,
        requiredEvidenceOmitted: context.requiredEvidenceOmitted,
        counterSignals: output.counterSignals,
        targetObjectIds: output.targetObjectIds,
        affectedObjectCount: Math.max(1, output.targetObjectIds.length),
        modifiesSourceText: false,
        changesLifecycle: false,
        changesPrimaryOwnership: false,
        structuralChange: false,
        reversible: true,
      });
      const recorded = await this.options.application.recordDecision({
        graphId: this.options.graphId,
        sourceRoot: {
          kind: "BLOCK",
          externalId: gate.sourceRoot.externalId,
          ...(gate.sourceRoot.pageName ? { pageName: gate.sourceRoot.pageName } : {}),
          durableOrigin: { kind: "BLOCK_UUID", value: gate.sourceRoot.externalId },
        },
        sourceSnapshotHash: snapshotHash,
        outcome: output.outcome,
        ...(output.targetObjectIds.length === 1 ? { targetObjectId: output.targetObjectIds[0] } : {}),
        rule: { id: rule.id, displayName: rule.displayName, skillName: this.options.skill.name, skillVersion: this.options.skill.version, skillHash: this.options.skill.sha256 },
        riskRoute: routing.route,
        executionStatus: "NOT_EXECUTED",
        evidenceSummary: output.evidenceSummary,
        evidenceRefs: output.evidenceRefs,
        counterSignals: output.counterSignals,
        closestAlternative: output.closestAlternative,
        context: {
          tier: context.tier,
          truncated: context.contextTruncated,
          omittedSections: context.omittedSections,
          estimatedInputTokens: completion.metadata.promptTokens ?? context.estimatedInputTokens,
          ...(completion.metadata.completionTokens !== undefined ? { estimatedOutputTokens: completion.metadata.completionTokens } : {}),
        },
      }, {
        actor: "agent",
        traceId: `agent-observe:${gate.sourceRoot.externalId}:${snapshotHash.slice(0, 12)}`,
        idempotencyKey: `agent-decision:${this.options.graphId}:${gate.sourceRoot.externalId}:${snapshotHash}`,
      }, observedAt);
      if (output.outcome === "REVIEW_SIGNAL") {
        await this.options.application.recordReviewSignal({
          graphId: this.options.graphId,
          sourceRoot: recorded.decision.sourceRoot,
          capturedSnapshotHash: snapshotHash,
          capturedText: gate.sourceRoot.content,
          category: "AGENT_WEAK_SIGNAL",
          relatedObjectIds: output.targetObjectIds,
          revisitReason: output.evidenceSummary,
          createdByDecisionId: recorded.decision.decisionId,
        }, {
          actor: "agent",
          traceId: `agent-signal:${gate.sourceRoot.externalId}:${snapshotHash.slice(0, 12)}`,
          idempotencyKey: `agent-signal:${this.options.graphId}:${gate.sourceRoot.externalId}:${snapshotHash}`,
        }, observedAt);
      }
      return { status: "RECORDED", gateAction: gate.action, decision: recorded.decision };
    } catch (error) {
      if (signal?.aborted || (error instanceof StructuredError && error.code === "AGENT_OBSERVATION_CANCELLED")) throw error;
      return this.recordProviderFailure(gate.action, gate.sourceRoot, sourceSnapshot, snapshotHash, rule, context, "PROVIDER_OUTPUT_REJECTED", observedAt);
    }
  }

  private async registerRules(at: Date): Promise<void> {
    for (const rule of this.options.skill.manifest.rules) {
      await this.options.application.registerRule({
        ruleId: rule.id,
        displayName: rule.displayName,
        skillName: this.options.skill.name,
        skillVersion: this.options.skill.version,
        skillHash: this.options.skill.sha256,
        skillMaxAuthority: rule.maxAuthority,
      }, {
        actor: "system",
        traceId: `agent-skill:${this.options.skill.sha256.slice(0, 12)}`,
        idempotencyKey: `agent-rule-register:${rule.id}:${this.options.skill.sha256}`,
      }, at);
    }
  }

  private async requireAuthorization(ruleId: string): Promise<AgentRuleAuthorization> {
    const authorization = (await this.options.application.listRuleAuthorizations()).find((value) => value.ruleId === ruleId);
    if (!authorization) throw runtimeError("AGENT_RULE_AUTHORIZATION_MISSING", "Agent Rule 本地授权记录缺失。");
    return authorization;
  }

  private async recordProviderFailure(
    gateAction: AgentGovernanceObservationResult["gateAction"],
    sourceRoot: AgentGateBlock,
    sourceSnapshot: ServiceGraphSnapshot,
    snapshotHash: string,
    rule: AgentGovernanceRule,
    context: ReturnType<typeof buildAgentGovernanceContextPackage>,
    failureCode: string,
    at: Date,
  ): Promise<AgentGovernanceObservationResult> {
    const recorded = await this.options.application.recordDecision({
      graphId: this.options.graphId,
      sourceRoot: {
        kind: "BLOCK",
        externalId: sourceRoot.externalId,
        ...(sourceRoot.pageName ? { pageName: sourceRoot.pageName } : {}),
        durableOrigin: { kind: "BLOCK_UUID", value: sourceRoot.externalId },
      },
      sourceSnapshotHash: snapshotHash,
      outcome: "NEEDS_HUMAN",
      rule: { id: rule.id, displayName: rule.displayName, skillName: this.options.skill.name, skillVersion: this.options.skill.version, skillHash: this.options.skill.sha256 },
      riskRoute: this.options.runtimeMode === "EXPERIMENT" ? "SHADOW" : "HUMAN_REVIEW",
      executionStatus: "FAILED",
      evidenceSummary: "Provider 未能生成通过结构与 Skill 校验的 Decision；来源观察已保留，正式业务状态未改变。",
      evidenceRefs: [`source:${sourceRoot.externalId}`, `rule:${rule.id}`],
      counterSignals: [failureCode],
      closestAlternative: { outcome: "NEEDS_HUMAN", reason: "保留观察并稍后重试。" },
      context: {
        tier: context.tier,
        truncated: context.contextTruncated || sourceSnapshot.truncated,
        omittedSections: context.omittedSections,
        estimatedInputTokens: context.estimatedInputTokens,
      },
    }, {
      actor: "system",
      traceId: `agent-failure:${sourceRoot.externalId}:${snapshotHash.slice(0, 12)}`,
      idempotencyKey: `agent-decision-failure:${this.options.graphId}:${sourceRoot.externalId}:${snapshotHash}:${failureCode}`,
    }, at);
    return { status: "RECORDED", gateAction, decision: recorded.decision };
  }

  private async recordDeterministicReviewSignal(
    gateAction: AgentGovernanceObservationResult["gateAction"],
    sourceRoot: AgentGateBlock,
    snapshotHash: string,
    rule: AgentGovernanceRule,
    context: ReturnType<typeof buildAgentGovernanceContextPackage>,
    at: Date,
  ): Promise<AgentGovernanceObservationResult> {
    const recorded = await this.options.application.recordDecision({
      graphId: this.options.graphId,
      sourceRoot: {
        kind: "BLOCK",
        externalId: sourceRoot.externalId,
        ...(sourceRoot.pageName ? { pageName: sourceRoot.pageName } : {}),
        durableOrigin: { kind: "BLOCK_UUID", value: sourceRoot.externalId },
      },
      sourceSnapshotHash: snapshotHash,
      outcome: "REVIEW_SIGNAL",
      rule: { id: rule.id, displayName: rule.displayName, skillName: this.options.skill.name, skillVersion: this.options.skill.version, skillHash: this.options.skill.sha256 },
      riskRoute: "SHADOW",
      executionStatus: "NOT_EXECUTED",
      evidenceSummary: "来源包含弱事务信号；当前只进入有期复盘索引，不进入待整理或正式对象。",
      evidenceRefs: [`source:${sourceRoot.externalId}`, `rule:${rule.id}`],
      counterSignals: [],
      closestAlternative: { outcome: "CREATE_CANDIDATE", reason: "若后续出现明确承诺、期限或第三次同源信号，再扩大上下文判断。" },
      context: {
        tier: context.tier,
        truncated: context.contextTruncated,
        omittedSections: context.omittedSections,
        estimatedInputTokens: context.estimatedInputTokens,
      },
    }, {
      actor: "system",
      traceId: `agent-weak-signal:${sourceRoot.externalId}:${snapshotHash.slice(0, 12)}`,
      idempotencyKey: `agent-weak-decision:${this.options.graphId}:${sourceRoot.externalId}:${snapshotHash}`,
    }, at);
    await this.options.application.recordReviewSignal({
      graphId: this.options.graphId,
      sourceRoot: recorded.decision.sourceRoot,
      capturedSnapshotHash: snapshotHash,
      capturedText: sourceRoot.content,
      category: "AGENT_WEAK_SIGNAL",
      relatedObjectIds: [],
      revisitReason: recorded.decision.evidenceSummary,
      createdByDecisionId: recorded.decision.decisionId,
    }, {
      actor: "system",
      traceId: `agent-weak-signal:${sourceRoot.externalId}:${snapshotHash.slice(0, 12)}`,
      idempotencyKey: `agent-weak-signal:${this.options.graphId}:${sourceRoot.externalId}:${snapshotHash}`,
    }, at);
    return { status: "RECORDED", gateAction, decision: recorded.decision };
  }
}
