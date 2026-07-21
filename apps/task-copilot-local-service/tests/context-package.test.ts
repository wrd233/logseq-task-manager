import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type { V2Anchor, V2ManagedObject, V2PrimaryOwnership } from "@task-copilot/domain";

import { buildContextPackage, contextPackageFingerprint, type ContextPackageSource } from "../src/context-package.ts";

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
  const source: ContextPackageSource = {
    getObject: (id) => objects.find(({ objectId }) => objectId === id),
    listObjects: () => objects,
    listPrimaryOwnerships: () => ownerships,
    getActivePrimaryAnchorByObject: (id) => anchors.get(id),
    databaseSchemaVersion: () => 6,
  };
  const skills = [{ name: "task-copilot-core" as const, version: "1.0.0", description: "core", sha256: "a".repeat(64), content: "# Core\n" }];
  const result = buildContextPackage(source, skills, { kind: "project", id: "project-1" }, new Date("2026-07-21T09:00:00.000Z"));
  assert.equal(result.manifest.includedObjectCount, 3);
  assert.equal(result.manifest.authority, "READ_ONLY_DERIVATIVE");
  assert.equal(JSON.parse(result.files["objects.json"] ?? "").formalFacts.some(({ objectId }: { objectId: string }) => objectId === "outside"), false);
  assert.deepEqual(JSON.parse(result.files["retrieval-candidates.json"] ?? "").candidates, []);
  assert.equal(JSON.parse(result.files["graph-excerpts.json"] ?? "").status, "NOT_AVAILABLE_IN_LOCAL_SERVICE");
  assert.equal(result.files["skills/task-copilot-core/SKILL.md"], "# Core\n");
  for (const entry of result.manifest.files) assert.equal(createHash("sha256").update(result.files[entry.path] ?? "").digest("hex"), entry.sha256);
  assert.match(contextPackageFingerprint(result), /^[0-9a-f]{64}$/);
  assert.equal(buildContextPackage(source, skills, { kind: "object", id: "task-1" }).manifest.includedObjectCount, 1);
  assert.throws(() => buildContextPackage(source, skills, { kind: "project", id: "task-1" }), /Project Context/);
});
