# Phase 6 External CLI Agent

Phase 6 makes the existing CLI a governed cognition surface for a shell-capable process outside Task Copilot. It does not add a model runtime or new domain semantics.

The production path is:

```text
External Agent -> task-copilot CLI -> Kernel Service -> in-memory Graph broker
                                                ^              |
                                                |              v
                                      verified Commit <- Logseq Plugin worker
```

The Agent may inspect Formal WorkObjects, use bounded Graph search/read, freeze selected live blocks as Evidence, start and finish an `EXTERNAL_CLI` AgentRun, and apply an eligible LOW-risk Proposal. The Kernel still derives the Proposal and GraphEffect. The Plugin still performs the Logseq SDK call and readback. SQLite remains Kernel-only.

External and deterministic executors share `current-focus-maintenance/0.1.0` and `engagement-reconciliation/0.1.1`. Executor identity changes who performs cognition, not the Skill, Proposal schema, autonomy policy, or write authority.

The permitted mutations remain `SET_CURRENT_FOCUS` and `ACTIONABLE <-> WAITING`. External execution cannot impersonate `USER`, create objects, park work, or complete, cancel, reopen, or amend Closure.

Exploratory reads create optional ReadReceipts. A Proposal depends only on explicitly frozen Evidence. Search results and receipts never become formal facts implicitly.

The broker is deliberately in-memory. It carries one typed request at a time, binds it to the connected Graph ID, expires an offline worker, leases deliveries for bounded redelivery, and times out. Durable Commit and recovery state remain in SQLite.
