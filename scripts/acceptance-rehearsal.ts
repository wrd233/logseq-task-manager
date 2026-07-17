import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { createEmptyState } from "@task-copilot/application";
import { createManagedObject, setPrimaryOwnership } from "@task-copilot/domain";
import { FileSystemBlobStore } from "@task-copilot/persistence/node";
import { VersionedStateRepository, exportRecoveryBundle, restoreRecoveryBundle } from "@task-copilot/persistence";

const root = await mkdtemp(join(tmpdir(), "task-copilot-rehearsal-"));
const repository = new VersionedStateRepository(new FileSystemBlobStore(join(root, "store")));
const state = createEmptyState();
const at = new Date("2026-07-17T12:00:00.000Z");
state.objects.push(
  createManagedObject(
    {
      objectId: "obj_rehearsal",
      objectType: "PROJECT",
      text: "Task Copilot 自动恢复演练",
      purpose: "证明恢复包可重建核心事实",
      targetOutcome: "对象、关系、事件和 Anchor Report 一致",
      nextAction: "执行临时 Store 导入",
    },
    at,
  ),
);
state.objects.push(
  createManagedObject(
    {
      objectId: "obj_rehearsal_area",
      objectType: "AREA",
      text: "个人事务系统",
    },
    at,
  ),
);
state.relations = setPrimaryOwnership(state.relations, state.objects, "obj_rehearsal", "obj_rehearsal_area", at);
state.anchors.push({
  anchorId: "anc_rehearsal",
  objectId: "obj_rehearsal",
  adapter: "logseq",
  graphId: "fixture",
  externalId: "fixture-block",
  role: "primary_text",
  contentHash: "fixture",
  lastSeenAt: at.toISOString(),
  status: "missing",
});
state.events.push({
  eventId: "event_rehearsal",
  timestamp: at.toISOString(),
  actor: "system",
  objectId: "obj_rehearsal",
  operationType: "rehearsal_seeded",
  payload: {},
  ruleRefs: ["SYN-REC-001"],
  reversible: false,
});
const saved = await repository.save(state);
const bundle = exportRecoveryBundle(saved, at);
const bundleDir = join(root, "bundle");
await mkdir(bundleDir, { recursive: true });
for (const [name, content] of Object.entries(bundle.files)) {
  const target = join(bundleDir, name);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}
const restored = restoreRecoveryBundle(bundle);
const targetRepository = new VersionedStateRepository(new FileSystemBlobStore(join(root, "restored-store")));
const imported = await targetRepository.save(restored.state);
assert.equal(imported.objects.length, saved.objects.length);
assert.equal(imported.relations.length, saved.relations.length);
assert.equal(imported.events.length, saved.events.length);
assert.deepEqual(restored.anchorReport.missing, ["anc_rehearsal"]);
assert.deepEqual(restored.differences, []);

const report = {
  status: "PASS",
  fixtureTime: at.toISOString(),
  objects: imported.objects.length,
  relations: imported.relations.length,
  events: imported.events.length,
  anchorsMissing: restored.anchorReport.missing.length,
  differences: restored.differences,
  temporaryRoot: root,
};
if (process.argv.includes("--write-report")) {
  await writeFile(new URL("../docs/runtime/AUTOMATED_ACCEPTANCE_REPORT.json", import.meta.url), `${JSON.stringify({ ...report, temporaryRoot: "ephemeral" }, null, 2)}\n`, "utf8");
}
console.log(JSON.stringify(report, null, 2));
