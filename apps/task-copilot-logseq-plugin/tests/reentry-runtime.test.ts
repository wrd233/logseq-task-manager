import assert from "node:assert/strict";
import test from "node:test";

import type { V2Anchor, V2ManagedObject } from "@task-copilot/domain";

import { projectPluginV2ProjectReentry } from "../src/reentry-runtime.ts";

const now = "2026-07-24T12:00:00.000Z";

function project(): V2ManagedObject {
  return {
    objectId: "project-1",
    objectType: "PROJECT",
    version: 2,
    lifecycle: "OPEN",
    condition: { kind: "ACTIONABLE" },
    text: "发布治理",
    projectStructure: {
      objectives: [{
        objectiveId: "objective-1",
        text: "稳定发布",
        priority: "PRIMARY",
        successEvidence: ["恢复演练通过"],
      }],
      deliverables: [],
      workStages: [],
      currentSummary: "核心链路已完成。",
      currentFocuses: ["完成恢复演练"],
      stageMappings: [],
    },
    createdAt: now,
    updatedAt: now,
    sourceOrCreationEvent: "test",
  };
}

function anchor(): V2Anchor {
  return {
    anchorId: "anchor-project-1",
    objectId: "project-1",
    graphId: "graph-1",
    externalId: "block-project-1",
    role: "primary_text",
    status: "active",
    contentHash: "hash",
    lastSeenAt: now,
  };
}

test("Plugin reentry adapter maps one bounded projection to existing routes", () => {
  const cards = projectPluginV2ProjectReentry({
    observedAt: now,
    objects: [project()],
    ownerships: [],
    associations: [],
    anchors: [anchor()],
    proposals: [],
    commits: [],
    nowWork: {
      generatedAt: now,
      focus: [],
      next: [],
      waitingReview: [],
      conditionOptions: [],
    },
  });

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.projection.headline, "发布治理｜完成恢复演练");
  assert.deepEqual(cards[0]?.primaryRoute, {
    action: "v2-open-primary-anchor",
    value: "block-project-1",
    label: "打开当前项目",
  });
});

test("recovery route opens existing Audit and never exposes a second recovery action", () => {
  const proposal = {
    updatedAt: now,
    files: { proposalMd: "# proposal", proposalJson: "{}" },
    proposal: {
      proposalId: "proposal-1",
      schemaVersion: "v2" as const,
      title: "更新当前接口",
      context: "context",
      understanding: "understanding",
      objective: "objective",
      logic: "logic",
      finalPreview: "preview",
      unresolvedQuestions: [],
      source: { kind: "user" as const },
      scope: { read: [], modify: [{ kind: "OBJECT" as const, id: "project-1", version: 2 }] },
      preconditions: [],
      groups: [],
      status: "ACCEPTED" as const,
      createdAt: now,
    },
  };
  const cards = projectPluginV2ProjectReentry({
    observedAt: now,
    objects: [project()],
    ownerships: [],
    associations: [],
    anchors: [anchor()],
    proposals: [proposal],
    commits: [{
      semanticCommitId: "commit-recovery",
      proposalId: "proposal-1",
      status: "RECOVERY_REQUIRED",
      beforeStateChecksum: "before",
      createdAt: now,
      updatedAt: now,
    }],
    nowWork: {
      generatedAt: now,
      focus: [],
      next: [],
      waitingReview: [],
      conditionOptions: [],
    },
  });

  assert.equal(cards[0]?.projection.safetyState, "RECOVERY_REQUIRED");
  assert.deepEqual(cards[0]?.primaryRoute, {
    action: "view",
    value: "audit",
    label: "查看差异与恢复记录",
  });
  assert.equal(JSON.stringify(cards[0]).includes("submit"), false);
});
