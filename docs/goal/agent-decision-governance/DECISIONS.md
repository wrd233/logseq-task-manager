# Agent Decision Governance Decisions

## Frozen implementation choices

### ADG-D-001 — Internal governance is not an external Agent privilege

外部 `task-copilot-core` 继续只允许有界读取与 review-only Proposal。内部治理的有效权限也只允许选择现有 Application/Proposal/Semantic Commit 路径，永不形成 Provider 直写或 force/apply API。

### ADG-D-002 — Minimal persistence shape

schema v13 采用四张表：

1. `agent_decisions`：每个 Graph + Source Root 一个 thread 的当前 aggregate 与关键 revision；
2. `agent_decision_events`：只追加的重要事件，Feedback 使用结构化 event payload；
3. `agent_review_signals`：需要 60/180 天 active index、source-missing 与 related-object query；
4. `agent_rule_authorizations`：Skill max、本地 current、有效权限、暂停和版本变更等级。

不新增第二套对象、Proposal、Commit、Audit 或全文索引。若真实查询证明此结构不足，先更新 ADR，再加表。

### ADG-D-003 — Schema v13 uses the existing explicit migration gate

新建空库直接创建 v13；现有 v12 必须通过已存在的 preflight snapshot + validation + single transaction + ledger 才能升级。`initialize()` 只报告 migration required，不静默升级。

### ADG-D-004 — Shadow first

EXPERIMENT 是首阶段默认模式。它可以持久化 Decision/Event/Review Signal/Authorization 和安全指标，但 Agent 引起的正式业务写入恒为 0。Guarded 代码接线默认关闭，不能用合成数据越过 14 天/200 Decision。

### ADG-D-005 — Reuse Graph events without coupling failures

治理观察订阅同一 `DB.onChanged` 原始事实，但拥有独立有界 latest-value queue、取消和失败隔离。它不得延迟或改变 Explicit Sync 与 Worksite invalidation；停用治理后现有消费者保持原样。

### ADG-D-006 — Reuse Context Package ingredients

LOCAL/EXPANDED 使用 Graph bridge normalized snapshots、SQLite formal projections、Anchor、versions/hash 与内置 Skill，不建立持久正文缓存或第二全文索引。Decision 只保存有界 captured snapshot/摘要与可验证 evidence refs，不保存模型内部思维。

### ADG-D-007 — Existing visual language wins

治理台采用当前 Plugin 的信息密度、tokens、cards、progressive disclosure 与 focus restoration。它是“态势监督”而非 BI dashboard 或清队列页；机器 ID/枚举只在技术详情。
