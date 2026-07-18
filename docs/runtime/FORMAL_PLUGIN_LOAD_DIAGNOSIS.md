# Formal Plugin Load Diagnosis

## 2026-07-18 observed symptom

Logseq Desktop recognized `Task Copilot 0.1.0` as an enabled unpacked plugin, while the formal plugin had no visible Toolbar entry or Main UI. Capability Lab and the separately installed Bridge did expose their entries. Command Palette presence was not established before the fix.

This is runtime evidence that the former automatic `PLG-*` checks did not prove successful Desktop bootstrap.

## Root cause

The first repaired Desktop run produced decisive evidence for two independent runtime defects:

```text
SyntaxError: Failed to execute 'querySelector' on 'Document':
'#injected-ui-item-task-copilot-personal-mvp/toolbar-task-copilot-personal-mvp'
is not a valid selector.

[Task Copilot] initialization failed at PERSISTENCE_READY file not existed
```

1. The Toolbar key was `task-copilot-personal-mvp/toolbar`. Logseq includes the key in an injected DOM ID and then passes it directly to `document.querySelector`; the slash made that host selector invalid and could push Logseq into its global error page.
2. The FileStorage adapter handled only `null`/`undefined`. Logseq Desktop instead throws `Error("file not existed")` on a missing first-run file, so a normal empty Store was misclassified as fatal. Capability Lab had the same missing-file assumption. `BUG: should not join with empty dir` also showed that nested FileStorage names were unsafe in this runtime.

The earlier registration-order defect was also real:

The formal plugin did implement one Toolbar registration, but the registration was after all of these operations:

1. top-level construction of `LogseqFileStorageBlobStore`, `VersionedStateRepository`, and `LogseqContentPort`;
2. settings registration and Application construction;
3. `TaskCopilot.initialize()`, including pending-commit recovery and Anchor scanning;
4. only then `provideModel`, Toolbar, Command Palette, and Slash registration.

Any exception before step 4 caused `logseq.ready(main)` to reject. The sole catch only logged a lower-case startup error, leaving no clickable diagnostic surface. The symptom therefore does not prove which deep initializer failed, but it does prove the registration order made every deep failure indistinguishable from “the plugin has no entry.”

The package entry itself was correct: both `package.json.main` and `package.json.logseq.main` are `dist/index.html`; that file, its relative `./index.js` and `./index.css`, and the bundled entry exist. Loading does not require a development server.

## Fix

Startup now has two phases:

- **Bootstrap Shell** registers the namespaced model, one Toolbar item, five Command Palette commands, the read-only Slash open command, isolated style, Main UI diagnostics content, click delegation, and unload cleanup before Store access.
- **Feature Initialization** registers settings, constructs the Runtime Adapter, opens and validates an existing Store without rewriting it or persists a complete empty Store on classified first-run `NOT_FOUND`, constructs the Application, runs recovery/Anchor initialization, and registers event listeners.

If Feature Initialization fails, the shell remains registered. `Task Copilot: Open` and `Task Copilot: Runtime Diagnostics` open a pure HTML diagnostic view; feature commands open the same view with an explicit not-ready Console warning. The failing stage, error name/message/stack, recoverability, versions, Graph label, Store schema, flags, and recovery state are copyable. Corrupt or unsupported Store data is not rewritten, and Graph content is not written during startup.

All identifiers that can enter Logseq registration, a DOM ID, HTML attribute, portal, or CSS selector are now direct literals matching `^[A-Za-z][A-Za-z0-9_-]*$`; domain/storage namespaces remain separate. The Toolbar key is `task-copilot-personal-mvp-toolbar`, the UI root is `task-copilot-personal-mvp-root`, and model/command keys are likewise CSS-safe. `assertCssSafeIdentifier()` rejects invalid literals and `sanitizeUiKey()` is available only for explicitly dynamic inputs; formal constants do not rely on silent sanitization. These values do not reuse Capability Lab's `open-logseq-plugin-capability-lab` identifier or the known Bridge name.

FileStorage logical keys remain namespaced, but the Adapter validates them and maps them to non-empty flat physical filenames before calling the SDK. No leading slash, empty segment, parent segment, or nested physical path reaches FileStorage. The shared `classifyStorageError()` maps SDK error shapes to `NOT_FOUND`, `CORRUPTED`, `PERMISSION_DENIED`, `IO_ERROR`, or `UNKNOWN`. `NOT_FOUND` creates and persists a complete empty schema-v1 state and records `initialized_new_store`; empty/corrupt JSON and unknown schemas are preserved and keep the feature layer in read-only safe mode. Capability Lab uses flat physical filenames and treats only classified `NOT_FOUND` as an empty first run.

All formal-plugin CSS selectors are scoped under `#task-copilot-personal-mvp-root`; there are no `html`, `body`, host-root, or unscoped wildcard rules.

## Loading and Console

Load this package root, not `dist/`:

```text
/Users/wangrundong/work/任务管理中心-logseq插件/apps/task-copilot-logseq-plugin
```

Expected Console prefix is exactly `[Task Copilot]`. A healthy startup includes:

```text
[Task Copilot] bootstrap started
[Task Copilot] toolbar registered
[Task Copilot] commands registered
[Task Copilot] main UI registered
[Task Copilot] persistence ready
[Task Copilot] plugin ready
```

A degraded startup includes `[Task Copilot] initialization failed at <STAGE>` and retains the Toolbar and diagnostic commands.

## Write and cleanup boundaries

Opening the Toolbar, palette command, Slash command, Main UI, or Diagnostics does not write the Graph. Capture and later explicitly confirmed feature actions can write plugin state or the dedicated selected test Block as described by the MVP runtime protocol. To clean up, delete only the temporary runtime-test Blocks; optional plugin-private data cleanup remains a separate manual action after exporting a recovery package.
