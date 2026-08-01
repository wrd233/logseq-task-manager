import {
  authorizeAgentRule,
  autoDowngradeAgentRule,
  buildAgentSkillFeedbackPackage,
  createAgentDecision,
  createAgentDecisionEvent,
  createAgentFeedbackEvent,
  createAgentRuleAuthorization,
  createOrRefreshAgentReviewSignal,
  groupCompatibleAgentFeedback,
  reconcileAgentReviewSignal,
  reviseAgentDecision,
  setAgentRulePaused,
  updateAgentRuleSkill,
  type AgentDecision,
  type AgentDecisionEvent,
  type AgentDecisionInput,
  type AgentGovernanceExportPackage,
  type AgentFeedbackInput,
  type AgentFeedbackCompatibilityGroup,
  type AgentRuleAuthorization,
  type AgentRuleAuthority,
  type AgentReviewSignal,
  type AgentReviewSignalInput,
  type AgentReviewSignalStatus,
  type CreateAgentRuleAuthorizationInput,
  type UpdateAgentRuleSkillInput,
} from "@task-copilot/domain";
import { StructuredError, checksum } from "@task-copilot/shared";

export interface AgentGovernanceRepository {
  getAgentDecisionBySource(
    graphId: string,
    sourceKind: "BLOCK" | "PAGE",
    sourceExternalId: string,
  ): AgentDecision | undefined | Promise<AgentDecision | undefined>;
  getAgentDecisionById(decisionId: string): AgentDecision | undefined | Promise<AgentDecision | undefined>;
  saveAgentDecision(
    decision: AgentDecision,
    event: AgentDecisionEvent | undefined,
    idempotencyKey: string,
  ): { decision: AgentDecision; event?: AgentDecisionEvent; replayed: boolean }
    | Promise<{ decision: AgentDecision; event?: AgentDecisionEvent; replayed: boolean }>;
  listAgentDecisions(input: { limit: number; since?: string }): AgentDecision[] | Promise<AgentDecision[]>;
  listAgentDecisionsForExport(input: { since: string; until: string; limit: number }): AgentDecision[] | Promise<AgentDecision[]>;
  countAgentDecisionsForExport(input: { since: string; until: string }): number | Promise<number>;
  listAgentDecisionEvents(threadId: string): AgentDecisionEvent[] | Promise<AgentDecisionEvent[]>;
  listAgentDecisionEventsForExport(input: { since: string; until: string; limit: number }): AgentDecisionEvent[] | Promise<AgentDecisionEvent[]>;
  saveAgentFeedback(
    event: AgentDecisionEvent,
    authorization: AgentRuleAuthorization | undefined,
    expectedAuthorizationUpdatedAt: string | undefined,
    idempotencyKey: string,
  ): { event: AgentDecisionEvent; authorization?: AgentRuleAuthorization; replayed: boolean }
    | Promise<{ event: AgentDecisionEvent; authorization?: AgentRuleAuthorization; replayed: boolean }>;
  getAgentRuleAuthorization(ruleId: string): AgentRuleAuthorization | undefined | Promise<AgentRuleAuthorization | undefined>;
  saveAgentRuleAuthorization(
    authorization: AgentRuleAuthorization,
    expectedUpdatedAt: string | undefined,
    idempotencyKey: string,
  ): { authorization: AgentRuleAuthorization; replayed: boolean }
    | Promise<{ authorization: AgentRuleAuthorization; replayed: boolean }>;
  listAgentRuleAuthorizations(): AgentRuleAuthorization[] | Promise<AgentRuleAuthorization[]>;
  getAgentReviewSignalBySource(graphId: string, sourceExternalId: string): AgentReviewSignal | undefined | Promise<AgentReviewSignal | undefined>;
  getAgentReviewSignal(reviewSignalId: string): AgentReviewSignal | undefined | Promise<AgentReviewSignal | undefined>;
  saveAgentReviewSignal(
    signal: AgentReviewSignal,
    expected: AgentReviewSignal | undefined,
    idempotencyKey: string,
  ): { signal: AgentReviewSignal; replayed: boolean } | Promise<{ signal: AgentReviewSignal; replayed: boolean }>;
  listAgentReviewSignals(input: { status?: AgentReviewSignalStatus; limit: number }): AgentReviewSignal[] | Promise<AgentReviewSignal[]>;
  listAgentReviewSignalsForExport(input: { since: string; until: string; limit: number }): AgentReviewSignal[] | Promise<AgentReviewSignal[]>;
  countAgentReviewSignalsForExport(input: { since: string; until: string }): number | Promise<number>;
}

