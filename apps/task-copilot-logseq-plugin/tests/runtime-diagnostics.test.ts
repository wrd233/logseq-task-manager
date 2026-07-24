import assert from "node:assert/strict";
import test from "node:test";

import { BLOCK_CONTEXT_LABELS, PAGE_CONTEXT_LABEL, BootstrapRegistration, COMMAND_KEYS, bindRootClick, captureUiFocus, restoreUiFocus, type BootstrapCallbacks, type BootstrapHost } from "../src/bootstrap-shell.ts";
import {
  MAIN_UI_ROOT_ID,
  MODEL_DIAGNOSTICS,
  MODEL_OPEN,
  PLUGIN_ID,
  RUNTIME_STAGES,
  RuntimeDiagnostics,
  TOOLBAR_KEY,
  UI_NAMESPACE,
  assertCssSafeIdentifier,
  mountWithDiagnosticFallback,
  renderRuntimeDiagnostics,
  sanitizeUiKey,
} from "../src/runtime-diagnostics.ts";
import { MODEL_PROJECT_REENTRY, PROJECT_PAGE_HEAD_UI_KEY } from "../src/project-page-head-action.ts";

function fakeBootstrap(): {
  host: BootstrapHost;
  toolbar: Array<{ key: string; template: string }>;
  commands: Array<{ key: string; label: string; action: () => unknown }>;
  slashCommands: Array<{ label: string; action: () => unknown }>;
  blockContextMenus: Array<{ label: string; action: (event: { uuid: string }) => Promise<void> }>;
  pageContextMenus: Array<{ label: string; action: (event: { page: string }) => Promise<void> }>;
  models: Record<string, (...args: unknown[]) => unknown>;
  styles: Array<Record<string, string | number>>;
  pageHeadSlots: Array<(event: { slot: string }) => void>;
  providedUi: Array<{ key: string; slot: string; template: string | null }>;
} {
  const toolbar: Array<{ key: string; template: string }> = [];
  const commands: Array<{ key: string; label: string; action: () => unknown }> = [];
  const slashCommands: Array<{ label: string; action: () => unknown }> = [];
  const blockContextMenus: Array<{ label: string; action: (event: { uuid: string }) => Promise<void> }> = [];
  const pageContextMenus: Array<{ label: string; action: (event: { page: string }) => Promise<void> }> = [];
  const models: Record<string, (...args: unknown[]) => unknown> = {};
  const styles: Array<Record<string, string | number>> = [];
  const pageHeadSlots: Array<(event: { slot: string }) => void> = [];
  const providedUi: Array<{ key: string; slot: string; template: string | null }> = [];
  return {
    toolbar,
    commands,
    slashCommands,
    blockContextMenus,
    pageContextMenus,
    models,
    styles,
    pageHeadSlots,
    providedUi,
    host: {
      setMainUIInlineStyle: (style) => { styles.push(style); },
      provideModel: (value) => { Object.assign(models, value); },
      provideStyle: () => undefined,
      provideUI: (value) => { providedUi.push(value); },
      UI: {
        checkSlotValid: async () => true,
      },
      App: {
        registerUIItem: (_type, options) => { toolbar.push(options); },
        registerCommandPalette: (options, action) => { commands.push({ ...options, action }); },
        registerPageMenuItem: (label, action) => { pageContextMenus.push({ label, action }); },
        onPageHeadActionsSlotted: (callback) => { pageHeadSlots.push(callback); },
      },
      Editor: {
        registerSlashCommand: (label, action) => { slashCommands.push({ label, action }); },
        registerBlockContextMenuItem: (label, action) => { blockContextMenus.push({ label, action }); },
      },
    },
  };
}

test("all formal UI, Toolbar, model, command, DOM and portal identifiers are CSS-safe and unique", () => {
  assert.equal(PLUGIN_ID, "task-copilot-personal-mvp");
  const values = [TOOLBAR_KEY, UI_NAMESPACE, MODEL_OPEN, MODEL_DIAGNOSTICS, MODEL_PROJECT_REENTRY, PROJECT_PAGE_HEAD_UI_KEY, MAIN_UI_ROOT_ID, ...Object.values(COMMAND_KEYS)];
  for (const value of values) assert.match(assertCssSafeIdentifier(value), /^[A-Za-z][A-Za-z0-9_-]*$/);
  assert.equal(new Set(values).size, values.length);
  for (const reserved of ["open-logseq-plugin-capability-lab", "ai-task-copilot-logseq-bridge"]) assert.equal(values.includes(reserved), false);
});

