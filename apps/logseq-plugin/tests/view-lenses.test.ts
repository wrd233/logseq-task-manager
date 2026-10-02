import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { captureLensSource, validateLensSource, logseqSourceId, type LensSourceSnapshot } from "../src/features/work-view/lens-source.ts";
import { decodeFocusPlan, validateFocusPlan, focusBasisChanged, type FocusRequest, type FocusPlan } from "../src/features/work-view/lens-plan.ts";
import { LensInputError } from "../src/features/work-view/lens-input.ts";
import { LensState } from "../src/features/work-view/lens-state.ts";
import { composeWorkView } from "../src/features/work-view/view-composer.ts";
import type { SourceRow } from "../src/features/work-view/model.mjs";
import type { ViewPresentation } from "../src/features/work-view/operations.ts";

const scope = { graphId: "graph:/work", rootUuid: "root" };
const rows: SourceRow[] = [
  { uuid: "root", depth: 0, sourceParent: null, content: "任务\nid:: root\n" },
  { uuid: "s1", depth: 1, sourceParent: "root", content: "目标" },
  { uuid: "a", depth: 2, sourceParent: "s1", content: "两台样机通过。\n\n但正式验收仍需重复运行。\n> 限定条件不能被裁掉。" },
  { uuid: "s2", depth: 1, sourceParent: "root", content: "方案" },
  { uuid: "b", depth: 2, sourceParent: "s2", content: "备选方案" },
  { uuid: "s3", depth: 1, sourceParent: "root", content: "工作记录" },
  { uuid: "c", depth: 2, sourceParent: "s3", content: "结果与反证\n未覆盖终端重启。" },
];
const request: FocusRequest = { schemaVersion: 1, requestId: "request-a", question: "验证充分吗？", scope };
function plan(source: LensSourceSnapshot, uuids = ["a", "c"]): FocusPlan {
  return {
    ...request, structureVersion: source.structureVersion,
    sourceVersions: source.blocks.map(block => ({ sourceId: block.sourceId, contentVersion: block.contentVersion! })),
    visibleRanges: source.blocks.filter(block => uuids.includes(block.target.blockUuid)).map(block => ({ sourceId: block.sourceId, contentVersion: block.contentVersion!, unit: "block" })),
    emphasisRanges: source.blocks.filter(block => block.target.blockUuid === uuids[0]).map(block => ({ sourceId: block.sourceId, contentVersion: block.contentVersion!, unit: "block" })),
    temporaryInference: "样机结果不能证明完整验收。", gaps: ["缺少重复运行结果"],
  };
}
const presentation = (): ViewPresentation => ({ items: rows.map(({ uuid, depth }) => ({ uuid, depth })), collapsed: ["root", "s1"], overrides: { a: "compact" }, expanded: [], selected: "b" });
function reason(action: () => unknown, expected: string) {
  assert.throws(action, (error: unknown) => error instanceof LensInputError && error.reason === expected);
}

test("source exchange versions hash complete UTF-8 text and real preorder, independently of capture time", async () => {
  const source = await captureLensSource(scope, rows);
  for (const [index, block] of source.blocks.entries()) {
    assert.equal(block.contentVersion, createHash("sha256").update(rows[index]!.content, "utf8").digest("hex"));
    assert.equal(block.sourceId, JSON.stringify(["logseq", scope.graphId, rows[index]!.uuid]));
  }
  assert.equal(source.structureVersion, createHash("sha256").update(JSON.stringify(source.blocks.map(block => [block.sourceId, block.parentUuid, block.order, block.depth]))).digest("hex"));
  assert.equal(source.sourceSetVersion, createHash("sha256").update(JSON.stringify(source.blocks.map(block => [block.sourceId, block.availability, block.contentVersion]))).digest("hex"));
  assert.deepEqual(source.blocks.map(block => block.order), [0, 0, 0, 1, 0, 2, 0]);
  const dated = { ...source, capturedAt: "2030-01-01T00:00:00Z" };
  assert.deepEqual((await validateLensSource(dated, scope)).blocks, source.blocks);
  const normalized = await captureLensSource(scope, rows.map(row => ({ ...row, content: row.content.replace(/^id::[^\n]*(?:\n|$)/gm, "").trim() })));
  assert.notEqual(normalized.blocks[0]!.contentVersion, source.blocks[0]!.contentVersion);
  assert.equal(normalized.structureVersion, source.structureVersion);
});

