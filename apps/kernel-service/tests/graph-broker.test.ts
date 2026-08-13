import assert from "node:assert/strict";
import test from "node:test";

import { GraphRequestBroker } from "../src/graph-broker.ts";

test("broker fails fast offline and coordinates one typed Graph request", async () => {
  const broker = new GraphRequestBroker({ requestTimeoutMs: 100 });
  await assert.rejects(broker.request({ kind: "READ_BLOCK", graphId: "graph", blockUuid: "block" }), /GRAPH_ADAPTER_OFFLINE/u);
  broker.heartbeat("graph");
  const waiting = broker.request({ kind: "SEARCH", graphId: "graph", query: "network", limit: 5 });
  const envelope = broker.poll("graph");
  assert.equal(envelope?.request.kind, "SEARCH");
  broker.complete("graph", envelope!.id, { kind: "SEARCH", matches: [{ graphId: "graph", blockUuid: "block", pageName: "Page", snippet: "network", contentHash: "deadbeef" }] });
  assert.equal((await waiting).kind, "SEARCH");
  broker.close();
});

test("broker rejects another Graph and mismatched response kinds", async () => {
  const broker = new GraphRequestBroker({ requestTimeoutMs: 100 }); broker.heartbeat("graph");
  await assert.rejects(broker.request({ kind: "READ_BLOCK", graphId: "other", blockUuid: "block" }), /GRAPH_ID_MISMATCH/u);
  const waiting = broker.request({ kind: "READ_BLOCK", graphId: "graph", blockUuid: "block" });
  const envelope = broker.poll("graph")!;
  assert.throws(() => broker.complete("graph", envelope.id, { kind: "SEARCH", matches: [] }), /GRAPH_RESPONSE_KIND_MISMATCH/u);
  broker.fail("graph", envelope.id, "GRAPH_READ_FAILED", "read failed");
  await assert.rejects(waiting, /GRAPH_READ_FAILED/u); broker.close();
});
