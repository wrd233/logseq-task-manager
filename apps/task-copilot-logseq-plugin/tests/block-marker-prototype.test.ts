import assert from "node:assert/strict";
import test from "node:test";

import type { V2Anchor, V2ManagedObject } from "@task-copilot/domain";

import {
  BlockMarkerPrototypeController,
  renderBlockMarkerPrototype,
} from "../src/block-marker-prototype.ts";

const object: V2ManagedObject = {
  objectId: "task-1",
  objectType: "TASK",
  version: 2,
  lifecycle: "OPEN",
  condition: { kind: "WAITING", waitingFor: "外部", expectedResult: "答复", reviewAt: "2026-07-25T01:00:00.000Z" },
  text: "私有正文不得进入 marker",
  createdAt: "2026-07-24T00:00:00.000Z",
  updatedAt: "2026-07-24T01:00:00.000Z",
  sourceOrCreationEvent: "test",
};
const anchor: V2Anchor = {
  anchorId: "anchor-1",
  objectId: "task-1",
  graphId: "graph-1",
  externalId: "block-1",
  role: "primary_text",
  contentHash: "aaaaaaaa",
  status: "active",
  lastSeenAt: "2026-07-24T01:00:00.000Z",
};

test("all visual candidates are tiny inert templates with no正文 or action authority", () => {
  for (const mode of ["LINE", "DOT", "ICON", "TINT", "PHRASE"] as const) {
    const html = renderBlockMarkerPrototype(mode, { state: "WAITING", label: "等待" });
    assert.match(html, new RegExp(`mode-${mode.toLowerCase()}`));
    assert.match(html, /aria-label="Task Copilot：等待"/);
    assert.doesNotMatch(html, /button|data-action|私有正文|objectId|block-1/);
  }
});

test("controller targets only active primary anchors, supports repeated slots, and clears without正文 changes", async () => {
  const callbacks = new Map<string, (event: { slot: string; uuid?: string }) => void>();
  const provided: Array<{ key: string; slot: string; template: string | null }> = [];
  const controller = new BlockMarkerPrototypeController({
    registerBlockSlot: (uuid, callback) => callbacks.set(uuid, callback),
    checkSlotValid: async () => true,
    provideUi: (input) => provided.push(input),
  }, { onIssue: (error) => { throw error; } });
  controller.refresh({ mode: "DOT", objects: [object], anchors: [anchor], activeFocusObjectIds: [] });
  assert.deepEqual([...callbacks.keys()], ["block-1"]);
  callbacks.get("block-1")?.({ slot: "main", uuid: "block-1" });
  callbacks.get("block-1")?.({ slot: "query", uuid: "block-1" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(provided.filter(({ template }) => template?.includes("state-waiting")).length, 2);

  controller.refresh({ mode: "PHRASE", objects: [{ ...object, condition: { kind: "ACTIONABLE" } }], anchors: [anchor], activeFocusObjectIds: ["task-1"] });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(provided.at(-1)?.template ?? "", /state-focus[\s\S]*当前/);
  controller.clear();
  assert.equal(provided.filter(({ template }) => template === null).length >= 2, true);
  assert.equal(object.text, "私有正文不得进入 marker");
});

test("prototype fails closed on oversized registration and mismatched host identity", async () => {
  const callbacks = new Map<string, (event: { slot: string; uuid?: string }) => void>();
  const provided: Array<{ slot: string; template: string | null }> = [];
  const issues: unknown[] = [];
  const controller = new BlockMarkerPrototypeController({
    registerBlockSlot: (uuid, callback) => callbacks.set(uuid, callback),
    checkSlotValid: async () => true,
    provideUi: ({ slot, template }) => provided.push({ slot, template }),
  }, { registrationCapacity: 1, onIssue: (error) => issues.push(error) });
  assert.throws(() => controller.refresh({
    mode: "LINE",
    objects: [object, { ...object, objectId: "task-2" }],
    anchors: [anchor, { ...anchor, anchorId: "anchor-2", objectId: "task-2", externalId: "block-2" }],
    activeFocusObjectIds: [],
  }), /capacity/);

  controller.refresh({ mode: "LINE", objects: [object], anchors: [anchor], activeFocusObjectIds: [] });
  callbacks.get("block-1")?.({ slot: "wrong", uuid: "another-block" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(provided.at(-1)?.template, null);
  assert.equal(issues.length, 1);
});

test("100 formal Blocks stay within the prototype registration and slot bounds", async () => {
  const callbacks = new Map<string, (event: { slot: string; uuid?: string }) => void>();
  const templates: string[] = [];
  const controller = new BlockMarkerPrototypeController({
    registerBlockSlot: (uuid, callback) => callbacks.set(uuid, callback),
    checkSlotValid: async () => true,
    provideUi: ({ template }) => { if (template) templates.push(template); },
  }, { onIssue: (error) => { throw error; } });
  const objects = Array.from({ length: 100 }, (_, index) => ({
    ...object,
    objectId: `task-${index}`,
    text: `private-${index}`,
  }));
  const anchors = objects.map((item, index) => ({
    ...anchor,
    anchorId: `anchor-${index}`,
    objectId: item.objectId,
    externalId: `block-${index}`,
  }));
  controller.refresh({ mode: "LINE", objects, anchors, activeFocusObjectIds: [] });
  assert.equal(callbacks.size, 100);
  for (const [uuid, callback] of callbacks) callback({ slot: `slot-${uuid}`, uuid });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(templates.length, 100);
  assert.equal(templates.some((template) => template.includes("private-")), false);
});
