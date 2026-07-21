import assert from "node:assert/strict";
import test from "node:test";

import { listTaskCopilotSkills, readTaskCopilotSkill } from "../src/skill-catalog.ts";

test("built-in external Agent Skills are concise, versioned, hashed, and authority-safe", async () => {
  const first = await listTaskCopilotSkills();
  const second = await listTaskCopilotSkills();
  assert.deepEqual(first, second);
  assert.deepEqual(first.map(({ name, version }) => ({ name, version })), [
    { name: "task-copilot-core", version: "1.0.0" },
    { name: "design-project", version: "1.0.0" },
  ]);
  assert.equal(first.every(({ sha256 }) => /^[0-9a-f]{64}$/.test(sha256)), true);

  const core = await readTaskCopilotSkill("task-copilot-core");
  assert.match(core?.content ?? "", /submit.*not.*commit/is);
  assert.match(core?.content ?? "", /never write formal Graph or SQLite state directly/i);
  assert.equal(await readTaskCopilotSkill("../task-copilot-core"), undefined);
  assert.equal(await readTaskCopilotSkill("missing"), undefined);
});
