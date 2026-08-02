import assert from "node:assert/strict";
import test from "node:test";

import {
  createCreationSession,
  generateCreationDraftRevision,
  observeCreationSessionSource,
  startCreationSessionRound,
  updateCreationSession,
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
  assert.match(html, /data-field="creation-round-narrative"/);
  assert.match(html, /data-action="creation-session-round-submit-narrative"/);
  assert.match(html, /不会把未明确的部分当作同意/);
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
  assert.match(html, /data-action="creation-session-draft-move"/);
  assert.match(html, /data-field="creation-draft-revision-instruction"/);
  assert.match(html, /data-action="creation-session-draft-revise"/);
  assert.doesNotMatch(html, new RegExp(`>${nodeId}<`));
});

test("a READY Project draft exposes explicit independent-Page placement and Proposal review entry", () => {
  const base = createCreationSession({ graphId: "graph-one", targetType: "PROJECT", primarySource: blank(), sessionId: "creation-project-ready" }, at);
  const drafted = generateCreationDraftRevision(base, {
    generationId: "generation-project-ready", reason: "INITIAL_DRAFT", suggestedObjectTitle: "统一告警治理",
    nodes: [
      { semanticKey: "root", text: "统一告警治理", order: 0, nodeType: "PAGE_SECTION", provenance: "AGENT_SYNTHESIS", operation: "CREATE", confirmed: true, evidenceRefs: [] },
      { semanticKey: "goal", parentSemanticKey: "root", text: "**[项目目标]** 建立可维护的告警治理工作面", order: 0, nodeType: "BLOCK", provenance: "AGENT_SYNTHESIS", operation: "CREATE", confirmed: true, evidenceRefs: [] },
    ],
    unusedMaterials: [], warnings: [], maturity: { level: "READY", missing: [] },
  }, base.version, at);
  const session = updateCreationSession(drafted, { placementPlan: { kind: "NEW_PROJECT_PAGE", pageName: "Project/统一告警治理" } }, drafted.version, at);
  const html = renderCreationSession({ status: "ready", sessions: [session], session, view: "DRAFT" });
  assert.match(html, /独立 Project Page/);
  assert.match(html, /data-action="creation-session-placement-project"/);
  assert.match(html, /data-action="creation-session-proposal-prepare"/);
  assert.match(html, /不会立即写入/);
  assert.match(html, /将发生/);
  assert.match(html, /不会发生/);
});

test("an already prepared Proposal keeps the final in-session confirm visible even after PRE_COMMIT capture", () => {
  const base = createCreationSession({ graphId: "graph-one", targetType: "PROJECT", primarySource: blank(), sessionId: "creation-project-confirm" }, at);
  const drafted = generateCreationDraftRevision(base, {
    generationId: "generation-project-confirm", reason: "INITIAL_DRAFT", suggestedObjectTitle: "统一告警治理",
    nodes: [
      { semanticKey: "root", text: "统一告警治理", order: 0, nodeType: "PAGE_SECTION", provenance: "AGENT_SYNTHESIS", operation: "CREATE", confirmed: true, evidenceRefs: [] },
      { semanticKey: "goal", parentSemanticKey: "root", text: "**[项目目标]** 建立可维护的告警治理工作面", order: 0, nodeType: "BLOCK", provenance: "AGENT_SYNTHESIS", operation: "CREATE", confirmed: true, evidenceRefs: [] },
    ],
    unusedMaterials: [], warnings: [], maturity: { level: "READY", missing: [] },
  }, base.version, at);
  const withPlacement = updateCreationSession(drafted, { placementPlan: { kind: "NEW_PROJECT_PAGE", pageName: "Project/统一告警治理" } }, drafted.version, at);
  const source = withPlacement.sources[0]!;
  const session = {
    ...withPlacement,
    sources: [{
      ...source,
      captures: [...source.captures, {
        captureId: "capture-pre-commit",
        reason: "PRE_COMMIT" as const,
        snapshotHash: "after",
        content: "",
        hierarchy: [],
        capturedAt: new Date("2026-08-02T06:30:00.000Z").toISOString(),
      } as CreationSessionSource["captures"][number]],
    }],
  };
  const html = renderCreationSession({
    status: "ready",
    sessions: [session],
    session,
    view: "DRAFT",
    proposal: { proposalId: "proposal-creation-confirm", updatedAt: "2026-08-02T06:30:00.000Z", groupId: "create-from-session" },
  });
  assert.match(html, /data-action="creation-session-confirm-create"/);
  assert.match(html, /不需要再到审阅中心重复确认/);
  assert.doesNotMatch(html, /data-action="creation-session-proposal-prepare"/);
});

