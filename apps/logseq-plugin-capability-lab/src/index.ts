import "@logseq/libs";
import {
  DEFAULT_EXPERIMENT_PAGE,
  PLUGIN_ID,
  canDeleteBlock,
  formatError,
  isCapabilityLabContent,
  makeExperimentContent,
  normalizeSettings,
  summarizeText,
  type LabSettings,
} from "./domain";

type CapabilityStatus = "pending" | "pass" | "fail" | "manual" | "unsupported";
type Entity = Record<string, any> & { id?: number; uuid?: string; content?: string; name?: string };

interface Capability {
  id: string;
  name: string;
  api: string;
  status: CapabilityStatus;
  detail: string;
}

interface StoredRegistry {
  createdUuids: string[];
  updatedAt: string;
}

interface RuntimeState {
  ready: boolean;
  settings: LabSettings;
  context: Record<string, unknown>;
  createdUuids: Set<string>;
  operationLog: string[];
  eventLog: string[];
  queryResults: Array<{ uuid: string; summary: string }>;
  storageResult: unknown;
  lastError: string | null;
  capabilities: Capability[];
}

const REGISTRY_KEY = "capability-lab/created-blocks.json";
const STORAGE_TEST_KEY = "capability-lab/storage-probe.json";
const MAX_LOG_ENTRIES = 40;
const queriedApp = document.querySelector<HTMLElement>("#app");
const offHooks: Array<() => void> = [];

if (!queriedApp) {
  throw new Error("Capability Lab root element #app is unavailable.");
}
const app: HTMLElement = queriedApp;

const state: RuntimeState = {
  ready: false,
  settings: normalizeSettings(undefined),
  context: {},
  createdUuids: new Set(),
  operationLog: [],
  eventLog: [],
  queryResults: [],
  storageResult: "尚未运行",
  lastError: null,
  capabilities: [
    { id: "lifecycle", name: "Lifecycle", api: "logseq.ready / beforeunload", status: "pending", detail: "Waiting for Logseq runtime." },
    { id: "toolbar", name: "Toolbar", api: "App.registerUIItem", status: "manual", detail: "Use the flask button to open this panel." },
    { id: "command", name: "Command palette", api: "App.registerCommandPalette", status: "manual", detail: "Run 'Open Logseq Plugin Capability Lab'." },
    { id: "slash", name: "Slash command", api: "Editor.registerSlashCommand", status: "manual", detail: "Run '/Open Capability Lab' while editing." },
    { id: "context", name: "Current context", api: "App.getCurrentGraph / Editor.getCurrentPage / getCurrentBlock", status: "pending", detail: "Not read yet." },
    { id: "page", name: "Page operations", api: "Editor.getPage / createPage / App.pushState", status: "pending", detail: "Not run yet." },
    { id: "block", name: "Block CRUD", api: "Editor append/get/update/insert/remove", status: "pending", detail: "Not run yet." },
    { id: "uuid", name: "UUID reread", api: "Editor.getBlock(uuid)", status: "pending", detail: "Not run yet." },
    { id: "query", name: "Query", api: "DB.datascriptQuery", status: "pending", detail: "Not run yet." },
    { id: "ui", name: "Main UI", api: "showMainUI / hideMainUI", status: "manual", detail: "Visible panel confirms rendering; record manually." },
    { id: "settings", name: "Settings", api: "useSettingsSchema / onSettingsChanged", status: "manual", detail: "Change, reload, and confirm persistence manually." },
    { id: "storage", name: "FileStorage", api: "FileStorage.setItem / getItem", status: "pending", detail: "Not run yet." },
    { id: "events", name: "Events", api: "App.onRouteChanged / onCurrentGraphChanged / DB.onChanged", status: "manual", detail: "Trigger events in Logseq and inspect the event log." },
    { id: "metadata", name: "Structured properties", api: "insertBlock options.properties", status: "pending", detail: "Not run yet." },
    { id: "anchor", name: "Anchor stability", api: "Block UUID + manual move/delete/undo", status: "manual", detail: "Follow MANUAL_TEST_GUIDE.md; never uses real blocks." },
    { id: "editing-event", name: "Editing-state event", api: "No dedicated stable hook in @logseq/libs 0.0.17", status: "unsupported", detail: "Current editing block can be read on demand; a dedicated edit-state event is not claimed." },
    { id: "errors", name: "Error handling", api: "guarded actions + normalized errors", status: "pending", detail: "Runtime actions report the latest error." },
  ],
};

