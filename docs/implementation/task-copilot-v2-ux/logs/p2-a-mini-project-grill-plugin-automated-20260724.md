# P2-A MiniProject Grill Plugin — Automated Evidence — 2026-07-24

## Scope

This gate covers the Plugin consumer of the existing session-only MiniProject Grill Service route.
It does not claim a Logseq Desktop or complete live Graph-read-bridge pass.

## User path implemented

1. An OPEN formal MiniProject exposes `梳理 MiniProject` in the Objects workspace.
2. Its active Primary Anchor Block reuses the stable native `Task Copilot：处理这条内容` intent.
   The action resolves the formal object at click time, routes an OPEN MiniProject to Grill, and
   captures the exact business origin without adding another permanent host menu item.
3. The Plugin shows one adaptive turn at a time: understanding, facts, inferences, unknowns,
   recommendation/tradeoffs, and the machine-selected focus question.
4. Each answer is bounded to 1–4000 characters and remains only in the in-memory controller.
5. Cancel clears the session and, for the Block entry, returns through the existing verified origin
   route. No Proposal, Review, Commit, Graph mutation, or SQLite mutation is exposed by this UI.

## Failure and stale behavior

- duplicate start/turn submission is ignored while one Provider request is in flight;
- the OPEN MiniProject identity and version are checked before and after every turn;
- Graph switch, restricted Service, Plugin cleanup, or Service generation change discards the
  session;
- object/lifecycle/runtime changes produce a terminal stale state rather than reusing answers;
- an ordinary Provider error retains the last validated turn and offers a bounded retry;
- a non-MiniProject, missing Anchor, closed object, or invalid identity fails before Provider.

## Automated evidence

```text
MiniProject Grill controller focused: 4/4 PASS
Logseq Plugin full tests: 236/236 PASS
Logseq Plugin typecheck: PASS
Logseq Plugin build: PASS
Package metadata/bootstrap/dist integrity: PASS
```

The UI renderer test also proves that the Grill dialog contains no Proposal submit, Review accept,
or Commit action. Runtime/Desktop validation remains open because the currently installed Logseq
renderer has not reconnected its Graph read bridge after the Service update.
