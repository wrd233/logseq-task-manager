import type { LauncherRestoreRecoveryStatus } from "@task-copilot/service-client/launcher";

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function recordedTime(value: string | undefined): string {
  if (!value) return "未知";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "未知";
  return new Date(timestamp).toLocaleString("zh-CN", { hour12: false });
}

export function renderRestoreRecoveryGuide(
  status: LauncherRestoreRecoveryStatus | undefined,
  options: { prepared?: boolean; busy?: boolean; applyAvailable?: boolean } = {},
): string {
  if (!status || status.state === "CLEAR") return "";
  if (status.state === "RECOVERY_REQUIRED") {
    if (options.prepared) {
      return `<section class="card restore-recovery-guide" aria-label="Restore 手工恢复审阅">
        <div class="eyebrow">高影响恢复 · 最终确认</div>
        <h2>恢复 Restore 前的正式状态</h2>
        <p>系统将使用已确认的恢复点替换当前不确定的正式状态；当前状态会先保存为新的安全快照。</p>
        <ul><li>Logseq 正文不会被改写。</li><li>恢复点和当前 Graph 会在执行时重新校验。</li><li>只有 Doctor 通过后才会解除正式写入保护。</li></ul>
        <label><input type="checkbox" data-field="restoreRecoveryConfirm"${options.busy ? " disabled" : ""}> 我确认恢复 Restore 前的正式状态</label>
        <div class="actions"><button type="button" data-action="restore-recovery-apply" class="danger"${options.busy || !options.applyAvailable ? " disabled" : ""}>${options.busy ? "恢复与校验中…" : "确认恢复"}</button>${options.busy ? "" : '<button type="button" data-action="restore-recovery-cancel">返回</button>'}</div>
      </section>`;
    }
    return `<section class="card restore-recovery-guide" aria-label="Restore 人工恢复">
      <div class="eyebrow">受控恢复 · 只读核验</div>
      <h2>Restore 前正式状态已记录</h2>
      <p>系统已确认本次 Restore 在切换前保存过恢复点；普通 reload 不会绕过安全锁。</p>
      <dl><div><dt>记录时间</dt><dd>${escapeHtml(recordedTime(status.recordedAt))}</dd></div><div><dt>当前保护</dt><dd>正式写入保持暂停，Logseq 正文仍可编辑。</dd></div></dl>
      <p class="muted">恢复动作执行前仍会重新校验恢复点和当前 Graph；此处不显示数据库路径或内部快照标识。</p>
      <div class="actions"><button type="button" data-action="restore-recovery-prepare" class="primary"${options.applyAvailable ? "" : " disabled"}>准备恢复</button><button type="button" data-action="restore-recovery-refresh">重新核验</button></div>
    </section>`;
  }
  if (status.state === "ARMED") {
    return `<section class="card restore-recovery-guide" aria-label="Restore 人工核验">
      <div class="eyebrow">受控恢复 · 信息不足</div>
      <h2>尚不能确认恢复点完整</h2>
      <p>Restore 在恢复点确认前中断。系统不会把未验证文件描述成可恢复状态，也不会开放正式写入。</p>
      <div class="actions"><button type="button" data-action="restore-recovery-refresh" class="primary">重新核验安全记录</button></div>
    </section>`;
  }
  return `<section class="card restore-recovery-guide" aria-label="Restore 恢复记录异常">
    <div class="eyebrow">受控恢复 · 保持只读</div>
    <h2>恢复身份仍无法安全确认</h2>
    <p>安全记录可能损坏、权限异常或正被另一个恢复操作占用。系统没有猜测恢复点，也没有自动删除记录。</p>
    <div class="actions"><button type="button" data-action="restore-recovery-refresh" class="primary">重新核验安全记录</button></div>
  </section>`;
}
