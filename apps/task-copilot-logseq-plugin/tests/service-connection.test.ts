import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceDescriptor } from "@task-copilot/service-client";
import type { LauncherDescriptor } from "@task-copilot/service-client/launcher";
import { StructuredError } from "@task-copilot/shared";

import {
  PRIVATE_LAUNCHER_DESCRIPTOR_KEY,
  PRIVATE_SERVICE_DESCRIPTOR_KEY,
  createElectronDescriptorReader,
  createLogseqPrivateStorageDescriptorReader,
  deriveLauncherGraphKey,
  discoverServiceConnection,
  discoverServiceRuntime,
  importServiceDescriptorToPrivateStorage,
  type DescriptorFileReader,
  type ElectronNodeHost,
} from "../src/service-connection.ts";

const descriptor: ServiceDescriptor = {
  protocolVersion: 1,
  url: "http://127.0.0.1:3210/",
  token: "plugin-test-session-token-24-characters",
  pid: 123,
  createdAt: "2026-07-20T09:00:00.000Z",
};

const launcherDescriptor: LauncherDescriptor = {
  kind: "task-copilot-launcher",
  protocolVersion: 1,
  url: "http://127.0.0.1:19673/",
  token: "launcher-plugin-test-token-at-least-32-characters",
};

test("missing descriptor configuration and unavailable Electron bridge are explicit restricted states", async () => {
  let reads = 0;
  const reader: DescriptorFileReader = { read: async () => { reads += 1; return descriptor; } };
  assert.deepEqual(await discoverServiceConnection("", reader), {
    status: "RESTRICTED",
    reasonCode: "SERVICE_DESCRIPTOR_PATH_REQUIRED",
    message: "尚未配置 Local Service descriptor 路径。",
    formalWritesAvailable: false,
    graphEditingAvailable: true,
  });
  assert.equal(reads, 0);
  assert.deepEqual(await discoverServiceConnection("/runtime/service.json", undefined), {
    status: "RESTRICTED",
    reasonCode: "SERVICE_DESCRIPTOR_READER_UNAVAILABLE",
    message: "Logseq 当前运行时不提供安全 descriptor 读取能力。",
    formalWritesAvailable: false,
    graphEditingAvailable: true,
  });
});

test("descriptor read and parse failures never expose token, path, or underlying cause", async () => {
  const secret = "plugin-secret-token-must-not-leak";
  const failed = await discoverServiceConnection("/private/runtime/service.json", {
    read: async () => { throw new Error(`EACCES /private/runtime/service.json ${secret}`); },
  });
  assert.equal(failed.status, "RESTRICTED");
  assert.doesNotMatch(JSON.stringify(failed), /private\/runtime|plugin-secret|EACCES/);

  const invalid = await discoverServiceConnection("/runtime/service.json", { read: async () => ({ token: secret }) });
  assert.equal(invalid.status, "RESTRICTED");
  assert.doesNotMatch(JSON.stringify(invalid), /plugin-secret/);
});

test("validated descriptor probes the versioned client and preserves capabilities", async () => {
  const connection = await discoverServiceConnection(
    "/runtime/service.json",
    { read: async () => descriptor },
    () => ({ health: async () => ({
      status: "READY",
      protocolVersion: 1,
      capabilities: { formalWrites: false, migration: false, provider: false, backup: true },
    }) }),
  );
  assert.deepEqual(connection, {
    status: "READY",
    capabilities: { formalWrites: false, migration: false, provider: false, backup: true },
    formalWritesAvailable: false,
    graphEditingAvailable: true,
  });
});

