import assert from "node:assert/strict";
import test from "node:test";

import type { GraphEffect, GraphGatewayRequestEnvelope, GraphSnapshot } from "@task-copilot/contracts";
import type { LogseqGraphAdapter } from "../src/graph-adapter.ts";
import { handleGraphGatewayRequest } from "../src/graph-gateway-worker.ts";

const snapshot = { graphId: "graph", sourceBlockUuid: "source", sourceContentHash: "deadbeef", projection: null } satisfies GraphSnapshot;
const adapter = {
  readGraphSnapshot: async () => snapshot,
  readEvidenceMaterial: async ({ graphId, blockUuid }: { graphId: string; blockUuid: string }) => ({ graphId, blockUuid, content: "evidence", sourceContentHash: "7be0f7a9", proof: "a".repeat(64) }),
  applyGraphEffect: async (effect: GraphEffect) => ({ commitId: effect.commitId, effectId: effect.effectId, effectType: effect.type, graphId: effect.graphId, sourceBlockUuid: effect.sourceBlockUuid, projectionHash: effect.type === "UPSERT_MANAGED_PROJECTION" ? effect.projection.projectionHash : null, appliedAt: "now" }),
  readRemovedProjectionSnapshot: async () => snapshot,
} as unknown as LogseqGraphAdapter;
const readHost = {
  search: async () => [{ uuid: "block", content: "network evidence", pageName: "Page" }],
  readBlock: async (uuid: string) => ({ uuid, content: "network evidence", pageName: "Page" }),
  readPage: async (pageName: string) => [{ uuid: "block", content: "network evidence", pageName }],
};

function envelope(request: GraphGatewayRequestEnvelope["request"]): GraphGatewayRequestEnvelope { return { id: "request", request, createdAt: "now" }; }

test("background worker exposes bounded Graph semantics and trusted Evidence, not filesystem RPC", async () => {
  const searched = await handleGraphGatewayRequest({ envelope: envelope({ kind: "SEARCH", graphId: "graph", query: "network", limit: 1 }), graphId: "graph", adapter, readHost, graphSnapshotKey: "a".repeat(64) });
  assert.equal(searched.kind, "SEARCH"); if (searched.kind === "SEARCH") assert.equal(searched.matches[0]?.blockUuid, "block");
  const read = await handleGraphGatewayRequest({ envelope: envelope({ kind: "READ_BLOCK", graphId: "graph", blockUuid: "block" }), graphId: "graph", adapter, readHost, graphSnapshotKey: "a".repeat(64) });
  assert.equal(read.kind, "READ_BLOCK");
  const evidence = await handleGraphGatewayRequest({ envelope: envelope({ kind: "READ_EVIDENCE", graphId: "graph", blockUuid: "block" }), graphId: "graph", adapter, readHost, graphSnapshotKey: "a".repeat(64) });
  assert.equal(evidence.kind, "READ_EVIDENCE");
});

test("worker fails an already claimed request after scope invalidation and does not resume after stop", async () => {
  const { startGraphGatewayWorker } = await import("../src/graph-gateway-worker.ts");
  const originalFetch = globalThis.fetch;
  let resolvePoll!: (value: Response) => void;
  let valid = true, handled = 0;
  const paths: string[] = [];
  globalThis.fetch = async (input) => {
    const path = String(input); paths.push(path);
    if (path.endsWith("/poll")) return new Promise<Response>(resolve => { resolvePoll = resolve; });
    return new Response("{}");
  };
  const stop = startGraphGatewayWorker({ intervalMs: 5, connection: async () => ({
    descriptor: {schemaVersion:1,baseUrl:"http://127.0.0.1:1",token:"fixture",pid:1,startedAt:"now",graphSnapshotKey:"a".repeat(64),graphBridgeToken:"b".repeat(64)},
    graphId: "graph", adapter, readHost: { ...readHost, readBlock: async () => { handled++; return null; } }, isCurrent: () => valid,
  }) });
  try {
    for(let i=0;i<50&&!resolvePoll;i++) await new Promise(resolve=>setTimeout(resolve,1));
    assert.ok(resolvePoll); valid = false; stop();
    resolvePoll(new Response(JSON.stringify({request:envelope({kind:"READ_BLOCK",graphId:"graph",blockUuid:"same"})})));
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(handled,0); assert.equal(paths.length,2); assert.ok(paths[1]?.endsWith("/fail"));
  } finally { stop(); globalThis.fetch = originalFetch; }
});
