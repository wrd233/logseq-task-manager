import assert from "node:assert/strict";
import test from "node:test";

import { listTaskCopilotSkills, readAgentGovernanceSkill, readTaskCopilotSkill, skillRootForModuleUrl } from "../src/skill-catalog.ts";

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
    { name: "design-project", version: "1.3.0" },
    { name: "recover-context", version: "1.3.0" },
    { name: "mini-project-modeling", version: "1.3.0" },
    { name: "project-creation-modeling", version: "1.6.0" },
    { name: "creation-session", version: "1.0.0" },
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
  assert.match(recovery?.content ?? "", /Machine identities belong only in `factRefs`/);
  assert.match(recovery?.content ?? "", /current recovery draft.*user disposition.*not.*business-context\s+unknowns/is);
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
  assert.match(projectCreation?.content ?? "", /current-interface.*one concrete business action.*not.*layout.*dashboard/is);
  assert.match(projectCreation?.content ?? "", /Never copy an Object ID.*Block\/Page UUID/is);
  const creationSession = await readTaskCopilotSkill("creation-session");
  assert.match(creationSession?.content ?? "", /2–5 strongly related questions/);
  assert.match(creationSession?.content ?? "", /UNANSWERED.*never consent/is);
  assert.match(creationSession?.content ?? "", /never creates or changes a\s+Logseq Block.*formal Object.*Commit/is);
  assert.equal(await readTaskCopilotSkill("../task-copilot-core"), undefined);
  assert.equal(await readTaskCopilotSkill("missing"), undefined);
});

test("internal governance Skill is hash-addressed, validated, and isolated from external Agent Skills", async () => {
  const external = await listTaskCopilotSkills();
  assert.equal(external.some(({ name }) => name === ("agent-decision-governance" as never)), false);

  const internal = await readAgentGovernanceSkill();
  assert.equal(internal.name, "agent-decision-governance");
  assert.equal(internal.version, "1.0.0");
  assert.match(internal.sha256, /^[0-9a-f]{64}$/);
  assert.equal(internal.manifest.outputSchemaVersion, "agent-decision-output-v1");
  assert.deepEqual(internal.manifest.rules.map(({ id, displayName }) => ({ id, displayName })), [
    { id: "EXPLICIT-TASK-01", displayName: "明确任务标记" },
    { id: "ORDINARY-CONTENT-01", displayName: "明确保留普通内容" },
    { id: "CANDIDATE-DUPLICATE-01", displayName: "候选事项去重" },
    { id: "CANDIDATE-DEFER-01", displayName: "候选事项延后" },
    { id: "WORKSITE-CONTEXT-01", displayName: "工作现场上下文关联" },
    { id: "REVIEW-SIGNAL-01", displayName: "复盘弱信号" },
  ]);
  assert.match(internal.content, /cannot grant itself authority/i);
  assert.match(internal.content, /never writes Graph or formal business state directly/i);
});