test("runtime discovery returns a usable sync client only after a READY probe", async () => {
  let syncCalls = 0;
  const ready = await discoverServiceRuntime(
    "/runtime/service.json",
    { read: async () => descriptor },
    () => ({
      health: async () => ({
        status: "READY",
        protocolVersion: 1,
        capabilities: { formalWrites: true, migration: false, provider: false, backup: true },
      }),
      synchronizeExplicitObject: async () => {
        syncCalls += 1;
        throw new Error("not called by discovery");
      },
      listCandidates: async () => [],
      discoverCandidate: async () => { throw new Error("not called by discovery"); },
      setCandidateDisposition: async () => { throw new Error("not called by discovery"); },
      formalizeCandidate: async () => { throw new Error("not called by discovery"); },
      updateCandidate: async () => { throw new Error("not called by discovery"); },
      listObjects: async () => [],
      createArea: async () => { throw new Error("not called by discovery"); },
      editArea: async () => { throw new Error("not called by discovery"); },
      createMiniProjectClosureProposal: async () => { throw new Error("not called by discovery"); },
      createLifecycleProposal: async () => { throw new Error("not called by discovery"); },
      draftMiniProjectClosure: async () => { throw new Error("not called by discovery"); },
      listAssociations: async () => [],
      listPrimaryOwnerships: async () => [],
      addAssociation: async () => { throw new Error("not called by discovery"); },
      listMigrationRuns: async () => [],
      listPrimaryAnchors: async () => ({ anchors: [] }),
      observePrimaryAnchor: async () => { throw new Error("not called by discovery"); },
      rebindPrimaryAnchor: async () => { throw new Error("not called by discovery"); },
      prepareProject: async () => { throw new Error("not called by discovery"); },
      finalizeProject: async () => { throw new Error("not called by discovery"); },
      listProposals: async () => [],
      getProposal: async () => undefined,
      submitProposal: async () => { throw new Error("not called by discovery"); },
      generateProposal: async () => { throw new Error("not called by discovery"); },
      reviseGeneratedProposal: async () => { throw new Error("not called by discovery"); },
      nowWork: async () => ({ generatedAt: "now", focus: [], next: [], waitingReview: [], conditionOptions: [] }),
      selectFocus: async () => { throw new Error("not called by discovery"); },
      removeFocus: async () => { throw new Error("not called by discovery"); },
      reorderFocus: async () => { throw new Error("not called by discovery"); },
      changeCondition: async () => { throw new Error("not called by discovery"); },
      prepareConditionUndo: async () => { throw new Error("not called by discovery"); },
      undoCondition: async () => { throw new Error("not called by discovery"); },
      changeDeadline: async () => { throw new Error("not called by discovery"); },
      reviewProposal: async () => { throw new Error("not called by discovery"); },
      revalidateProposal: async () => { throw new Error("not called by discovery"); },
      prepareProposalCommit: async () => { throw new Error("not called by discovery"); },
      finalizeProposalCommit: async () => { throw new Error("not called by discovery"); },
      compensateProposalCommit: async () => { throw new Error("not called by discovery"); },
      commitProjectClosure: async () => { throw new Error("not called by discovery"); },
      commitProjectStructure: async () => { throw new Error("not called by discovery"); },
      undoProjectStructure: async () => { throw new Error("not called by discovery"); },
      undoProjectClosure: async () => { throw new Error("not called by discovery"); },
      commitLifecycleTransition: async () => { throw new Error("not called by discovery"); },
      commitPrimaryOwnership: async () => { throw new Error("not called by discovery"); },
      undoPrimaryOwnership: async () => { throw new Error("not called by discovery"); },
      undoLifecycle: async () => { throw new Error("not called by discovery"); },
      listSemanticCommits: async () => [],
      prepareProposalUndo: async () => { throw new Error("not called by discovery"); },
      finalizeProposalUndo: async () => { throw new Error("not called by discovery"); },
      compensateProposalUndo: async () => { throw new Error("not called by discovery"); },
    }),
  );
  assert.equal(ready.connection.status, "READY");
  assert.ok(ready.client);
  assert.equal(syncCalls, 0);

  const restrictedRuntime = await discoverServiceRuntime("/runtime/service.json", { read: async () => descriptor }, () => ({
    health: async () => { throw new Error("offline"); },
    synchronizeExplicitObject: async () => { throw new Error("must not escape restricted discovery"); },
    listCandidates: async () => { throw new Error("must not escape restricted discovery"); },
    discoverCandidate: async () => { throw new Error("must not escape restricted discovery"); },
    setCandidateDisposition: async () => { throw new Error("must not escape restricted discovery"); },
    formalizeCandidate: async () => { throw new Error("must not escape restricted discovery"); },
    updateCandidate: async () => { throw new Error("must not escape restricted discovery"); },
    listObjects: async () => { throw new Error("must not escape restricted discovery"); },
    createArea: async () => { throw new Error("must not escape restricted discovery"); },
    editArea: async () => { throw new Error("must not escape restricted discovery"); },
    createMiniProjectClosureProposal: async () => { throw new Error("must not escape restricted discovery"); },
    createLifecycleProposal: async () => { throw new Error("must not escape restricted discovery"); },
    draftMiniProjectClosure: async () => { throw new Error("must not escape restricted discovery"); },
    listAssociations: async () => { throw new Error("must not escape restricted discovery"); },
    listPrimaryOwnerships: async () => { throw new Error("must not escape restricted discovery"); },
    addAssociation: async () => { throw new Error("must not escape restricted discovery"); },
    listMigrationRuns: async () => { throw new Error("must not escape restricted discovery"); },
    listPrimaryAnchors: async () => ({ anchors: [] }),
    observePrimaryAnchor: async () => { throw new Error("must not escape restricted discovery"); },
    rebindPrimaryAnchor: async () => { throw new Error("must not escape restricted discovery"); },
    prepareProject: async () => { throw new Error("must not escape restricted discovery"); },
    finalizeProject: async () => { throw new Error("must not escape restricted discovery"); },
    listProposals: async () => [],
    getProposal: async () => undefined,
    submitProposal: async () => { throw new Error("must not escape restricted discovery"); },
    generateProposal: async () => { throw new Error("must not escape restricted discovery"); },
    reviseGeneratedProposal: async () => { throw new Error("must not escape restricted discovery"); },
    nowWork: async () => ({ generatedAt: "now", focus: [], next: [], waitingReview: [], conditionOptions: [] }),
    selectFocus: async () => { throw new Error("must not escape restricted discovery"); },
    removeFocus: async () => { throw new Error("must not escape restricted discovery"); },
    reorderFocus: async () => { throw new Error("must not escape restricted discovery"); },
    changeCondition: async () => { throw new Error("must not escape restricted discovery"); },
    prepareConditionUndo: async () => { throw new Error("must not escape restricted discovery"); },
    undoCondition: async () => { throw new Error("must not escape restricted discovery"); },
    changeDeadline: async () => { throw new Error("must not escape restricted discovery"); },
    reviewProposal: async () => { throw new Error("must not escape restricted discovery"); },
    revalidateProposal: async () => { throw new Error("must not escape restricted discovery"); },
    prepareProposalCommit: async () => { throw new Error("must not escape restricted discovery"); },
    finalizeProposalCommit: async () => { throw new Error("must not escape restricted discovery"); },
    compensateProposalCommit: async () => { throw new Error("must not escape restricted discovery"); },
    commitProjectClosure: async () => { throw new Error("must not escape restricted discovery"); },
    commitProjectStructure: async () => { throw new Error("must not escape restricted discovery"); },
    undoProjectStructure: async () => { throw new Error("must not escape restricted discovery"); },
    undoProjectClosure: async () => { throw new Error("must not escape restricted discovery"); },
    commitLifecycleTransition: async () => { throw new Error("must not escape restricted discovery"); },
    commitPrimaryOwnership: async () => { throw new Error("must not escape restricted discovery"); },
      undoPrimaryOwnership: async () => { throw new Error("must not escape restricted discovery"); },
      undoLifecycle: async () => { throw new Error("must not escape restricted discovery"); },
    listSemanticCommits: async () => [],
    prepareProposalUndo: async () => { throw new Error("must not escape restricted discovery"); },
    finalizeProposalUndo: async () => { throw new Error("must not escape restricted discovery"); },
    compensateProposalUndo: async () => { throw new Error("must not escape restricted discovery"); },
  }));
  assert.equal(restrictedRuntime.connection.status, "RESTRICTED");
  assert.equal(restrictedRuntime.client, undefined);
  assert.doesNotMatch(JSON.stringify(restrictedRuntime), /plugin-test-session-token/);
});

