import assert from "node:assert/strict";
import test from "node:test";

import { parseExplicitObjectSyntax } from "../src/index.ts";

test("fixed explicit markers produce only the four parser-managed object types", () => {
  assert.deepEqual(parseExplicitObjectSyntax("[任务] 核对时间同步来源"), {
    kind: "OBJECT",
    objectType: "TASK",
    marker: undefined,
    syntax: "[任务]",
    title: "核对时间同步来源",
  });
  assert.deepEqual(parseExplicitObjectSyntax("[MiniProject] 梳理外部推送链路"), {
    kind: "OBJECT",
    objectType: "MINI_PROJECT",
    marker: undefined,
    syntax: "[MiniProject]",
    title: "梳理外部推送链路",
  });
  assert.deepEqual(parseExplicitObjectSyntax("#MiniProject 梳理外部推送链路"), {
    kind: "OBJECT",
    objectType: "MINI_PROJECT",
    marker: undefined,
    syntax: "#MiniProject",
    title: "梳理外部推送链路",
  });
  assert.deepEqual(parseExplicitObjectSyntax("[决策] 暂不修改生产脚本"), {
    kind: "OBJECT",
    objectType: "DECISION",
    marker: undefined,
    syntax: "[决策]",
    title: "暂不修改生产脚本",
  });
  assert.deepEqual(parseExplicitObjectSyntax("[成果] 真实事件验证记录"), {
    kind: "OBJECT",
    objectType: "OUTPUT",
    marker: undefined,
    syntax: "[成果]",
    title: "真实事件验证记录",
  });
});

test("TODO Marker is optional execution syntax and never decides object identity", () => {
  assert.deepEqual(parseExplicitObjectSyntax("[任务] TODO 核对时间同步来源"), {
    kind: "OBJECT",
    objectType: "TASK",
    marker: "TODO",
    syntax: "[任务]",
    title: "核对时间同步来源",
  });
  assert.deepEqual(parseExplicitObjectSyntax("[任务] DOING 核对时间同步来源"), {
    kind: "OBJECT",
    objectType: "TASK",
    marker: "DOING",
    syntax: "[任务]",
    title: "核对时间同步来源",
  });
  assert.deepEqual(parseExplicitObjectSyntax("TODO 核对时间同步来源"), {
    kind: "NONE",
    marker: "TODO",
    reason: "NO_EXPLICIT_OBJECT_MARKER",
  });
  assert.deepEqual(parseExplicitObjectSyntax("普通正文"), {
    kind: "NONE",
    marker: undefined,
    reason: "NO_EXPLICIT_OBJECT_MARKER",
  });
});

test("bare TODO stays non-object regardless of whether a parent formal object exists", () => {
  const child = parseExplicitObjectSyntax("TODO 收集一条测试事件");
  assert.equal(child.kind, "NONE");
  assert.equal(child.reason, "NO_EXPLICIT_OBJECT_MARKER");
});

test("unsupported Area and Project labels are not guessed into formal objects", () => {
  for (const content of ["[Area] 工作责任区", "[领域] 工作责任区", "[Project] 告警治理", "[项目] 告警治理"]) {
    assert.deepEqual(parseExplicitObjectSyntax(content), {
      kind: "NONE",
      marker: undefined,
      reason: "NO_EXPLICIT_OBJECT_MARKER",
    });
  }
});

test("empty titles and conflicting explicit types are deterministic structural errors", () => {
  assert.deepEqual(parseExplicitObjectSyntax("[任务] TODO"), {
    kind: "INVALID",
    code: "EXPLICIT_OBJECT_TITLE_REQUIRED",
    markers: ["[任务]"],
  });
  assert.deepEqual(parseExplicitObjectSyntax("[任务] 核对链路 [MiniProject] 完成治理"), {
    kind: "INVALID",
    code: "EXPLICIT_OBJECT_MARKER_CONFLICT",
    markers: ["[任务]", "[MiniProject]"],
  });
});

test("explicit syntax is leading-only and exact instead of natural-language guessing", () => {
  for (const content of [
    "这是一个提到 [任务] 的说明",
    "[task] English alias is not specified",
    "[miniproject] wrong casing",
    "做完告警验证",
  ]) {
    assert.deepEqual(parseExplicitObjectSyntax(content), {
      kind: "NONE",
      marker: undefined,
      reason: "NO_EXPLICIT_OBJECT_MARKER",
    });
  }
});
