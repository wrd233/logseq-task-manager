# P2-D LIGHT Condition durable Undo Desktop Gate

## Gate identity

- branch: `feature/task-copilot-mvp`
- captured code commit: `58bf6306d04d8eb3016f3f733646e7116a57c39b`
- implementation commits:
  - `28dfb7b` — persist the server-owned inverse and expose version-protected Condition Undo
  - `58bf630` — keep Association disabled until it has an equivalent inverse
- Plugin / Local Service / Launcher: `0.1.0`
- Plugin build time: `2026-07-26T08:42:14+0800`
- Logseq Desktop: `0.10.15`
- test Graph: `logseq`
- host: main Page, Dark, `1567×1104`
- runtime: real installed Plugin + Launcher + owned Local Service; no static prototype

No API key, descriptor token, Provider response, private Graph text, filesystem identity or machine
object identity is present in the screenshots.

## What was exercised

1. Open Project reentry and choose `调整 Project`.
2. Verify the impact router exposes LIGHT Condition and durable Undo, while ordinary Association is
   visibly disabled because no remove/inverse command exists.
3. Change the test Project from `ACTIONABLE` v8 to `PAUSED` v9 with a user reason.
4. Reload Logseq. The Project disappears from actionable Now Work and reentry reads the paused
   condition and reason from the formal projection.
5. Reopen the impact router and ask the Service to prepare the most recent Condition inverse.
6. The user-facing confirmation says exactly “我先暂停” → “可以行动”; it does not expose a change
   ID, object ID or storage term.
7. Confirm Undo. The Service revalidates the current object version and current Condition, then
   applies the server-owned inverse as v10.
8. Reload again. Reentry returns to the deterministic baseline.

Final CLI readback:

```text
version: 10
lifecycle: OPEN
condition: ACTIONABLE
currentSummary: 已创建 P0 Page Route Gate 20260723，待明确目标与当前推进。
currentFocuses: [明确目标与下一步]
objectives/deliverables/workStages/stageMappings: []
```

The forward and inverse commands did not change Lifecycle, Focus, Ownership, Graph body or the
Project current interface.

## Evidence

| Screenshot | Proof |
|---|---|
| `p2-d-11-light-condition-router-current-dark.png` | Current impact router; Condition/Undo are actionable and Association is disabled |
| `p2-d-12-light-condition-undo-after-reload-current-dark.png` | Reload-preserved PAUSED state and the exact version-protected Undo confirmation |
| `p2-d-13-light-condition-undo-reload-current-dark.png` | Second reload reads the original ACTIONABLE deterministic projection |

Automated evidence at the implementation boundary:

- Application: `161/161`
- Local Service: `135/135`
- Plugin: `275/275`
- Persistence: `49/49`
- root `./scripts/check.sh`: PASS
- recovery rehearsal: `differences: []`

## Interaction evaluation

- The primary decision is clear: choose impact, then choose state or Undo.
- Reload does not lose the Undo affordance because the inverse is owned by the Service receipt rather
  than Plugin session memory.
- The confirmation is concise and tells the user what remains unchanged.
- The Condition form's blocker selector can visually mention another object near the target form. The
  exact target remains bound in the action value, but a future UI pass should add the target title to
  the form heading to remove this momentary ambiguity.
- `Lifecycle`, `Focus`, `Ownership`, `Condition` and `inverse` still leak engineering vocabulary in
  explanatory prose. Status translation cleanup remains open.
- The light Plugin surface over a Dark host and the tall router still need Light and narrow-width
  visual Gates.

## Bounded conclusion

`LIGHT Condition durable Undo` is DONE for this Project vertical: implementation, automated tests,
real Desktop, reload, formal inverse, second reload and final state conservation all passed.

P2-D remains IN PROGRESS. Association cannot enter the final route until it gains an inverse; Focus
and reviewAt still need their own discoverable Undo conclusions, and Ownership/body movement/batch
children/split-merge/Closure still require separate HEAVY vertical chains.
