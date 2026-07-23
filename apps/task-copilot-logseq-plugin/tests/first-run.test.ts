import assert from "node:assert/strict";
import test from "node:test";

import { renderFirstRunWelcome } from "../src/first-run.ts";

const restricted = {
  status: "RESTRICTED" as const,
  reasonCode: "SERVICE_DESCRIPTOR_PATH_REQUIRED",
  message: "not configured",
  formalWritesAvailable: false as const,
  graphEditingAvailable: true as const,
};

test("first-run welcome exposes exactly the three bounded entries", () => {
  const html = renderFirstRunWelcome({ connection: restricted });
  assert.equal((html.match(/data-first-run-entry="true"/g) ?? []).length, 3);
  assert.match(html, />开始使用<\/button>/);
  assert.match(html, />迁移现有内容<\/button>/);
  assert.match(html, />检查系统状态<\/button>/);
  assert.match(html, /SERVICE_DESCRIPTOR_PATH_REQUIRED/);
  assert.doesNotMatch(html, /data-action="(?:scan|commit|model|provider)/);
});

test("first-run actions explain setup and preserve explicit migration", () => {
  const start = renderFirstRunWelcome({ connection: restricted, selectedAction: "start" });
  assert.match(start, /0600 descriptor/);
  assert.match(start, /type="file"/);
  assert.match(start, /accept="application\/json,.json"/);
  assert.match(start, /data-field="serviceDescriptorFile"/);
  assert.match(start, /data-action="first-run-import-descriptor"/);
  assert.match(start, /token 不进入设置、Graph、日志或截图/);
  assert.match(start, /不会扫描 Graph、迁移旧状态或调用模型/);

  const migrate = renderFirstRunWelcome({ connection: restricted, selectedAction: "migrate" });
  assert.match(migrate, /迁移尚未启动/);
  assert.match(migrate, /tc migration scan/);
  assert.match(migrate, /tc migration preview/);
  assert.match(migrate, /tc backup create/);
  assert.match(migrate, /migration import/);
  assert.match(migrate, /tc migration show/);
  assert.match(migrate, /精确确认短语/);
  assert.match(migrate, /不会双写/);
});

test("descriptor import exposes loading and sanitized failure without a second submit", () => {
  const loading = renderFirstRunWelcome({
    connection: restricted,
    selectedAction: "start",
    descriptorImport: { status: "loading" },
  });
  assert.match(loading, /正在安全连接/);
  assert.match(loading, /aria-busy="true"/);
  assert.equal((loading.match(/ disabled/g) ?? []).length, 2);

  const failed = renderFirstRunWelcome({
    connection: restricted,
    selectedAction: "start",
    descriptorImport: { status: "error", message: "<路径与 token 不公开>" },
  });
  assert.match(failed, /role="alert"/);
  assert.match(failed, /&lt;路径与 token 不公开&gt;/);
  assert.doesNotMatch(failed, /<路径与 token 不公开>/);
});
