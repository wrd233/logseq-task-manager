import assert from "node:assert/strict";
import test from "node:test";

import { listTaskCopilotSkills, readTaskCopilotSkill, skillRootForModuleUrl } from "../src/skill-catalog.ts";

test("Skill root resolves beside both build and installed runtime bundles", () => {
  assert.equal(skillRootForModuleUrl("file:///Applications/Task%20Copilot/dist/service.js"), "/Applications/Task Copilot/dist/skills");
  assert.equal(skillRootForModuleUrl("file:///Applications/Task%20Copilot/bin/service.js"), "/Applications/Task Copilot/bin/skills");
  assert.equal(skillRootForModuleUrl("file:///repo/apps/task-copilot-local-service/src/skill-catalog.ts"), "/repo/skills");
});

test("built-in external Agent Skills are concise, versioned, hashed, and authority-safe", async () => {
  const first = await listTaskCopilotSkills();
  const second = await listTaskCopilotSkills();
  assert.deepEqual(first, second);
  assert.deepEqual(first.map(({ name, version }) => ({ name, version })), [
    { name: "task-copilot-core", version: "1.0.0" },
    { name: "design-project", version: "1.1.0" },
    { name: "recover-context", version: "1.1.0" },
    { name: "mini-project-modeling", version: "1.3.0" },
    { name: "project-creation-modeling", version: "1.5.0" },
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
  const grill = await readTaskCopilotSkill("mini-project-modeling");
  assert.match(grill?.content ?? "", /material, not a questionnaire/i);
  assert.match(grill?.content ?? "", /task-copilot-grill-turn-v1/);
  assert.match(grill?.content ?? "", /exactly one question/i);
  assert.match(grill?.content ?? "", /task-copilot-grill-preview-v1/);
  assert.match(grill?.content ?? "", /every supplied source material exactly once/i);
  assert.match(grill?.content ?? "", /never a Proposal or a formal change/i);
  assert.match(grill?.content ?? "", /final machine `outputContract`/);
  assert.match(grill?.content ?? "", /resolvedUncertaintyIds.*forbidden/is);
  const projectCreation = await readTaskCopilotSkill("project-creation-modeling");
  assert.match(projectCreation?.content ?? "", /Do not ask a fixed/i);
  assert.match(projectCreation?.content ?? "", /Blank creation.*Page conversion.*MiniProject evolution/is);
  assert.match(projectCreation?.content ?? "", /never creates an Object.*Proposal.*Graph write.*SQLite write/is);
  assert.match(projectCreation?.content ?? "", /prepare\/page\/finalize/);
  assert.match(projectCreation?.content ?? "", /MiniProject.*not a question.*preserves.*root Block/is);
  assert.match(projectCreation?.content ?? "", /internal-closure.*new Project's recurring operating.*never means closing.*source MiniProject/is);
  assert.match(projectCreation?.content ?? "", /Never copy an Object ID.*Block\/Page UUID/is);
  assert.equal(await readTaskCopilotSkill("../task-copilot-core"), undefined);
  assert.equal(await readTaskCopilotSkill("missing"), undefined);
});