export interface AgentGovernanceCommandEnvelope {
  actor: string;
  traceId: string;
  idempotencyKey: string;
}

function requireEnvelope(value: AgentGovernanceCommandEnvelope): void {
  if (!value.actor.trim() || !value.traceId.trim() || !value.idempotencyKey.trim()) {
    throw new StructuredError({
      code: "AGENT_GOVERNANCE_COMMAND_INVALID",
      message: "Agent governance command 缺少 actor、trace_id 或 idempotency key。",
      ruleRefs: ["ADG-ARCH-01", "ADG-DATA-02"],
    });
  }
}

function eventActor(actor: string): AgentDecisionEvent["actor"] {
  const normalized = actor.trim().toLowerCase();
  if (normalized === "user" || normalized === "human") return "USER";
  if (normalized === "system") return "SYSTEM";
  return "AGENT";
}

export class AgentGovernanceApplication {
  constructor(private readonly repository: AgentGovernanceRepository) {}

  async recordDecision(
    input: AgentDecisionInput,
    envelope: AgentGovernanceCommandEnvelope,
    at = new Date(),
  ): Promise<{ decision: AgentDecision; event?: AgentDecisionEvent; revised: boolean; replayed: boolean }> {
    requireEnvelope(envelope);
    const current = await this.repository.getAgentDecisionBySource(
      input.graphId,
      input.sourceRoot.kind,
      input.sourceRoot.externalId,
    );
    const result = current ? reviseAgentDecision(current, input, at) : { decision: createAgentDecision(input, at), revised: true };
    const event = result.revised
      ? createAgentDecisionEvent({
          threadId: result.decision.threadId,
          decisionId: result.decision.decisionId,
          eventType: current ? "DECISION_REVISED" : "SOURCE_OBSERVED",
          actor: eventActor(envelope.actor),
          payload: { revision: result.decision.revision, traceId: envelope.traceId },
        }, at)
      : undefined;
    const saved = await this.repository.saveAgentDecision(result.decision, event, envelope.idempotencyKey);
    return { ...saved, revised: saved.event !== undefined };
  }

  listDecisions(input: { limit: number; since?: string }): Promise<AgentDecision[]> {
    return Promise.resolve(this.repository.listAgentDecisions(input));
  }

  listDecisionEvents(threadId: string): Promise<AgentDecisionEvent[]> {
    return Promise.resolve(this.repository.listAgentDecisionEvents(threadId));
  }

  async exportSkillFeedback(
    input: { since: string; until?: string },
    at = new Date(),
  ): Promise<AgentGovernanceExportPackage> {
    const until = input.until ?? at.toISOString();
    const [decisions, sourceTotal, events, authorizations] = await Promise.all([
      this.repository.listAgentDecisionsForExport({ since: input.since, until, limit: 100 }),
      this.repository.countAgentDecisionsForExport({ since: input.since, until }),
      this.repository.listAgentDecisionEventsForExport({ since: input.since, until, limit: 1_000 }),
      this.repository.listAgentRuleAuthorizations(),
    ]);
    const includedIds = new Set(decisions.map(({ decisionId }) => decisionId));
    return buildAgentSkillFeedbackPackage({
      generatedAt: at,
      since: input.since,
      until,
      decisions,
      events: events.filter(({ decisionId }) => includedIds.has(decisionId)),
      authorizations,
      sourceTotal,
      truncated: sourceTotal > decisions.length,
    });
  }

  async prepareReviewEvidenceExport(
    days: 60 | 180,
    at = new Date(),
  ): Promise<{ since: string; until: string; signals: AgentReviewSignal[]; decisions: AgentDecision[]; events: AgentDecisionEvent[]; sourceTotal: number; truncated: boolean }> {
    const until = at.toISOString();
    const sinceDate = new Date(at);
    sinceDate.setUTCDate(sinceDate.getUTCDate() - days);
    const since = sinceDate.toISOString();
    const [signals, sourceTotal, decisions, events] = await Promise.all([
      this.repository.listAgentReviewSignalsForExport({ since, until, limit: 50 }),
      this.repository.countAgentReviewSignalsForExport({ since, until }),
      this.repository.listAgentDecisionsForExport({ since, until, limit: 100 }),
      this.repository.listAgentDecisionEventsForExport({ since, until, limit: 1_000 }),
    ]);
    return { since, until, signals, decisions, events, sourceTotal, truncated: sourceTotal > signals.length };
  }