test("slash and selector metacharacters are rejected rather than silently used as UI keys", () => {
  for (const invalid of ["task/copilot", "task copilot", "task:copilot", "task.copilot", "task#copilot", "task[copilot]"]) {
    assert.throws(() => assertCssSafeIdentifier(invalid), /Unsafe UI identifier/);
    assert.match(sanitizeUiKey(invalid), /^[A-Za-z][A-Za-z0-9_-]*$/);
  }
});

test("initialization failure retains all runtime stages and renders a diagnostic shell", () => {
  const diagnostics = new RuntimeDiagnostics();
  diagnostics.start("BOOTSTRAP_STARTED");
  diagnostics.ready("BOOTSTRAP_STARTED");
  diagnostics.start("PERSISTENCE_READY");
  diagnostics.fail("PERSISTENCE_READY", new Error("damaged store"));
  diagnostics.setStoreStatus("READ_ONLY_SAFE_MODE");
  diagnostics.setServiceConnection({
    status: "RESTRICTED",
    reasonCode: "SERVICE_DESCRIPTOR_PATH_REQUIRED",
    formalWritesAvailable: false,
    graphEditingAvailable: true,
  });
  const snapshot = diagnostics.snapshot();
  assert.equal(snapshot.stages.length, RUNTIME_STAGES.length);
  assert.equal(snapshot.runtime_status, "DEGRADED");
  assert.equal(snapshot.latest_error?.stage, "PERSISTENCE_READY");
  const html = renderRuntimeDiagnostics(snapshot, '<section data-test="diagnostics-extension">Primary Anchor repair</section>');
  for (const label of ["Task Copilot", "Runtime Diagnostics", "Copy diagnostics", "V2 Local Service", "SERVICE_DESCRIPTOR_PATH_REQUIRED", "Review Center", "Now Work", "Projects", "Audit / Recovery", "UNCLASSIFIED_ERROR"]) {
    assert.match(html, new RegExp(label));
  }
  assert.doesNotMatch(html, /damaged store/);
  assert.doesNotMatch(html, /data-action="recover-previous-slot"/);
  assert.doesNotMatch(html, /data-action="source-resolver-probe"/);
  assert.doesNotMatch(html, /data-action="inbox-action-probe"/);
  assert.match(html, /data-test="diagnostics-extension"[\s\S]*Primary Anchor repair/);
  assert.equal(snapshot.feature_flags.v2_formal_writes_available, false);
});

test("runtime diagnostics retains only structural error evidence in snapshots and rendered exports", () => {
  const diagnostics = new RuntimeDiagnostics();
  diagnostics.start("APPLICATION_READY");
  const privateError = Object.assign(
    new Error("private block body and provider response", { cause: new Error("private key") }),
    { code: "APPLICATION_BOOT_FAILED" },
  );
  diagnostics.fail("APPLICATION_READY", privateError);

  const snapshot = diagnostics.snapshot();
  const serialized = JSON.stringify(snapshot);
  const html = renderRuntimeDiagnostics(snapshot);
  assert.equal(snapshot.latest_error?.error_name, "Error");
  assert.equal(snapshot.latest_error?.error_code, "APPLICATION_BOOT_FAILED");
  for (const privateValue of ["private block body", "provider response", "private key", "error_message", "stack"]) {
    assert.doesNotMatch(serialized, new RegExp(privateValue));
    assert.doesNotMatch(html, new RegExp(privateValue));
  }
});

test("runtime diagnostics makes the bounded explicit-sync recovery state visible", () => {
  const diagnostics = new RuntimeDiagnostics();
  const html = renderRuntimeDiagnostics({
    ...diagnostics.snapshot(),
    explicit_sync: { pending: 1, transportReady: false, reconciliationRequired: true },
  });
  assert.match(html, /Explicit sync/);
  assert.match(html, /&quot;pending&quot;:1/);
  assert.match(html, /&quot;reconciliationRequired&quot;:true/);
});

