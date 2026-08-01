# Agent Decision Governance Acceptance Matrix

状态：`NOT_STARTED` / `AUTOMATED_FOUNDATION` / `DESKTOP_PARTIAL_PASS` / `RUNTIME_TIME_GATE` / `DONE`。

| ID | Requirement | Code evidence | Automated evidence | Desktop/runtime evidence | Status |
|---|---|---|---|---|---|
| ADG-BASE-01 | 真实 Git/Node/Logseq/Plugin/SQLite/Provider/Skill 基线 | `GOAL.md` | command transcript | running Service + Doctor | DONE |
| ADG-ARCH-01 | 复用唯一正式写入内核；外部 Agent 权限不扩张 | ADR 0009 + `packages/application/src/agent-governance.ts` + read-only Service/CLI routes | domain/application boundaries + no CLI promote/apply + existing No-Agent regression | No-Agent regression | AUTOMATED_FOUNDATION |
| ADG-DATA-01 | Decision Thread/Revision/Event/Review Signal/Authorization schema v13 | Domain validators; Application; SQLite; Local Service/client | v1→v13/v12→v13 migration + reload + backup/restore + forged-response rejection | live migration/reload/Graph switch | AUTOMATED_FOUNDATION |
| ADG-DATA-02 | Feedback 与 Undo 分离；bulk compatibility grouping | pending | application tests | Desktop scenario F | NOT_STARTED |
| ADG-GATE-01 | format-only suppression、强/弱信号、Source Root、latest wins | `packages/domain/src/agent-governance-gate.ts`; plugin governance queue | gate/source/latest-wins/cancel/capacity/failure tests | scenarios A–D | AUTOMATED_FOUNDATION |
| ADG-CTX-01 | LOCAL/EXPANDED/REVIEW、metrics、truncation fail-closed | domain context budget + existing Service Context adapter | required evidence, dedupe, deterministic clipping and existing Graph/SQLite reuse tests; REVIEW pending | scenarios C/I | AUTOMATED_FOUNDATION |
| ADG-SKILL-01 | hash-addressed internal Skill、稳定 Rule ID、中文名称 | `skills/agent-decision-governance/SKILL.md`; separate internal catalog loader | hash/manifest/Rule ID/name/examples/output schema/Doctor tests | scenario E/detail | AUTOMATED_FOUNDATION |
| ADG-ROUTER-01 | deterministic effective authority、pause、downgrade、high-impact never-auto | governance domain + deterministic router | effective min, user-only promotion, step downgrade, pause/global pause, truncation, counter-signal, multi-object and R3 matrix | scenario G | AUTOMATED_FOUNDATION |
| ADG-REVAL-01 | source/target/Anchor/rule/Skill/mode/scope/equivalent action revalidation | pending | stale/idempotency/fault tests | scenario J | NOT_STARTED |
| ADG-SHADOW-01 | EXPERIMENT 下业务 Object/Graph/Ownership/Lifecycle/Condition/Focus 写入 0 | pending | zero-write snapshots | scenarios A–D/H | NOT_STARTED |
| ADG-UI-01 | 24h/7d、最近 Decision、例外、抽样、中文规则、详情、来源 | pending | renderer/AX tests | Light/Dark/1000/760 | NOT_STARTED |
| ADG-UI-02 | loading/error/disabled、keyboard、focus restore、focus ring、pause clarity | pending | UI interaction tests | scenario E/G/H | NOT_STARTED |
| ADG-EXPORT-01 | privacy-safe Skill Feedback Package | pending | deterministic export tests | scenario F | NOT_STARTED |
| ADG-EXPORT-02 | 60/180 day Review Evidence Markdown + machine data | pending | dedupe/source-missing/truncation tests | scenario I | NOT_STARTED |
| ADG-GUARDED-01 | explicit-task representative path default off, explicit authority, existing Commit/Undo | pending | disabled/guarded/revalidation tests | scenario J | NOT_STARTED |
| ADG-FAIL-01 | Provider/Skill/Service unavailable and Agent off do not block base product | pending | failure/no-agent regression | scenarios G/H | NOT_STARTED |
| ADG-TIME-01 | 14 days + 200 real Decisions; per-rule evidence | runtime data | no synthetic substitution | daily Shadow use | RUNTIME_TIME_GATE |
