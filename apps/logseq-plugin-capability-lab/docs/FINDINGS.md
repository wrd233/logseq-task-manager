# Findings

## Confirmed by automation

- The repository is a conventional Logseq File Graph and was clean before the experiment branch was created.
- Stable npm `@logseq/libs@0.0.17` type declarations contain the required toolbar, command, slash command, context, Page/Block, DataScript, settings, FileStorage, route, Graph, DB change, and unload APIs.
- The plugin compiles and bundles without a UI framework.
- Pure safety logic refuses deletion unless UUID registry, both ownership markers, and exact experiment-page ownership agree.
- Package metadata and generated artifact shape are automatically checkable.

These facts do **not** prove that a particular Logseq Desktop build executes every API correctly.

## Partially feasible or awaiting Desktop proof

- Page and Block CRUD, parent/child data, structured properties, and UUID reread are implemented but await real runtime transactions.
- DataScript query is implemented against `:block/properties`, then owner-filtered in JavaScript. File Graph versions may differ in property values or pull shape.
- Settings change events are implemented; persistence across reload is manual.
- FileStorage round trip is implemented; its actual physical location and lifecycle are not inferred from the public type surface.
- Route, current-Graph, and DB transaction events are official SDK hooks, but delivery/duplication behavior requires runtime observation.
- Main UI styling and toolbar placement depend on the Desktop host/theme.

## Unsupported or deliberately excluded

- No dedicated stable editing-focus/state change event was found in the inspected SDK surface. Context is read on demand instead.
- No DOM `MutationObserver`, private ClojureScript state, undocumented Electron IPC, or DOM selector scraping is used as a core capability.
- No claim is made that FileStorage follows the Graph when moved, is included in Git, is backed up, or is covered by Logseq Sync.
- No DB Graph conversion or DB Graph compatibility is attempted.

## Security and SDK risk

The stable File Graph SDK package currently produces npm audit findings through historical DOMPurify and lodash-es dependencies. The Lab escapes diagnostic HTML and does not accept remote content, but that reduces exposure rather than removing dependency risk. A forced audit fix changes `@logseq/libs` to 0.3.4 and is not safe to adopt without a File Graph compatibility run. This must be resolved before treating the Lab stack as production-ready.

## File Graph versus DB Graph

- File Graph durability ultimately includes Markdown/Org serialization, property parsing, filenames, and Git-visible changes.
- DB Graph uses a different model and newer SDK evolution; property identity, query shape, transactions, and plugin compatibility may differ.
- A successful File Graph experiment must remain scoped to this Graph/version. It cannot be generalized to DB Graph.

## Preliminary impact on a future MVP

If manual tests pass, a future MVP can likely build on UUID-based anchors, explicit structured properties, normal SDK CRUD, guarded query/index refresh, and official navigation/DB events. It should keep an abstraction boundary around Graph access so File Graph serialization and any future DB Graph adapter do not leak into domain logic.

Do not yet make UUID move/undo stability, FileStorage backup, settings persistence, editing-state events, or exact DataScript property shape foundational assumptions. Each needs evidence in `CAPABILITY_MATRIX.md`.

## Mechanisms the next phase must not depend on

- DOM structure or CSS selectors as data APIs.
- `MutationObserver` as the authoritative change stream.
- Undocumented Logseq internal state or Electron IPC.
- File paths as permanent block identity.
- FileStorage as if it were synced Graph data.
- A one-version observation generalized to all File Graph or DB Graph releases.
- Forced SDK upgrades used only to silence audits without compatibility tests.