test("Electron descriptor reader requires an absolute regular 0600 file", async () => {
  const values = new Map<string, { mode: number; json: string; symbolic?: boolean }>([
    ["/runtime/good.json", { mode: 0o100600, json: JSON.stringify(descriptor) }],
    ["/runtime/open.json", { mode: 0o100644, json: JSON.stringify(descriptor) }],
    ["/runtime/link.json", { mode: 0o120777, json: JSON.stringify(descriptor), symbolic: true }],
  ]);
  const host: ElectronNodeHost = {
    require: (specifier) => {
      if (specifier === "node:path") return { isAbsolute: (value: string) => value.startsWith("/") };
      if (specifier === "node:fs/promises") return {
        lstat: async (path: string) => {
          const value = values.get(path);
          if (!value) throw new Error("missing");
          return { mode: value.mode, isFile: () => !value.symbolic, isSymbolicLink: () => Boolean(value.symbolic) };
        },
        readFile: async (path: string) => values.get(path)?.json ?? "",
      };
      throw new Error("unexpected module");
    },
  };
  const reader = createElectronDescriptorReader(host);
  assert.ok(reader);
  assert.deepEqual(await reader.read("/runtime/good.json"), descriptor);
  await assert.rejects(() => reader.read("relative.json"), (error: unknown) => error instanceof Error && "code" in error && error.code === "SERVICE_DESCRIPTOR_PATH_INVALID");
  await assert.rejects(() => reader.read("/runtime/open.json"), (error: unknown) => error instanceof Error && "code" in error && error.code === "SERVICE_DESCRIPTOR_INSECURE");
  await assert.rejects(() => reader.read("/runtime/link.json"), (error: unknown) => error instanceof Error && "code" in error && error.code === "SERVICE_DESCRIPTOR_INSECURE");
  assert.equal(createElectronDescriptorReader({}), undefined);
});

