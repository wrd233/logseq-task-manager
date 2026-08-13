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
