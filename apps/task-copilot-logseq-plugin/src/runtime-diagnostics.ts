import { escapeHtml } from "./ui.ts";
import { privateErrorEvidence } from "./private-error-evidence.ts";
import { deriveUserSystemStatus } from "./user-system-status.ts";

export const PLUGIN_ID = "task-copilot-personal-mvp";
export const PLUGIN_VERSION = "0.1.0";
declare const __TASK_COPILOT_COMMIT__: string;
export const PLUGIN_COMMIT = typeof __TASK_COPILOT_COMMIT__ === "string" ? __TASK_COPILOT_COMMIT__ : "development";
export const UI_NAMESPACE = "task-copilot-main-ui";
export const MODEL_OPEN = "task-copilot-open-main-ui";
export const MODEL_DIAGNOSTICS = "task-copilot-runtime-diagnostics";
export const TOOLBAR_KEY = "task-copilot-personal-mvp-toolbar";
export const MAIN_UI_ROOT_ID = "task-copilot-personal-mvp-root";

const CSS_SAFE_IDENTIFIER = /^[A-Za-z][A-Za-z0-9_-]*$/;

export function assertCssSafeIdentifier(value: string): string {
  if (!CSS_SAFE_IDENTIFIER.test(value)) throw new Error(`Unsafe UI identifier: ${value}`);
  return value;
}

export function sanitizeUiKey(value: string): string {
  const sanitized = value.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  const withLetter = /^[A-Za-z]/.test(sanitized) ? sanitized : `ui-${sanitized || "item"}`;
  return assertCssSafeIdentifier(withLetter);
}

for (const identifier of [UI_NAMESPACE, MODEL_OPEN, MODEL_DIAGNOSTICS, TOOLBAR_KEY, MAIN_UI_ROOT_ID]) assertCssSafeIdentifier(identifier);

export const RUNTIME_STAGES = [
  "BOOTSTRAP_STARTED",
  "TOOLBAR_REGISTERED",
  "COMMANDS_REGISTERED",
  "MAIN_UI_REGISTERED",
  "SETTINGS_READY",
  "SERVICE_CONNECTION_READY",
  "RUNTIME_ADAPTER_READY",
  "PERSISTENCE_READY",
  "MIGRATION_READY",
  "APPLICATION_READY",
  "EVENTS_READY",
  "PLUGIN_READY",
] as const;

export type RuntimeStage = (typeof RUNTIME_STAGES)[number];
export type RuntimeStageStatus = "PENDING" | "RUNNING" | "READY" | "FAILED";

export interface RuntimeStageRecord {
  stage: RuntimeStage;
  started_at?: string;
  completed_at?: string;
  status: RuntimeStageStatus;
  error_name?: string;
  error_code?: string;
  recoverability: "RETRYABLE" | "READ_ONLY_SAFE_MODE" | "NOT_APPLICABLE";
}

export interface RuntimeDiagnosticsSnapshot {
  plugin_id: string;
  plugin_version: string;
  runtime_status: "BOOTSTRAPPING" | "READY" | "DEGRADED";
  store_status: "NOT_STARTED" | "READY" | "READ_ONLY_SAFE_MODE";
  store_schema: string;
  current_graph: string;
  logseq_version: string;
  feature_flags: Record<string, boolean | string>;
  service_connection: {
    status: "NOT_CHECKED" | "READY" | "RESTRICTED";
    reason_code?: string;
    formal_writes_available: boolean;
    graph_editing_available: true;
    capabilities?: { formalWrites: boolean; migration: boolean; provider: boolean; backup: boolean };
  };
  recovery_state: string;
  notice?: { code: string; message: string; next_step: string };
  stages: RuntimeStageRecord[];
  latest_error?: RuntimeStageRecord;
  plugin_commit?: string;
  persistence_backend?: string;
  pending_semantic_commits?: number | "unavailable";
  recovery_required_commits?: number | "unavailable";
  source_anchor_conflicts?: number | "unavailable";
  explicit_sync?: { pending: number; transportReady: boolean; reconciliationRequired: boolean };
  event_listener_status?: Record<string, boolean>;
  recent_logs?: unknown[];
  recent_action_failure?: unknown;
}

function errorDetail(error: unknown): Pick<RuntimeStageRecord, "error_name" | "error_code"> {
  const evidence = privateErrorEvidence(error);
  return {
    error_name: evidence.errorName,
    error_code: evidence.errorCode,
  };
}

export class RuntimeDiagnostics {
  private readonly records = new Map<RuntimeStage, RuntimeStageRecord>();
  private storeStatus: RuntimeDiagnosticsSnapshot["store_status"] = "NOT_STARTED";
  private currentGraph = "unavailable";
  private logseqVersion = "unavailable";
  private recoveryState = "not checked";
  private storeSchema = "unknown (not loaded)";
  private notice: RuntimeDiagnosticsSnapshot["notice"];
  private serviceConnection: RuntimeDiagnosticsSnapshot["service_connection"] = {
    status: "NOT_CHECKED",
    formal_writes_available: false,
    graph_editing_available: true,
  };

