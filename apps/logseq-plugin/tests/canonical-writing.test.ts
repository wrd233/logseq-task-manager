import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeFormalSource,
  extractFormalTitle,
  extractTitleFromSourceLine,
  formatFormalAnchor,
  isCanonicalFormalAnchor,
  parseFormalAnchor,
  replaceTaskMarker,
} from "../src/canonical-writing.ts";

test("Task canonical form keeps Logseq workflow marker first and bold [任务] label", () => {
  assert.equal(formatFormalAnchor({ kind: "TASK", title: "完成 OA 告警规则复核" }), "TODO **[任务]** 完成 OA 告警规则复核");
  assert.equal(formatFormalAnchor({ kind: "TASK", title: "完成 OA 告警规则复核", lifecycle: "COMPLETED" }), "DONE **[任务]** 完成 OA 告警规则复核");
});

test("MiniProject canonical form uses the exact requested bold prefix and trailing tag", () => {
  assert.equal(formatFormalAnchor({ kind: "MINI_PROJECT", title: "完成采购技术规格书整理" }), "**[MiniProject]** 完成采购技术规格书整理 #MiniProject");
});

test("Project does not use the block anchor formatter", () => {
  assert.throws(() => formatFormalAnchor({ kind: "PROJECT" as never, title: "x" }), /PROJECT_DOES_NOT_USE_BLOCK_ANCHOR_FORMATTER/u);
});

test("parse/extract handles marker-first canonical Task", () => {
  const line = "TODO **[任务]** 联系厂商确认探针兼容版本";
  assert.deepEqual(parseFormalAnchor(line), { kind: "TASK", title: "联系厂商确认探针兼容版本", marker: "TODO" });
  assert.equal(extractFormalTitle(line), "联系厂商确认探针兼容版本");
  assert.equal(extractTitleFromSourceLine(line), "联系厂商确认探针兼容版本");
  assert.equal(isCanonicalFormalAnchor(line, "TASK"), true);
});

test("parse/extract handles prefix-first legacy canonical Task and normalizes it", () => {
  const line = "**[任务]** TODO 联系厂商确认探针兼容版本";
  assert.deepEqual(parseFormalAnchor(line), { kind: "TASK", title: "联系厂商确认探针兼容版本", marker: "TODO" });
  assert.equal(canonicalizeFormalSource(line), "TODO **[任务]** 联系厂商确认探针兼容版本");
  assert.equal(extractTitleFromSourceLine(line), "联系厂商确认探针兼容版本");
});

test("parse/extract handles MiniProject canonical line", () => {
  const line = "**[MiniProject]** 完成采购技术规格书整理 #MiniProject";
  assert.deepEqual(parseFormalAnchor(line), { kind: "MINI_PROJECT", title: "完成采购技术规格书整理", marker: null });
  assert.equal(extractFormalTitle(line), "完成采购技术规格书整理");
  assert.equal(extractTitleFromSourceLine("完成采购技术规格书整理 #MiniProject"), "完成采购技术规格书整理");
});

test("title stripping removes marker, bold labels, and MiniProject tag without eating semantic markdown", () => {
  assert.equal(extractTitleFromSourceLine("TODO **[任务]** 完成 **重要** 复核"), "完成 **重要** 复核");
  assert.equal(extractTitleFromSourceLine("DONE **[任务]** 完成 OA 告警规则复核"), "完成 OA 告警规则复核");
  assert.equal(extractTitleFromSourceLine("**[MiniProject]** 完成采购技术规格书整理 #MiniProject"), "完成采购技术规格书整理");
  assert.equal(extractTitleFromSourceLine("TODO 联系厂商确认探针兼容版本"), "联系厂商确认探针兼容版本");
});

test("canonicalize is idempotent and never rewrites natural content", () => {
  const canonical = "TODO **[任务]** 完成 OA 告警规则复核";
  assert.equal(canonicalizeFormalSource(canonical, { title: "完成 OA 告警规则复核" }), canonical);
  assert.equal(canonicalizeFormalSource("TODO 完成 OA 告警规则复核"), null);
  assert.equal(canonicalizeFormalSource("**[MiniProject]** 完成采购技术规格书整理 #MiniProject"), "**[MiniProject]** 完成采购技术规格书整理 #MiniProject");
});

test("replaceTaskMarker preserves canonical decoration and converts prefix-first to marker-first", () => {
  assert.equal(replaceTaskMarker("TODO **[任务]** 完成 OA 告警规则复核", "DONE"), "DONE **[任务]** 完成 OA 告警规则复核");
  assert.equal(replaceTaskMarker("**[任务]** TODO 完成 OA 告警规则复核", "DONE"), "DONE **[任务]** 完成 OA 告警规则复核");
  assert.equal(replaceTaskMarker("TODO 自然任务", "DONE"), "DONE 自然任务");
});
