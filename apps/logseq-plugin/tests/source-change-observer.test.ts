import assert from "node:assert/strict";
import test from "node:test";

import type { KernelClient } from "@task-copilot/client/browser";
import { startSourceChangeObserver } from "../src/source-change-observer.ts";

function clientWithAnchors(observations: Array<Record<string, unknown>>): KernelClient {
  return {
    listObjectAnchorIndex: async () => ({ objects: [{ object: { id: "work-1" }, anchor: { externalId: "block-1", graphId: "test-graph:/tmp/test-graph" } }] }),
    recordSourceChange: async (value: Record<string, unknown>) => { observations.push(value); return { coverage: { workObjectId: value.workObjectId }, job: { id: "job-1", workObjectId: value.workObjectId } }; },
  } as unknown as KernelClient;
}

function fakeHost() {
  let callback: ((event: { blocks?: readonly { uuid?: unknown; content?: unknown }[] }) => void) | null = null;
  return {
    host: {
      onChanged: (next: typeof callback) => { callback = next; return () => { callback = null; }; },
      getCurrentGraph: async () => ({ name: "test-graph", url: "/tmp/test-graph" }),
    },
    emit(blocks: Array<{ uuid: string; content: string }>) { callback?.({ blocks }); },
  };
}

test("source observer coalesces bursts and only reports Primary Anchor blocks", async () => {
  const observations: Array<Record<string, unknown>> = [];
  const fixture = fakeHost();
  const stop = startSourceChangeObserver(fixture.host, { scope: () => ({graphId:"test-graph:/tmp/test-graph",generation:1}), isCurrent: () => true, client: async () => clientWithAnchors(observations), quietMs: 5 });
  try {
    fixture.emit([{ uuid: "block-1", content: "TODO 第一次内容" }]);
    fixture.emit([{ uuid: "block-1", content: "TODO 第二次内容" }, { uuid: "other-block", content: "普通记录" }]);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(observations.length, 1);
    assert.equal(observations[0]?.workObjectId, "work-1");
    assert.equal(observations[0]?.sourceContentHash, (observations[0]?.sourceContentHash as string).toLowerCase());
  } finally { stop(); }
});

test("system self-written source UUIDs are suppressed from semantic dirty", async () => {
  const observations: Array<Record<string, unknown>> = [];
  const fixture = fakeHost();
  const stop = startSourceChangeObserver(fixture.host, { scope: () => ({graphId:"test-graph:/tmp/test-graph",generation:1}), isCurrent: () => true, client: async () => clientWithAnchors(observations), quietMs: 5, isSelfWritten: (uuid) => uuid === "block-1" });
  try {
    fixture.emit([{ uuid: "block-1", content: "TODO 系统写入" }]);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(observations.length, 0);
  } finally { stop(); }
});

test("pending observations belong to the event Graph and delayed batches stop at scope invalidation", async () => {
  const observations: Array<Record<string, unknown>> = [];
  const fixture = fakeHost();
  let scope = { graphId: "A", generation: 1 };
  let release: (() => void) | undefined;
  let calls = 0;
  const stop = startSourceChangeObserver(fixture.host, {
    quietMs: 5, scope: () => ({ ...scope }), isCurrent: value => value.graphId === scope.graphId && value.generation === scope.generation,
    client: async () => ({
      listObjectAnchorIndex: async () => {
        calls++;
        if (calls === 1) await new Promise<void>(resolve => { release = resolve; });
        return { objects: [{object:{id:"A-object"},anchor:{graphId:"A",externalId:"block-1"}},{object:{id:"B-object"},anchor:{graphId:"B",externalId:"block-1"}}] };
      },
      recordSourceChange: async (value: Record<string, unknown>) => { observations.push(value); },
    } as unknown as KernelClient),
  });
  try {
    fixture.emit([{uuid:"block-1",content:"A change"}]);
    for (let i=0;i<50&&!release;i++) await new Promise(resolve=>setTimeout(resolve,2));
    assert.ok(release);
    scope = { graphId:"B",generation:2 };
    fixture.emit([{uuid:"block-1",content:"B change"}]);
    release();
    await new Promise(resolve=>setTimeout(resolve,25));
    assert.equal(observations.length,1);
    assert.equal(observations[0]?.graphId,"B"); assert.equal(observations[0]?.workObjectId,"B-object");
    fixture.emit([{uuid:"block-1",content:"stopped"}]); stop();
    await new Promise(resolve=>setTimeout(resolve,15));
    assert.equal(observations.length,1);
  } finally { stop(); }
});

test("switch before the quiet window cannot relabel an old event as the new Graph", async () => {
  const observations: Array<Record<string, unknown>> = [];
  const fixture = fakeHost();
  let generation=1;
  const stop=startSourceChangeObserver(fixture.host,{
    client:async()=>clientWithAnchors(observations),quietMs:5,
    scope:()=>({graphId:"test-graph:/tmp/test-graph",generation}),isCurrent:s=>s.generation===generation,
  });
  fixture.emit([{uuid:"block-1",content:"old change"}]);generation++;
  await new Promise(resolve=>setTimeout(resolve,20));stop();
  assert.equal(observations.length,0);
});