function currentSettings(): LabSettings {
  return normalizeSettings((logseq.settings ?? {}) as Record<string, unknown>);
}

function updateCapability(id: string, status: CapabilityStatus, detail: string): void {
  const capability = state.capabilities.find((item) => item.id === id);
  if (capability) {
    capability.status = status;
    capability.detail = detail;
  }
}

function appendLimited(target: string[], entry: string): void {
  target.unshift(`${new Date().toISOString()} ${entry}`);
  target.splice(MAX_LOG_ENTRIES);
}

function logOperation(message: string, detail?: unknown): void {
  const suffix = detail === undefined ? "" : ` ${summarizeText(JSON.stringify(detail), 240)}`;
  appendLimited(state.operationLog, `${message}${suffix}`);
  if (state.settings.verboseLogging) {
    console.info(`[${PLUGIN_ID}] ${message}`, detail ?? "");
  }
}

function logEvent(message: string, detail?: unknown): void {
  appendLimited(state.eventLog, `${message} ${summarizeText(JSON.stringify(detail), 200)}`);
  render();
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function json(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "当前不可用（无法序列化）";
  }
}

function render(): void {
  const statusLabel: Record<CapabilityStatus, string> = {
    pending: "尚未验证",
    pass: "运行时通过",
    fail: "失败",
    manual: "待人工验证",
    unsupported: "当前不支持/不确定",
  };
  const rows = state.capabilities.map((capability) => `
    <tr>
      <td>${escapeHtml(capability.name)}</td>
      <td><code>${escapeHtml(capability.api)}</code></td>
      <td class="status status-${capability.status}">${statusLabel[capability.status]}</td>
      <td>${escapeHtml(capability.detail)}</td>
    </tr>`).join("");
  const operations = state.operationLog.length
    ? state.operationLog.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")
    : "<li>尚无操作</li>";
  const events = state.eventLog.length
    ? state.eventLog.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")
    : "<li>尚无事件</li>";

  app.innerHTML = `
    <section class="lab-panel">
      <header class="lab-header">
        <div><h1>Logseq Plugin Capability Lab</h1><p>File Graph 实验边界：${escapeHtml(state.settings.experimentPageName)}</p></div>
        <button class="close" data-action="close" aria-label="Close Capability Lab">×</button>
      </header>
      <div class="ready-banner">Ready: ${state.ready ? "yes" : "no"} · 已记录测试块: ${state.createdUuids.size} · Query 结果: ${state.queryResults.length}</div>
      ${state.lastError ? `<div class="error-banner"><strong>最近错误：</strong>${escapeHtml(state.lastError)}</div>` : ""}
      <div class="actions">
        <button data-action="context">读取当前上下文</button>
        <button data-action="open-page">查找/创建/打开实验页</button>
        <button data-action="crud">运行 Block CRUD</button>
        <button data-action="query">查询实验块</button>
        <button data-action="storage">写入并读取私有存储</button>
        <button class="danger" data-action="cleanup">清理本插件创建的块</button>
      </div>
      <p class="muted">所有写入操作都需要明确点击；删除还会校验 UUID 注册表、双重标记和所属页面。</p>
      <h2>能力矩阵（运行时视图）</h2>
      <table class="capabilities"><thead><tr><th>能力</th><th>API</th><th>状态</th><th>详情</th></tr></thead><tbody>${rows}</tbody></table>
      <h2>当前上下文</h2><pre>${escapeHtml(json(state.context))}</pre>
      <h2>FileStorage 结果</h2><pre>${escapeHtml(json(state.storageResult))}</pre>
      <h2>最近操作</h2><ol class="log">${operations}</ol>
      <h2>稳定 API 事件</h2><ol class="log">${events}</ol>
    </section>`;
}

async function persistRegistry(): Promise<void> {
  const value: StoredRegistry = {
    createdUuids: [...state.createdUuids],
    updatedAt: new Date().toISOString(),
  };
  await logseq.FileStorage.setItem(REGISTRY_KEY, JSON.stringify(value, null, 2));
}

async function loadRegistry(): Promise<void> {
  const raw = await logseq.FileStorage.getItem(REGISTRY_KEY);
  if (typeof raw !== "string" || raw.length === 0) return;
  const parsed = JSON.parse(raw) as Partial<StoredRegistry>;
  if (Array.isArray(parsed.createdUuids)) {
    state.createdUuids = new Set(parsed.createdUuids.filter((value): value is string => typeof value === "string"));
  }
}

