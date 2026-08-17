import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { KernelClient, readKernelDescriptor } from "@task-copilot/client";
import type { PrimaryAnchor, WorkObject } from "@task-copilot/contracts";
import { startKernelServer } from "../src/server.ts";

function object(id: string, overrides: Partial<WorkObject> = {}): WorkObject {
  return { id, kind: "TASK", title: id, lifecycle: "OPEN", engagement: "ACTIONABLE", waitingCondition: null, currentFocus: null, desiredOutcome: null, completionChecks: [], version: 1, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", ...overrides };
}

function anchor(workObjectId: string): PrimaryAnchor {
  return { id: `anchor-${workObjectId}`, workObjectId, graphId: "graph-1", externalId: "block-1", sourceContentHash: "hash", projectionContainerUuid: "c", projectionTitleUuid: "t", projectionStateUuid: "s", projectionFocusUuid: "f", projectionWaitingUuid: "w", projectionOutcomeUuid: "o", projectionCompletionUuid: "k", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" };
}

test("dogfood correction HTTP endpoint applies a governed USER reality fix", async () => {
  const directory = await mkdtemp(join(tmpdir(), "task-copilot-dogfood-api-"));
  const stateDirectory = join(directory, "state");
  const descriptorPath = join(stateDirectory, "kernel.json");
  const server = await startKernelServer({ requireTrustedUserChannel: false, databasePath: join(stateDirectory, "kernel.sqlite"), descriptorPath, token: "dogfood-token", profile: "production", consoleDistPath: fileURLToPath(new URL("../../kernel-console/dist", import.meta.url)) });
  try {
    const task = object("task-1", { title: "联系厂商确认版本", engagement: "WAITING", waitingCondition: { workObjectId: "task-1", description: "等厂商回复", since: "2026-08-01T00:00:00.000Z", reviewAt: null, evidenceIds: [] } });
    server.store.putWorkObject(task);
    server.store.putAnchor(anchor(task.id));
    const content = "不是，我还可以继续本地测试";
    const contentHash = createHash("sha256").update(content).digest("hex");
    server.store.putEvidence({ id: "evidence-1", workObjectId: task.id, sourceType: "LOGSEQ_BLOCK", graphId: "graph-1", externalId: "block-1", frozenContent: content, contentHash, frozenAt: "2026-08-01T00:00:00.000Z", locator: { graphId: "graph-1", blockUuid: "block-1" } });

    const client = new KernelClient(await readKernelDescriptor(descriptorPath));
    const result = await client.applyUserRealityCorrection({ workObjectId: task.id, utterance: content, evidenceId: "evidence-1", evidenceContentHash: contentHash });
    assert.equal(result.decision.operationType, "CHANGE_ENGAGEMENT");
    assert.equal(result.commit.actor.type, "USER");
    const after = server.store.getWorkObject(task.id)!;
    assert.equal(after.engagement, "ACTIONABLE");
    assert.equal(after.waitingCondition, null);
    assert.ok(server.store.listUserDecisions().some((decision) => decision.id === result.decision.id));
  } finally {
    await server.close();
  }
});
