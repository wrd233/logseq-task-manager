import assert from "node:assert/strict";
import test from "node:test";

import { GraphReadBroker } from "../src/graph-read-broker.ts";

const now = () => new Date("2026-07-22T08:00:00.000Z");

test("Graph read broker relays one bounded request without persisting Graph data", async () => {
  const broker = new GraphReadBroker({ now, createRequestId: () => "graph_read_test", bridgePollMs: 100, readTimeoutMs: 100 });
  const claimed = broker.claim();
  const reading = broker.read({ kind: "PAGE", target: "Project/Test", depth: 2 });
  const request = await claimed;
  assert.deepEqual(request, {
    kind: "PAGE",
    target: "Project/Test",
    depth: 2,
    requestId: "graph_read_test",
    requestedAt: "2026-07-22T08:00:00.000Z",
    expiresAt: "2026-07-22T08:00:00.100Z",
  });
  assert.deepEqual(broker.status(), { connected: true, pending: 1, queued: 0 });
  assert.throws(() => broker.complete({ requestId: request!.requestId, status: "FOUND", snapshot: { kind: "PAGE", requestedTarget: "Other", resolved: { kind: "PAGE", id: "page-other", evidenceHash: "11111111" }, blocks: [], truncated: false, readAt: "2026-07-22T08:00:00.000Z", scopeHash: "22222222" } }), /原请求不匹配/);
  broker.complete({ requestId: request!.requestId, status: "NOT_FOUND" });
  assert.deepEqual(await reading, { requestId: "graph_read_test", status: "NOT_FOUND" });
  broker.close();
});

test("Graph read broker fails closed when Desktop is absent, busy, expired, or stopped", async () => {
  const unavailable = new GraphReadBroker({ now });
  await assert.rejects(() => unavailable.read({ kind: "BLOCK", target: "block-1", includeChildren: false, parents: 0 }), /只读桥接未连接/);

  const timeout = new GraphReadBroker({ now, createRequestId: () => "graph_read_timeout", bridgePollMs: 100, readTimeoutMs: 10 });
  const claimed = timeout.claim();
  const timedOut = timeout.read({ kind: "RESOLVE", target: "((block-1))" });
  await claimed;
  await assert.rejects(() => timedOut, /未在时限内/);
  assert.throws(() => timeout.complete({ requestId: "graph_read_timeout", status: "NOT_FOUND" }), /已过期或不存在/);

  const busy = new GraphReadBroker({ now, createRequestId: () => "graph_read_pending", maximumPending: 1, readTimeoutMs: 100 });
  const wait = busy.claim();
  const pending = busy.read({ kind: "PAGE", target: "Page", depth: 1 });
  await wait;
  await assert.rejects(() => busy.read({ kind: "PAGE", target: "Other", depth: 1 }), /过多等待请求/);
  busy.close();
  await assert.rejects(() => pending, /只读桥接已停止/);
  await assert.rejects(() => busy.claim(), /只读桥接已停止/);
});
