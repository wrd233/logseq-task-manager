# Graph-originated User Command Contract

Status: Accepted for online `TODO → DONE`; offline reconciliation deferred

## Decision

A direct online marker change to `DONE` on the current formal open Task is treated as a user completion command, not as an authoritative state write by Logseq. The Plugin observes `DB.onChanged`, coalesces duplicate notifications by block UUID, re-reads the formal target and managed snapshot, and prepares an ordinary `COMPLETE_WORK_OBJECT` using the configured USER actor. Kernel authorization, version/projection preconditions, record creation, Graph convergence, fresh verification, and Commit finalization are identical to the explicit command path.

The observer ignores non-DONE blocks, unmanaged/not-current blocks, and terminal targets. DONE writes emitted by the explicit completion effect are temporarily muted so the Plugin does not create a duplicate command from its own Graph mutation. Duplicate events are also ignored while the same block's completion is in flight, and the observer's off-hook is called from `logseq.beforeunload` so reloads cannot accumulate writers.

## Race and recovery contract

- The initial snapshot binds both managed projection hash and observed marker.
- The effect accepts only its exact expected marker, an already-written resulting marker during safe replay, or a fully matching final state.
- An unrelated marker/projection edit fails closed and becomes recovery-visible; user text is not overwritten.
- A response lost after writing the marker resumes from the recognized partial state and finishes the same effect/Commit.
- If a post-write Logseq read still exposes the exact pre-write projection hash, verification settles for a bounded 500 ms. Any different hash remains a conflict and is never overwritten.
- The CompletionRecord is unique to the deterministic Commit and formal history exposes it only after `COMMITTED`.

## Host evidence and limitation

The installed Logseq SDK exposes `DB.onChanged`, while marker semantics are read from canonical block content. This supports live event ingestion but provides no durable last-seen marker baseline. Phase 5 therefore does not claim restart/offline reconciliation: a TODO changed while the Plugin is stopped is not scanned automatically at startup. Adding such a scan requires persisted observation state and a bounded conflict policy, and is deferred rather than inferred.

Cancellation deliberately does not enter through a marker event. No stable host cancellation-marker contract was established for this slice, so the explicit Cancel command preserves natural text and marker and projects formal `CANCELLED` state in the owned managed block.