test("Logseq private storage descriptor reader accepts one bounded key and never leaks storage failures", async () => {
  const reader = createLogseqPrivateStorageDescriptorReader({
    getItem: async (key) => key === "v2-service-descriptor.json" ? JSON.stringify(descriptor) : undefined,
  });
  assert.deepEqual(await reader.read("v2-service-descriptor.json"), descriptor);
  await assert.rejects(
    () => reader.read("../service-descriptor.json"),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "SERVICE_DESCRIPTOR_PATH_INVALID",
  );

  const failed = createLogseqPrivateStorageDescriptorReader({
    getItem: async () => { throw new Error("private path and token must stay hidden"); },
  });
  await assert.rejects(
    () => failed.read("v2-service-descriptor.json"),
    (error: unknown) => error instanceof Error
      && "code" in error
      && error.code === "SERVICE_DESCRIPTOR_READ_FAILED"
      && !error.message.includes("token"),
  );
});

test("descriptor import validates before writing only to the fixed private FileStorage key", async () => {
  const writes: Array<{ key: string; value: string }> = [];
  const result = await importServiceDescriptorToPrivateStorage({
    getItem: async () => undefined,
    setItem: async (key, value) => { writes.push({ key, value }); },
  }, JSON.stringify(descriptor));

  assert.deepEqual(result, { storageKey: PRIVATE_SERVICE_DESCRIPTOR_KEY });
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.key, PRIVATE_SERVICE_DESCRIPTOR_KEY);
  assert.deepEqual(JSON.parse(writes[0]!.value), descriptor);
  assert.doesNotMatch(JSON.stringify(result), /plugin-test-session-token/);
});