test("system status answers the five user questions before keeping engineering diagnostics collapsed", () => {
  const diagnostics = new RuntimeDiagnostics();
  diagnostics.setStoreStatus("READY");
  diagnostics.setStoreSchema("v12");
  diagnostics.setEnvironment("personal-graph", "0.10.15");
  diagnostics.setServiceConnection({
    status: "READY",
    formalWritesAvailable: true,
    graphEditingAvailable: true,
    capabilities: { formalWrites: true, migration: true, provider: false, backup: true },
  });
  for (const stage of RUNTIME_STAGES) {
    diagnostics.start(stage);
    diagnostics.ready(stage);
  }
  const html = renderRuntimeDiagnostics({
    ...diagnostics.snapshot(),
    pending_semantic_commits: 0,
    recovery_required_commits: 0,
    source_anchor_conflicts: 0,
    explicit_sync: { pending: 0, transportReady: true, reconciliationRequired: false },
  });
  const detailBoundary = html.indexOf('<details class="technical-diagnostics">');
  assert.ok(detailBoundary > 0);
  for (const label of ["发生了什么", "哪些能力受影响", "哪些仍可用", "数据是否安全", "是否需要我操作"]) {
    const labelIndex = html.indexOf(label);
    assert.ok(labelIndex >= 0 && labelIndex < detailBoundary, `${label} should be user-visible before technical diagnostics`);
  }
  assert.match(html.slice(0, detailBoundary), /Task Copilot 可以正常使用/);
  assert.match(html.slice(0, detailBoundary), /Agent 分析未启用/);
  assert.doesNotMatch(html.slice(0, detailBoundary), /READY|v12|personal-graph|Runtime Diagnostics|Copy diagnostics/);
  assert.match(html.slice(detailBoundary), /Runtime Diagnostics[\s\S]*Copy diagnostics[\s\S]*v12[\s\S]*personal-graph/);
});

test("runtime diagnostics keeps user repair content outside collapsed engineering details", () => {
  const diagnostics = new RuntimeDiagnostics();
  const html = renderRuntimeDiagnostics(
    diagnostics.snapshot(),
    '<section data-test="technical-extension">technical only</section>',
    '<section data-test="user-extension">正文连接需要处理</section>',
  );
  const detailBoundary = html.indexOf('<details class="technical-diagnostics">');
  assert.ok(html.indexOf('data-test="user-extension"') < detailBoundary);
  assert.ok(html.indexOf('data-test="technical-extension"') > detailBoundary);
});

test("restricted system status explains safety before exposing reason codes on demand", () => {
  const diagnostics = new RuntimeDiagnostics();
  diagnostics.setStoreStatus("READ_ONLY_SAFE_MODE");
  diagnostics.setServiceConnection({
    status: "RESTRICTED",
    reasonCode: "SERVICE_GRAPH_MISMATCH",
    formalWritesAvailable: false,
    graphEditingAvailable: true,
  });
  const html = renderRuntimeDiagnostics({
    ...diagnostics.snapshot(),
    pending_semantic_commits: "unavailable",
    recovery_required_commits: "unavailable",
    source_anchor_conflicts: "unavailable",
  });
  const detailBoundary = html.indexOf('<details class="technical-diagnostics">');
  assert.match(html.slice(0, detailBoundary), /当前 Graph 与正式状态不匹配/);
  assert.match(html.slice(0, detailBoundary), /Logseq 正文仍可编辑/);
  assert.doesNotMatch(html.slice(0, detailBoundary), /SERVICE_GRAPH_MISMATCH|READ_ONLY_SAFE_MODE/);
  assert.match(html.slice(detailBoundary), /SERVICE_GRAPH_MISMATCH/);
});

test("UI mount failure uses pure HTML diagnostics fallback", () => {
  const root = { innerHTML: "" };
  const result = mountWithDiagnosticFallback(root, () => { throw new Error("renderer failed"); }, () => "<h1>Runtime Diagnostics</h1>");
  assert.equal(result.fallbackUsed, true);
  assert.equal(root.innerHTML, "<h1>Runtime Diagnostics</h1>");
});

