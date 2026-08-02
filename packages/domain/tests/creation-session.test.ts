import assert from "node:assert/strict";
import test from "node:test";

import { abandonCreationSession, completeCreationRound, completeCreationSession, createCreationSession, failCreationRound, observeCreationSessionSource, refreshCreationSessionSource, retryCreationRound, startCreationSessionRound, submitCreationRoundAnswers, updateCreationSession, type CreationSessionSource } from "../src/index.ts";

const at = new Date("2026-08-02T06:00:00.000Z");
const blank = (): CreationSessionSource => ({ sourceId: "source-primary", role: "PRIMARY", kind: "BLANK", captures: [{ captureId: "capture-blank", reason: "SESSION_START", snapshotHash: "blank", content: "", hierarchy: [], capturedAt: at.toISOString() }], currentCaptureId: "capture-blank", latestKnownHash: "blank", availability: "AVAILABLE" });

test("creation session starts as a graph-clean discussing aggregate", () => {
  const session = createCreationSession({ graphId: "graph-one", targetType: "MINI_PROJECT", primarySource: blank(), sessionId: "creation-one" }, at);
  assert.equal(session.status, "DISCUSSING");
  assert.equal(session.sources.length, 1);
  assert.equal(session.sources[0]?.kind, "BLANK");
  assert.equal(session.rounds.length, 0);
  assert.equal(session.creationResult, undefined);
});

test("creation session enforces one primary plus at most three references", () => {
  const session = createCreationSession({ graphId: "graph-one", targetType: "PROJECT", primarySource: blank(), sessionId: "creation-two" }, at);
  const reference = (index: number): CreationSessionSource => ({ sourceId: `ref-${index}`, role: "REFERENCE", kind: "PAGE", externalId: `page-${index}`, captures: [{ captureId: `capture-${index}`, reason: "SESSION_START", snapshotHash: `hash-${index}`, content: `page ${index}`, hierarchy: [], capturedAt: at.toISOString() }], currentCaptureId: `capture-${index}`, latestKnownHash: `hash-${index}`, availability: "AVAILABLE" });
  assert.throws(() => updateCreationSession(session, { sources: [blank(), reference(1), reference(2), reference(3), reference(4)] }, 1, at), /参考来源最多三个/);
});

test("round questions require rationale, recommendation, and explicit answer state", () => {
  const session = createCreationSession({ graphId: "graph-one", targetType: "PROJECT", primarySource: blank(), sessionId: "creation-three" }, at);
  assert.throws(() => updateCreationSession(session, { rounds: [{ roundId: "round-1", theme: "结果与完成方式", questions: [{ questionId: "q1", uncertaintyId: "outcome", text: "最终结果是什么？", rationale: "现在需要明确结果。", recommendation: "先产出一份可审阅清单。", answerRequirement: "说明可交付结果。", answerState: "ANSWERED" }], providerStatus: "COMPLETED", consensusDelta: [], draftDelta: [], unresolvedBranches: [], abstentions: [], createdAt: at.toISOString() }] }, 1, at), /必须保存明确答案/);
});

test("adopted draft makes preview ready and completion requires placement", () => {
  const session = createCreationSession({ graphId: "graph-one", targetType: "MINI_PROJECT", primarySource: blank(), sessionId: "creation-four" }, at);
  const preview = updateCreationSession(session, { draftRevisions: [{ revisionId: "draft-1", reason: "INITIAL_DRAFT", nodes: [{ nodeId: "root", text: "**[MiniProject]** 整理材料 #MiniProject", order: 0, nodeType: "BLOCK", provenance: "USER_CONFIRMED", operation: "CREATE", userEdited: false, confirmed: true }], adopted: true, final: false, createdAt: at.toISOString() }], currentDraftRevisionId: "draft-1" }, 1, at);
  assert.equal(preview.status, "PREVIEW_READY");
  assert.throws(() => completeCreationSession(preview, { objectId: "obj-1", semanticCommitId: "commit-1", createdAt: at.toISOString() }, 2, at), /Placement/);
  const placed = updateCreationSession(preview, { placementPlan: { kind: "PAGE_END", pageId: "journal", pageName: "2026-08-02" } }, 2, at);
  const created = completeCreationSession(placed, { objectId: "obj-1", semanticCommitId: "commit-1", createdAt: at.toISOString() }, 3, at);
  assert.equal(created.status, "CREATED");
  assert.equal(created.creationResult?.semanticCommitId, "commit-1");
});

test("created sessions are read-only and abandoned sessions cannot be created", () => {
  const session = createCreationSession({ graphId: "graph-one", targetType: "PROJECT", primarySource: blank(), sessionId: "creation-five" }, at);
  const abandoned = abandonCreationSession(session, 1, at);
  assert.equal(abandoned.status, "ABANDONED");
  assert.throws(() => updateCreationSession(abandoned, { userTitle: "late edit" }, 2, at), /只读/);
});

