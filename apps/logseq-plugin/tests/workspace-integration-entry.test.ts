import test from "node:test";
import assert from "node:assert/strict";
import { contentFixture } from "./fixtures/content-writeback.ts";
import { panels } from "../src/workspace/context.ts";
import type { WorkView } from "../src/features/work-view/controller.ts";
import type { ContentInstallation } from "../src/features/content-writeback/installer.ts";

type Bench = {
  open(uuid: string): Promise<void>;
  read(): {graph: string; root: string; seq: number; blocks: Array<{uuid: string; content: string}>} | null;
  close(): Promise<void>;
  apply(input: unknown): {ok: boolean; reason?: string};
  content: ContentInstallation["api"];
  lenses: WorkView["lensesAPI"];
  materials: {list(): Promise<unknown>};
};
const entry = new URL("../src/index.ts", import.meta.url).href;
const bench = (): Bench => (window as unknown as {taskCopilotWorkbench: Bench}).taskCopilotWorkbench;

test("a released composition API cannot close a newly installed work view", async () => {
  const f = await contentFixture();
  logseq.settings!.workViewEnabled = true;
  try {
    await import(`${entry}?workspace-lifetime=1`); await f.boot();
    const previous = bench(); await previous.open(f.root); await f.unload();
    await import(`${entry}?workspace-lifetime=2`); await f.boot();
    const current = bench(); await current.open(f.root);
    const visible = Array.from(document.querySelectorAll<HTMLElement>('[data-workbench-feature="work"]')).find(panel => !panel.hidden)!;
    assert.ok(visible);
    assert.equal(panels.active, "work");
    await previous.close();
    assert.equal(panels.active, "work");
    assert.equal(visible.hidden, false);
    assert.equal(previous.read(), null);
    assert.deepEqual(previous.apply({}), {ok: false, reason: "workbench-disposed"});
    await assert.rejects(previous.open(f.root), /关闭/);
  } finally { await f.unload(); await f.cleanup(); }
});

test("all available natural-work capabilities install without a Kernel and drafts/layout cannot change committed versions", async () => {
  const f = await contentFixture(), fetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw Error("Kernel offline"); };
  logseq.settings!.workViewEnabled = true; logseq.settings!.materialsEnabled = true;
  logseq.settings!.materialsDirectory = `${f.directory}/materials`;
  (window as unknown as {apis: unknown}).apis = {doAction: async ([operation]: string[]) => {
    assert.equal(operation, "listdir"); return [];
  }};
  try {
    await import(`${entry}?workspace-capabilities=1`); await f.boot();
    const api = bench(); assert.equal("workspace" in api, false);
    assert.deepEqual(await api.materials.list(), {status: "success", materials: [], problems: []});
    await api.open(f.root);
    assert.equal(f.counts().identities, 0); // Unbound reading never establishes write authority.
    const initial = await api.lenses.source();
    if (!initial.ok) assert.fail(initial.reason);
    await f.commands.get("content-authorize")!();
    const committed = await api.content.read();
    const captured = await api.lenses.source(); if (!captured.ok) assert.fail(captured.reason);
    assert.deepEqual(captured.value.blocks, committed.blocks);
    assert.equal(captured.value.sourceSetVersion, committed.sourceSetVersion);
    const old = f.patch([await f.text(f.a, "Beta", "must not replace draft")]);
    f.editing(f.a);
    const draft = await api.lenses.source(); if (!draft.ok) assert.fail(draft.reason);
    assert.deepEqual(draft.value.blocks, captured.value.blocks);
    assert.equal(api.read()!.blocks.find(block => block.uuid === f.a)!.content, "uncommitted draft");
    assert.equal((await api.content.apply(old)).record.items[0]!.reason, "NATIVE_EDITING_ACTIVE");
    assert.equal(f.counts().writes, 0);
    f.editing(false);
    await api.lenses.source();
    const view = api.read()!;
    assert.equal(api.apply({type: "display", graph: view.graph, root: view.root, expectedSeq: view.seq, uuid: f.a, level: "compact"}).ok, true);
    const layout = await api.lenses.source(); if (!layout.ok) assert.fail(layout.reason);
    assert.equal(layout.value.sourceSetVersion, captured.value.sourceSetVersion);
    assert.equal(layout.value.structureVersion, captured.value.structureVersion);
    assert.equal(requests, 0);
    await f.unload();
    assert.equal(f.counts().graphSubscriptions, 0);
    assert.equal(api.content.scope(), null);
    assert.equal((await api.lenses.source()).ok, false);
    await assert.rejects(async () => api.materials.list(), /关闭/);
  } finally { await f.unload(); globalThis.fetch = fetch; await f.cleanup(); }
});

