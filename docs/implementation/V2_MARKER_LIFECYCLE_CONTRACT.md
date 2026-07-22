# V2 Marker / Lifecycle / Condition 合同

> 状态：`MARKER_DESKTOP_PASS / MINI_PROJECT_CLOSURE_AUTOMATED_PASS / MINI_PROJECT_CLOSURE_DESKTOP_PENDING`

## 权威边界

- Logseq 权威：显式对象正文与 TODO Marker。
- SQLite 权威：Object Lifecycle 与 Condition。
- Marker 不决定对象身份，不改 Primary Ownership，不自动选入 Focus。
- Condition 不从 Marker 或自然语言静默推导。`WAITING` Marker 只保留为用户命令线索，当前同步路径不改 Condition。

## 同步矩阵

| Marker | Task Lifecycle | MiniProject / Project | Decision / Output | Condition / Focus |
|---|---|---|---|---|
| 无 / `TODO` | 保持当前 Lifecycle；首次创建为 `OPEN` | 保持 | 保持 | 不变 |
| `NOW` / `DOING` | 保持 `OPEN`；仅表达正文执行状态 | 保持 | 保持 | 不自动加入 Focus |
| `WAITING` | 保持 Lifecycle | 保持 | 保持 | 不自动设为 `WAITING` |
| `DONE` | `OPEN → COMPLETED`；重复 DONE 幂等 | MiniProject 只生成一个 HIGH Proposal；必须填写原目标、实际结果、遗留/转移三问，接受仍不生效，最终确认后与 `OPEN → COMPLETED` 原子持久。Project 继续使用结构化 Closure Proposal | 零写入，不使用 Marker 改 Lifecycle | 不变 |
| `CANCELED` / `CANCELLED` | 只生成取消请求；在记录取消原因前零写入 | 零写入，要求可审阅关闭流程 | 零写入，不使用 Marker 改 Lifecycle | 不变 |

Task 已进入一个终态后，相反的 DONE/CANCELED 请求是语义冲突：零写入、保持 Service 连接健康，要求用户审阅，不用断线重试循环补漏。移除 Marker 也不会静默重开已完成/已取消对象。

## 写入链

```text
Logseq authoritative Block reread
→ explicit parser (type, title, marker evidence)
→ bounded Plugin queue
→ Local Service validation
→ V2 Application command
→ Domain marker matrix
→ Object + Anchor + Audit + Receipt single SQLite transaction
```

Client 不能提供 Lifecycle、Condition、object_id、Graph ID 或 SQLite 路径。Service 只接受受限 Marker 证据，Lifecycle 结果由 Domain 决定。

## 当前证据与缺口

自动证据已覆盖：Parser 别名、Task 首次 DONE、同 UUID DONE 更新、Condition 不变、Task 缺少取消原因时零写入、终态冲突零写入、Service 409 以及 Plugin 不错将语义冲突当作传输断线。MiniProject DONE 复用既有 Proposal、Review、版本重验和单步 Domain SemanticCommit；三问已纳入唯一 Proposal 表示、最终预览和正式对象，普通接受不能绕过。首次观察可先以现有同步回执建立 OPEN 对象，再生成确定性 Proposal；一个活跃关闭意图的正文变化只修订这一机器表示并重置审阅，不产生平行 READY/ACCEPTED，终态审阅后的新 DONE 事件则建立新代次。延迟旧回执不能倒灌旧 version/hash。Commit 仅接受 active 且 hash 一致的 Anchor；无 Domain receipt 的 PENDING 重试再次重验并在 stale 时安全终结，有 receipt 的故障恢复幂等续完；Proposal/Commit 分步终结的两个崩溃窗口在 planner 前恢复收口，并发最终确认收敛为一个 Commit。

Logseq Desktop 0.10.15 已验证 Task DONE、重复 DONE、移除 Marker 不重开、终态相反 Marker 冲突零写入，以及 CANCELED 缺少原因零写入。MiniProject 的旧 Desktop 证据只证明 Proposal/Review/Commit 安全链，三问 UI 和读回尚需重跑；详见 `docs/runtime/V2_MARKER_DESKTOP_REPORT.md` 和 `docs/implementation/V2_MINI_PROJECT_CLOSURE_CONTRACT.md`。

Task 的产品内“记录取消原因后正式取消”与“显式重开”仍属于后续专用命令/审阅 Gate；Logseq 原生 Undo 只能撤回正文 Marker，不能绕过 SQLite Lifecycle 或自动重开。