  async recordFeedback(
    decisionId: string,
    input: AgentFeedbackInput,
    envelope: AgentGovernanceCommandEnvelope,
    at = new Date(),
  ): Promise<{ event: AgentDecisionEvent; authorization?: AgentRuleAuthorization; replayed: boolean }> {
    requireEnvelope(envelope);
    if (eventActor(envelope.actor) !== "USER") {
      throw new StructuredError({ code: "AGENT_FEEDBACK_REQUIRES_USER", message: "Agent Feedback 必须由 USER 显式提交。", ruleRefs: ["ADG-FEEDBACK-01"] });
    }
    const decision = await this.repository.getAgentDecisionById(decisionId);
    if (!decision) {
      throw new StructuredError({ code: "AGENT_DECISION_NOT_FOUND", message: "Agent Decision 不存在或已不是当前 Revision。", ruleRefs: ["ADG-DATA-01", "ADG-FEEDBACK-01"] });
    }
    const event = createAgentFeedbackEvent(decision, input, envelope.traceId, at);
    const currentAuthorization = input.action === "PAUSE_RULE_AUTOMATION"
      ? await this.requireRuleAuthorization(decision.rule.id)
      : undefined;
    const authorization = currentAuthorization
      ? setAgentRulePaused(currentAuthorization, true, "USER", "用户通过 Decision Feedback 显式暂停规则自动应用。", at)
      : undefined;
    return this.repository.saveAgentFeedback(event, authorization, currentAuthorization?.updatedAt, envelope.idempotencyKey);
  }

  async recordBulkFeedback(
    decisionIds: readonly string[],
    input: AgentFeedbackInput,
    envelope: AgentGovernanceCommandEnvelope,
    at = new Date(),
  ): Promise<{
    groups: AgentFeedbackCompatibilityGroup[];
    results: Array<{ event: AgentDecisionEvent; authorization?: AgentRuleAuthorization; replayed: boolean }>;
  }> {
    requireEnvelope(envelope);
    const uniqueIds = [...new Set(decisionIds.map((value) => value.trim()))];
    if (uniqueIds.length < 1 || uniqueIds.length > 50 || uniqueIds.some((value) => !value || value.length > 256)) {
      throw new StructuredError({ code: "AGENT_BULK_FEEDBACK_INVALID", message: "批量 Feedback 必须包含 1..50 个唯一 Decision ID。", ruleRefs: ["ADG-FEEDBACK-02"] });
    }
    const decisions = await Promise.all(uniqueIds.map((decisionId) => Promise.resolve(this.repository.getAgentDecisionById(decisionId))));
    if (decisions.some((decision) => decision === undefined)) {
      throw new StructuredError({ code: "AGENT_DECISION_NOT_FOUND", message: "批量 Feedback 包含不存在或已不是当前 Revision 的 Decision。", ruleRefs: ["ADG-FEEDBACK-02"] });
    }
    const resolved = decisions as AgentDecision[];
    const groups = groupCompatibleAgentFeedback(resolved, input);
    const results = [];
    for (const decision of resolved) {
      results.push(await this.recordFeedback(decision.decisionId, input, {
        ...envelope,
        idempotencyKey: `${envelope.idempotencyKey}:${checksum(decision.decisionId)}`,
      }, at));
    }
    return { groups, results };
  }

  async registerRule(
    input: CreateAgentRuleAuthorizationInput,
    envelope: AgentGovernanceCommandEnvelope,
    at = new Date(),
  ): Promise<{ authorization: AgentRuleAuthorization; replayed: boolean }> {
    requireEnvelope(envelope);
    const current = await this.repository.getAgentRuleAuthorization(input.ruleId);
    const authorization = current ?? createAgentRuleAuthorization(input, at);
    if (current && (current.skillName !== input.skillName
      || current.skillVersion !== input.skillVersion
      || current.skillHash !== input.skillHash
      || current.skillMaxAuthority !== input.skillMaxAuthority)) {
      throw new StructuredError({
        code: "AGENT_RULE_REGISTRATION_CONFLICT",
        message: "已存在的 Rule 变更必须声明 PATCH、NARROWING 或 EXPANDING。",
        ruleRefs: ["ADG-SKILL-01", "ADG-ROUTER-01"],
      });
    }
    return this.repository.saveAgentRuleAuthorization(authorization, current?.updatedAt, envelope.idempotencyKey);
  }