test("source observation and explicit refresh retain prior capture and mark dependent source facts conflicting", () => {
  const source: CreationSessionSource = {
    sourceId: "source-block", role: "PRIMARY", kind: "BLOCK_SUBTREE", externalId: "block-one", latestKnownHash: "hash-old", availability: "AVAILABLE", currentCaptureId: "capture-old",
    captures: [{ captureId: "capture-old", reason: "SESSION_START", snapshotHash: "hash-old", content: "旧内容", hierarchy: [{ nodeId: "block-one", text: "旧内容", order: 0, depth: 0, relation: "ROOT" }], capturedAt: at.toISOString() }],
  };
  const started = createCreationSession({ graphId: "graph-one", targetType: "MINI_PROJECT", primarySource: source, sessionId: "creation-source" }, at);
  const withFact = updateCreationSession(started, { consensus: [{ consensusId: "fact-one", text: "旧内容", provenance: "SOURCE_FACT", evidenceRefs: ["capture-old"], updatedAt: at.toISOString() }] }, 1, at);
  const changed = observeCreationSessionSource(withFact, "source-block", { latestKnownHash: "hash-new", availability: "CHANGED" }, 2, new Date("2026-08-02T06:01:00.000Z"));
  assert.equal(changed.sources[0]?.availability, "CHANGED");
  const refreshed = refreshCreationSessionSource(changed, "source-block", { captureId: "capture-new", reason: "USER_REFRESH", snapshotHash: "hash-new", content: "新内容", hierarchy: [{ nodeId: "block-one", text: "新内容", order: 0, depth: 0, relation: "ROOT" }], capturedAt: "2026-08-02T06:02:00.000Z" }, 3, new Date("2026-08-02T06:02:00.000Z"));
  assert.deepEqual(refreshed.sources[0]?.captures.map(({ captureId }) => captureId), ["capture-old", "capture-new"]);
  assert.equal(refreshed.sources[0]?.availability, "AVAILABLE");
  assert.equal(refreshed.consensus[0]?.provenance, "CONFLICT");
});

test("round answers persist before Provider and failure retry preserves explicit per-question state", () => {
  const started = createCreationSession({ graphId: "graph-one", targetType: "PROJECT", primarySource: blank(), sessionId: "creation-round" }, at);
  const withRound = startCreationSessionRound(started, { roundId: "round-one", theme: "结果与完成方式", questions: [
    { questionId: "q-outcome", uncertaintyId: "outcome", text: "希望形成什么结果？", rationale: "先明确长期结果。", recommendation: "形成可持续运行的成果。", answerRequirement: "说明具体结果。", answerState: "UNANSWERED" },
    { questionId: "q-deliverable", uncertaintyId: "deliverables", text: "要交付什么？", rationale: "成果需要落到交付物。", recommendation: "先确定一项可审阅交付物。", answerRequirement: "列出首项交付物。", answerState: "UNANSWERED" },
    { questionId: "q-evidence", uncertaintyId: "completion-evidence", text: "怎样判断完成？", rationale: "避免没有完成判断。", recommendation: "使用可复核证据。", answerRequirement: "给出可复核证据。", answerState: "UNANSWERED" },
  ], unresolvedBranches: ["完成证据"], abstentions: [] }, 1, at);
  const requesting = submitCreationRoundAnswers(withRound, "round-one", [
    { questionId: "q-outcome", answerState: "ANSWERED", userAnswer: "形成稳定告警接入" },
    { questionId: "q-deliverable", answerState: "ACCEPTED_RECOMMENDATION" },
    { questionId: "q-evidence", answerState: "UNCERTAIN", userAnswer: "还需要验证" },
  ], 2, new Date("2026-08-02T06:01:00.000Z"));
  assert.equal(requesting.rounds[0]?.providerStatus, "REQUESTING");
  assert.equal(requesting.rounds[0]?.questions[1]?.userAnswer, "先确定一项可审阅交付物。");
  const failed = failCreationRound(requesting, "round-one", "FAILED", 3, new Date("2026-08-02T06:02:00.000Z"));
  assert.equal(failed.rounds[0]?.questions[0]?.userAnswer, "形成稳定告警接入");
  const retried = retryCreationRound(failed, "round-one", 4, new Date("2026-08-02T06:03:00.000Z"));
  const completed = completeCreationRound(retried, "round-one", {
    agentSynthesis: "结果和首项交付物已明确，完成证据仍待确认。", consensus: [], draftDelta: ["补充结果与交付物"],
    unresolvedBranches: ["完成证据", "范围"], abstentions: ["来源未说明范围"],
    summary: { confirmed: "结果与交付物已明确", unresolved: "完成证据仍待确认", draftChange: "补充结果与交付物", nextSuggestion: "下一轮确认范围" },
    nextRound: { roundId: "round-two", theme: "范围", questions: [{ questionId: "q-in", uncertaintyId: "in-scope", text: "哪些内容属于本项目？", rationale: "需要封顶边界。", recommendation: "先纳入接入与验收。", answerRequirement: "说明最小范围。", answerState: "UNANSWERED" }], unresolvedBranches: ["范围"], abstentions: ["来源未说明范围"] },
  }, 5, new Date("2026-08-02T06:04:00.000Z"));
  assert.equal(completed.rounds[0]?.providerStatus, "COMPLETED");
  assert.equal(completed.rounds[1]?.providerStatus, "NOT_REQUESTED");
  assert.deepEqual(completed.consensus.map(({ provenance }) => provenance), ["USER_CONFIRMED", "USER_CONFIRMED", "UNKNOWN"]);
});