test("launcher import uses a distinct fixed private key and Graph identity leaves only a stable digest", async () => {
  const writes: Array<{ key: string; value: string }> = [];
  const result = await importServiceDescriptorToPrivateStorage({
    getItem: async () => undefined,
    setItem: async (key, value) => { writes.push({ key, value }); },
  }, JSON.stringify(launcherDescriptor));
  assert.deepEqual(result, { storageKey: PRIVATE_LAUNCHER_DESCRIPTOR_KEY });
  assert.equal(writes[0]?.key, PRIVATE_LAUNCHER_DESCRIPTOR_KEY);
  assert.deepEqual(JSON.parse(writes[0]!.value), launcherDescriptor);

  const graphUrl = "file:///Users/private/Graph Name/";
  const graphKey = await deriveLauncherGraphKey(graphUrl);
  assert.match(graphKey, /^graph-[a-f0-9]{64}$/);
  assert.equal(graphKey, await deriveLauncherGraphKey("file:///Users/private/Graph Name"));
  assert.doesNotMatch(graphKey, /Users|private|Graph/);
  await assert.rejects(
    () => deriveLauncherGraphKey(undefined),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "LAUNCHER_GRAPH_IDENTITY_REQUIRED",
  );
});

test("launcher discovery binds one Graph lease, probes the returned Service, and releases exactly that lease", async () => {
  const calls: string[] = [];
  const runtime = await discoverServiceRuntime(
    PRIVATE_LAUNCHER_DESCRIPTOR_KEY,
    { read: async () => launcherDescriptor },
    () => ({
      health: async () => ({
        status: "READY",
        protocolVersion: 1,
        capabilities: { formalWrites: true, migration: true, provider: true, backup: true },
      }),
    }) as never,
    {
      graphKey: "graph-aabbcc",
      clientInstanceId: "plugin-instance-1",
      createLauncherClient: () => ({
        health: async () => {
          calls.push("health");
          return {
            status: "READY",
            protocolVersion: 1,
            capabilities: { graphServiceLifecycle: true, leaseHeartbeat: true, ownedShutdown: true },
            configuredGraphs: 1,
          };
        },
        ensure: async (graphKey, clientInstanceId) => {
          calls.push(`ensure:${graphKey}:${clientInstanceId}`);
          return { leaseId: "lease-1", serviceDescriptor: descriptor };
        },
        heartbeat: async (leaseId) => { calls.push(`heartbeat:${leaseId}`); },
        release: async (leaseId) => { calls.push(`release:${leaseId}`); },
      }),
    },
  );
  assert.equal(runtime.connection.status, "READY");
  assert.ok(runtime.client);
  assert.equal(runtime.lifecycle?.kind, "LAUNCHER_LEASE");
  await runtime.lifecycle?.heartbeat();
  await runtime.lifecycle?.release();
  await runtime.lifecycle?.release();
  assert.deepEqual(calls, [
    "health",
    "ensure:graph-aabbcc:plugin-instance-1",
    "heartbeat:lease-1",
    "release:lease-1",
  ]);
});

test("launcher discovery fails closed without Graph identity and releases a lease after Service probe failure", async () => {
  let launcherCreated = 0;
  const missingIdentity = await discoverServiceRuntime(
    PRIVATE_LAUNCHER_DESCRIPTOR_KEY,
    { read: async () => launcherDescriptor },
    () => ({ health: async () => { throw new Error("must not probe"); } }) as never,
    { createLauncherClient: () => { launcherCreated += 1; throw new Error("must not create"); } },
  );
  assert.equal(missingIdentity.connection.status, "RESTRICTED");
  assert.equal(missingIdentity.connection.status === "RESTRICTED" && missingIdentity.connection.reasonCode, "LAUNCHER_GRAPH_IDENTITY_REQUIRED");
  assert.equal(launcherCreated, 0);

  const released: string[] = [];
  const unavailable = await discoverServiceRuntime(
    PRIVATE_LAUNCHER_DESCRIPTOR_KEY,
    { read: async () => launcherDescriptor },
    () => ({
      health: async () => { throw new Error("service did not become ready"); },
    }) as never,
    {
      graphKey: "graph-aabbcc",
      clientInstanceId: "plugin-instance-1",
      createLauncherClient: () => ({
        health: async () => ({
          status: "READY",
          protocolVersion: 1,
          capabilities: { graphServiceLifecycle: true, leaseHeartbeat: true, ownedShutdown: true },
          configuredGraphs: 1,
        }),
        ensure: async () => ({ leaseId: "lease-failed", serviceDescriptor: descriptor }),
        heartbeat: async () => undefined,
        release: async (leaseId) => { released.push(leaseId); },
      }),
    },
  );
  assert.equal(unavailable.connection.status, "RESTRICTED");
  assert.deepEqual(released, ["lease-failed"]);
  assert.equal(unavailable.lifecycle, undefined);
});