  constructor() {
    for (const stage of RUNTIME_STAGES) {
      this.records.set(stage, { stage, status: "PENDING", recoverability: "NOT_APPLICABLE" });
    }
  }

  start(stage: RuntimeStage): void {
    this.records.set(stage, { stage, started_at: new Date().toISOString(), status: "RUNNING", recoverability: "RETRYABLE" });
  }

  ready(stage: RuntimeStage): void {
    const previous = this.records.get(stage);
    this.records.set(stage, {
      stage,
      started_at: previous?.started_at ?? new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: "READY",
      recoverability: "NOT_APPLICABLE",
    });
  }

  fail(stage: RuntimeStage, error: unknown, recoverability: RuntimeStageRecord["recoverability"] = "READ_ONLY_SAFE_MODE"): void {
    const previous = this.records.get(stage);
    this.records.set(stage, {
      stage,
      started_at: previous?.started_at ?? new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: "FAILED",
      recoverability,
      ...errorDetail(error),
    });
  }

  setEnvironment(graph: string, logseqVersion: string): void {
    this.currentGraph = graph;
    this.logseqVersion = logseqVersion;
  }

  setStoreStatus(status: RuntimeDiagnosticsSnapshot["store_status"]): void {
    this.storeStatus = status;
  }

  setStoreSchema(value: string): void {
    this.storeSchema = value;
  }

  setNotice(notice: RuntimeDiagnosticsSnapshot["notice"]): void {
    this.notice = notice;
  }

  setRecoveryState(value: string): void {
    this.recoveryState = value;
  }

  setServiceConnection(value: {
    status: "READY" | "RESTRICTED";
    formalWritesAvailable: boolean;
    graphEditingAvailable: true;
    reasonCode?: string;
    capabilities?: { formalWrites: boolean; migration: boolean; provider: boolean; backup: boolean };
  }): void {
    this.serviceConnection = {
      status: value.status,
      formal_writes_available: value.formalWritesAvailable,
      graph_editing_available: value.graphEditingAvailable,
      ...(value.reasonCode ? { reason_code: value.reasonCode } : {}),
      ...(value.capabilities ? { capabilities: value.capabilities } : {}),
    };
  }

  snapshot(): RuntimeDiagnosticsSnapshot {
    const stages = RUNTIME_STAGES.map((stage) => this.records.get(stage)!);
    const latest_error = stages.slice().reverse().find((record) => record.status === "FAILED");
    const ready = this.records.get("PLUGIN_READY")?.status === "READY";
    return {
      plugin_id: PLUGIN_ID,
      plugin_version: PLUGIN_VERSION,
      runtime_status: ready ? "READY" : latest_error ? "DEGRADED" : "BOOTSTRAPPING",
      store_status: this.storeStatus,
      store_schema: this.storeSchema,
      current_graph: this.currentGraph,
      logseq_version: this.logseqVersion,
      feature_flags: {
        agent_provider: "none_or_demo",
        graph_writes_require_explicit_action: true,
        move_content: false,
        v2_formal_writes_available: this.serviceConnection.formal_writes_available,
      },
      service_connection: this.serviceConnection,
      recovery_state: this.recoveryState,
      stages,
      ...(this.notice ? { notice: this.notice } : {}),
      ...(latest_error ? { latest_error } : {}),
    };
  }
}

