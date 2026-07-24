import type { ServiceConnectionState } from "@task-copilot/service-client";

export type FirstRunAction = "start" | "migrate";

export interface FirstRunModel {
  connection: ServiceConnectionState;
  selectedAction?: FirstRunAction;
  descriptorImport?: { status: "loading" | "error"; message?: string };
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function guidance(action: FirstRunAction | undefined, descriptorImport: FirstRunModel["descriptorImport"]): string {
  if (action === "start") {
    const loading = descriptorImport?.status === "loading";
    return `<section class="first-run-guidance" role="status"><h2>连接本地 Service</h2>
      <p>选择 Task Copilot Launcher 的 0600 配对 descriptor（推荐），或兼容的 Local Service 0600 descriptor。Task Copilot 会先验证 loopback、协议和字段，再写入插件私有 FileStorage；token 不进入设置、Graph、日志或截图。</p>
      <label>本地运行环境 descriptor 文件<input type="file" accept="application/json,.json" data-field="serviceDescriptorFile"${loading ? " disabled" : ""}></label>
      <button type="button" class="primary" data-action="first-run-import-descriptor"${loading ? ' disabled aria-busy="true"' : ""}>${loading ? "正在安全连接…" : "安全连接"}</button>
      ${descriptorImport?.status === "error" ? `<p class="diagnostic-error" role="alert">${escapeHtml(descriptorImport.message ?? "连接未完成；正式写入仍保持关闭。")}</p>` : ""}
      <p>Launcher 只接收当前 Graph 的不可逆稳定键，并只管理它亲自启动的 Service；该私有文件不是领域状态源。本页不会扫描 Graph、迁移旧状态或调用模型。</p>
    </section>`;
  }
  if (action === "migrate") {
    return `<section class="first-run-guidance" role="status"><h2>迁移现有内容</h2><p>迁移尚未启动，本页也不会读取你的 Recovery Bundle。先按“开始使用”连接 Local Service，再在终端依次运行只读 <code>tc migration scan</code>、带 decisions 文件的 <code>tc migration preview</code> 和 <code>tc backup create</code>。</p><p>只有 <code>migration import</code>、<code>undo</code> 与 <code>activate</code> 会改变正式状态，并分别要求命令行显示的精确确认短语；可随时用 <code>tc migration show &lt;run_id&gt;</code> 查看并在 Service 重启后继续。FileStorage 与 SQLite 不会双写。</p></section>`;
  }
  return "";
}

export function renderFirstRunWelcome(model: FirstRunModel): string {
  const reason = model.connection.status === "RESTRICTED" ? model.connection.reasonCode : undefined;
  return `<section class="app-shell first-run-shell">
    <header class="topbar"><div><div class="eyebrow">个人事务运行系统 V2</div><h1>欢迎使用 Task Copilot</h1></div></header>
    <main class="workspace first-run-workspace">
      <p>首次启用处于受限模式：Logseq 正文编辑不受影响，正式领域写入尚未开放。</p>
      <p class="muted">Local Service: ${escapeHtml(model.connection.status)}${reason ? ` · ${escapeHtml(reason)}` : ""}</p>
      <div class="first-run-entries" aria-label="首次启用入口">
        <button type="button" class="primary" data-action="first-run-start" data-first-run-entry="true">开始使用</button>
        <button type="button" data-action="first-run-migrate" data-first-run-entry="true">迁移现有内容</button>
        <button type="button" data-action="first-run-status" data-first-run-entry="true">检查系统状态</button>
      </div>
      ${guidance(model.selectedAction, model.descriptorImport)}
    </main>
  </section>`;
}