test("bootstrap registrations survive a simulated feature initialization failure", async () => {
  const fake = fakeBootstrap();
  const opened: string[] = [];
  const callbacks: BootstrapCallbacks = {
    open: () => { opened.push("open"); },
    openToolbar: () => { opened.push("toolbar"); },
    processCurrentBlock: () => { opened.push("process-current-block"); },
    openReview: () => { opened.push("review"); },
    openNowWork: () => { opened.push("now"); },
    toggleCurrentBlockFocus: () => { opened.push("toggle-current-focus"); },
    diagnostics: () => { opened.push("diagnostics"); },
    createTask: () => { opened.push("create-task"); },
    createMiniProject: () => { opened.push("create-mini-project"); },
    createDecision: () => { opened.push("create-decision"); },
    createOutput: () => { opened.push("create-output"); },
    processBlock: async (blockUuid) => { opened.push(`process-block:${blockUuid}`); },
    toggleBlockFocus: async (blockUuid) => { opened.push(`block-focus:${blockUuid}`); },
    undoBlockFocus: async () => { opened.push("block-focus-undo"); },
    openBlockCondition: async (blockUuid) => { opened.push(`block-condition:${blockUuid}`); },
    undoBlockCondition: async () => { opened.push("block-condition-undo"); },
    openPageContext: async (page) => { opened.push(`page-context:${page}`); },
    openProjectReentry: async () => { opened.push("project-reentry"); },
    observeProjectPageHeadSlot: (slot) => { opened.push(`page-head:${slot}`); },
  };
  const registration = new BootstrapRegistration();
  registration.registerToolbar(fake.host);
  registration.updateToolbar(fake.host, {
    mode: "attention",
    count: 3,
    target: "review",
    title: "Task Copilot：3 项需要介入",
    counts: { dueReview: 1, pendingConfirmation: 1, acceptedNotApplied: 1, pendingCommit: 0, formalConnectionRisk: 0 },
  });
  registration.registerCommands(fake.host, callbacks);
  registration.registerBlockContextMenus(fake.host, callbacks);
  registration.registerPageContextMenu(fake.host, callbacks);
  registration.registerMainUi(fake.host, callbacks);
  registration.registerProjectPageHeadAction(fake.host, callbacks);
  assert.throws(() => { throw new Error("simulated persistence failure"); });
  const diagnostics = new RuntimeDiagnostics();
  diagnostics.start("PERSISTENCE_READY");
  diagnostics.fail("PERSISTENCE_READY", new Error("simulated persistence failure"));
  diagnostics.setStoreStatus("READ_ONLY_SAFE_MODE");
  fake.commands.find((command) => command.label === "Task Copilot：打开")?.action();
  fake.commands.find((command) => command.label === "Task Copilot：系统状态与技术诊断")?.action();
  fake.commands.find((command) => command.label === "Task Copilot：处理当前 Block")?.action();
  fake.commands.find((command) => command.label === "Task Copilot：加入或移出当前关注")?.action();
  for (const slash of fake.slashCommands) slash.action();
  await fake.blockContextMenus[0]?.action({ uuid: "ordinary-or-query-result" });
  await fake.blockContextMenus[1]?.action({ uuid: "block-ctx-1" });
  await fake.blockContextMenus[2]?.action({ uuid: "block-ctx-2" });
  await fake.blockContextMenus[3]?.action({ uuid: "ignored" });
  await fake.blockContextMenus[4]?.action({ uuid: "ignored" });
  await fake.pageContextMenus[0]?.action({ page: "page-ctx-1" });
  assert.deepEqual(opened, [
    "open",
    "diagnostics",
    "process-current-block",
    "toggle-current-focus",
    "create-task",
    "create-mini-project",
    "create-decision",
    "create-output",
    "process-block:ordinary-or-query-result",
    "block-focus:block-ctx-1",
    "block-condition:block-ctx-2",
    "block-focus-undo",
    "block-condition-undo",
    "page-context:page-ctx-1",
  ]);
  assert.equal(fake.toolbar.length, 2);
  assert.match(fake.toolbar[0]!.template, /data-toolbar-mode="quiet"/);
  assert.match(fake.toolbar[1]!.template, /toolbar-badge[^>]*>③</);
  assert.equal(fake.commands.length, 6);
  assert.deepEqual(fake.slashCommands.map(({ label }) => label), [
    "创建任务",
    "创建 MiniProject",
    "创建决策",
    "创建成果",
  ]);
  assert.equal(fake.blockContextMenus.length, 5);
  assert.equal(fake.pageContextMenus.length, 1);
  assert.equal(fake.pageHeadSlots.length, 1);
  assert.equal(typeof fake.models[MODEL_OPEN], "function");
  fake.models[MODEL_OPEN]?.();
  assert.equal(opened.at(-1), "toolbar");
  fake.pageHeadSlots[0]?.({ slot: "project-page-head" });
  assert.equal(opened.at(-1), "page-head:project-page-head");
  fake.models[MODEL_PROJECT_REENTRY]?.();
  assert.equal(opened.at(-1), "project-reentry");
  const diagnosticHtml = renderRuntimeDiagnostics(diagnostics.snapshot());
  assert.match(diagnosticHtml, /PERSISTENCE_READY[\s\S]*UNCLASSIFIED_ERROR/);
  assert.doesNotMatch(diagnosticHtml, /simulated persistence failure/);
});

