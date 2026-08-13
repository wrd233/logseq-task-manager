import assert from "node:assert/strict";
import test from "node:test";

import { stableHash, type ManagedProjection } from "@task-copilot/contracts";
import { projectPresentation, renderProjection, reviewFieldUuid } from "../src/projection-renderer.ts";

const core = { containerUuid: "container", titleUuid: "title", stateUuid: "state", focusUuid: "focus", waitingUuid: "waiting", title: "完成测试服务器上架", lifecycle: "OPEN" as const, engagement: "ACTIONABLE" as const, waitingCondition: null, currentFocus: null };
const projection = (overrides: Partial<ManagedProjection> = {}): ManagedProjection => { const value = { ...core, ...overrides }; return { ...value, projectionHash: stableHash(value) }; };

test("zero-noise default renders no managed fields", () => {
  assert.deepEqual(renderProjection(projection()), []);
});

test("focus, waiting, and review use stable identities and deterministic order", () => {
  const waiting = { workObjectId: "work", description: "网络组确认测试 VLAN", since: "2026-08-13T00:00:00.000Z", reviewAt: "2026-08-15", evidenceIds: [] };
  assert.deepEqual(renderProjection(projection({ engagement: "WAITING", currentFocus: "验证管理网络", waitingCondition: waiting })), [
    { kind: "CURRENT_FOCUS", uuid: "focus", value: "验证管理网络", order: 0, content: "**[当前推进]** 验证管理网络" },
    { kind: "WAITING", uuid: "waiting", value: "网络组确认测试 VLAN", order: 1, content: "**[等待]** 网络组确认测试 VLAN" },
    { kind: "REVIEW", uuid: reviewFieldUuid("waiting"), value: "2026-08-15", order: 2, content: "**[复查]** 2026-08-15" },
  ]);
});

test("a domain-normalized midnight review date stays natural in Logseq", () => {
  const waiting = { workObjectId: "work", description: "网络组确认测试 VLAN", since: "2026-08-13T00:00:00.000Z", reviewAt: "2026-08-15T00:00:00.000Z", evidenceIds: [] };
  assert.equal(renderProjection(projection({ engagement: "WAITING", waitingCondition: waiting }))[1]?.content, "**[复查]** 2026-08-15");
});

test("completion is omitted when DONE and title already express the outcome", () => {
  assert.deepEqual(projectPresentation(projection({ lifecycle: "COMPLETED", engagement: null, closure: { type: "COMPLETED", recordId: "record", outcomeSummary: "完成测试服务器上架" } })), []);
  assert.deepEqual(renderProjection(projection({ lifecycle: "COMPLETED", engagement: null, closure: { type: "COMPLETED", recordId: "record", outcomeSummary: "管理口和业务口均已验证" } })), [
    { kind: "COMPLETION", uuid: "state", value: "管理口和业务口均已验证", order: 0, content: "**[完成]** 管理口和业务口均已验证" },
  ]);
});

test("cancellation renders a non-empty reason and empty values are omitted", () => {
  assert.deepEqual(renderProjection(projection({ lifecycle: "CANCELLED", engagement: null, closure: { type: "CANCELLED", recordId: "record", reason: "替代方案已覆盖" } })), [
    { kind: "CANCELLATION", uuid: "state", value: "替代方案已覆盖", order: 0, content: "**[取消]** 替代方案已覆盖" },
  ]);
  assert.deepEqual(renderProjection(projection({ currentFocus: "   " })), []);
});
