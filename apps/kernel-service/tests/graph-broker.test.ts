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

test("an unacknowledged delivery is leased and redelivered with the same request identity", async () => {
  const broker = new GraphRequestBroker({ requestTimeoutMs: 100, deliveryLeaseMs: 1 }); broker.heartbeat("graph");
  const waiting = broker.request({ kind: "READ_BLOCK", graphId: "graph", blockUuid: "block" });
  const first = broker.poll("graph")!;
  assert.equal(broker.poll("graph"), null);
  await new Promise((resolve) => setTimeout(resolve, 5));
  const retry = broker.poll("graph")!;
  assert.equal(retry.id, first.id);
  broker.complete("graph", retry.id, { kind: "READ_BLOCK", block: { graphId: "graph", blockUuid: "block", pageName: "Page", content: "value", contentHash: "hash" } });
  assert.equal((await waiting).kind, "READ_BLOCK"); broker.close();
});

test("the broker rejects Graph replacement and cross-Graph responses while a request is active", async () => {
  const broker = new GraphRequestBroker({ requestTimeoutMs: 100 }); broker.heartbeat("graph-a");
  assert.throws(() => broker.heartbeat("graph-b"), /GRAPH_ADAPTER_GRAPH_CONFLICT/u);
  const waiting = broker.request({ kind: "READ_BLOCK", graphId: "graph-a", blockUuid: "block" }); const envelope = broker.poll("graph-a")!;
  assert.throws(() => broker.complete("graph-b", envelope.id, { kind: "READ_BLOCK", block: { graphId: "graph-b", blockUuid: "block", pageName: "Page", content: "value", contentHash: "hash" } }), /GRAPH_ADAPTER_GRAPH_CONFLICT|GRAPH_RESPONSE_GRAPH_MISMATCH/u);
  assert.throws(() => broker.complete("graph-a", envelope.id, { kind: "READ_BLOCK", block: { graphId: "graph-b", blockUuid: "block", pageName: "Page", content: "value", contentHash: "hash" } }), /GRAPH_RESPONSE_GRAPH_MISMATCH/u);
  broker.fail("graph-a", envelope.id, "EXPECTED_TEST_FAILURE", "done"); await assert.rejects(waiting, /EXPECTED_TEST_FAILURE/u); broker.close();
});
