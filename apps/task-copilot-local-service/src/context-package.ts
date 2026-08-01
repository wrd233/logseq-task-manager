import { createHash } from "node:crypto";

import {
  buildAgentDecisionContext,
  type AgentContextTier,
  type AgentDecisionContextPackage,
  type AgentGovernanceRule,
  type V2Anchor,
  type V2Association,
  type V2ManagedObject,
  type V2PrimaryOwnership,
} from "@task-copilot/domain";
import type { ServiceGraphSnapshot } from "@task-copilot/service-client";
import { StructuredError, checksum, stableJson } from "@task-copilot/shared";

import type { TaskCopilotSkillDocument } from "./skill-catalog.ts";

export type ContextExportScope = "block" | "page" | "object" | "project";

export interface ContextPackageManifest {
  schemaVersion: 1;
  generatedAt: string;
  scope: { kind: ContextExportScope; id: string };
  authority: "READ_ONLY_DERIVATIVE";
  formalFactsSource: "SQLITE";
  graphExcerptStatus: "NOT_INCLUDED" | "AVAILABLE_FROM_LOGSEQ_BRIDGE";
  includedObjectCount: number;
  files: Array<{ path: string; sha256: string; bytes: number }>;
}

export interface ServiceContextPackage {
  manifest: ContextPackageManifest;
  files: Record<string, string>;
}

export interface BuildAgentGovernanceContextPackageInput {
  tier: AgentContextTier;
  tokenBudget: number;
  rule: AgentGovernanceRule;
  counterSignals: string[];
  recentFeedback: string[];
}

export interface ContextPackageSource {
  getObject(objectId: string): V2ManagedObject | undefined;
  listObjects(): V2ManagedObject[];
  listPrimaryOwnerships(): V2PrimaryOwnership[];
  listAssociations(): V2Association[];
  getActivePrimaryAnchorByObject(objectId: string): V2Anchor | undefined;
  databaseSchemaVersion(): number;
}

export interface ContextRetrievalCandidate {
  objectId: string;
  reason: "SOURCE_LINEAGE" | "EXACT_TEXT_MENTION";
}

export interface BuildContextPackageOptions {
  retrievalCandidates?: readonly ContextRetrievalCandidate[];
}

function contextError(code: string, message: string): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-118", "D-132", "D-135", "D-190"] });
}

