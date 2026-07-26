# P2-E Project Closure read-only evidence Desktop Gate

## Gate identity

- branch: `feature/task-copilot-mvp`
- captured code commit: `ec1a70d848d660d5a8a364d98badb41fb1e30d4d`
- Plugin / Local Service / Launcher: `0.1.0`
- Plugin build time: `2026-07-26T08:55:52+0800`
- Logseq Desktop: `0.10.15`
- test Graph: `logseq`
- theme / viewport: Dark / `1567×1104`
- host: main Page; real installed Plugin + Launcher + owned Local Service

The Launcher install reused only the Keychain reference. No API key, descriptor token, Provider
response, private Graph text or personal Graph was read into screenshots or this report.

## Operation chain

1. Build and install commit `ec1a70d848d6` into the existing dedicated Launcher runtime.
2. Reload the real Task Copilot Plugin through Logseq's plugin runtime.
3. Open `项目`, choose the formal Project and enter `调整 Project`.
4. Confirm the impact router exposes `整理 Closure 证据` and states that this step cannot create a
   Proposal or complete the Project.
5. Open the read-only preview for the existing empty-evidence Project.
6. Verify goal, deliverable, Decision and completed-work evidence remain unknown instead of being
   invented.
7. Verify the preview separates `目前无法确认` from `仍需你判断`.
8. Verify the preview contains one button only: `取消`.
9. Reload the Plugin while the preview is open. On reopen, no preview is persisted.
10. Re-enter the same route; Runtime and Store are READY and the evidence is recomputed.

## Zero-write evidence

SQLite readback before and after reload/recompute:

```json
{"objects":2,"proposals":10,"commits":21}
{"projectVersion":10,"lifecycle":"OPEN","condition":"ACTIONABLE"}
```

No Provider request was made. No Proposal, Review, Commit, Audit mutation, Closure or Graph body
write was created by this flow.

## Current screenshots

| Screenshot | Proof |
|---|---|
| `p2-e-01-closure-evidence-entry-current-dark.png` | Current Project impact route and the safe Closure entry |
| `p2-e-02-closure-evidence-empty-current-dark.png` | Source-bounded candidate and unknown projection |
| `p2-e-03-closure-evidence-reload-recompute-current-dark.png` | Fresh recompute after Plugin reload |
| `p2-e-04-closure-evidence-judgments-current-dark.png` | User judgments, next safety stage and the sole Cancel action |

## Interaction evaluation

- The main conclusion is clear: the system has insufficient formal evidence and will not pretend the
  Project is complete.
- The frontstage asks for the actual missing judgments rather than exposing a fixed Closure form.
- The user remains inside the Project workspace; no diagnostics or external window is required.
- The tall preview requires scrolling on this viewport. This is acceptable for a first evidence
  reading but needs density work before the Provider draft is added.
- English terms such as `Proposal`, `Primary Ownership`, `Objective`, `Decision` and `Commit` remain
  visible. P1 state translation should replace them with user-level language before final release.
- The empty-evidence scene is intentionally valuable: it proves the system says “unknown” instead of
  asking the model to fabricate an outcome. A rich-evidence Project and conflicting-evidence sample
  remain required for Provider quality evaluation.

## Bounded conclusion

The deterministic P2-E read-only preview is DONE for automated and current Desktop evidence,
including reload, recompute and zero-write proof. P2-E remains IN PROGRESS until real Provider
quality, HIGH Proposal Review, Commit, failure/Recovery, Undo and final reload all pass.