  async authorizeRule(
    ruleId: string,
    requestedAuthority: AgentRuleAuthority,
    reason: string,
    envelope: AgentGovernanceCommandEnvelope,
    at = new Date(),
  ): Promise<{ authorization: AgentRuleAuthorization; replayed: boolean }> {
    requireEnvelope(envelope);
    const current = await this.requireRuleAuthorization(ruleId);
    const actor = envelope.actor.trim().toLowerCase() === "user" ? "USER" : "SYSTEM";
    const authorization = authorizeAgentRule(current, requestedAuthority, actor, reason, at);
    return this.repository.saveAgentRuleAuthorization(authorization, current.updatedAt, envelope.idempotencyKey);
  }

  async autoDowngradeRule(
    ruleId: string,
    reason: string,
    envelope: AgentGovernanceCommandEnvelope,
    at = new Date(),
  ): Promise<{ authorization: AgentRuleAuthorization; replayed: boolean }> {
    requireEnvelope(envelope);
    const current = await this.requireRuleAuthorization(ruleId);
    const authorization = autoDowngradeAgentRule(current, reason, at);
    return this.repository.saveAgentRuleAuthorization(authorization, current.updatedAt, envelope.idempotencyKey);
  }

  async updateRuleSkill(
    ruleId: string,
    input: UpdateAgentRuleSkillInput,
    envelope: AgentGovernanceCommandEnvelope,
    at = new Date(),
  ): Promise<{ authorization: AgentRuleAuthorization; replayed: boolean }> {
    requireEnvelope(envelope);
    const current = await this.requireRuleAuthorization(ruleId);
    const authorization = updateAgentRuleSkill(current, input, at);
    return this.repository.saveAgentRuleAuthorization(authorization, current.updatedAt, envelope.idempotencyKey);
  }

  listRuleAuthorizations(): Promise<AgentRuleAuthorization[]> {
    return Promise.resolve(this.repository.listAgentRuleAuthorizations());
  }

  async recordReviewSignal(
    input: AgentReviewSignalInput,
    envelope: AgentGovernanceCommandEnvelope,
    at = new Date(),
  ): Promise<{ signal: AgentReviewSignal; replayed: boolean }> {
    requireEnvelope(envelope);
    const current = await this.repository.getAgentReviewSignalBySource(input.graphId, input.sourceRoot.externalId);
    const signal = createOrRefreshAgentReviewSignal(current, input, at);
    return this.repository.saveAgentReviewSignal(signal, current, envelope.idempotencyKey);
  }

  async reconcileReviewSignal(
    reviewSignalId: string,
    sourceExists: boolean,
    envelope: AgentGovernanceCommandEnvelope,
    at = new Date(),
  ): Promise<{ signal: AgentReviewSignal; replayed: boolean }> {
    requireEnvelope(envelope);
    const current = await this.repository.getAgentReviewSignal(reviewSignalId);
    if (!current) {
      throw new StructuredError({
        code: "AGENT_REVIEW_SIGNAL_NOT_FOUND",
        message: "Review Signal 不存在。",
        ruleRefs: ["ADG-DATA-01", "ADG-EXPORT-02"],
      });
    }
    const signal = reconcileAgentReviewSignal(current, { sourceExists }, at);
    return this.repository.saveAgentReviewSignal(signal, current, envelope.idempotencyKey);
  }

  listReviewSignals(input: { status?: AgentReviewSignalStatus; limit: number }): Promise<AgentReviewSignal[]> {
    return Promise.resolve(this.repository.listAgentReviewSignals(input));
  }

  private async requireRuleAuthorization(ruleId: string): Promise<AgentRuleAuthorization> {
    const authorization = await this.repository.getAgentRuleAuthorization(ruleId);
    if (!authorization) {
      throw new StructuredError({
        code: "AGENT_RULE_AUTHORIZATION_NOT_FOUND",
        message: "Rule 本地授权不存在。",
        ruleRefs: ["ADG-SKILL-01", "ADG-ROUTER-01"],
      });
    }
    return authorization;
  }
}
