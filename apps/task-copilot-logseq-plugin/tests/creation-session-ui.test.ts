import assert from "node:assert/strict";
import test from "node:test";

import {
  createCreationSession,
  generateCreationDraftRevision,
  startCreationSessionRound,
  type CreationSessionSource,
} from "@task-copilot/domain";

import { renderCreationSession } from "../src/creation-session-ui.ts";

const at = new Date("2026-08-02T06:00:00.000Z");
const blank = (): CreationSessionSource => ({
  sourceId: "source-primary",
  role: "PRIMARY",
  kind: "BLANK",
  captures: [{ captureId: "capture-blank", reason: "SESSION_START", snapshotHash: "blank", content: "", hierarchy: [], capturedAt: at.toISOString() }],
  currentCaptureId: "capture-blank",
  latestKnownHash: "blank",
  availability: "AVAILABLE",
});

function discussing() {
  const session = createCreationSession({ graphId: "graph-one", targetType: "PROJECT", primarySource: blank(), sessionId: "creation-render" }, at);
  return startCreationSessionRound(session, {
    roundId: "round-one",
    theme: "结果、边界与完成判断",
    questions: [
      { questionId: "q1", uncertaintyId: "outcome", text: "最终希望得到什么？", rationale: "结果决定是否应建 Project。", recommendation: "先形成一份可验收成果。", answerRequirement: "说明成果。", answerState: "UNANSWERED" },
      { questionId: "q2", uncertaintyId: "scope", text: "哪些内容明确不做？", rationale: "范围需要封顶。", recommendation: "排除长期运营。", alternativeImpact: "范围会更聚焦。", answerRequirement: "说明范围外。", answerState: "UNANSWERED" },
      { questionId: "q3", uncertaintyId: "evidence", text: "如何判断完成？", rationale: "避免无限延伸。", recommendation: "以真实演练为证据。", answerRequirement: "说明证据。", answerState: "UNANSWERED" },
    ],
    unresolvedBranches: ["范围"],
    abstentions: [],
  }, session.version, at);
}

test("renders a coherent multi-question round with reason, recommendation, and explicit answer state", () => {
  const session = discussing();
  const html = renderCreationSession({ status: "ready", sessions: [session], session, view: "DISCUSSION" });

  assert.equal([...html.matchAll(/class="creation-question"/g)].length, 3);
  assert.match(html, /结果、边界与完成判断/);
  assert.match(html, /结果决定是否应建 Project/);
  assert.match(html, /先形成一份可验收成果/);
  assert.equal([...html.matchAll(/value="UNANSWERED" selected/g)].length, 3);
  assert.match(html, /value="UNCERTAIN"/);
  assert.match(html, /value="ACCEPTED_RECOMMENDATION"/);
  assert.match(html, /data-action="creation-session-round-accept-all"/);
});

test("renders a Logseq-like Draft Tree and exposes edits without displaying stable machine IDs", () => {
  const base = createCreationSession({ graphId: "graph-one", targetType: "MINI_PROJECT", primarySource: blank(), sessionId: "creation-draft-render" }, at);
  const session = generateCreationDraftRevision(base, {
    generationId: "generation-render",
    reason: "INITIAL_DRAFT",
    suggestedObjectTitle: "建立告警接入",
    nodes: [
      { semanticKey: "root", text: "**[MiniProject]** 建立告警接入 #MiniProject", order: 0, nodeType: "BLOCK", provenance: "AGENT_SYNTHESIS", operation: "CREATE", confirmed: false, evidenceRefs: [] },
      { semanticKey: "goal", parentSemanticKey: "root", text: "**[目标]** [[告警系统]] 完成真实接入", order: 0, nodeType: "BLOCK", provenance: "AGENT_SYNTHESIS", operation: "CREATE", confirmed: false, evidenceRefs: [] },
      { semanticKey: "todo", parentSemanticKey: "root", text: "TODO 验证一条真实告警", order: 1, nodeType: "TODO", provenance: "AGENT_SUGGESTION", operation: "CREATE", confirmed: false, evidenceRefs: [] },
    ],
    unusedMaterials: ["尚未采用的背景说明"],
    warnings: ["完成证据仍待确认"],
    maturity: { level: "WORKABLE", missing: ["完成证据"] },
  }, base.version, at);
  const revision = session.draftRevisions[0]!;
  const nodeId = revision.nodes[1]!.nodeId;
  const html = renderCreationSession({ status: "ready", sessions: [session], session, view: "DRAFT", editingNodeId: nodeId });

  assert.match(html, /class="creation-draft-tree"/);
  assert.match(html, /<strong>\[MiniProject\]<\/strong>/);
  assert.match(html, /class="creation-page-ref">\[\[告警系统\]\]<\/span>/);
  assert.match(html, /TODO 验证一条真实告警/);
  assert.match(html, /data-action="creation-session-draft-edit-save"/);
  assert.match(html, /data-action="creation-session-draft-delete"/);
  assert.doesNotMatch(html, new RegExp(`>${nodeId}<`));
});

test("shows only active sessions in a restrained resumable list", () => {
  const session = discussing();
  const html = renderCreationSession({ status: "ready", sessions: [session], view: "DISCUSSION" });
  assert.match(html, /创建中的事项/);
  assert.match(html, /data-action="creation-session-resume"/);
  assert.match(html, /新建 MiniProject/);
  assert.match(html, /新建 Project/);
  assert.doesNotMatch(html, /Agent 治理|待整理|Now Work/);
});
