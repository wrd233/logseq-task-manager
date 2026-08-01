import { checksum, stableJson } from "@task-copilot/shared";

import {
  validateAgentFeedbackPayload,
  type AgentDecision,
  type AgentDecisionEvent,
  type AgentReviewSignal,
  type AgentRuleAuthorization,
  type AgentSourceRoot,
} from "./agent-governance.ts";

export interface AgentGovernanceExportManifest {
  schemaVersion: "agent-governance-export-v1";
  kind: "SKILL_FEEDBACK" | "REVIEW_EVIDENCE";
  generatedAt: string;
  since: string;
  until: string;
  sourceTotal: number;
  includedCount: number;
  truncated: boolean;
  redactionCount: number;
  files: Array<{ path: string; sha256: string; bytes: number }>;
}

export interface AgentGovernanceExportPackage {
  manifest: AgentGovernanceExportManifest;
  files: Record<string, string>;
}

export interface AgentCurrentSourceEvidence {
  graphId: string;
  sourceRoot: AgentSourceRoot;
  status: "FOUND" | "MISSING" | "ERROR";
  currentText?: string;
  currentSnapshotHash?: string;
  truncated?: boolean;
}

export function validateAgentGovernanceExportPackage(value: unknown): AgentGovernanceExportPackage {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Agent governance export package must be an object.");
  const record = value as Record<string, unknown>;
  if (!record.manifest || typeof record.manifest !== "object" || Array.isArray(record.manifest)
    || !record.files || typeof record.files !== "object" || Array.isArray(record.files)) {
    throw new Error("Agent governance export package manifest or files are invalid.");
  }
  const manifest = record.manifest as Record<string, unknown>;
  const files = record.files as Record<string, unknown>;
  const fileEntries = Array.isArray(manifest.files) ? manifest.files : [];
  if (manifest.schemaVersion !== "agent-governance-export-v1"
    || !["SKILL_FEEDBACK", "REVIEW_EVIDENCE"].includes(String(manifest.kind))
    || !Number.isFinite(Date.parse(String(manifest.generatedAt)))
    || !Number.isFinite(Date.parse(String(manifest.since)))
    || !Number.isFinite(Date.parse(String(manifest.until)))
    || String(manifest.since) > String(manifest.until)
    || !Number.isSafeInteger(manifest.sourceTotal) || Number(manifest.sourceTotal) < 0
    || !Number.isSafeInteger(manifest.includedCount) || Number(manifest.includedCount) < 0
    || typeof manifest.truncated !== "boolean"
    || !Number.isSafeInteger(manifest.redactionCount) || Number(manifest.redactionCount) < 0
    || fileEntries.length < 1 || fileEntries.length > 16) {
    throw new Error("Agent governance export package manifest is invalid.");
  }
  const paths = Object.keys(files).sort((left, right) => left.localeCompare(right));
  const validatedFiles: Record<string, string> = {};
  const validatedEntries = fileEntries.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Agent governance export file manifest is invalid.");
    const entry = value as Record<string, unknown>;
    const path = String(entry.path ?? "");
    const content = files[path];
    if (!/^(?:README\.md|data\/[a-z0-9][a-z0-9._-]{0,63})$/.test(path)
      || typeof content !== "string" || content.length > 2 * 1024 * 1024
      || entry.sha256 !== checksum(content)
      || entry.bytes !== new TextEncoder().encode(content).byteLength) {
      throw new Error("Agent governance export file failed integrity validation.");
    }
    validatedFiles[path] = content;
    return { path, sha256: String(entry.sha256), bytes: Number(entry.bytes) };
  }).sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(validatedEntries.map(({ path }) => path)).size !== validatedEntries.length
    || stableJson(paths) !== stableJson(validatedEntries.map(({ path }) => path))) {
    throw new Error("Agent governance export file set does not match its manifest.");
  }
  return {
    manifest: {
      schemaVersion: "agent-governance-export-v1",
      kind: manifest.kind as AgentGovernanceExportManifest["kind"],
      generatedAt: String(manifest.generatedAt),
      since: String(manifest.since),
      until: String(manifest.until),
      sourceTotal: Number(manifest.sourceTotal),
      includedCount: Number(manifest.includedCount),
      truncated: manifest.truncated,
      redactionCount: Number(manifest.redactionCount),
      files: validatedEntries,
    },
    files: validatedFiles,
  };
}

interface Sanitized<T> {
  value: T;
  redactions: number;
}

