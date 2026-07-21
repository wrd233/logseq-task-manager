import assert from "node:assert/strict";
import test from "node:test";

import {
  ExplicitObjectChangeDebouncer,
  parseExplicitObjectSyntax,
  stripLogseqBlockIdentityProperty,
  type DebounceClock,
} from "../src/index.ts";

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
  assert.deepEqual(parseExplicitObjectSyntax("[任务] WAITING 等待外部答复"), {
    kind: "OBJECT",
    objectType: "TASK",
    marker: "WAITING",
    syntax: "[任务]",
    title: "等待外部答复",
  });
  assert.deepEqual(parseExplicitObjectSyntax("[任务] CANCELLED 取消旧路径"), {
    kind: "OBJECT",
    objectType: "TASK",
    marker: "CANCELLED",
    syntax: "[任务]",
    title: "取消旧路径",
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

test("parser and semantic content ignore Logseq's persisted Block identity property", () => {
  const uuid = "6a5e48ce-c0e3-4281-9f74-1a8f49a3e539";
  const withIdentity = `[任务] 稳定的正式对象\nid:: ${uuid}`;
  assert.deepEqual(parseExplicitObjectSyntax(withIdentity), {
    kind: "OBJECT", objectType: "TASK", marker: undefined, syntax: "[任务]", title: "稳定的正式对象",
  });
  assert.equal(stripLogseqBlockIdentityProperty(withIdentity, uuid), "[任务] 稳定的正式对象");
  assert.equal(stripLogseqBlockIdentityProperty(`${withIdentity}\nid:: 00000000-0000-4000-8000-000000000000`, uuid), "[任务] 稳定的正式对象\nid:: 00000000-0000-4000-8000-000000000000");
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

test("changed Block events debounce by UUID and deliver only the latest pure parse", async () => {
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  const clock: DebounceClock = {
    setTimeout(callback) {
      nextTimer += 1;
      timers.set(nextTimer, callback);
      return nextTimer;
    },
    clearTimeout(handle) {
      timers.delete(handle as number);
    },
  };
  const delivered: unknown[] = [];
  const errors: unknown[] = [];
  const debouncer = new ExplicitObjectChangeDebouncer({
    delayMs: 250,
    clock,
    async deliver(batch) {
      delivered.push(batch);
    },
    onError(error) {
      errors.push(error);
    },
  });

  debouncer.enqueue([
    { uuid: "block-2", content: "TODO 内部步骤" },
    { uuid: "block-1", content: "[任务] 旧标题", "updated-at": 1001 },
    { uuid: 42, content: "[任务] 无效 UUID" },
  ]);
  debouncer.enqueue([{ uuid: "block-1", content: "[任务] 新标题", "updated-at": 1002 }]);
  assert.equal(timers.size, 1);
  await debouncer.flush();

  assert.deepEqual(delivered, [[
    {
      externalId: "block-2",
      content: "TODO 内部步骤",
      inputVersion: "content-c4995b97",
      parsed: { kind: "NONE", marker: "TODO", reason: "NO_EXPLICIT_OBJECT_MARKER" },
    },
    {
      externalId: "block-1",
      content: "[任务] 新标题",
      inputVersion: "1002",
      parsed: { kind: "OBJECT", objectType: "TASK", marker: undefined, syntax: "[任务]", title: "新标题" },
    },
  ]]);
  assert.deepEqual(errors, []);
  assert.equal(timers.size, 0);
});

test("debounced delivery failures are surfaced and dispose prevents late delivery", async () => {
  let callback: (() => void) | undefined;
  const errors: unknown[] = [];
  const clock: DebounceClock = {
    setTimeout(next) {
      callback = next;
      return 1;
    },
    clearTimeout() {
      callback = undefined;
    },
  };
  const debouncer = new ExplicitObjectChangeDebouncer({
    clock,
    delayMs: 10,
    async deliver() {
      throw new Error("service unavailable");
    },
    onError(error, batch) {
      errors.push([error instanceof Error ? error.message : error, batch.map((item) => item.externalId)]);
    },
  });
  debouncer.enqueue([{ uuid: "block-fail", content: "[任务] 保留失败证据" }]);
  callback?.();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(errors, [["service unavailable", ["block-fail"]]]);

  debouncer.enqueue([{ uuid: "block-dispose", content: "[任务] 不得迟到提交" }]);
  debouncer.dispose();
  assert.equal(callback, undefined);
  await debouncer.flush();
  assert.equal(errors.length, 1);
});
