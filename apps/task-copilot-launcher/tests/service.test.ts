import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceDescriptor } from "@task-copilot/service-client";
import type {
  LauncherRestoreRecoveryResult,
  LauncherRestoreRecoveryStatus,
} from "@task-copilot/service-client/launcher";

import type { EnsureServiceInput, EnsureServiceResult } from "../src/manager.ts";
import { startLauncherService, type LauncherManager } from "../src/service.ts";

const serviceDescriptor: ServiceDescriptor = {
  protocolVersion: 1,
  url: "http://127.0.0.1:45678/",
  token: "e".repeat(48),
  pid: 7654,
  createdAt: "2026-07-24T00:00:00.000Z",
};

class FakeManager implements LauncherManager {
  ensured: EnsureServiceInput[] = [];
  heartbeats: string[] = [];
  releases: string[] = [];
  recoveryChecks: string[] = [];
  recoveryApplies: string[] = [];
  closed = false;

  async ensure(input: EnsureServiceInput): Promise<EnsureServiceResult> {
    this.ensured.push(input);
    return { leaseId: "lease_123", serviceDescriptor };
  }

  heartbeat(leaseId: string): void {
    this.heartbeats.push(leaseId);
  }

  async release(leaseId: string): Promise<void> {
    this.releases.push(leaseId);
  }

  async restoreRecoveryStatus(graphKey: string): Promise<LauncherRestoreRecoveryStatus> {
    this.recoveryChecks.push(graphKey);
    return {
      state: "RECOVERY_REQUIRED",
      recoveryPointConfirmed: true,
      recordedAt: "2026-07-26T17:20:00.000Z",
    };
  }

  async recoverRestore(graphKey: string): Promise<LauncherRestoreRecoveryResult> {
    this.recoveryApplies.push(graphKey);
    return { status: "RECOVERED" };
  }

  async reapExpired(): Promise<void> {}

  async close(): Promise<void> {
    this.closed = true;
  }
}

test("launcher management API is authenticated, loopback-only, CORS-capable, and lifecycle-complete", async () => {
  const manager = new FakeManager();
  const launcher = await startLauncherService({
    listenPort: 0,
    token: "f".repeat(48),
    leaseTtlMs: 15_000,
    graphCount: 1,
    manager,
  });
  const headers = { authorization: `Bearer ${"f".repeat(48)}`, "content-type": "application/json" };
  try {
    const unauthenticated = await fetch(new URL("/health", launcher.url));
    assert.equal(unauthenticated.status, 401);

    const health = await fetch(new URL("/health", launcher.url), { headers });
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
      status: "READY",
      protocolVersion: 1,
      capabilities: {
        graphServiceLifecycle: true,
        leaseHeartbeat: true,
        ownedShutdown: true,
        restoreRecoveryStatus: true,
        restoreRecoveryApply: true,
      },
      configuredGraphs: 1,
    });

    const ensured = await fetch(new URL("/sessions/ensure", launcher.url), {
      method: "POST",
      headers,
      body: JSON.stringify({ graphKey: "graph-key", clientInstanceId: "plugin-a" }),
    });
    assert.equal(ensured.status, 200);
    assert.deepEqual(await ensured.json(), { leaseId: "lease_123", serviceDescriptor });
    assert.deepEqual(manager.ensured, [{ graphKey: "graph-key", clientInstanceId: "plugin-a" }]);

    const heartbeat = await fetch(new URL("/sessions/heartbeat", launcher.url), {
      method: "POST",
      headers,
      body: JSON.stringify({ leaseId: "lease_123" }),
    });
    assert.equal(heartbeat.status, 204);
    assert.deepEqual(manager.heartbeats, ["lease_123"]);

    const released = await fetch(new URL("/sessions/release", launcher.url), {
      method: "POST",
      headers,
      body: JSON.stringify({ leaseId: "lease_123" }),
    });
    assert.equal(released.status, 204);
    assert.deepEqual(manager.releases, ["lease_123"]);

    const recovery = await fetch(new URL("/restore-recovery/status", launcher.url), {
      method: "POST",
      headers,
      body: JSON.stringify({ graphKey: "graph-key" }),
    });
    assert.equal(recovery.status, 200);
    assert.deepEqual(await recovery.json(), {
      state: "RECOVERY_REQUIRED",
      recoveryPointConfirmed: true,
      recordedAt: "2026-07-26T17:20:00.000Z",
    });
    assert.deepEqual(manager.recoveryChecks, ["graph-key"]);

    const recovered = await fetch(new URL("/restore-recovery/apply", launcher.url), {
      method: "POST",
      headers,
      body: JSON.stringify({
        graphKey: "graph-key",
        confirmation: "RESTORE_RETAINED_FORMAL_STATE",
      }),
    });
    assert.equal(recovered.status, 200);
    assert.deepEqual(await recovered.json(), { status: "RECOVERED" });
    assert.deepEqual(manager.recoveryApplies, ["graph-key"]);

    const unconfirmedRecovery = await fetch(new URL("/restore-recovery/apply", launcher.url), {
      method: "POST",
      headers,
      body: JSON.stringify({ graphKey: "graph-key", confirmation: "wrong" }),
    });
    assert.equal(unconfirmedRecovery.status, 400);
    assert.deepEqual(manager.recoveryApplies, ["graph-key"]);

    const preflight = await fetch(new URL("/sessions/ensure", launcher.url), {
      method: "OPTIONS",
      headers: { origin: "file://" },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
    assert.match(preflight.headers.get("access-control-allow-headers") ?? "", /authorization/i);
  } finally {
    await launcher.close();
  }
  assert.equal(manager.closed, true);
});

test("launcher rejects oversized, malformed, or unknown management requests without calling the manager", async () => {
  const manager = new FakeManager();
  const launcher = await startLauncherService({
    listenPort: 0,
    token: "g".repeat(48),
    leaseTtlMs: 15_000,
    graphCount: 1,
    manager,
  });
  const headers = { authorization: `Bearer ${"g".repeat(48)}`, "content-type": "application/json" };
  try {
    const malformed = await fetch(new URL("/sessions/ensure", launcher.url), { method: "POST", headers, body: "{}" });
    assert.equal(malformed.status, 400);
    const unknown = await fetch(new URL("/unknown", launcher.url), { headers });
    assert.equal(unknown.status, 404);
    const oversized = await fetch(new URL("/sessions/ensure", launcher.url), {
      method: "POST",
      headers,
      body: JSON.stringify({ graphKey: "x".repeat(20_000), clientInstanceId: "plugin-a" }),
    });
    assert.equal(oversized.status, 413);
    assert.deepEqual(manager.ensured, []);
  } finally {
    await launcher.close();
  }
});

test("launcher exposes Restore recovery interlock as a bounded 409 without a Service descriptor", async () => {
  const manager = new FakeManager();
  manager.ensure = async () => {
    throw new Error("LAUNCHER_RESTORE_RECOVERY_REQUIRED");
  };
  const launcher = await startLauncherService({
    listenPort: 0,
    token: "h".repeat(48),
    leaseTtlMs: 15_000,
    graphCount: 1,
    manager,
  });
  try {
    const response = await fetch(new URL("/sessions/ensure", launcher.url), {
      method: "POST",
      headers: {
        authorization: `Bearer ${"h".repeat(48)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ graphKey: "graph-key", clientInstanceId: "plugin-a" }),
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      error: {
        code: "LAUNCHER_RESTORE_RECOVERY_REQUIRED",
        message: "LAUNCHER_RESTORE_RECOVERY_REQUIRED",
      },
    });
  } finally {
    await launcher.close();
  }
});