function redactText(input: string): Sanitized<string> {
  let value = input.slice(0, 16_384);
  let redactions = 0;
  const replace = (pattern: RegExp, replacement: string | ((match: string, ...groups: string[]) => string)) => {
    value = value.replace(pattern, (...args: unknown[]) => {
      redactions += 1;
      if (typeof replacement === "string") return replacement;
      return replacement(String(args[0]), ...args.slice(1, -2).map(String));
    });
  };
  replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_CREDENTIAL]");
  replace(/\bBearer\s+[A-Za-z0-9._~+/-]{6,}=*\b/gi, "Bearer [REDACTED_CREDENTIAL]");
  replace(/"(authorization|api[_-]?key|token|secret)"\s*:\s*"[^"]*"/gi, (_match, key) => `"${key}":"[REDACTED_CREDENTIAL]"`);
  replace(/\b(authorization|api[_-]?key|token|secret)\s*[:=]\s*[^\s,;"'}]+/gi, (_match, key) => `${key}: [REDACTED_CREDENTIAL]`);
  replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]");
  return { value, redactions };
}

function json(value: unknown): string {
  return `${stableJson(value)}\n`;
}

function jsonl(values: readonly unknown[]): string {
  return values.map((value) => stableJson(value)).join("\n") + (values.length > 0 ? "\n" : "");
}

function finalize(
  input: Omit<AgentGovernanceExportManifest, "schemaVersion" | "redactionCount" | "files">,
  unsafeFiles: Record<string, string>,
): AgentGovernanceExportPackage {
  let redactionCount = 0;
  const files = Object.fromEntries(Object.entries(unsafeFiles).sort(([left], [right]) => left.localeCompare(right)).map(([path, content]) => {
    const sanitized = redactText(content);
    redactionCount += sanitized.redactions;
    return [path, sanitized.value];
  }));
  const fileManifest = Object.entries(files).map(([path, content]) => ({
    path,
    sha256: checksum(content),
    bytes: new TextEncoder().encode(content).byteLength,
  }));
  return {
    manifest: { schemaVersion: "agent-governance-export-v1", ...input, redactionCount, files: fileManifest },
    files,
  };
}

function requireRange(since: string, until: string): void {
  if (!Number.isFinite(Date.parse(since)) || !Number.isFinite(Date.parse(until)) || since > until) {
    throw new Error("Agent governance export requires a valid bounded time range.");
  }
}