test("bootstrap registrar prevents duplicate registration and applies visible Main UI geometry", () => {
  const fake = fakeBootstrap();
  const noop = () => undefined;
  const callbacks: BootstrapCallbacks = {
    open: noop,
    openToolbar: noop,
    processCurrentBlock: noop,
    openReview: noop,
    openNowWork: noop,
    toggleCurrentBlockFocus: noop,
    diagnostics: noop,
    createTask: noop,
    createMiniProject: noop,
    createDecision: noop,
    createOutput: noop,
    processBlock: async () => undefined,
    toggleBlockFocus: async () => undefined,
    undoBlockFocus: async () => undefined,
    openBlockCondition: async () => undefined,
    undoBlockCondition: async () => undefined,
    openPageContext: async () => undefined,
    openProjectReentry: async () => undefined,
    observeProjectPageHeadSlot: () => undefined,
  };
  const registration = new BootstrapRegistration();
  assert.equal(registration.registerToolbar(fake.host), true);
  assert.equal(registration.registerToolbar(fake.host), false);
  assert.equal(registration.registerCommands(fake.host, callbacks), true);
  assert.equal(registration.registerCommands(fake.host, callbacks), false);
  assert.equal(registration.registerBlockContextMenus(fake.host, callbacks), true);
  assert.equal(registration.registerBlockContextMenus(fake.host, callbacks), false);
  assert.equal(registration.registerPageContextMenu(fake.host, callbacks), true);
  assert.equal(registration.registerPageContextMenu(fake.host, callbacks), false);
  assert.equal(registration.registerMainUi(fake.host, callbacks), true);
  assert.equal(registration.registerMainUi(fake.host, callbacks), false);
  assert.equal(registration.registerProjectPageHeadAction(fake.host, callbacks), true);
  assert.equal(registration.registerProjectPageHeadAction(fake.host, callbacks), false);
  assert.equal(fake.toolbar.length, 1);
  assert.equal(fake.commands.length, 6);
  assert.deepEqual(fake.slashCommands.map(({ label }) => label), [
    "创建任务",
    "创建 MiniProject",
    "创建决策",
    "创建成果",
  ]);
  assert.deepEqual(fake.blockContextMenus.map(({ label }) => label), [
    BLOCK_CONTEXT_LABELS.processContent,
    BLOCK_CONTEXT_LABELS.toggleFocus,
    BLOCK_CONTEXT_LABELS.blockCondition,
    BLOCK_CONTEXT_LABELS.undoFocus,
    BLOCK_CONTEXT_LABELS.undoCondition,
  ]);
  assert.deepEqual(fake.pageContextMenus.map(({ label }) => label), [PAGE_CONTEXT_LABEL]);
  assert.equal(fake.pageHeadSlots.length, 1);
  assert.deepEqual(fake.styles[0], { position: "fixed", inset: "0", zIndex: 999, width: "100vw", height: "100vh", background: "rgb(11 24 18 / 35%)", opacity: 1 });
});

test("reload cleanup removes the delegated UI listener exactly once", () => {
  let added = 0;
  let removed = 0;
  const root = {
    addEventListener: () => { added += 1; },
    removeEventListener: () => { removed += 1; },
  } as unknown as Pick<HTMLElement, "addEventListener" | "removeEventListener">;
  const cleanup = bindRootClick(root, () => undefined);
  cleanup();
  cleanup();
  assert.deepEqual({ added, removed }, { added: 1, removed: 1 });
});

test("UI refresh restores the same keyboard control without relying on text or DOM position", () => {
  const before = {
    dataset: { action: "review-mode", value: "proposals" },
    getAttribute: (name: string) => name === "data-field" ? null : null,
  } as unknown as HTMLElement;
  const token = captureUiFocus(before);
  assert.deepEqual(token, { action: "review-mode", value: "proposals" });

  let matchingFocused = 0;
  const controls = [
    { dataset: { action: "review-mode", value: "candidates" }, getAttribute: () => null, focus: () => undefined },
    { dataset: { action: "review-mode", value: "proposals" }, getAttribute: () => null, focus: () => { matchingFocused += 1; } },
  ] as unknown as HTMLElement[];
  const root = { querySelectorAll: () => controls } as unknown as Pick<HTMLElement, "querySelectorAll">;
  assert.equal(restoreUiFocus(root, token), true);
  assert.equal(matchingFocused, 1);
  assert.equal(restoreUiFocus(root, { action: "review-mode", value: "missing" }), false);
});
