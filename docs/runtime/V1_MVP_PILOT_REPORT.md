# V1 MVP copied-data Pilot 报告

> 日期：2026-07-20  
> 环境：Logseq Desktop 0.10.15 / 正式 Task Copilot 插件 / Agent `none`  
> 结论：`V1_MVP_PILOT_PARTIAL`，不得使用 `V1_MVP_PILOT_SUCCESS`

## 1. 选择与安全边界

四项使用同一条“告警外部推送治理”的脱敏工作链，均位于专用页面 `Task Copilot/Pilot/2026-07-20/告警外部推送治理`：

| 类型 | copied-data 副本 | 选择理由 |
|---|---|---|
| Capture | 下周前梳理告警外部推送链路并验证一条脱敏测试事件 | 来自真实工作语义，能覆盖整理与延后 |
| Task | `[任务] 使用一条脱敏测试事件验证外部推送链路` | 单一、可完成、可 Undo 的承诺 |
| MiniProject | `[MiniProject] 完成告警外部推送现状梳理与单事件验证` | 包含目标、推进、内部步骤与结束条件 |
| Project | `告警外部推送治理 Pilot` | 可承载摘要、推进、Waiting 和多对象聚合 |

原正式内容没有被改写。Pilot 前恢复包为 `/Users/wangrundong/Downloads/task-copilot-pilot-preflight-2026-07-20.json`，SHA-256 `86b07547ab112c36bb01ac1bfd0da8d8913be9b21b37217f4d06cf92deec1154`，回放 differences 为空。

## 2. 实际结果

### Capture

- PASS：当前 Block Capture；正文不移动、不自动创建 Task；来源页正确。
- PASS：同一 Block 再次 Capture 时没有产生第二个 Pilot Capture，界面给出可见反馈。
- PASS：手工正式化为 Task，并经 SemanticCommit 解决 Capture。
- PASS：`暂缓` 至 2026-07-27，处置可追踪。
- PASS：`无需行动` 保留 Capture、审计和原始 Logseq Block，不删除普通内容。
- PASS：reload 后已解决、暂缓和无需行动处置仍在。

### Task

- PASS：创建 object_id `obj_20260720013536279_6f11fa8aeac84dcaaaa011971b09097d`；Primary Anchor 激活。
- PASS：CLARIFY -> READY -> ACTIVE -> COMPLETED 均走 Proposal / SemanticCommit；完成为高影响确认。
- PASS：COMPLETED 后从 Now Work 消失。
- PASS：逆向 Commit 将对象恢复为 ACTIVE，旧 Commit 不被篡改。
- PASS：真实插件 reload 后对象、ACTIVE、Capture 处置和 Store 均保留。
- PASS_WITH_LIMITATION：编辑 Marker 时 Logseq 将 `TODO` 与正文拆成两个 Block；领域对象未静默漂移，用户显式确认 rebind 后旧 Anchor 为 `replaced`、新 Anchor 为 `active`。

### MiniProject

- PASS：正式化为 `MINI_PROJECT`，object_id `obj_20260720024325038_ae8d368b5cd94c2b9efe6b4441c76cc4`；完成标准、目标结果和下一步保留。
- PASS：尝试进入 READY 时，Domain 明确拒绝缺少目的与主归属的对象，没有静默降级或写入。
- PARTIAL：补目的/摘要的 edit Proposal 已接受操作但仍为 OPEN，未提交为正式 Commit。
- PARTIAL：主归属 Proposal 已接受操作但仍为 OPEN；高影响确认链过长，实际 Store 仍为 UNASSIGNED。
- GAP：三问式完成、类型迁移/拒绝迁移没有形成 V1 产品闭环；它们属于 V2 迁移后能力，不应继续扩建 V1。

### Project

