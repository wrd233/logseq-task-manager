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

function fakeBootstrap(): {
  host: BootstrapHost;
  toolbar: Array<{ key: string; template: string }>;
  commands: Array<{ key: string; label: string; action: () => unknown }>;
  blockContextMenus: Array<{ label: string; action: (event: { uuid: string }) => Promise<void> }>;
  pageContextMenus: Array<{ label: string; action: (event: { page: string }) => Promise<void> }>;
  models: Record<string, (...args: unknown[]) => unknown>;
  styles: Array<Record<string, string | number>>;
} {
  const toolbar: Array<{ key: string; template: string }> = [];
  const commands: Array<{ key: string; label: string; action: () => unknown }> = [];
  const blockContextMenus: Array<{ label: string; action: (event: { uuid: string }) => Promise<void> }> = [];
  const pageContextMenus: Array<{ label: string; action: (event: { page: string }) => Promise<void> }> = [];
  const models: Record<string, (...args: unknown[]) => unknown> = {};
  const styles: Array<Record<string, string | number>> = [];
  return {
    toolbar,
    commands,
    blockContextMenus,
    pageContextMenus,
    models,
    styles,
    host: {
      setMainUIInlineStyle: (style) => { styles.push(style); },
      provideModel: (value) => { Object.assign(models, value); },
      provideStyle: () => undefined,
      App: {
        registerUIItem: (_type, options) => { toolbar.push(options); },
        registerCommandPalette: (options, action) => { commands.push({ ...options, action }); },
        registerPageMenuItem: (label, action) => { pageContextMenus.push({ label, action }); },
      },
      Editor: {
        registerSlashCommand: () => undefined,
        registerBlockContextMenuItem: (label, action) => { blockContextMenus.push({ label, action }); },
      },
    },
  };
}

test("all formal UI, Toolbar, model, command, DOM and portal identifiers are CSS-safe and unique", () => {
  assert.equal(PLUGIN_ID, "task-copilot-personal-mvp");
  const values = [TOOLBAR_KEY, UI_NAMESPACE, MODEL_OPEN, MODEL_DIAGNOSTICS, MAIN_UI_ROOT_ID, ...Object.values(COMMAND_KEYS)];
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
  for (const label of ["Task Copilot", "Runtime Diagnostics", "Copy diagnostics", "V2 Local Service", "SERVICE_DESCRIPTOR_PATH_REQUIRED", "Review Center", "Now Work", "Projects", "Audit / Recovery", "damaged store"]) {
    assert.match(html, new RegExp(label));
  }
  assert.doesNotMatch(html, /data-action="recover-previous-slot"/);
  assert.doesNotMatch(html, /data-action="source-resolver-probe"/);
  assert.doesNotMatch(html, /data-action="inbox-action-probe"/);
  assert.match(html, /data-test="diagnostics-extension"[\s\S]*Primary Anchor repair/);
  assert.equal(snapshot.feature_flags.v2_formal_writes_available, false);
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
    capture: () => { opened.push("capture"); },
    openReview: () => { opened.push("review"); },
    openNowWork: () => { opened.push("now"); },
    diagnostics: () => { opened.push("diagnostics"); },
    toggleBlockFocus: async (blockUuid) => { opened.push(`block-focus:${blockUuid}`); },
    undoBlockFocus: async () => { opened.push("block-focus-undo"); },
    openBlockCondition: async (blockUuid) => { opened.push(`block-condition:${blockUuid}`); },
    undoBlockCondition: async () => { opened.push("block-condition-undo"); },
    openPageContext: async (page) => { opened.push(`page-context:${page}`); },
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
  assert.throws(() => { throw new Error("simulated persistence failure"); });
  const diagnostics = new RuntimeDiagnostics();
  diagnostics.start("PERSISTENCE_READY");
  diagnostics.fail("PERSISTENCE_READY", new Error("simulated persistence failure"));
  diagnostics.setStoreStatus("READ_ONLY_SAFE_MODE");
  fake.commands.find((command) => command.label === "Task Copilot: Open")?.action();
  fake.commands.find((command) => command.label === "Task Copilot: Runtime Diagnostics")?.action();
  await fake.blockContextMenus[0]?.action({ uuid: "block-ctx-1" });
  await fake.blockContextMenus[1]?.action({ uuid: "block-ctx-2" });
  await fake.blockContextMenus[2]?.action({ uuid: "ignored" });
  await fake.blockContextMenus[3]?.action({ uuid: "ignored" });
  await fake.pageContextMenus[0]?.action({ page: "page-ctx-1" });
  assert.deepEqual(opened, ["open", "diagnostics", "block-focus:block-ctx-1", "block-condition:block-ctx-2", "block-focus-undo", "block-condition-undo", "page-context:page-ctx-1"]);
  assert.equal(fake.toolbar.length, 2);
  assert.match(fake.toolbar[0]!.template, /data-toolbar-mode="quiet"/);
  assert.match(fake.toolbar[1]!.template, /toolbar-badge[^>]*>③</);
  assert.equal(fake.commands.length, 5);
  assert.equal(fake.blockContextMenus.length, 4);
  assert.equal(fake.pageContextMenus.length, 1);
  assert.equal(typeof fake.models[MODEL_OPEN], "function");
  fake.models[MODEL_OPEN]?.();
  assert.equal(opened.at(-1), "toolbar");
  assert.match(renderRuntimeDiagnostics(diagnostics.snapshot()), /PERSISTENCE_READY[\s\S]*simulated persistence failure/);
});

test("bootstrap registrar prevents duplicate registration and applies visible Main UI geometry", () => {
  const fake = fakeBootstrap();
  const noop = () => undefined;
  const callbacks: BootstrapCallbacks = {
    open: noop,
    openToolbar: noop,
    capture: noop,
    openReview: noop,
    openNowWork: noop,
    diagnostics: noop,
    toggleBlockFocus: async () => undefined,
    undoBlockFocus: async () => undefined,
    openBlockCondition: async () => undefined,
    undoBlockCondition: async () => undefined,
    openPageContext: async () => undefined,
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
  assert.equal(fake.toolbar.length, 1);
  assert.equal(fake.commands.length, 5);
  assert.deepEqual(fake.blockContextMenus.map(({ label }) => label), [
    BLOCK_CONTEXT_LABELS.toggleFocus,
    BLOCK_CONTEXT_LABELS.blockCondition,
    BLOCK_CONTEXT_LABELS.undoFocus,
    BLOCK_CONTEXT_LABELS.undoCondition,
  ]);
  assert.deepEqual(fake.pageContextMenus.map(({ label }) => label), [PAGE_CONTEXT_LABEL]);
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