function pretty(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function descendants(rootId: string, ownerships: readonly V2PrimaryOwnership[]): string[] {
  const children = new Map<string, string[]>();
  for (const ownership of ownerships) children.set(ownership.ownerObjectId, [...(children.get(ownership.ownerObjectId) ?? []), ownership.childObjectId]);
  const result: string[] = [];
  const visited = new Set([rootId]);
  const queue = [...(children.get(rootId) ?? [])].sort();
  while (queue.length > 0) {
    const objectId = queue.shift()!;
    if (visited.has(objectId)) continue;
    visited.add(objectId);
    result.push(objectId);
    if (result.length > 255) throw contextError("CONTEXT_SCOPE_TOO_LARGE", "Context Package 最多包含 256 个正式对象。");
    queue.push(...(children.get(objectId) ?? []).sort());
  }
  return result;
}

export function buildContextPackage(
  source: ContextPackageSource,
  skills: readonly TaskCopilotSkillDocument[],
  scope: { kind: ContextExportScope; id: string },
  at = new Date(),
  graphSnapshot?: ServiceGraphSnapshot,
  options: BuildContextPackageOptions = {},
): ServiceContextPackage {
  const graphScope = scope.kind === "block" || scope.kind === "page";
  const root = graphScope ? undefined : source.getObject(scope.id);
  if (!graphScope && !root) throw contextError("CONTEXT_OBJECT_NOT_FOUND", "Context 根对象不存在。");
  if (scope.kind === "project" && root && !["PROJECT", "MINI_PROJECT"].includes(root.objectType)) throw contextError("CONTEXT_PROJECT_REQUIRED", "Project Context 必须引用 Project 或 Mini Project。");
  if (graphScope && (!graphSnapshot || graphSnapshot.requestedTarget !== scope.id || graphSnapshot.kind !== scope.kind.toUpperCase())) throw contextError("CONTEXT_GRAPH_SNAPSHOT_REQUIRED", "Block/Page Context 必须使用同一目标的实时 Logseq 只读快照。");
  const allObjects = source.listObjects();
  const allOwnerships = source.listPrimaryOwnerships();
  const graphExternalIds = new Set(graphSnapshot?.blocks.map(({ uuid }) => uuid) ?? []);
  if (graphSnapshot?.resolved.kind === "PAGE") {
    graphExternalIds.add(graphSnapshot.resolved.id);
    if (graphSnapshot.resolved.name) graphExternalIds.add(graphSnapshot.resolved.name);
  }
  const graphObjectIds = allObjects.filter((object) => {
    const anchor = source.getActivePrimaryAnchorByObject(object.objectId);
    return Boolean(anchor && graphExternalIds.has(anchor.externalId));
  }).map(({ objectId }) => objectId).sort();
  const scopedIds = scope.kind === "project" && root
    ? [root.objectId, ...descendants(root.objectId, allOwnerships)]
    : scope.kind === "object" && root ? [root.objectId] : graphObjectIds;
  const retrievalCandidates = [...(options.retrievalCandidates ?? [])]
    .sort((left, right) => left.objectId.localeCompare(right.objectId));
  const ids = [...new Set([...scopedIds, ...retrievalCandidates.map(({ objectId }) => objectId)])];
  if (ids.length > 256) throw contextError("CONTEXT_SCOPE_TOO_LARGE", "Context Package 最多包含 256 个正式对象。");
  const idSet = new Set(ids);
  const objects = ids.map((id) => allObjects.find((object) => object.objectId === id)).filter((object): object is V2ManagedObject => Boolean(object));
  if (objects.length !== ids.length) throw contextError("CONTEXT_OWNERSHIP_DANGLING", "Context Ownership 引用了不存在的对象。");
  const anchors = objects.map((object) => source.getActivePrimaryAnchorByObject(object.objectId)).filter((anchor): anchor is V2Anchor => Boolean(anchor));
  const ownerships = allOwnerships.filter(({ childObjectId, ownerObjectId }) => idSet.has(childObjectId) && idSet.has(ownerObjectId));
  const associations = source.listAssociations().filter(({ sourceObjectId, targetObjectId }) => idSet.has(sourceObjectId) && idSet.has(targetObjectId));
  const modifyScope = graphSnapshot
    ? graphSnapshot.kind === "BLOCK"
      ? [{ kind: "BLOCK" as const, id: graphSnapshot.resolved.id, hash: graphSnapshot.blocks.find(({ relation }) => relation === "ROOT")?.contentHash ?? graphSnapshot.scopeHash }]
      : [{ kind: "PAGE" as const, id: graphSnapshot.resolved.id, ...(graphSnapshot.resolved.version !== undefined ? { version: graphSnapshot.resolved.version } : {}), hash: graphSnapshot.resolved.evidenceHash ?? graphSnapshot.scopeHash }]
    : objects.map((object) => ({ kind: "OBJECT" as const, id: object.objectId, version: object.version, hash: checksum(object) }));
  const generatedAt = at.toISOString();
  const skillVersions = skills.map((skill) => ({ name: skill.name, version: skill.version, description: skill.description, sha256: skill.sha256 }));
  const files: Record<string, string> = {
    "scope.md": `# Task Copilot Context Scope\n\n- Scope: ${scope.kind}\n- Root target: ${scope.id}\n- Authority: read-only derivative; this package grants no write permission\n- Formal facts: SQLite\n- Graph excerpts: ${graphSnapshot ? "live bounded snapshot from the Logseq Desktop read bridge" : "not included for this object-derived export"}\n- Included objects: ${objects.length}\n\nProposal modify scope must remain explicit and is revalidated again at review/commit time.\n`,
    "objects.json": pretty({ schemaVersion: 1, formalFacts: objects }),
    "anchors.json": pretty({ schemaVersion: 1, formalFacts: anchors }),
    "relations.json": pretty({ schemaVersion: 1, formalFacts: { primaryOwnerships: ownerships, associations } }),
    "decisions.json": pretty({ schemaVersion: 1, formalFacts: objects.filter(({ objectType }) => objectType === "DECISION") }),
    "outputs.json": pretty({ schemaVersion: 1, formalFacts: objects.filter(({ objectType }) => objectType === "OUTPUT") }),
    "graph-excerpts.json": pretty({ schemaVersion: 1, status: graphSnapshot ? "AVAILABLE_FROM_LOGSEQ_BRIDGE" : "NOT_INCLUDED", excerpts: graphSnapshot ? [{ path: graphSnapshot.kind === "PAGE" ? "graph/page.json" : "graph/block.json", scopeHash: graphSnapshot.scopeHash, readAt: graphSnapshot.readAt, truncated: graphSnapshot.truncated }] : [] }),
    "retrieval-candidates.json": pretty({
      schemaVersion: 1,
      candidates: retrievalCandidates.map(({ objectId, reason }) => {
        const object = allObjects.find((value) => value.objectId === objectId);
        if (!object) throw contextError("CONTEXT_RETRIEVAL_TARGET_NOT_FOUND", "Context retrieval candidate 引用了不存在的正式对象。");
        return { objectId, objectType: object.objectType, text: object.text, lifecycle: object.lifecycle, version: object.version, reason };
      }),
      note: "Candidates are bounded retrieval hints over SQLite formal facts; they grant no write authority.",
    }),
    "workspace-semantics.md": "# Workspace Semantics\n\nStatus: NOT_CONFIGURED\n\nNo user semantic profile was invented for this export.\n",
    "writing-profile.md": "# Writing Profile\n\nStatus: NOT_CONFIGURED\n\nNo writing profile was invented for this export.\n",
    "versions.json": pretty({ schemaVersion: 1, contextPackageSchemaVersion: 1, domainSchemaVersion: "v2", databaseSchemaVersion: source.databaseSchemaVersion(), skills: skillVersions }),
    "modify-scope.json": pretty({ schemaVersion: 1, informationalOnly: true, targets: modifyScope }),
  };
  if (graphSnapshot) files[graphSnapshot.kind === "PAGE" ? "graph/page.json" : "graph/block.json"] = pretty({ schemaVersion: 1, source: "LOGSEQ_DESKTOP_BRIDGE", snapshot: graphSnapshot });
  for (const skill of skills) files[`skills/${skill.name}/SKILL.md`] = skill.content;
  const fileEntries = Object.entries(files).sort(([left], [right]) => left.localeCompare(right)).map(([path, content]) => ({
    path,
    sha256: createHash("sha256").update(content).digest("hex"),
    bytes: Buffer.byteLength(content),
  }));
  const manifest: ContextPackageManifest = {
    schemaVersion: 1,
    generatedAt,
    scope,
    authority: "READ_ONLY_DERIVATIVE",
    formalFactsSource: "SQLITE",
    graphExcerptStatus: graphSnapshot ? "AVAILABLE_FROM_LOGSEQ_BRIDGE" : "NOT_INCLUDED",
    includedObjectCount: objects.length,
    files: fileEntries,
  };
  return { manifest, files: Object.fromEntries(Object.entries(files).sort(([left], [right]) => left.localeCompare(right))) };
}

export function contextPackageFingerprint(value: ServiceContextPackage): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function estimatedTokens(content: string): number {
  return Math.max(1, Math.ceil(Buffer.byteLength(content, "utf8") / 4));
}

function graphRootContent(contextPackage: ServiceContextPackage): string {
  const path = contextPackage.files["graph/block.json"] !== undefined ? "graph/block.json" : "graph/page.json";
  const raw = contextPackage.files[path];
  if (!raw) throw contextError("AGENT_CONTEXT_GRAPH_REQUIRED", "Agent LOCAL/EXPANDED Context 必须复用实时 Graph Snapshot。");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw contextError("AGENT_CONTEXT_GRAPH_INVALID", "Context Package 中的 Graph Snapshot 不是合法 JSON。");
  }
  const snapshot = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as { snapshot?: unknown }).snapshot
    : undefined;
  const blocks = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? (snapshot as { blocks?: unknown }).blocks
    : undefined;
  if (!Array.isArray(blocks)) throw contextError("AGENT_CONTEXT_GRAPH_INVALID", "Graph Snapshot 缺少受控 Blocks。");
  const root = blocks.find((value) => value && typeof value === "object" && !Array.isArray(value) && (value as { relation?: unknown }).relation === "ROOT") ?? blocks[0];
  if (!root || typeof root !== "object" || Array.isArray(root)) throw contextError("AGENT_CONTEXT_SOURCE_ROOT_MISSING", "Graph Snapshot 缺少 Source Root。");
  const uuid = (root as { uuid?: unknown }).uuid;
  const content = (root as { content?: unknown }).content;
  if (typeof uuid !== "string" || !uuid.trim() || typeof content !== "string" || !content.trim()) {
    throw contextError("AGENT_CONTEXT_SOURCE_ROOT_MISSING", "Graph Snapshot Source Root 缺少身份或正文。");
  }
  return stableJson({ externalId: uuid, content, scopeHash: (snapshot as { scopeHash?: unknown }).scopeHash });
}

