import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceDescriptor } from "@task-copilot/service-client";

import {
  createElectronDescriptorReader,
  createLogseqPrivateStorageDescriptorReader,
  discoverServiceConnection,
  discoverServiceRuntime,
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
      createMiniProjectClosureProposal: async () => { throw new Error("not called by discovery"); },
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
      generateProposal: async () => { throw new Error("not called by discovery"); },
      nowWork: async () => ({ generatedAt: "now", focus: [], next: [], waitingReview: [], conditionOptions: [] }),
      selectFocus: async () => { throw new Error("not called by discovery"); },
      removeFocus: async () => { throw new Error("not called by discovery"); },
      reorderFocus: async () => { throw new Error("not called by discovery"); },
      changeCondition: async () => { throw new Error("not called by discovery"); },
      changeDeadline: async () => { throw new Error("not called by discovery"); },
      reviewProposal: async () => { throw new Error("not called by discovery"); },
      revalidateProposal: async () => { throw new Error("not called by discovery"); },
      prepareProposalCommit: async () => { throw new Error("not called by discovery"); },
      finalizeProposalCommit: async () => { throw new Error("not called by discovery"); },
      compensateProposalCommit: async () => { throw new Error("not called by discovery"); },
      commitProjectClosure: async () => { throw new Error("not called by discovery"); },
      commitLifecycleTransition: async () => { throw new Error("not called by discovery"); },
      commitPrimaryOwnership: async () => { throw new Error("not called by discovery"); },
      undoPrimaryOwnership: async () => { throw new Error("not called by discovery"); },
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
    createMiniProjectClosureProposal: async () => { throw new Error("must not escape restricted discovery"); },
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
    generateProposal: async () => { throw new Error("must not escape restricted discovery"); },
    nowWork: async () => ({ generatedAt: "now", focus: [], next: [], waitingReview: [], conditionOptions: [] }),
    selectFocus: async () => { throw new Error("must not escape restricted discovery"); },
    removeFocus: async () => { throw new Error("must not escape restricted discovery"); },
    reorderFocus: async () => { throw new Error("must not escape restricted discovery"); },
    changeCondition: async () => { throw new Error("must not escape restricted discovery"); },
    changeDeadline: async () => { throw new Error("must not escape restricted discovery"); },
    reviewProposal: async () => { throw new Error("must not escape restricted discovery"); },
    revalidateProposal: async () => { throw new Error("must not escape restricted discovery"); },
    prepareProposalCommit: async () => { throw new Error("must not escape restricted discovery"); },
    finalizeProposalCommit: async () => { throw new Error("must not escape restricted discovery"); },
    compensateProposalCommit: async () => { throw new Error("must not escape restricted discovery"); },
    commitProjectClosure: async () => { throw new Error("must not escape restricted discovery"); },
    commitLifecycleTransition: async () => { throw new Error("must not escape restricted discovery"); },
    commitPrimaryOwnership: async () => { throw new Error("must not escape restricted discovery"); },
    undoPrimaryOwnership: async () => { throw new Error("must not escape restricted discovery"); },
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
