import assert from "node:assert/strict";
import test from "node:test";

import { BootstrapRegistration, COMMAND_KEYS, bindRootClick, type BootstrapCallbacks, type BootstrapHost } from "../src/bootstrap-shell.ts";
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
  models: Record<string, (...args: unknown[]) => unknown>;
  styles: Array<Record<string, string | number>>;
} {
  const toolbar: Array<{ key: string; template: string }> = [];
  const commands: Array<{ key: string; label: string; action: () => unknown }> = [];
  const models: Record<string, (...args: unknown[]) => unknown> = {};
  const styles: Array<Record<string, string | number>> = [];
  return {
    toolbar,
    commands,
    models,
    styles,
    host: {
      setMainUIInlineStyle: (style) => { styles.push(style); },
      provideModel: (value) => { Object.assign(models, value); },
      provideStyle: () => undefined,
      App: {
        registerUIItem: (_type, options) => { toolbar.push(options); },
        registerCommandPalette: (options, action) => { commands.push({ ...options, action }); },
      },
      Editor: { registerSlashCommand: () => undefined },
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
  const html = renderRuntimeDiagnostics(snapshot);
  for (const label of ["Task Copilot", "Runtime Diagnostics", "Copy diagnostics", "恢复上一可读 Slot", "V2 Local Service", "SERVICE_DESCRIPTOR_PATH_REQUIRED", "Inbox", "Now Work", "Projects", "Audit / Recovery", "damaged store"]) {
    assert.match(html, new RegExp(label));
  }
  assert.doesNotMatch(html, /data-action="source-resolver-probe"/);
  assert.equal(snapshot.feature_flags.v2_formal_writes_available, false);
});

test("UI mount failure uses pure HTML diagnostics fallback", () => {
  const root = { innerHTML: "" };
  const result = mountWithDiagnosticFallback(root, () => { throw new Error("renderer failed"); }, () => "<h1>Runtime Diagnostics</h1>");
  assert.equal(result.fallbackUsed, true);
  assert.equal(root.innerHTML, "<h1>Runtime Diagnostics</h1>");
});

test("bootstrap registrations survive a simulated feature initialization failure", () => {
  const fake = fakeBootstrap();
  const opened: string[] = [];
  const callbacks: BootstrapCallbacks = {
    open: () => { opened.push("open"); },
    capture: () => { opened.push("capture"); },
    openInbox: () => { opened.push("inbox"); },
    openNowWork: () => { opened.push("now"); },
    diagnostics: () => { opened.push("diagnostics"); },
  };
  const registration = new BootstrapRegistration();
  registration.registerToolbar(fake.host);
  registration.registerCommands(fake.host, callbacks);
  registration.registerMainUi(fake.host, callbacks);
  assert.throws(() => { throw new Error("simulated persistence failure"); });
  const diagnostics = new RuntimeDiagnostics();
  diagnostics.start("PERSISTENCE_READY");
  diagnostics.fail("PERSISTENCE_READY", new Error("simulated persistence failure"));
  diagnostics.setStoreStatus("READ_ONLY_SAFE_MODE");
  fake.commands.find((command) => command.label === "Task Copilot: Open")?.action();
  fake.commands.find((command) => command.label === "Task Copilot: Runtime Diagnostics")?.action();
  assert.deepEqual(opened, ["open", "diagnostics"]);
  assert.equal(fake.toolbar.length, 1);
  assert.equal(fake.commands.length, 5);
  assert.equal(typeof fake.models[MODEL_OPEN], "function");
  assert.match(renderRuntimeDiagnostics(diagnostics.snapshot()), /PERSISTENCE_READY[\s\S]*simulated persistence failure/);
});

test("bootstrap registrar prevents duplicate registration and applies visible Main UI geometry", () => {
  const fake = fakeBootstrap();
  const noop = () => undefined;
  const callbacks: BootstrapCallbacks = { open: noop, capture: noop, openInbox: noop, openNowWork: noop, diagnostics: noop };
  const registration = new BootstrapRegistration();
  assert.equal(registration.registerToolbar(fake.host), true);
  assert.equal(registration.registerToolbar(fake.host), false);
  assert.equal(registration.registerCommands(fake.host, callbacks), true);
  assert.equal(registration.registerCommands(fake.host, callbacks), false);
  assert.equal(registration.registerMainUi(fake.host, callbacks), true);
  assert.equal(registration.registerMainUi(fake.host, callbacks), false);
  assert.equal(fake.toolbar.length, 1);
  assert.equal(fake.commands.length, 5);
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