test("retained outside rows are not source members; unavailable snapshots carry no cached body/version", async () => {
  const extra = { uuid: "outside", depth: 0, content: "cached outside", outside: true };
  const source = await captureLensSource(scope, [...rows, extra]);
  assert.equal(source.blocks.some(block => block.target.blockUuid === "outside"), false);
  for (const availability of ["missing", "unavailable"] as const) {
    const snapshot = await captureLensSource(scope, rows, availability);
    assert.equal(snapshot.blocks.length, 1);
    assert.equal(snapshot.blocks[0]!.availability, availability);
    assert.equal(snapshot.blocks[0]!.content, null); assert.equal(snapshot.blocks[0]!.contentVersion, null);
    await validateLensSource(snapshot, scope);
  }
});

test("provider validation rejects forged identities, incorrect hashes/structure and content disguised as unavailable", async () => {
  const source = await captureLensSource(scope, rows);
  const cases = [
    (value: LensSourceSnapshot) => { value.blocks[1]!.target.graphId = "other"; },
    (value: LensSourceSnapshot) => { value.blocks[1]!.content = "forged"; },
    (value: LensSourceSnapshot) => { value.blocks[2]!.parentUuid = "s3"; },
    (value: LensSourceSnapshot) => { value.blocks[3]!.order = 0; },
    (value: LensSourceSnapshot) => { value.blocks[0]!.availability = "unavailable"; },
  ];
  for (const change of cases) {
    const value = structuredClone(source); change(value);
    await assert.rejects(validateLensSource(value, scope), LensInputError);
  }
  await assert.rejects(validateLensSource({ ...source, actor: "USER", capability: true }, scope), LensInputError);
  await assert.rejects(validateLensSource(source, { ...scope, rootUuid: "s1" }), LensInputError);
});

test("plan validation fails closed on schema, membership, scope, versions, precise ranges and arbitrary operations/styles", async () => {
  const source = await captureLensSource(scope, rows), valid = plan(source);
  const cases: Array<[string, (value: FocusPlan & Record<string, unknown>) => void]> = [
    ["unknown-field", value => { value.operation = "write-source"; }],
    ["unknown-field", value => { value.style = { display: "none" }; }],
    ["unknown-field", value => { value.html = "<script>bad()</script>"; }],
    ["scope-mismatch", value => { value.scope.graphId = "other"; }],
    ["scope-mismatch", value => { value.scope.rootUuid = "s1"; }],
    ["source-not-in-scope", value => { value.visibleRanges[0]!.sourceId = logseqSourceId(scope.graphId, "fake"); }],
    ["stale-content", value => { value.visibleRanges[0]!.contentVersion = "f".repeat(64); }],
    ["stale-structure", value => { value.structureVersion = "f".repeat(64); }],
    ["unknown-field", value => { Object.assign(value.visibleRanges[0]!, { start: 0, end: 100_000 }); }],
    ["unsupported-range-unit", value => { Object.assign(value.visibleRanges[0]!, { unit: "paragraph" }); }],
    ["ancestor-version-required", value => { value.sourceVersions = value.sourceVersions.filter(version => version.sourceId !== logseqSourceId(scope.graphId, "s1")); }],
    ["superseded-request", value => { value.requestId = "old"; }],
    ["duplicate-source-version", value => { value.sourceVersions.push(value.sourceVersions[0]!); }],
    ["emphasis-not-visible", value => { value.emphasisRanges = [{ sourceId: logseqSourceId(scope.graphId, "b"), contentVersion: source.blocks[4]!.contentVersion!, unit: "block" }]; }],
  ];
  for (const [expected, change] of cases) {
    const value = structuredClone(valid) as FocusPlan & Record<string, unknown>; change(value);
    reason(() => validateFocusPlan(decodeFocusPlan(value), source, request), expected);
  }
  reason(() => decodeFocusPlan({ ...valid, question: "a".repeat(241) }), "invalid-text");
  reason(() => decodeFocusPlan({ ...valid, gaps: Array(9).fill("gap") }), "input-too-large");
  reason(() => decodeFocusPlan({ ...valid, visibleRanges: Array(2001).fill(valid.visibleRanges[0]) }), "input-too-large");
  let invoked = false;
  reason(() => decodeFocusPlan({ ...valid, get temporaryInference() { invoked = true; return "bad"; } }), "invalid-plan");
  assert.equal(invoked, false);
});