test("a blank READY MiniProject exposes a current-Page placement action", () => {
  const base = createCreationSession({ graphId: "graph-one", targetType: "MINI_PROJECT", primarySource: blank(), sessionId: "creation-mini-ready" }, at);
  const session = generateCreationDraftRevision(base, {
    generationId: "generation-mini-ready", reason: "INITIAL_DRAFT", suggestedObjectTitle: "验证告警接入",
    nodes: [
      { semanticKey: "root", text: "**[MiniProject]** 验证告警接入 #MiniProject", order: 0, nodeType: "BLOCK", provenance: "AGENT_SYNTHESIS", operation: "CREATE", confirmed: true, evidenceRefs: [] },
      { semanticKey: "goal", parentSemanticKey: "root", text: "**[目标]** 一条真实告警可追踪", order: 0, nodeType: "BLOCK", provenance: "AGENT_SYNTHESIS", operation: "CREATE", confirmed: true, evidenceRefs: [] },
    ],
    unusedMaterials: [], warnings: [], maturity: { level: "READY", missing: [] },
  }, base.version, at);
  const html = renderCreationSession({ status: "ready", sessions: [session], session, view: "DRAFT" });
  assert.match(html, /当前 Page 末尾/);
  assert.match(html, /data-action="creation-session-placement-blank-page-end"/);
  assert.doesNotMatch(html, /data-action="creation-session-proposal-prepare"/);
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

test("a Page source is summarized before the first round and exposes bounded reference management", () => {
  const page: CreationSessionSource = {
    sourceId: "source-page", role: "PRIMARY", kind: "PAGE", externalId: "page-one", pageName: "硬件告警材料", currentCaptureId: "capture-page", latestKnownHash: "hash-old", availability: "AVAILABLE",
    captures: [{ captureId: "capture-page", reason: "SESSION_START", snapshotHash: "hash-old", content: "接入范围\n历史记录", hierarchy: [
      { nodeId: "block-scope", text: "接入范围", order: 0, depth: 0, relation: "ROOT" },
      { nodeId: "block-history", text: "历史记录", order: 1, depth: 0, relation: "ROOT" },
    ], capturedAt: at.toISOString() }],
  };
  const base = createCreationSession({ graphId: "graph-one", targetType: "PROJECT", primarySource: page, sessionId: "creation-page-source" }, at);
  const changed = observeCreationSessionSource(base, page.sourceId, { availability: "CHANGED", latestKnownHash: "hash-new", changeSummary: { added: 1, modified: 2, deleted: 0 } }, base.version, new Date("2026-08-02T06:01:00.000Z"));
  const html = renderCreationSession({ status: "ready", sessions: [changed], session: changed, view: "DISCUSSION" });
  assert.match(html, /Page 材料识别/);
  assert.match(html, /可能属于本次对象/);
  assert.match(html, /新增 1 · 修改 2 · 删除 0/);
  assert.match(html, /data-action="creation-session-source-refresh"/);
  assert.match(html, /data-action="creation-session-source-add-block"/);
  assert.match(html, /data-action="creation-session-source-add-page"/);
  assert.match(html, /确认来源范围并开始/);
});

test("created history preserves discussion and exposes object, source, review, and Undo affordances", () => {
  const current = discussing();
  const created: typeof current = {
    ...current,
    status: "CREATED",
    sources: [{ sourceId: "source-page", role: "PRIMARY", kind: "PAGE", externalId: "page-one", pageName: "来源页", currentCaptureId: "capture-page", latestKnownHash: "hash-page", availability: "AVAILABLE", captures: [{ captureId: "capture-page", reason: "SESSION_START", snapshotHash: "hash-page", content: "来源材料", hierarchy: [], capturedAt: at.toISOString() }] }],
    rounds: [{ ...current.rounds[0]!, userNarrativeAnswer: "先形成一条可验证链路，恢复演练作为完成证据。", providerStatus: "COMPLETED", summary: { confirmed: "先形成可验证链路", unresolved: "长期运营边界", draftChange: "补充完成证据", nextSuggestion: "检查草稿" } }],
    creationResult: { objectId: "object-created", semanticCommitId: "proposal-commit:created", createdAt: "2026-08-02T07:00:00.000Z" },
  };
  const html = renderCreationSession({ status: "ready", sessions: [], session: created, view: "HISTORY" });
  assert.match(html, /正式对象已创建/);
  assert.match(html, /先形成一条可验证链路/);
  assert.match(html, /data-action="creation-session-open-object"/);
  assert.match(html, /data-action="creation-session-open-review"/);
  assert.match(html, /data-action="creation-session-open-source"/);
  assert.match(html, /查看审阅与 Undo/);
  assert.doesNotMatch(html, /data-action="creation-session-abandon"/);
});
