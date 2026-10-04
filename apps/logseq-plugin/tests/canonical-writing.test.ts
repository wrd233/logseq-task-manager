import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeFormalSource,
  extractFormalTitle,
  extractTitleFromSourceLine,
  formatFormalAnchor,
  formatFormalSource,
  taskMarkerFromContent,
  TASK_MARKERS,
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
  assert.deepEqual(parseFormalAnchor(line), { kind: "TASK", title: "联系厂商确认探针兼容版本", marker: "TODO", taskLabel: "任务" });
  assert.equal(extractFormalTitle(line), "联系厂商确认探针兼容版本");
  assert.equal(extractTitleFromSourceLine(line), "联系厂商确认探针兼容版本");
  assert.equal(isCanonicalFormalAnchor(line, "TASK"), true);
});

test("parse/extract handles prefix-first legacy canonical Task and normalizes it", () => {
  const line = "**[任务]** TODO 联系厂商确认探针兼容版本";
  assert.deepEqual(parseFormalAnchor(line), { kind: "TASK", title: "联系厂商确认探针兼容版本", marker: "TODO", taskLabel: "任务" });
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

test("both task spellings and every supported marker share TASK semantics and retain source spelling", () => {
  const title = "核对 **重点** [资料](longdoc://stable-id) 与 ((same-name-uuid))";
  for (const taskLabel of ["任务", "事务"] as const) for (const marker of TASK_MARKERS) {
    for (const line of [`${marker} **[${taskLabel}]** ${title}`, `**[${taskLabel}]** ${marker} ${title}`]) {
      assert.deepEqual(parseFormalAnchor(line), { kind: "TASK", title, marker, taskLabel });
      assert.equal(extractTitleFromSourceLine(line), title);
      assert.equal(taskMarkerFromContent(line), marker);
      assert.equal(canonicalizeFormalSource(line), `${marker} **[${taskLabel}]** ${title}`);
      assert.equal(replaceTaskMarker(line, "DONE"), `DONE **[${taskLabel}]** ${title}`);
    }
  }
  assert.equal(formatFormalAnchor({ kind: "TASK", title, taskLabel: "事务" }), `TODO **[事务]** ${title}`);
});

test("source normalization, title changes and marker changes retain complete multiline/property bytes", () => {
  for (const newline of ["\n", "\r\n"]) {
    const tail = ["", "[注] 保留口吻 😀", "[目标] 当前约束", "[想法] 仍需核验", "反例与无标记条件", "TODO 普通待办", "id:: 11111111-1111-4111-8111-111111111111", "custom:: [资料](longdoc://stable-id)", "```ts", "const x = '[事务]';", "```", ""].join(newline);
    const source = `TODO **[事务]** 核对资料${tail}`;
    assert.equal(canonicalizeFormalSource(source), source);
    assert.equal(canonicalizeFormalSource(source, { title: "新标题" }), `TODO **[事务]** 新标题${tail}`);
    assert.equal(replaceTaskMarker(source, "DONE"), `DONE **[事务]** 核对资料${tail}`);
    assert.equal(formatFormalSource(source, { kind: "TASK", title: "核对资料" }), source);
    assert.equal(canonicalizeFormalSource(`**[事务]** TODO 核对资料${tail}`), source);
    assert.equal(replaceTaskMarker(`  TODO 普通记录${tail}`, "DONE"), `  DONE 普通记录${tail}`);
    const mini = `**[MiniProject]** 调研材料 #MiniProject${tail}`;
    assert.equal(canonicalizeFormalSource(mini, { title: "新材料" }), `**[MiniProject]** 新材料 #MiniProject${tail}`);
  }
});

test("anchor parsing never claims ordinary TODOs, prose, quoted or coded labels", () => {
  for (const line of ["TODO 普通待办", "正文中的 [事务] 字样", "引用 TODO **[事务]** 标题", "> TODO **[事务]** 标题", "`TODO **[事务]** 标题`", "```\nTODO **[事务]** 标题\n```", "[注] TODO **[事务]** 标题", "普通段落\nTODO **[事务]** 标题", "TODO [资料](https://example.test/事务)"]) {
    assert.equal(parseFormalAnchor(line), null, line);
    assert.equal(canonicalizeFormalSource(line), null, line);
  }
});

test("semantic title text is not interpreted as another layer of anchor decoration", () => {
  for (const title of ["TODO 语法说明", "**[事务]** 作为示例", "A  B 与 **重点** [链接](https://example.test)"]) {
    const source = `TODO **[事务]** ${title}`;
    assert.equal(extractTitleFromSourceLine(source), title);
    assert.equal(canonicalizeFormalSource(source), source);
    assert.equal(replaceTaskMarker(source, "DONE"), `DONE **[事务]** ${title}`);
  }
  assert.equal(extractTitleFromSourceLine("**[事务]** TODO 旧标题"), "旧标题");
  for (const label of ["任务", "事务"]) {
    assert.equal(extractTitleFromSourceLine(`[${label}] TODO 旧标题`), "旧标题");
    assert.equal(extractTitleFromSourceLine(`TODO [${label}] 旧标题`), "旧标题");
  }
});