- PASS：正式化为 `PROJECT`，object_id `obj_20260720025833376_427e8913fc04452390cfb3217491e479`；专用页面 Anchor 激活。
- PASS：通过 edit Proposal / Commit 写入 `purpose` 与 `currentSummary`，对象版本从 V1 到 V2。
- PASS：Project Re-entry 能显示摘要、下一步、正文来源和最近事件。
- PARTIAL：IDEA -> DEFINING Proposal 已接受操作但仍 OPEN，状态未正式改变。
- PARTIAL：MiniProject 主归属尚未提交，Project 尚无本轮新增聚合关系。
- GAP：Decision / Output 当前只是普通正文候选；V1 没有 V2 的正式 Decision / Output 与 Closure Candidate 闭环。
- GAP：Project 页面与对象原子创建未实现；本轮是用户先建 Pilot 页面、再正式化对象。

## 3. UI 摩擦与语义问题

1. Proposal 的“接受”只改变 operation status；还必须继续滚动并点击“提交已确认操作”。两个动作视觉相似，用户很容易误以为已生效。
2. 高影响主归属在接受、提交、二次确认之间切换页面，形成 OPEN + ACCEPTED 的可恢复但难理解状态。
3. Proposal Review 默认从最旧 Proposal 展示；到达最新 Proposal 需要长距离滚动。
4. MiniProject 目的、目标结果、完成标准之间存在字段重复；READY 拒绝是正确的，但初次正式化表单没有提前收齐门槛字段。
5. V1 Phase 与 V2 Lifecycle/Condition/Focus 不同；继续给 V1 补长期语义会增加迁移债务。

## 4. 数据、恢复与清理

- Pilot 后 FileStorage：revision 138，8 objects、14 captures、23 proposals、20 commits、1 relation、66 events。
- Pending Commit：0；Recovery Required Commit：0。
- Pilot 三个正式对象的当前 Primary Anchor 均为 `active`。
- 两个未完成动作保持为 `OPEN` Proposal，operation 为 `ACCEPTED`；它们不是正式状态，恢复包可以完整保留。
- Pilot 后恢复包：`/Users/wangrundong/Downloads/task-copilot-pilot-post-2026-07-20.json`。
- Pilot 后 SHA-256：`4e9dd666697b94ca0d6b81e7dc7bd0c12c82d0f432b2363eddfbc95a1a602612`。
- 回放：objects 8、relations 1、events 66、differences `[]`；5 个 missing Anchor 来自此前保留的 runtime 历史证据，本轮三个 Pilot Primary Anchor 均 active。
- secret scan：未发现 API Key、Authorization、Bearer 或 DeepSeek 凭据。
- Pilot 页面作为本地迁移证据保留，不删除；不提交 `logseq/`、截图或恢复包。

## 5. 产品判定

本轮不能宣告 `V1_MVP_PILOT_SUCCESS`：Capture 与 Task 闭环通过，但 MiniProject/Project 的主归属、推进、聚合以及 Decision/Output/Closure 仍不构成低摩擦产品闭环。

同时，不应继续向 V1 添加长期功能。V1 的可信运行内核、恢复、Anchor、Commit/Undo 与诊断资产已经足够作为 V2 基础；剩余差距正是 V2 冻结语义要解决的内容。因此本轮判定：

```text
V1_RUNTIME_KERNEL_PASS
V1_MVP_PILOT_PARTIAL
V1_FROZEN_FOR_MIGRATION
```

## 6. 直接迁入 V2 / 冻结 / 淘汰

- 直接复用：object_id、Anchor observation/rebind、Application Command、Proposal DAG、SemanticCommit、inverse Commit、Pending/Recovery、A/B 恢复、Diagnostics、No-Agent 降级、runtime 测试纪律。
- 冻结为只读迁移来源：V1 FileStorage、Phase/Signal 字段、现有 Proposal/Commit/Event、恢复包。
- 淘汰为长期模型：Phase 轴、Signal 存储、Plugin 直写 FileStorage、长期双模式、长期双写、V1 新功能扩展。

## 7. 证据路径

- 计划：`docs/runtime/V1_MVP_PILOT_PLAN.md`
- 运行截图（本地 ignored）：`tmp/runtime/pilot/*.png`
- Pilot Graph（本地 ignored）：`logseq/pages/Task Copilot%2FPilot%2F2026-07-20%2F告警外部推送治理.md`
- 前后恢复包：Downloads 中上述两个 0600 JSON 文件
- FileStorage：`/Users/wangrundong/.logseq/storages/task-copilot-personal-mvp/`