async function resolvePageName(block: Entity): Promise<string | null> {
  const pageId = block.page?.id;
  if (typeof pageId !== "number") return null;
  const page = await logseq.Editor.getPage(pageId);
  return page?.originalName ?? page?.name ?? null;
}

async function ensureExperimentPage(): Promise<Entity> {
  const pageName = state.settings.experimentPageName;
  let page = await logseq.Editor.getPage(pageName);
  if (!page) {
    page = await logseq.Editor.createPage(
      pageName,
      { "capability-lab": true, "capability-lab-owner": PLUGIN_ID },
      { redirect: false, createFirstBlock: false, format: "markdown" },
    );
    if (!page) throw new Error("Logseq did not return the newly created experiment page.");
    logOperation("Created dedicated experiment page", { pageName, uuid: page.uuid });
  } else {
    logOperation("Found dedicated experiment page", { pageName, uuid: page.uuid });
  }
  updateCapability("page", "pass", `Found or created ${pageName}; UUID ${page.uuid}.`);
  return page;
}

async function refreshContext(): Promise<void> {
  const [graph, page, block] = await Promise.all([
    logseq.App.getCurrentGraph(),
    logseq.Editor.getCurrentPage(),
    logseq.Editor.getCurrentBlock(),
  ]);
  state.context = {
    graph: graph ? { name: graph.name, path: graph.path, url: graph.url } : "当前不可用",
    page: page ? {
      id: page.id,
      uuid: page.uuid,
      name: "name" in page ? page.name : "当前不可用",
      originalName: "originalName" in page ? page.originalName : "当前不可用",
    } : "当前不可用",
    editingBlock: block ? {
      id: block.id,
      uuid: block.uuid,
      content: block.content || "当前不可用",
      parent: block.parent ?? "当前不可用",
      page: block.page ?? "当前不可用",
      children: block.children ?? "当前不可用",
    } : "当前不可用",
  };
  updateCapability("context", "pass", "Graph, page, and editing block APIs returned without error; absent values are shown as 当前不可用.");
  logOperation("Read current context", state.context);
}

async function openExperimentPage(): Promise<void> {
  if (!confirmWrite("This may create the dedicated experiment page if it does not exist. Continue?")) return;
  await ensureExperimentPage();
  logseq.App.pushState("page", { name: state.settings.experimentPageName });
  logOperation("Opened dedicated experiment page", state.settings.experimentPageName);
}

function confirmWrite(message: string): boolean {
  return !state.settings.confirmWrites || window.confirm(message);
}

async function runCrudExperiment(): Promise<void> {
  if (!confirmWrite(`Create and update marked test blocks only on '${state.settings.experimentPageName}'?`)) return;
  await ensureExperimentPage();
  const runId = `run-${Date.now()}`;
  const initialContent = makeExperimentContent("Capability Lab parent block", runId);
  const parent = await logseq.Editor.appendBlockInPage(state.settings.experimentPageName, initialContent, {
    properties: { "capability-lab": true, "capability-lab-owner": PLUGIN_ID, "capability-lab-run": runId },
  });
  if (!parent?.uuid) throw new Error("Parent block creation returned no UUID.");
  state.createdUuids.add(parent.uuid);
  await persistRegistry();
  logOperation("Created parent block", { uuid: parent.uuid, runId });

  const createdRead = await logseq.Editor.getBlock(parent.uuid, { includeChildren: true });
  if (!createdRead) throw new Error(`Could not read created block ${parent.uuid}.`);

  const updatedContent = makeExperimentContent("Capability Lab parent block (updated)", runId);
  await logseq.Editor.updateBlock(parent.uuid, updatedContent, {
    properties: { "capability-lab": true, "capability-lab-owner": PLUGIN_ID, "capability-lab-run": runId },
  });
  const afterUpdate = await logseq.Editor.getBlock(parent.uuid, { includeChildren: true });
  if (!afterUpdate || !isCapabilityLabContent(afterUpdate.content)) {
    throw new Error("Updated parent block could not be reread with safety markers.");
  }

  const child = await logseq.Editor.insertBlock(
    parent.uuid,
    makeExperimentContent("Capability Lab child block", runId),
    {
      sibling: false,
      properties: { "capability-lab": true, "capability-lab-owner": PLUGIN_ID, "capability-lab-run": runId },
    },
  );
  if (!child?.uuid) throw new Error("Child block creation returned no UUID.");
  state.createdUuids.add(child.uuid);
  await persistRegistry();

  const [parentWithChildren, childByUuid] = await Promise.all([
    logseq.Editor.getBlock(parent.uuid, { includeChildren: true }),
    logseq.Editor.getBlock(child.uuid, { includeChildren: true }),
  ]);
  if (!parentWithChildren || !childByUuid) throw new Error("Parent/child UUID reread failed.");

  const parentPageName = await resolvePageName(parentWithChildren as Entity);
  if (parentPageName !== state.settings.experimentPageName) {
    throw new Error(`Safety boundary mismatch: created block resolved to page '${parentPageName ?? "unknown"}'.`);
  }

  updateCapability("block", "pass", `Created, read, updated, and added child. Parent ${parent.uuid}; child ${child.uuid}.`);
  updateCapability("uuid", "pass", `Both blocks were reread by UUID; update preserved parent UUID ${parent.uuid}.`);
  updateCapability("metadata", "pass", `Structured properties and visible safety markers were reread for run ${runId}.`);
  logOperation("Completed Block CRUD experiment", {
    parentUuid: parent.uuid,
    childUuid: child.uuid,
    parentField: childByUuid.parent ?? "当前不可用",
    childrenField: parentWithChildren.children ?? "当前不可用",
  });
}