test("composer selects separate structures, retains full conditions, temporarily expands ancestors and never changes layout/source", async () => {
  const source = await captureLensSource(scope, rows), focus = validateFocusPlan(plan(source), source, request), state = presentation();
  const before = structuredClone(state), original = structuredClone(rows);
  const composed = composeWorkView(rows, state, { focus, changed: false, userFolds: new Set() });
  assert.deepEqual(composed.items.filter(item => !item.hidden).map(item => item.uuid), ["root", "s1", "a", "s3", "c"]);
  assert.equal(composed.items.find(item => item.uuid === "root")!.folded, false);
  assert.equal(composed.items.find(item => item.uuid === "a")!.full, true);
  assert.equal(composed.items.find(item => item.uuid === "a")!.emphasis, true);
  assert.deepEqual(state, before); assert.deepEqual(rows, original);
  const changed = composeWorkView(rows, state, { focus, changed: true, userFolds: new Set(["s1"]) });
  assert.equal(changed.items.find(item => item.uuid === "a")!.hidden, true);
  assert.equal(changed.items.some(item => item.emphasis), false);
  assert.equal(composeWorkView(rows, state).items.find(item => item.uuid === "s1")!.hidden, true);
});

test("personal ancestry supplements real ancestry without replacing source hierarchy or reordering the personal view", async () => {
  const source = await captureLensSource(scope, rows), focus = validateFocusPlan(plan(source, ["a"]), source, request);
  const state = presentation(); state.collapsed = [];
  state.items = [{ uuid: "root", depth: 0 }, { uuid: "s3", depth: 1 }, { uuid: "c", depth: 2 }, { uuid: "s2", depth: 1 }, { uuid: "b", depth: 2 }, { uuid: "a", depth: 3 }, { uuid: "s1", depth: 1 }];
  const view = composeWorkView(rows, state, { focus, changed: false, userFolds: new Set() });
  assert.deepEqual(view.items.filter(item => !item.hidden).map(item => item.uuid), ["root", "s2", "b", "a", "s1"]);
  assert.equal(rows.find(row => row.uuid === "a")!.sourceParent, "s1");
  const empty = rows.map(row => row.uuid === "s1" ? { ...row, content: "id:: s1\n" } : row);
  assert.equal(composeWorkView(empty, state, { focus, changed: false, userFolds: new Set() }).items.find(item => item.uuid === "s1")!.hidden, true);
});

test("basis changes are independent of display/draft versions and invalidate inference without replacing the selection", async () => {
  const source = await captureLensSource(scope, rows), value = plan(source);
  value.sourceVersions = value.sourceVersions.filter(version => !["s2", "b"].some(id => version.sourceId === logseqSourceId(scope.graphId, id)));
  const focus = validateFocusPlan(value, source, request), state = new LensState();
  state.begin(request.question, scope); state.accept(focus, null);
  const unrelated = await captureLensSource(scope, rows.map(row => row.uuid === "b" ? { ...row, content: "new unrelated" } : row));
  assert.equal(focusBasisChanged(focus, unrelated), false);
  const edited = await captureLensSource(scope, rows.map(row => row.uuid === "a" ? { ...row, content: "new source, still a full block" } : row));
  assert.equal(state.changed(edited), true); assert.equal(state.changed(source), false);
  assert.equal(state.snapshot(scope).phase, "changed");
  assert.deepEqual([...state.active!.focus.selected], ["a", "c"]);
  reason(() => validateFocusPlan(value, edited, request), "stale-content");
});

test("new requests replace selection, cancellations invalidate tickets, history is bounded and snapshots cannot mutate state", async () => {
  const source = await captureLensSource(scope, rows), state = new LensState();
  const first = state.begin("first", scope), one = { ...plan(source, ["a"]), ...first };
  const next = state.begin("second", scope); assert.equal(state.current(first.requestId), false);
  reason(() => validateFocusPlan(one, source, next), "superseded-request");
  state.cancel(); assert.equal(state.current(next.requestId), false);
  for (let index = 0; index < 8; index++) {
    const request = state.begin("q" + index, scope);
    state.accept(validateFocusPlan({ ...plan(source, index % 2 ? ["a"] : ["c"]), ...request }, source, request), null);
  }
  assert.equal(state.history.length, 5);
  const snapshot = state.snapshot(scope); snapshot.plan!.question = "injected"; snapshot.plan!.visibleRanges.length = 0;
  assert.equal(state.snapshot(scope).plan!.question, "q7"); assert.equal(state.snapshot(scope).plan!.visibleRanges.length, 1);
  state.clear(); assert.equal(state.snapshot(scope).phase, "reading"); assert.equal(state.history.length, 0);
});
