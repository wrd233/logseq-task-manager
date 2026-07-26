import assert from "node:assert/strict";
import test from "node:test";

import { renderRestoreRecoveryGuide } from "../src/restore-recovery-guide.ts";

test("confirmed Restore recovery renders one bounded read-only guide without internal identity", () => {
  const html = renderRestoreRecoveryGuide({
    state: "RECOVERY_REQUIRED",
    recoveryPointConfirmed: true,
    recordedAt: "2026-07-26T17:40:00.000Z",
  });
  assert.match(html, /Restore 前正式状态已记录/);
  assert.match(html, /重新核验恢复记录/);
  assert.match(html, /正式写入保持暂停/);
  assert.doesNotMatch(html, /backup_|sqlite|database|路径：/i);
  assert.equal((html.match(/data-action="restore-recovery-refresh"/g) ?? []).length, 1);
});

test("ARMED and INVALID recovery guides never claim a confirmed recovery point", () => {
  for (const status of [
    { state: "ARMED" as const, recoveryPointConfirmed: false, recordedAt: "2026-07-26T17:40:00.000Z" },
    { state: "INVALID" as const, recoveryPointConfirmed: false },
  ]) {
    const html = renderRestoreRecoveryGuide(status);
    assert.match(html, /重新核验/);
    assert.doesNotMatch(html, /已记录|仍保留|可恢复快照/);
  }
  assert.equal(renderRestoreRecoveryGuide({ state: "CLEAR", recoveryPointConfirmed: false }), "");
});