export function renderRuntimeDiagnostics(snapshot: RuntimeDiagnosticsSnapshot, extensionHtml = "", userExtensionHtml = ""): string {
  const userStatus = deriveUserSystemStatus(snapshot);
  const rows = snapshot.stages.map((record) => `<tr><td><code>${escapeHtml(record.stage)}</code></td><td>${escapeHtml(record.status)}</td><td>${escapeHtml(record.started_at ?? "-")}</td><td>${escapeHtml(record.completed_at ?? "-")}</td><td>${escapeHtml(record.recoverability)}</td></tr>`).join("");
  const latest = snapshot.latest_error
    ? `<section class="diagnostic-error"><h2>最近错误</h2><p><strong>${escapeHtml(snapshot.latest_error.stage)}</strong> · ${escapeHtml(snapshot.latest_error.error_name ?? "Error")} · <code>${escapeHtml(snapshot.latest_error.error_code ?? "UNCLASSIFIED_ERROR")}</code></p><p>默认诊断只保留结构化错误名和错误码，不保存异常正文、堆栈或 cause。</p><p>下一步：复制诊断和 Console 中的 [Task Copilot] 结构化日志；不要反复执行写入操作。当前保持只读安全模式。</p></section>`
    : `<section><h2>最近错误</h2><p>无。</p></section>`;
  return `<section class="app-shell diagnostics-shell" data-task-copilot-ui="${UI_NAMESPACE}">
    <header class="topbar"><div><div class="eyebrow">系统状态</div><h1>${escapeHtml(userStatus.headline)}</h1></div><button type="button" data-action="close" class="quiet">关闭</button></header>
    <main class="workspace diagnostics-workspace">
      <section class="user-system-status status-${userStatus.level.toLowerCase()}" aria-label="用户系统状态" data-narration-rule="${escapeHtml(userStatus.narrationRuleId)}">
        <div class="eyebrow">${userStatus.level === "READY" ? "可以正常使用" : userStatus.level === "ATTENTION" ? "需要留意" : "部分能力已暂停"}</div>
        ${userStatus.keyEvidence.length ? `<p class="muted">${userStatus.keyEvidence.map((value) => escapeHtml(value)).join(" · ")}</p>` : ""}
        <dl>
          <div><dt>发生了什么</dt><dd>${escapeHtml(userStatus.whatHappened)}</dd></div>
          <div><dt>哪些能力受影响</dt><dd>${escapeHtml(userStatus.affected)}</dd></div>
          <div><dt>哪些仍可用</dt><dd>${escapeHtml(userStatus.stillAvailable)}</dd></div>
          <div><dt>数据是否安全</dt><dd>${escapeHtml(userStatus.dataSafety)}</dd></div>
          <div><dt>是否需要我操作</dt><dd>${escapeHtml(userStatus.actionRequired)}</dd></div>
        </dl>
      </section>
      ${userExtensionHtml}
      <details class="technical-diagnostics">
        <summary>展开技术诊断</summary>
        <div class="technical-diagnostics-body">
          <div class="eyebrow">Runtime Diagnostics</div>
          <div class="top-actions"><button type="button" data-action="copy-diagnostics" class="primary">复制诊断信息 / Copy diagnostics</button><button type="button" data-action="export-diagnostics">导出 JSONL</button><button type="button" data-action="clear-diagnostics">清空内存日志</button><button type="button" data-action="toggle-debug">切换 Debug Log</button></div>
          ${snapshot.notice ? `<section class="diagnostic-notice"><strong>${escapeHtml(snapshot.notice.code)}</strong><p>${escapeHtml(snapshot.notice.message)}</p><p>${escapeHtml(snapshot.notice.next_step)}</p></section>` : ""}
          <div class="diagnostic-grid"><section><h2>Runtime 状态</h2><p>${escapeHtml(snapshot.runtime_status)}</p></section><section><h2>Store 状态</h2><p>${escapeHtml(snapshot.store_status)} · schema ${escapeHtml(snapshot.store_schema)} · ${escapeHtml(snapshot.persistence_backend ?? "unknown")}</p></section><section><h2>V2 Local Service</h2><p>${escapeHtml(snapshot.service_connection.status)}${snapshot.service_connection.reason_code ? ` · ${escapeHtml(snapshot.service_connection.reason_code)}` : ""} · formal writes ${escapeHtml(snapshot.service_connection.formal_writes_available)}</p></section><section><h2>当前 Graph</h2><p>${escapeHtml(snapshot.current_graph)}</p></section><section><h2>版本</h2><p>Plugin ${escapeHtml(snapshot.plugin_version)} · Commit ${escapeHtml(snapshot.plugin_commit ?? "unknown")} · Logseq ${escapeHtml(snapshot.logseq_version)}</p></section><section><h2>Pending / Recovery / Source Conflict</h2><p>${escapeHtml(snapshot.pending_semantic_commits ?? 0)} / ${escapeHtml(snapshot.recovery_required_commits ?? 0)} / ${escapeHtml(snapshot.source_anchor_conflicts ?? 0)}</p></section><section><h2>Explicit sync</h2><p>${escapeHtml(JSON.stringify(snapshot.explicit_sync ?? { pending: 0, transportReady: false, reconciliationRequired: false }))}</p></section><section><h2>Event listeners</h2><p>${escapeHtml(JSON.stringify(snapshot.event_listener_status ?? {}))}</p></section></div>
          <nav class="diagnostic-nav"><span>Now Work</span><span>Review Center</span><span>Projects</span><span>Audit / Recovery</span><strong>Diagnostics</strong></nav>
          ${extensionHtml}
          <section><h2>Runtime stages</h2><div class="diagnostic-table-wrap"><table class="diagnostic-table"><thead><tr><th>Stage</th><th>Status</th><th>Started</th><th>Completed</th><th>Recoverability</th></tr></thead><tbody>${rows}</tbody></table></div></section>
          ${latest}
          <section><h2>Feature flags</h2><pre>${escapeHtml(JSON.stringify(snapshot.feature_flags, null, 2))}</pre></section>
          <section><h2>Recovery state</h2><p>${escapeHtml(snapshot.recovery_state)}</p></section>
          <section><h2>最近结构化日志（上限受控）</h2><pre>${escapeHtml(JSON.stringify(snapshot.recent_logs ?? [], null, 2))}</pre></section>
        </div>
      </details>
    </main>
  </section>`;
}

export function mountWithDiagnosticFallback(
  root: Pick<HTMLElement, "innerHTML">,
  renderPrimary: () => string,
  renderFallback: () => string,
): { fallbackUsed: boolean; error?: unknown } {
  try {
    root.innerHTML = renderPrimary();
    return { fallbackUsed: false };
  } catch (error) {
    root.innerHTML = renderFallback();
    return { fallbackUsed: true, error };
  }
}
