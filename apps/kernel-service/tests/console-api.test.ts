import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { KernelClient, readKernelDescriptor } from "@task-copilot/client";
import type { PrimaryAnchor, PrimaryOwnership, UserReadBaseline, WorkObject } from "@task-copilot/contracts";
import { startKernelServer } from "../src/server.ts";

function workObject(id: string, overrides: Partial<WorkObject> = {}): WorkObject {
  return {
    id, kind: "TASK", title: id, lifecycle: "OPEN", engagement: "ACTIONABLE", waitingCondition: null, currentFocus: null, desiredOutcome: null, completionChecks: [], version: 1, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", ...overrides,
  };
}

function anchor(workObjectId: string, externalId: string): PrimaryAnchor {
  return {
    id: `anchor-${workObjectId}`, workObjectId, graphId: "graph-1", externalId, sourceContentHash: "hash",
    projectionContainerUuid: "c", projectionTitleUuid: "t", projectionStateUuid: "s", projectionFocusUuid: "f", projectionWaitingUuid: "w", projectionOutcomeUuid: "o", projectionCompletionUuid: "k",
    createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

function baseline(workObjectId: string): UserReadBaseline {
  return { workObjectId, lastViewedFormalVersion: 1, lastViewedAt: "2026-08-01T00:00:00.000Z", lastSeenCommitId: null };
}

test("console world/search/viewed are read-only Kernel Service clients", async () => {
  const directory = await mkdtemp(join(tmpdir(), "task-copilot-console-api-"));
  const stateDirectory = join(directory, "state");
  const descriptorPath = join(stateDirectory, "kernel.json");
  const server = await startKernelServer({ requireTrustedUserChannel: false, databasePath: join(stateDirectory, "kernel.sqlite"), descriptorPath, token: "console-test-token", profile: "sandbox", consoleDistPath: fileURLToPath(new URL("../../kernel-console/dist", import.meta.url)) });
  try {
    const project = workObject("project-1", { kind: "PROJECT", title: "海丝独立建设" });
    const mini = workObject("mini-1", { kind: "MINI_PROJECT", title: "完成采购技术规格书", desiredOutcome: "形成可采购的规格书", completionChecks: ["范围", "参数"] });
    const task = workObject("task-1", { title: "确认设备参数" });
    server.store.putWorkObject(project);
    server.store.putWorkObject(mini);
    server.store.putWorkObject(task);
    server.store.putAnchor(anchor(project.id, "block-p"));
    server.store.putAnchor(anchor(mini.id, "block-mini"));
    server.store.putOwnership({ childId: mini.id, ownerId: project.id, createdAt: "2026-08-01T00:00:00.000Z" } satisfies PrimaryOwnership);
    server.store.putOwnership({ childId: task.id, ownerId: mini.id, createdAt: "2026-08-01T00:00:00.000Z" } satisfies PrimaryOwnership);
    server.store.putUserReadBaseline(baseline(project.id));

    const client = new KernelClient(await readKernelDescriptor(descriptorPath));
    const world = await client.consoleWorld();
    assert.equal(world.environment.profile, "sandbox");
    assert.equal(world.objects.length, 3);
    assert.equal(world.ownerships.length, 2);
    assert.equal(world.objects.find((entry) => entry.object.id === project.id)?.baseline?.lastViewedFormalVersion, 1);

    const search = await client.consoleSearch("规格");
    assert.equal(search.results.some((result) => result.workObjectId === mini.id), true);
    assert.equal(search.results.some((result) => result.workObjectId === project.id), false);

    const beforeCount = (await client.consoleWorld()).objects.length;
    const viewed = await client.markConsoleObjectViewed(mini.id);
    assert.equal(viewed.baseline.workObjectId, mini.id);
    assert.equal((await client.consoleWorld()).objects.length, beforeCount);

    // Bootstrap is reachable without auth for same-origin Console shell only.
    const bootstrap = await fetch(`${server.baseUrl}/v1/console/bootstrap`);
    assert.equal(bootstrap.status, 200);
    const bootstrapJson = await bootstrap.json() as { token: string; profile: string };
    assert.equal(bootstrapJson.token, "console-test-token");
    assert.equal(bootstrapJson.profile, "sandbox");

    // /console redirects to /console/ so relative app.js resolves under the console mount.
    const redirect = await fetch(`${server.baseUrl}/console`, { redirect: "manual" });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get("location"), "/console/");
    const consolePage = await fetch(`${server.baseUrl}/console/`);
    assert.equal(consolePage.status, 200);
    assert.match(await consolePage.text(), /Task Copilot/);
  } finally {
    await server.close();
  }
});