export function buildAgentSkillFeedbackPackage(input: {
  generatedAt: Date;
  since: string;
  until: string;
  decisions: readonly AgentDecision[];
  events: readonly AgentDecisionEvent[];
  authorizations: readonly AgentRuleAuthorization[];
  sourceTotal: number;
  truncated: boolean;
}): AgentGovernanceExportPackage {
  requireRange(input.since, input.until);
  const decisions = [...input.decisions].sort((left, right) => left.observedAt.localeCompare(right.observedAt) || left.decisionId.localeCompare(right.decisionId));
  const events = [...input.events].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.eventId.localeCompare(right.eventId));
  const feedback = events.filter((event) => event.eventType === "USER_FEEDBACK_ADDED").map((event) => ({ event, payload: validateAgentFeedbackPayload(event.payload) }));
  const ratings = { CORRECT: 0, MOSTLY_CORRECT: 0, WRONG: 0 };
  const correctionTypes: Record<string, number> = {};
  const feedbackByDecision = new Map<string, ReturnType<typeof validateAgentFeedbackPayload>[]>();
  for (const item of feedback) {
    ratings[item.payload.rating] += 1;
    if (item.payload.correctionType) correctionTypes[item.payload.correctionType] = (correctionTypes[item.payload.correctionType] ?? 0) + 1;
    feedbackByDecision.set(item.event.decisionId, [...(feedbackByDecision.get(item.event.decisionId) ?? []), item.payload]);
  }
  const byRule = [...new Set(decisions.map(({ rule }) => rule.id))].sort().map((ruleId) => {
    const ruleDecisions = decisions.filter(({ rule }) => rule.id === ruleId);
    const ruleFeedback = ruleDecisions.flatMap(({ decisionId }) => feedbackByDecision.get(decisionId) ?? []);
    return {
      ruleId,
      displayName: ruleDecisions[0]!.rule.displayName,
      skillVersion: ruleDecisions[0]!.rule.skillVersion,
      decisions: ruleDecisions.length,
      feedback: ruleFeedback.length,
      ratings: {
        CORRECT: ruleFeedback.filter(({ rating }) => rating === "CORRECT").length,
        MOSTLY_CORRECT: ruleFeedback.filter(({ rating }) => rating === "MOSTLY_CORRECT").length,
        WRONG: ruleFeedback.filter(({ rating }) => rating === "WRONG").length,
      },
    };
  });
  const corrected = ratings.MOSTLY_CORRECT + ratings.WRONG;
  const summary = {
    scope: { since: input.since, until: input.until, sourceTotal: input.sourceTotal, included: decisions.length, truncated: input.truncated },
    decisionCount: decisions.length,
    feedbackCount: feedback.length,
    correctionRate: feedback.length === 0 ? 0 : corrected / feedback.length,
    ratings,
    correctionTypes: Object.fromEntries(Object.entries(correctionTypes).sort(([left], [right]) => left.localeCompare(right))),
    byRule,
    authorizations: [...input.authorizations].sort((left, right) => left.ruleId.localeCompare(right.ruleId)).map((authorization) => ({
      ruleId: authorization.ruleId,
      displayName: authorization.displayName,
      skillVersion: authorization.skillVersion,
      localCurrentAuthority: authorization.localCurrentAuthority,
      effectiveAuthority: authorization.effectiveAuthority,
      paused: authorization.paused,
    })),
    representativePositiveDecisionIds: decisions.filter(({ decisionId }) => (feedbackByDecision.get(decisionId) ?? []).some(({ rating }) => rating === "CORRECT")).slice(0, 5).map(({ decisionId }) => decisionId),
    representativeCorrectionDecisionIds: decisions.filter(({ decisionId }) => (feedbackByDecision.get(decisionId) ?? []).some(({ rating }) => rating !== "CORRECT")).slice(0, 5).map(({ decisionId }) => decisionId),
    unresolvedDecisionIds: decisions.filter(({ outcome, executionStatus, counterSignals }) => outcome === "NEEDS_HUMAN" || executionStatus === "FAILED" || counterSignals.length > 0).slice(0, 20).map(({ decisionId }) => decisionId),
  };
  const markdown = [
    "# Skill Feedback Package",
    "",
    `范围：${input.since} ～ ${input.until}`,
    `完整性：${input.truncated ? `已截断，纳入 ${decisions.length}/${input.sourceTotal} 条` : `完整纳入 ${decisions.length} 条`}`,
    "",
    "## 总体",
    "",
    `- Decision：${decisions.length}`,
    `- Feedback：${feedback.length}`,
    `- 正确：${ratings.CORRECT}；基本正确：${ratings.MOSTLY_CORRECT}；错误：${ratings.WRONG}`,
    `- 纠正率：${(summary.correctionRate * 100).toFixed(1)}%`,
    "",
    "## 按规则",
    "",
    ...byRule.map((rule) => `- ${rule.displayName}（${rule.ruleId}）：${rule.decisions} 次 Decision，${rule.feedback} 次 Feedback，错误 ${rule.ratings.WRONG}`),
    "",
    "机器数据位于 `data/`；本包只整理证据，不修改 Skill，也不授予权限。",
    "",
  ].join("\n");
  return finalize({
    kind: "SKILL_FEEDBACK",
    generatedAt: input.generatedAt.toISOString(),
    since: input.since,
    until: input.until,
    sourceTotal: input.sourceTotal,
    includedCount: decisions.length,
    truncated: input.truncated,
  }, {
    "README.md": markdown,
    "data/decisions.jsonl": jsonl(decisions),
    "data/events.jsonl": jsonl(events),
    "data/summary.json": json(summary),
  });
}

function sourceIdentity(graphId: string, sourceRoot: AgentSourceRoot): string {
  return stableJson({ graphId, kind: sourceRoot.kind, externalId: sourceRoot.externalId, durableOrigin: sourceRoot.durableOrigin });
}

