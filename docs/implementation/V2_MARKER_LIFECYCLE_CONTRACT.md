# V2 Marker / Lifecycle / Condition 合同

> 状态：`AUTOMATED_CONTRACT_PASS / DESKTOP_PENDING`

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
| `DONE` | `OPEN → COMPLETED`；重复 DONE 幂等 | 零写入，要求可审阅关闭流程 | 零写入，不使用 Marker 改 Lifecycle | 不变 |
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

自动证据已覆盖：Parser 别名、Task 首次 DONE、同 UUID DONE 更新、Condition 不变、Task 缺少取消原因时零写入、MiniProject 关闭拒绝、终态冲突零写入、Service 409 以及 Plugin 不错将语义冲突当作传输断线。

尚需 Desktop：Logseq 0.10.15 真实 Marker 形态、Task DONE/CANCELED、Undo 交互，以及 MiniProject 关闭请求进入 Slice C 审阅中心。在此之前 B3 不标记整体 DONE。
