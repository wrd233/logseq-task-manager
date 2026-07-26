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
      return `<section class="card restore-recovery-guide" aria-label="人工恢复最终确认">
        <div class="eyebrow">高影响恢复 · 最终确认</div>
        <h2>恢复到切换前的状态</h2>
        <p>系统将使用已确认的恢复点替换当前不确定状态；当前状态会先另存，避免丢失。</p>
        <ul><li>Logseq 正文不会被改写。</li><li>恢复点和当前知识库会在执行时重新核验。</li><li>只有完整性检查通过后才会恢复应用修改。</li></ul>
        <label><input type="checkbox" data-field="restoreRecoveryConfirm"${options.busy ? " disabled" : ""}> 我确认恢复到切换前的状态</label>
        <div class="actions"><button type="button" data-action="restore-recovery-apply" class="danger"${options.busy || !options.applyAvailable ? " disabled" : ""}>${options.busy ? "恢复与校验中…" : "确认恢复"}</button>${options.busy ? "" : '<button type="button" data-action="restore-recovery-cancel">返回</button>'}</div>
      </section>`;
    }
    return `<section class="card restore-recovery-guide" aria-label="人工恢复">
      <div class="eyebrow">受控恢复 · 安全核验</div>
      <h2>切换前的状态已安全保留</h2>
      <p>系统已确认切换前保存过可用恢复点；普通重新载入无法跳过当前保护。</p>
      <dl><div><dt>记录时间</dt><dd>${escapeHtml(recordedTime(status.recordedAt))}</dd></div><div><dt>当前保护</dt><dd>暂时不能应用正式修改，Logseq 正文仍可编辑。</dd></div></dl>
      <p class="muted">恢复前仍会重新核验恢复点和当前知识库。</p>
      <div class="actions"><button type="button" data-action="restore-recovery-prepare" class="primary"${options.applyAvailable ? "" : " disabled"}>准备恢复</button><button type="button" data-action="restore-recovery-refresh">重新核验</button></div>
    </section>`;
  }
  if (status.state === "ARMED") {
    return `<section class="card restore-recovery-guide" aria-label="恢复核验">
      <div class="eyebrow">受控恢复 · 信息不足</div>
      <h2>尚不能确认恢复点完整</h2>
      <p>上次状态切换在恢复点确认前中断。系统不会把未经核验的内容描述成可恢复状态，也不会允许应用正式修改。</p>
      <div class="actions"><button type="button" data-action="restore-recovery-refresh" class="primary">重新核验安全记录</button></div>
    </section>`;
  }
  return `<section class="card restore-recovery-guide" aria-label="恢复记录异常">
    <div class="eyebrow">受控恢复 · 保持只读</div>
    <h2>恢复身份仍无法安全确认</h2>
    <p>安全记录可能损坏、权限异常或正被另一个恢复操作占用。系统没有猜测恢复点，也没有自动删除记录。</p>
    <div class="actions"><button type="button" data-action="restore-recovery-refresh" class="primary">重新核验安全记录</button></div>
  </section>`;
}