export function buildAgentReviewEvidencePackage(input: {
  generatedAt: Date;
  days: 60 | 180;
  signals: readonly AgentReviewSignal[];
  decisions: readonly AgentDecision[];
  events: readonly AgentDecisionEvent[];
  currentSources: readonly AgentCurrentSourceEvidence[];
  sourceTotal: number;
  truncated: boolean;
}): AgentGovernanceExportPackage {
  const until = input.generatedAt.toISOString();
  const sinceDate = new Date(input.generatedAt);
  sinceDate.setUTCDate(sinceDate.getUTCDate() - input.days);
  const since = sinceDate.toISOString();
  const latestSignals = new Map<string, AgentReviewSignal>();
  for (const signal of input.signals) {
    const identity = sourceIdentity(signal.graphId, signal.sourceRoot);
    const current = latestSignals.get(identity);
    if (!current || signal.lastSeenAt > current.lastSeenAt) latestSignals.set(identity, signal);
  }
  const currentBySource = new Map(input.currentSources.map((current) => [sourceIdentity(current.graphId, current.sourceRoot), current]));
  const evidence = [...latestSignals.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([identity, signal]) => {
    const current = currentBySource.get(identity);
    const sourceStatus = current?.status ?? (signal.status === "SOURCE_MISSING" ? "MISSING" : "ERROR");
    return {
      evidenceId: `E-${checksum(identity).slice(0, 8).toUpperCase()}`,
      graphId: signal.graphId,
      sourceRoot: signal.sourceRoot,
      category: signal.category,
      firstSeenAt: signal.firstSeenAt,
      lastSeenAt: signal.lastSeenAt,
      occurrenceCount: signal.occurrenceCount,
      capturedSnapshotHash: signal.capturedSnapshotHash,
      capturedText: signal.capturedText,
      sourceStatus,
      ...(sourceStatus === "FOUND" && current?.currentText !== undefined ? { currentText: current.currentText } : {}),
      ...(sourceStatus === "FOUND" && current?.currentSnapshotHash !== undefined ? { currentSnapshotHash: current.currentSnapshotHash } : {}),
      changedSinceCapture: sourceStatus === "FOUND" && current?.currentSnapshotHash !== undefined && current.currentSnapshotHash !== signal.capturedSnapshotHash,
      truncated: Boolean(current?.truncated),
      relatedObjectIds: signal.relatedObjectIds,
      revisitReason: signal.revisitReason,
      createdByDecisionId: signal.createdByDecisionId,
      durableOrigin: signal.sourceRoot.durableOrigin,
    };
  });
  const decisionRows = [...input.decisions].sort((left, right) => left.observedAt.localeCompare(right.observedAt) || left.decisionId.localeCompare(right.decisionId)).map((decision) => ({
    decisionId: decision.decisionId,
    observedAt: decision.observedAt,
    outcome: decision.outcome,
    ruleId: decision.rule.id,
    ruleDisplayName: decision.rule.displayName,
    skillVersion: decision.rule.skillVersion,
    riskRoute: decision.riskRoute,
    evidenceRefs: decision.evidenceRefs,
    counterSignals: decision.counterSignals,
  }));
  const eventRows = [...input.events].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.eventId.localeCompare(right.eventId));
  const clusters = [...new Set(evidence.map(({ category }) => category))].sort().map((category) => ({
    clusterId: `category:${category}`,
    kind: "WEAK_CATEGORY",
    category,
    evidenceIds: evidence.filter((item) => item.category === category).map(({ evidenceId }) => evidenceId),
    interpretation: "仅表示值得一起复盘，不构成正式对象边界。",
  }));
  const timeline = [
    ...evidence.map((item) => ({ at: item.lastSeenAt, kind: "REVIEW_SIGNAL", evidenceId: item.evidenceId, category: item.category })),
    ...decisionRows.map((item) => ({ at: item.observedAt, kind: "DECISION", decisionId: item.decisionId, outcome: item.outcome, ruleId: item.ruleId })),
    ...eventRows.filter(({ eventType }) => eventType === "USER_FEEDBACK_ADDED").map((event) => ({ at: event.occurredAt, kind: "FEEDBACK", decisionId: event.decisionId, payload: event.payload })),
  ].sort((left, right) => left.at.localeCompare(right.at) || stableJson(left).localeCompare(stableJson(right)));
  const missing = evidence.filter(({ sourceStatus }) => sourceStatus === "MISSING").length;
  const conflicts = evidence.filter(({ sourceStatus }) => sourceStatus === "ERROR").length;
  const evidenceTruncated = evidence.filter((item) => item.truncated).length;
  const markdown = [
    "# 主动复盘 Evidence Package",
    "",
    `范围：最近 ${input.days} 天（${since} ～ ${until}）`,
    `完整性：${input.truncated ? `已截断，纳入 ${evidence.length}/${input.sourceTotal} 个来源` : `完整纳入 ${evidence.length} 个来源`}`,
    `来源缺失：${missing}；读取冲突：${conflicts}；内容截断：${evidenceTruncated}`,
    "",
    "## Evidence 索引",
    "",
    ...evidence.map((item) => `- ${item.evidenceId} · ${item.category} · ${item.sourceStatus} · ${item.lastSeenAt}`),
    "",
    "## 弱聚类",
    "",
    ...clusters.map((cluster) => `- ${cluster.category}：${cluster.evidenceIds.join("、")}（仅为复盘编排）`),
    "",
    "机器数据位于 `data/`；本包不自动回灌、不创建对象、不执行 Commit。",
    "",
  ].join("\n");
  return finalize({
    kind: "REVIEW_EVIDENCE",
    generatedAt: until,
    since,
    until,
    sourceTotal: input.sourceTotal,
    includedCount: evidence.length,
    truncated: input.truncated,
  }, {
    "README.md": markdown,
    "data/evidence.json": json({ evidence }),
    "data/index.json": json({ clusters, decisions: decisionRows, events: eventRows }),
    "data/timeline.jsonl": jsonl(timeline),
  });
}