test("an unconfigured Graph has a distinct restricted state and never receives a Service client", async () => {
  const runtime = await discoverServiceRuntime(
    PRIVATE_LAUNCHER_DESCRIPTOR_KEY,
    { read: async () => launcherDescriptor },
    () => { throw new Error("service client must not be created"); },
    {
      graphKey: "graph-unknown",
      clientInstanceId: "plugin-instance-1",
      createLauncherClient: () => ({
        health: async () => ({
          status: "READY",
          protocolVersion: 1,
          capabilities: { graphServiceLifecycle: true, leaseHeartbeat: true, ownedShutdown: true },
          configuredGraphs: 1,
        }),
        ensure: async () => {
          throw new StructuredError({
            code: "LAUNCHER_HTTP_ERROR",
            message: "sanitized",
            ruleRefs: ["D-216"],
            details: { status: 409, remoteCode: "LAUNCHER_GRAPH_NOT_CONFIGURED" },
          });
        },
        heartbeat: async () => undefined,
        release: async () => undefined,
      }),
    },
  );
  assert.equal(runtime.connection.status, "RESTRICTED");
  assert.equal(runtime.connection.status === "RESTRICTED" && runtime.connection.reasonCode, "LAUNCHER_GRAPH_NOT_CONFIGURED");
  assert.match(runtime.connection.message, /当前 Graph/);
  assert.equal(runtime.client, undefined);
});

test("a Restore recovery interlock survives reload as a distinct restricted state", async () => {
  const runtime = await discoverServiceRuntime(
    PRIVATE_LAUNCHER_DESCRIPTOR_KEY,
    { read: async () => launcherDescriptor },
    () => { throw new Error("service client must not be created"); },
    {
      graphKey: "graph-aabbcc",
      clientInstanceId: "plugin-instance-1",
      createLauncherClient: () => ({
        health: async () => ({
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
        }),
        ensure: async () => {
          throw new StructuredError({
            code: "LAUNCHER_HTTP_ERROR",
            message: "sanitized",
            ruleRefs: ["D-216"],
            details: { status: 409, remoteCode: "LAUNCHER_RESTORE_RECOVERY_REQUIRED" },
          });
        },
        heartbeat: async () => undefined,
        release: async () => undefined,
        restoreRecoveryStatus: async () => ({
          state: "RECOVERY_REQUIRED",
          recoveryPointConfirmed: true,
          recordedAt: "2026-07-26T17:40:00.000Z",
        }),
        recoverRestore: async () => ({ status: "RECOVERED" }),
      }),
    },
  );
  assert.equal(runtime.connection.status, "RESTRICTED");
  assert.equal(
    runtime.connection.status === "RESTRICTED" && runtime.connection.reasonCode,
    "LAUNCHER_RESTORE_RECOVERY_REQUIRED",
  );
  assert.match(runtime.connection.message, /人工处理/);
  assert.equal(runtime.client, undefined);
  assert.deepEqual(runtime.restoreRecovery, {
    state: "RECOVERY_REQUIRED",
    recoveryPointConfirmed: true,
    recordedAt: "2026-07-26T17:40:00.000Z",
  });
  assert.ok(runtime.restoreRecoveryApply);
  await runtime.restoreRecoveryApply?.();
});

