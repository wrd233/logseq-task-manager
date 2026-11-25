import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { FloatingNotesBuffer, FreeNotesStore, type FreeNotesPort } from "../src/features/stage/free-notes.ts";

const scope = { kind: "block", uuid: "work", routeName: "work", graphId: "graph", title: "工作" } as const;

function fixture() {
  const parents: Array<{ uuid: string; content: string }> = [];
  const children: Array<{ uuid: string; content: string }> = [];
  const writes: string[] = [];
  const activeEditors = new Set<string>();
  const port: FreeNotesPort = {
    roots: async () => structuredClone(parents),
    children: async () => structuredClone(children),
    createParent: async () => {
      const parent = { uuid: "free", content: "自由随记" };
      parents.push(parent);
      return parent;
    },
    append: async (_parent, content) => {
      const block = { uuid: `note-${children.length}`, content };
      children.push(block);
      writes.push(`append:${content}`);
      return block;
    },
    update: async (uuid, content) => {
      children.find((block) => block.uuid === uuid)!.content = content;
      writes.push(`update:${content}`);
    },
    isEditing: async uuid => activeEditors.has(uuid),
    checkGraph: async () => undefined,
  };
  return { parents, children, writes, activeEditors, store: new FreeNotesStore(port) };
}

test("concurrent blind captures create one native parent and append in submission order", async () => {
  const { parents, children, store } = fixture();
  await Promise.all([store.append(scope, "第一句"), store.append(scope, "第二句")]);
  assert.deepEqual(parents.map(block => block.content), ["自由随记"]);
  assert.deepEqual(children.map(block => block.content), ["第一句", "第二句"]);
  parents[0]!.content += "\nagent-ready:: true";
  await store.append(scope, "第三句");
  assert.equal(parents.length, 1);
  assert.equal(children.at(-1)?.content, "第三句");
});

test("floating edits wait for idle or flush and preserve the native block identity", async () => {
  const { store, writes, children } = fixture();
  await store.append(scope, "原句");
  writes.length = 0;
  const rows = await store.read(scope, "free");
  const outcomes: boolean[] = [];
  const buffer = new FloatingNotesBuffer(() => store.sync(scope, "free", rows), result => outcomes.push(result), error => assert.fail(String(error)), 20);
  rows[0]!.value = "改";
  buffer.changed();
  rows[0]!.value = "改完";
  buffer.changed();
  assert.deepEqual(writes, []);
  await delay(45);
  assert.deepEqual(writes, ["update:改完"]);
  assert.equal(children[0]?.uuid, "note-0");
  rows[0]!.value = "贴回";
  buffer.changed();
  await buffer.flush();
  await delay(28);
  assert.deepEqual(writes, ["update:改完", "update:贴回"]);
  assert.deepEqual(outcomes, [false, false]);
});

test("native and floating edits diverge safely and later saves only update the appended copy", async () => {
  const { store, children, activeEditors, writes } = fixture();
  await store.append(scope, "原句");
  const rows = await store.read(scope, "free");
  children[0]!.content = "原页改过";
  rows[0]!.value = "悬浮修改";
  const [first, second] = await Promise.all([store.sync(scope, "free", rows), store.sync(scope, "free", rows)]);
  assert.equal(first, true);
  assert.equal(second, false);
  assert.deepEqual(children.map(block => block.content), ["原页改过", "悬浮修改"]);
  rows[0]!.value = "悬浮续写";
  await store.sync(scope, "free", rows);
  assert.deepEqual(children.map(block => block.content), ["原页改过", "悬浮续写"]);
  activeEditors.add("note-1");
  rows[0]!.value = "原块编辑尚未保存时的悬浮稿";
  assert.equal(await store.sync(scope, "free", rows), true);
  assert.equal(children[1]?.content, "悬浮续写");
  assert.equal(writes.at(-1), "append:原块编辑尚未保存时的悬浮稿");
});
