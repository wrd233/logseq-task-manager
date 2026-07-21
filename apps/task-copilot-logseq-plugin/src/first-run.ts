import type { ServiceConnectionState } from "@task-copilot/service-client";

export type FirstRunAction = "start" | "migrate";

export interface FirstRunModel {
  connection: ServiceConnectionState;
  selectedAction?: FirstRunAction;
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function guidance(action: FirstRunAction | undefined): string {
  if (action === "start") {
    return `<section class="first-run-guidance" role="status"><h2>开始使用</h2><p>先让本地 Service 把 0600 descriptor 写入 Task Copilot 私有 FileStorage，再在插件设置中填入该文件名并重新加载插件。</p><p>该私有文件只用于会话发现，不是领域状态源；本页不会扫描 Graph、迁移旧状态或调用模型。</p></section>`;
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
      ${guidance(model.selectedAction)}
    </main>
  </section>`;
}