test("an interrupted Restore before recovery-point confirmation never claims that a recovery point exists", async () => {
  const runtime = await discoverServiceRuntime(
    PRIVATE_LAUNCHER_DESCRIPTOR_KEY,
    { read: async () => launcherDescriptor },
    () => { throw new Error("service client must not be created"); },
    {
      graphKey: "graph-aabbcc",
      clientInstanceId: "plugin-instance-1",
      createLauncherClient: () => ({
        health: async () => ({
          status: "READY",
          protocolVersion: 1,
          capabilities: { graphServiceLifecycle: true, leaseHeartbeat: true, ownedShutdown: true },
          configuredGraphs: 1,
        }),
        ensure: async () => {
          throw new StructuredError({
            code: "LAUNCHER_HTTP_ERROR",
            message: "sanitized",
            ruleRefs: ["D-216"],
            details: { status: 409, remoteCode: "LAUNCHER_RESTORE_RECOVERY_ARMED" },
          });
        },
        heartbeat: async () => undefined,
        release: async () => undefined,
      }),
    },
  );
  assert.equal(runtime.connection.status, "RESTRICTED");
  assert.equal(
    runtime.connection.status === "RESTRICTED" && runtime.connection.reasonCode,
    "LAUNCHER_RESTORE_RECOVERY_ARMED",
  );
  assert.match(runtime.connection.message, /恢复点确认前中断/);
  assert.doesNotMatch(runtime.connection.message, /仍保留/);
  assert.equal(runtime.client, undefined);
});

test("invalid Restore recovery metadata stays fail-closed without inventing rollback evidence", async () => {
  const runtime = await discoverServiceRuntime(
    PRIVATE_LAUNCHER_DESCRIPTOR_KEY,
    { read: async () => launcherDescriptor },
    () => { throw new Error("service client must not be created"); },
    {
      graphKey: "graph-aabbcc",
      clientInstanceId: "plugin-instance-1",
      createLauncherClient: () => ({
        health: async () => ({
          status: "READY",
          protocolVersion: 1,
          capabilities: { graphServiceLifecycle: true, leaseHeartbeat: true, ownedShutdown: true },
          configuredGraphs: 1,
        }),
        ensure: async () => {
          throw new StructuredError({
            code: "LAUNCHER_HTTP_ERROR",
            message: "sanitized",
            ruleRefs: ["D-216"],
            details: { status: 409, remoteCode: "LAUNCHER_RESTORE_RECOVERY_STATE_INVALID" },
          });
        },
        heartbeat: async () => undefined,
        release: async () => undefined,
      }),
    },
  );
  assert.equal(runtime.connection.status, "RESTRICTED");
  assert.equal(
    runtime.connection.status === "RESTRICTED" && runtime.connection.reasonCode,
    "LAUNCHER_RESTORE_RECOVERY_STATE_INVALID",
  );
  assert.match(runtime.connection.message, /身份与完整性尚不确定/);
  assert.doesNotMatch(runtime.connection.message, /回滚|仍保留/);
});

test("invalid descriptor import performs no private write and storage failures redact the token", async () => {
  let writes = 0;
  const storage = {
    getItem: async () => undefined,
    setItem: async () => { writes += 1; },
  };
  await assert.rejects(
    () => importServiceDescriptorToPrivateStorage(storage, '{"token":"must-not-be-enough"}'),
    (error: unknown) => error instanceof Error
      && "code" in error
      && error.code === "SERVICE_DESCRIPTOR_INVALID"
      && !error.message.includes("must-not-be-enough"),
  );
  assert.equal(writes, 0);

  await assert.rejects(
    () => importServiceDescriptorToPrivateStorage({
      getItem: async () => undefined,
      setItem: async () => { throw new Error(`disk failed ${descriptor.token}`); },
    }, JSON.stringify(descriptor)),
    (error: unknown) => error instanceof Error
      && "code" in error
      && error.code === "SERVICE_DESCRIPTOR_WRITE_FAILED"
      && !error.message.includes(descriptor.token),
  );
});
