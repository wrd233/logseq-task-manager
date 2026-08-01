import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type { V2Anchor, V2Association, V2ManagedObject, V2PrimaryOwnership } from "@task-copilot/domain";

import { buildAgentGovernanceContextPackage, buildContextPackage, contextPackageFingerprint, type ContextPackageSource } from "../src/context-package.ts";

function object(objectId: string, objectType: V2ManagedObject["objectType"], text: string): V2ManagedObject {
  return { objectId, objectType, version: 1, lifecycle: "OPEN", condition: { kind: "ACTIONABLE" }, text, createdAt: "2026-07-21T08:00:00.000Z", updatedAt: "2026-07-21T08:00:00.000Z", sourceOrCreationEvent: "test" };
}

test("Project Context Package contains bounded formal descendants, versions, hashes, and separate non-facts", () => {
  const objects = [object("project-1", "PROJECT", "告警治理"), object("task-1", "TASK", "校验告警"), object("decision-1", "DECISION", "采用单一入口"), object("outside", "OUTPUT", "不相关")];
  const ownerships: V2PrimaryOwnership[] = [
    { childObjectId: "task-1", ownerObjectId: "project-1", assignedAt: "2026-07-21T08:00:00.000Z" },
    { childObjectId: "decision-1", ownerObjectId: "project-1", assignedAt: "2026-07-21T08:00:00.000Z" },
  ];
  const anchors = new Map<string, V2Anchor>(objects.map(({ objectId }) => [objectId, { anchorId: `anchor-${objectId}`, objectId, graphId: "graph", externalId: `block-${objectId}`, role: "primary_text", status: "active", contentHash: "11111111", lastSeenAt: "2026-07-21T08:00:00.000Z" }]));
  const associations: V2Association[] = [{ associationId: "rel-project-task", sourceObjectId: "task-1", targetObjectId: "decision-1", associationKind: "RELATED", status: "ACTIVE", createdAt: "2026-07-21T08:00:00.000Z", updatedAt: "2026-07-21T08:00:00.000Z" }];
  const source: ContextPackageSource = {
    getObject: (id) => objects.find(({ objectId }) => objectId === id),
    listObjects: () => objects,
    listPrimaryOwnerships: () => ownerships,
    listAssociations: () => associations,
    getActivePrimaryAnchorByObject: (id) => anchors.get(id),
    databaseSchemaVersion: () => 6,
  };
  const skills = [{ name: "task-copilot-core" as const, version: "1.0.0", description: "core", sha256: "a".repeat(64), content: "# Core\n" }];
  const result = buildContextPackage(source, skills, { kind: "project", id: "project-1" }, new Date("2026-07-21T09:00:00.000Z"));
  assert.equal(result.manifest.includedObjectCount, 3);
  assert.equal(result.manifest.authority, "READ_ONLY_DERIVATIVE");
  assert.equal(JSON.parse(result.files["objects.json"] ?? "").formalFacts.some(({ objectId }: { objectId: string }) => objectId === "outside"), false);
  assert.deepEqual(JSON.parse(result.files["retrieval-candidates.json"] ?? "").candidates, []);
  assert.equal(JSON.parse(result.files["graph-excerpts.json"] ?? "").status, "NOT_INCLUDED");
  assert.deepEqual(JSON.parse(result.files["relations.json"] ?? "").formalFacts.associations, associations);
  assert.equal(result.files["skills/task-copilot-core/SKILL.md"], "# Core\n");
  for (const entry of result.manifest.files) assert.equal(createHash("sha256").update(result.files[entry.path] ?? "").digest("hex"), entry.sha256);
  assert.match(contextPackageFingerprint(result), /^[0-9a-f]{64}$/);
  assert.equal(buildContextPackage(source, skills, { kind: "object", id: "task-1" }).manifest.includedObjectCount, 1);
  assert.throws(() => buildContextPackage(source, skills, { kind: "project", id: "task-1" }), /Project Context/);

  const graphSnapshot = {
    kind: "BLOCK" as const,
    requestedTarget: "block-task-1",
    resolved: { kind: "BLOCK" as const, id: "block-task-1" },
    blocks: [{ uuid: "block-task-1", content: "[任务] 校验告警", contentHash: "11111111", relation: "ROOT" as const, depth: 0, pageName: "Project/Test" }],
    truncated: false,
    readAt: "2026-07-21T09:00:00.000Z",
    scopeHash: "22222222",
  };
  const graph = buildContextPackage(source, skills, { kind: "block", id: "block-task-1" }, new Date("2026-07-21T09:00:01.000Z"), graphSnapshot);
  assert.equal(graph.manifest.graphExcerptStatus, "AVAILABLE_FROM_LOGSEQ_BRIDGE");
  assert.deepEqual(JSON.parse(graph.files["objects.json"] ?? "").formalFacts.map(({ objectId }: { objectId: string }) => objectId), ["task-1"]);
  assert.equal(JSON.parse(graph.files["graph/block.json"] ?? "").snapshot.scopeHash, "22222222");
  assert.deepEqual(JSON.parse(graph.files["modify-scope.json"] ?? "").targets, [{ kind: "BLOCK", id: "block-task-1", hash: "11111111" }]);
  assert.throws(() => buildContextPackage(source, skills, { kind: "page", id: "Project/Test" }), /实时 Logseq/);

  const agentContext = buildAgentGovernanceContextPackage(graph, {
    tier: "LOCAL",
    tokenBudget: 2_000,
    rule: {
      id: "EXPLICIT-TASK-01",
      displayName: "明确任务标记",
      shortReason: "来源包含明确任务标记。",
      scope: ["EXPLICIT_TASK"],
      requiredEvidence: ["SOURCE_ROOT_EXPLICIT_TASK_MARKER", "NO_DUPLICATE"],
      counterSignals: ["MULTIPLE_TARGETS"],
      recommendedOutcome: "CREATE_OBJECT",
      maxAuthority: "AUTO_APPLY",
      riskLevel: "R1",
      positiveExamples: ["[Task] 校验告警"],
      boundaryExamples: ["校验告警"],
      negativeExamples: ["告警校验说明"],
    },
    counterSignals: [],
    recentFeedback: [],
  });
  assert.equal(agentContext.tier, "LOCAL");
  assert.equal(agentContext.sections[0]?.kind, "SOURCE_ROOT");
  assert.match(agentContext.sections[0]?.content ?? "", /\[任务\] 校验告警/);
  assert.deepEqual(agentContext.requiredEvidenceOmitted, []);
  assert.equal(agentContext.sections.some(({ kind }) => kind === "SKILL_RULE"), true);
  assert.equal(agentContext.sections.some(({ kind }) => kind === "FORMAL_FACTS"), true);
});