async function runQueryExperiment(): Promise<void> {
  const rows = await logseq.DB.datascriptQuery<Array<[Entity]>>(`
    [:find (pull ?b [:block/uuid :block/content :block/properties])
     :where
     [?b :block/properties ?properties]
     [(get ?properties :capability-lab) ?marker]]
  `);
  state.queryResults = (rows ?? [])
    .map((row) => row[0])
    .filter((block): block is Entity & { uuid: string; content: string } => Boolean(block?.uuid) && isCapabilityLabContent(block?.content))
    .map((block) => ({ uuid: block.uuid, summary: summarizeText(block.content) }));
  updateCapability("query", "pass", `DataScript Query returned ${state.queryResults.length} plugin-owned marked block(s) after JS owner-marker filtering.`);
  logOperation("Queried capability lab properties via DataScript", state.queryResults.slice(0, 10));
}

async function runStorageExperiment(): Promise<void> {
  const probe = {
    kind: "non-sensitive-capability-lab-probe",
    pluginId: PLUGIN_ID,
    writtenAt: new Date().toISOString(),
    pageName: state.settings.experimentPageName,
  };
  await logseq.FileStorage.setItem(STORAGE_TEST_KEY, JSON.stringify(probe, null, 2));
  const raw = await logseq.FileStorage.getItem(STORAGE_TEST_KEY);
  state.storageResult = typeof raw === "string" ? JSON.parse(raw) : raw;
  updateCapability("storage", "pass", `Wrote and reread ${STORAGE_TEST_KEY}. Physical location/sync behavior remains manual/undocumented.`);
  logOperation("Completed FileStorage round trip", state.storageResult);
}

async function cleanupCreatedBlocks(): Promise<void> {
  if (!window.confirm("Delete only registered, marked Capability Lab blocks on the configured experiment page? The page itself will remain.")) return;
  const uuids = [...state.createdUuids].reverse();
  let removed = 0;
  const refused: string[] = [];

  for (const uuid of uuids) {
    const block = await logseq.Editor.getBlock(uuid, { includeChildren: true });
    if (!block) {
      state.createdUuids.delete(uuid);
      continue;
    }
    const pageName = await resolvePageName(block as Entity);
    const decision = canDeleteBlock(
      { uuid, content: block.content, pageName },
      state.createdUuids,
      state.settings.experimentPageName,
    );
    if (!decision.allowed) {
      refused.push(`${uuid}: ${decision.reason}`);
      continue;
    }
    await logseq.Editor.removeBlock(uuid);
    const afterDelete = await logseq.Editor.getBlock(uuid);
    if (afterDelete) {
      refused.push(`${uuid}: UUID still resolves after removeBlock.`);
      continue;
    }
    state.createdUuids.delete(uuid);
    removed += 1;
  }

  await persistRegistry();
  if (refused.length) {
    throw new Error(`Cleanup removed ${removed}; refused ${refused.length}: ${refused.join(" | ")}`);
  }
  updateCapability("block", "pass", `Cleanup removed ${removed} registered and marked block(s); experiment page was retained.`);
  logOperation("Cleaned plugin-created test blocks", { removed });
}

