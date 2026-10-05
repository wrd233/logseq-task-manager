import test from "node:test";
import assert from "node:assert/strict";
import { contentFixture } from "./fixtures/content-writeback.ts";
import { installContentWriteback } from "../src/features/content-writeback/installer.ts";
import { installStageWorkbench } from "../src/features/stage-workbench/installer.ts";
import type { Patch } from "../src/features/content-writeback/protocol.ts";

test("report grouping and native drafts remain independent of authorized moves and immutable stage history", async () => {
  const f = await contentFixture(), content = installContentWriteback({journal:f.journal, adapter:f.adapter});
  const { WorkView } = await import("../src/features/work-view/controller.ts");
  const work = new WorkView(() => {}), stages = installStageWorkbench({content, work, storage:f.storage});
  try {
    f.blocks.get(f.root)!.content = "**[MiniProject]** 整理一份调研材料 #MiniProject";
    f.blocks.get(f.a)!.content = "[想法] 保留原来的条件与反例。";
    f.blocks.get(f.b)!.content = "[目标] 核对引用资料。";
    const child = f.add("[原文件](longdoc://stable-reference)\n限制仍然成立", f.a);
    await content.local.authorize(f.root, true);
    await work.open(f.root);
    assert.equal((await work.reportAPI.setMode("report")).ok, true);
    const source = await content.api.read();
    const a = source.blocks.find(b => b.target.blockUuid === f.a)!, b = source.blocks.find(b => b.target.blockUuid === f.b)!;
    assert.ok(a.order < b.order);
    const displayed = Array.from(document.querySelectorAll<HTMLElement>("article[data-uuid]")).map(row => row.dataset.uuid);
    assert.ok(displayed.indexOf(f.b) < displayed.indexOf(f.a));
    const target = {schemaVersion:1, scope:source.scope, sourceId:a.sourceId, contentVersion:a.contentVersion,
      structureVersion:source.structureVersion, position:{kind:"block"}};
    const resolved = await work.reportAPI.resolve(target);
    assert.equal(resolved.ok, true);
    assert.deepEqual(resolved.value.target, a.target);
    const patch:Patch = {schemaVersion:2, requestId:crypto.randomUUID(), scope:source.scope, metadata:null, operations:[{
      type:"move-block", operationId:"report-move", target:resolved.value.target, expectedContentVersion:a.contentVersion!,
      expectedParentUuid:a.parentUuid, destination:b.target, expectedDestinationVersion:b.contentVersion!,
      expectedDestinationParentUuid:b.parentUuid, expectedStructureVersion:source.structureVersion, position:"after",
    }]};
    f.editing(child.uuid);
    assert.equal((await content.api.apply(patch)).record.items[0]!.reason, "NATIVE_EDITING_ACTIVE");
    assert.equal(f.counts().moves, 0);
    f.editing(false);
    const stage = await stages.api.begin({goal:"核验报告与真实原块移动", requestKey:crypto.randomUUID(), expectedStageId:null});
    const submitted = {...patch, requestId:crypto.randomUUID(), metadata:{stageId:stage.start.id, runId:null}};
    const applied = await stages.api.submit({stageId:stage.start.id, expectedRevision:stage.start.id, patch:submitted});
    assert.equal(applied.stageProblem, null);
    assert.equal(applied.status, "complete");
    await work.refresh();
    assert.equal((await work.reportAPI.setMode("report")).ok, true);
    document.querySelector<HTMLButtonElement>(".wb-stage-bar>button")!.click();
    const row = document.querySelector<HTMLElement>(`article[data-uuid="${f.a}"]`)!;
    assert.ok(row.classList.contains("wb-report-row"));
    assert.match(row.textContent!, /结构变化/);
    assert.match(row.textContent!, /位置：.*→/);
    assert.equal((await work.reportAPI.resolve(target)).ok, false);
    const fresh = await content.api.read();
    assert.equal(fresh.blocks.find(block => block.sourceId === a.sourceId)!.contentVersion, a.contentVersion);
    assert.equal(f.blocks.get(f.a)!.children[0], child.uuid);
    assert.equal(f.counts().writes, 0);
    assert.equal(f.counts().inserts, 0);
    await f.commands.get("stage-accept")!();
    const history = JSON.stringify(await stages.api.history());
    f.nativeMove(f.a, f.b, {before:true});
    await work.refresh();
    assert.equal((await work.reportAPI.setMode("report")).ok, true);
    assert.match(document.querySelector<HTMLElement>(`article[data-uuid="${f.a}"]`)!.textContent!, /来源未知 \/ 人工间隔变化/);
    assert.equal(JSON.stringify(await stages.api.history()), history);
    assert.equal((await content.api.apply(submitted)).record.items[0]!.status, "APPLIED_VERIFIED");
    assert.equal(f.counts().moves, 1);
    assert.deepEqual(f.blocks.get(f.root)!.children.slice(0,2), [f.a, f.b]);
    assert.equal(f.blocks.get(f.a)!.content, a.content);
  } finally {
    stages.dispose(); work.dispose(); content.dispose(); await f.cleanup();
  }
});
