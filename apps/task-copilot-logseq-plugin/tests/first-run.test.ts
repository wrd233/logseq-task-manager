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
  assert.match(start, /不会扫描 Graph、迁移旧状态或调用模型/);

  const migrate = renderFirstRunWelcome({ connection: restricted, selectedAction: "migrate" });
  assert.match(migrate, /迁移尚未启动/);
  assert.match(migrate, /只有你显式确认/);
  assert.match(migrate, /不会双写/);
});