async function guarded(actionName: string, action: () => Promise<void>): Promise<void> {
  state.lastError = null;
  try {
    await action();
    updateCapability("errors", "pass", `Last guarded action '${actionName}' completed without an unhandled error.`);
  } catch (error) {
    state.lastError = `${actionName}: ${formatError(error)}`;
    updateCapability("errors", "fail", state.lastError);
    console.error(`[${PLUGIN_ID}]`, error);
  } finally {
    render();
  }
}

function openCapabilityLab(): void {
  logseq.showMainUI({ autoFocus: true });
  void guarded("refresh context", refreshContext);
}

function bindUi(): void {
  app.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action;
    if (!action) return;
    const actions: Record<string, () => void> = {
      close: () => logseq.hideMainUI({ restoreEditingCursor: true }),
      context: () => void guarded("read context", refreshContext),
      "open-page": () => void guarded("open experiment page", openExperimentPage),
      crud: () => void guarded("Block CRUD", runCrudExperiment),
      query: () => void guarded("DataScript query", runQueryExperiment),
      storage: () => void guarded("FileStorage round trip", runStorageExperiment),
      cleanup: () => void guarded("cleanup", cleanupCreatedBlocks),
    };
    actions[action]?.();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") logseq.hideMainUI({ restoreEditingCursor: true });
  });
}

function registerEntrypoints(): void {
  logseq.App.registerUIItem("toolbar", {
    key: "open-logseq-plugin-capability-lab",
    template: `<a class="button" data-on-click="openCapabilityLab" title="Open Logseq Plugin Capability Lab" aria-label="Open Logseq Plugin Capability Lab">🧪</a>`,
  });
  logseq.App.registerCommandPalette(
    { key: "open-logseq-plugin-capability-lab", label: "Open Logseq Plugin Capability Lab" },
    openCapabilityLab,
  );
  logseq.Editor.registerSlashCommand("Open Capability Lab", async () => {
    openCapabilityLab();
  });
}

function registerEvents(): void {
  offHooks.push(logseq.App.onRouteChanged((event) => logEvent("route changed", { path: event.path, template: event.template })));
  offHooks.push(logseq.App.onCurrentGraphChanged((event) => logEvent("current graph changed", event)));
  offHooks.push(logseq.DB.onChanged((event) => {
    const marked = event.blocks?.filter((block) => isCapabilityLabContent(block.content)) ?? [];
    if (marked.length > 0) logEvent("marked block transaction", { count: marked.length, txMeta: event.txMeta });
  }));
  offHooks.push(logseq.onSettingsChanged((next, previous) => {
    state.settings = normalizeSettings(next as Record<string, unknown>);
    updateCapability("settings", "pass", `Settings change event observed. Page is '${state.settings.experimentPageName}'. Reload persistence still requires manual verification.`);
    logEvent("settings changed", { next, previous });
  }));
}

async function main(): Promise<void> {
  state.settings = currentSettings();
  bindUi();
  registerEntrypoints();
  registerEvents();
  logseq.setMainUIInlineStyle({ position: "fixed", inset: "52px 0 auto 0", zIndex: 99 });
  logseq.provideStyle(`
    div[data-injected-ui=open-logseq-plugin-capability-lab-${logseq.baseInfo.id}] {
      display: inline-flex;
      align-items: center;
      font-size: 18px;
    }
  `);
  await loadRegistry();
  state.ready = true;
  updateCapability("lifecycle", "pass", `Plugin initialized as ${logseq.baseInfo.id}; unload hook registered.`);
  logOperation("Capability Lab ready", { pluginId: logseq.baseInfo.id, settings: state.settings });
  render();
  console.info(`[${PLUGIN_ID}] ready`);

  logseq.beforeunload(async () => {
    for (const off of offHooks.splice(0)) off();
    await persistRegistry();
    logseq.hideMainUI();
    console.info(`[${PLUGIN_ID}] unloaded`);
  });
}

const settingsSchema = [
  { key: "verboseLogging", type: "boolean" as const, default: false, title: "Verbose logging", description: "Write detailed capability lab diagnostics to the Logseq developer console." },
  { key: "experimentPageName", type: "string" as const, default: DEFAULT_EXPERIMENT_PAGE, title: "Experiment page name", description: "The only page on which this plugin may create marked test blocks." },
  { key: "confirmWrites", type: "boolean" as const, default: true, title: "Confirm Graph writes", description: "Ask for confirmation before page or block write experiments." },
];

logseq.useSettingsSchema(settingsSchema);
logseq.ready({ openCapabilityLab }).then(main).catch((error: unknown) => {
  console.error(`[${PLUGIN_ID}] initialization failed`, error);
});