/**
 * Reuses the existing read-only Context Package as the single source for
 * Agent LOCAL/EXPANDED evidence. It adds no Graph cache or second retrieval
 * index; token clipping remains explicit and is consumed by the Risk Router.
 */
export function buildAgentGovernanceContextPackage(
  contextPackage: ServiceContextPackage,
  input: BuildAgentGovernanceContextPackageInput,
): AgentDecisionContextPackage {
  const sourceRoot = graphRootContent(contextPackage);
  const formalFacts = stableJson({
    objects: contextPackage.files["objects.json"],
    anchors: contextPackage.files["anchors.json"],
    relations: contextPackage.files["relations.json"],
    versions: contextPackage.files["versions.json"],
  });
  const rule = stableJson(input.rule);
  const counterSignals = stableJson(input.counterSignals);
  const feedback = stableJson(input.recentFeedback);
  const graphExcerpt = contextPackage.files["graph/block.json"] ?? contextPackage.files["graph/page.json"] ?? "{}";
  const relatedDecisions = contextPackage.files["decisions.json"] ?? "{}";
  const retrievalCandidates = contextPackage.files["retrieval-candidates.json"] ?? "{}";
  const optionalSections = input.tier === "LOCAL"
    ? [
      { id: "graph-excerpt", kind: "SUBTREE" as const, content: graphExcerpt, relevance: 80 },
      { id: "related-decisions", kind: "RELATED_DECISIONS" as const, content: relatedDecisions, relevance: 60 },
    ]
    : [
      { id: "graph-excerpt", kind: "PAGE_CONTEXT" as const, content: graphExcerpt, relevance: 90 },
      { id: "retrieval-candidates", kind: "CANDIDATE_TARGETS" as const, content: retrievalCandidates, relevance: 80 },
      { id: "related-decisions", kind: "RELATED_DECISIONS" as const, content: relatedDecisions, relevance: 70 },
    ];
  return buildAgentDecisionContext({
    tier: input.tier,
    tokenBudget: input.tokenBudget,
    sections: [
      { id: "source-root", kind: "SOURCE_ROOT", content: sourceRoot, estimatedTokens: estimatedTokens(sourceRoot), required: true, relevance: 100 },
      { id: `skill-rule:${input.rule.id}`, kind: "SKILL_RULE", content: rule, estimatedTokens: estimatedTokens(rule), required: true, relevance: 100 },
      { id: "formal-facts", kind: "FORMAL_FACTS", content: formalFacts, estimatedTokens: estimatedTokens(formalFacts), required: true, relevance: 95 },
      { id: "counter-signals", kind: "COUNTER_SIGNALS", content: counterSignals, estimatedTokens: estimatedTokens(counterSignals), required: true, relevance: 100 },
      { id: "recent-feedback", kind: "USER_FEEDBACK", content: feedback, estimatedTokens: estimatedTokens(feedback), required: true, relevance: 100 },
      ...optionalSections.map((section) => ({ ...section, estimatedTokens: estimatedTokens(section.content), required: false })),
    ],
  });
}
