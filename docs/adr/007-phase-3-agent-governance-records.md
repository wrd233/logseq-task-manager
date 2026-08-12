# ADR 007: Minimal Phase 3 Agent Governance Records

Status: Accepted — 2026-08-12

## Decision

The second golden path adds four durable records: frozen Logseq Block Evidence, AgentRunReceipt, atomic Proposal plus immutable revisions, and FeedbackEvent. It adds one semantic operation, `SET_CURRENT_FOCUS`. A versioned Skill remains a file package; SQLite records only each used `id/version/content-hash` tuple to make in-place mutation fail closed.

The Kernel exposes narrow governance interfaces to freeze one explicitly selected Block from a proof-bound Graph Adapter read, run one current-focus Agent against that Evidence, revise or dismiss an open Proposal, and automatically apply one still-valid low-risk Proposal through the existing Semantic Commit path. Proposal creation never writes formal state. Agent output never calls Commit or Graph directly. Run plus Proposal creation, revision plus correction Feedback, and Commit plus governance finalization are atomic SQLite transactions. The release pins the exact approved Skill content hash; a same-version mutation cannot bootstrap its own approval.

## Why these are durable

The golden path must later explain which frozen material, Skill version, run, Proposal revision, Commit, Undo, and user correction caused a formal fact to change. Projection, a transient receipt, or an ordinary file cannot answer that audit chain after the source changes.

## Rejected

- Direct Agent `SET_CURRENT_FOCUS` write endpoint.
- Approval Inbox or persistent `ACCEPTED` Proposal state.
- Agent Session, workflow engine, policy DSL, prompt runtime, or generic evidence registry.
- Storing prompts, tool logs, token streams, or chain-of-thought.

## Deletion cost

All Phase 3 records are isolated tables and closed contracts. Removing Agent governance leaves user commands, WorkObject, Commit, Graph, Undo, and Recovery intact; only `currentFocus` remains as a normal formal field.
