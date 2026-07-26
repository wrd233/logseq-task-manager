# P2-G Rebind — identity-free reading preview automated gate

## Status

`FRONTSTAGE_AUTOMATED / FORMAL_REBIND_CHAIN_REUSED / DESKTOP_GATE_OPEN / P2G_PARTIAL`

This slice changes only the user-facing Rebind preview and selection token. The existing bounded
read, version/hash revalidation, explicit confirmation and Local Service Rebind command remain the
only formal path.

## Product change

The previous ready-state preview exposed:

- the selected Block UUID;
- content hash;
- old Anchor ID and external ID;
- raw `missing` / `replaced` states;
- `Primary Anchor` and `object_id` implementation terminology.

The current preview shows only:

- the selected Block's formal type and readable title;
- candidate formal item title and type;
- translated connection state such as “原连接位置不可用”;
- a plain-language explanation that the formal item and Ownership do not change;
- one explicit confirmation that the selected Block becomes the main text.

Select values are session-local `candidate:<index>` tokens. The Plugin maps the token back to the
already verified preview in memory before calling the unchanged Service request. No Anchor,
Object, Block or hash identity appears in the frontstage HTML.

The success result now names the formal item and says the old connection remains in history. It no
longer prints Object or Block identity.

## Safety preserved

- reads only the current selected Block and one bounded page of known Anchors;
- persists Logseq Block identity only after confirmation and stale checks;
- rereads content/type/version/hash before the formal request;
- sends the same server-required previous Anchor ID, object version, Anchor status/hash, current
  Block evidence, exact confirmation and trace ID;
- does not accept Object ID, Ownership, Graph or path authority from the UI;
- old Anchor remains `replaced`; it is not deleted;
- busy state still removes Cancel and prevents duplicate submission.

## Automated evidence

- focused Rebind suite: `5/5` PASS;
- Plugin full suite: `280/280` PASS;
- Plugin typecheck: PASS.

The ready HTML test asserts that the selected UUID, old Anchor ID, old external ID and hash are
absent, while title, translated state, confirmation and action remain present.

## Open gate

The current build still needs Desktop proof in the dedicated test Graph: create or reuse one
missing/conflicting Anchor, select a valid replacement Block, capture the reading preview, submit,
reload and verify the same Object now has one active Anchor while the old Anchor remains historical.
Restore and Migration productization are not changed by this slice.
