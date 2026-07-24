import assert from "node:assert/strict";
import test from "node:test";

import { listTaskCopilotSkills, readTaskCopilotSkill } from "../src/skill-catalog.ts";

test("built-in external Agent Skills are concise, versioned, hashed, and authority-safe", async () => {
  const first = await listTaskCopilotSkills();
  const second = await listTaskCopilotSkills();
  assert.deepEqual(first, second);
  assert.deepEqual(first.map(({ name, version }) => ({ name, version })), [
    { name: "task-copilot-core", version: "1.0.0" },
    { name: "design-project", version: "1.1.0" },
    { name: "recover-context", version: "1.0.0" },
  ]);
  assert.equal(first.every(({ sha256 }) => /^[0-9a-f]{64}$/.test(sha256)), true);

  const core = await readTaskCopilotSkill("task-copilot-core");
  assert.match(core?.content ?? "", /submit.*not.*commit/is);
  assert.match(core?.content ?? "", /never write formal Graph or SQLite state directly/i);
  const project = await readTaskCopilotSkill("design-project");
  assert.match(project?.content ?? "", /"schemaVersion": "v2"/);
  assert.match(project?.content ?? "", /"semanticOperations"/);
  assert.match(project?.content ?? "", /"actualResult"/);
  assert.match(project?.content ?? "", /actually read in `scope\.read`/);
  const recovery = await readTaskCopilotSkill("recover-context");
  assert.match(recovery?.content ?? "", /formal facts.*current object.*Project current interface.*direct relations.*broad retrieval/is);
  assert.match(recovery?.content ?? "", /factRefs/);
  assert.match(recovery?.content ?? "", /nextActionEligible.*false/is);
  assert.match(recovery?.content ?? "", /never write formal Graph or SQLite state directly/i);
  assert.equal(await readTaskCopilotSkill("../task-copilot-core"), undefined);
  assert.equal(await readTaskCopilotSkill("missing"), undefined);
});
