# V1 MVP copied-data Pilot 计划

- 计划日期：2026-07-20
- 环境：Logseq Desktop 0.10.15，Graph `logseq`，正式插件 0.1.0
- 原则：只操作专用 Pilot 副本；不修改正式来源；先恢复点、后操作、再清理

## 1. 选择与理由

四项使用同一条真实工作语义链“告警外部推送现状梳理与单事件验证”，来源是当前 Graph 中 2026-07-18 的 Graylog 要求及既有 Graylog/Zabbix 治理记录。副本做必要脱敏，不包含内部地址、账号、人员姓名、真实告警载荷或生产脚本。

| 类型 | Pilot 副本 | 代表性 |
|---|---|---|
| Capture | `需要在下周前梳理告警外部推送链路，并用一条脱敏测试事件验证。` | 真实临时要求；可验证来源、待整理、正式化、保留普通、稍后和去重 |
| Task | `[任务] 使用一条脱敏测试事件验证外部推送链路` | 单一可完成承诺；覆盖身份、Anchor、Marker、完成、Undo、reload、rebind |
| MiniProject | `[MiniProject] 完成告警外部推送现状梳理与单事件验证` | 有限结果、多个动作、当前推进和三问式结束；覆盖 Task/MiniProject 边界 |
| Project | `告警外部推送治理 Pilot` | 需要独立重入、摘要、推进、Waiting、Decision/Output 候选和多对象聚合 |

## 2. 副本和来源边界

- 专用页面：`Task Copilot/Pilot/2026-07-20/告警外部推送治理`；
- 每项保留 `Pilot 副本`、来源日期和来源语义说明，不复制敏感原文；
- 正式来源 Block 不移动、不改写、不绑定为 Pilot 对象；
- Pilot 页面和对象 ID 记录在报告，便于精确清理；
- V1 FileStorage 只为本次 V1 Pilot 写入；它不会成为 V2 当前状态源。

## 3. Pilot 前 Gate

- [x] 外层 Git 与 `origin/feature/task-copilot-mvp` 同 SHA；
- [x] 根级 `./scripts/check.sh` PASS：91 tests、145 rules、0 skipped；
- [x] 当前 Store slot-b / generation 92 / revision 90，Pending / Recovery Required 0；
- [x] Agent `none`；
- [x] 既有 13 文件恢复包 checksum 与临时 Store 重放 differences 0；
- [x] 创建本次 Pilot 前恢复包：`/Users/wangrundong/Downloads/task-copilot-pilot-preflight-2026-07-20.json`，SHA-256 `86b07547ab112c36bb01ac1bfd0da8d8913be9b21b37217f4d06cf92deec1154`，重放 differences 0，secret scan PASS；
- [ ] 确认 Pilot 页面此前不存在。

## 4. 执行序列

### 4.1 Capture

1. 在专用页面创建脱敏 Capture Block；
2. 捕获当前块，核对来源页面和原文；
3. 重复捕获同一未变更 Block，检查是否去重或明确报告重复；
4. 对副本分别验证稍后处理、保留普通内容和手工正式化；
5. reload 后检查 Capture/Proposal/处置仍在。

### 4.2 Task

1. 从副本正式化为 Task，记录 object_id 和 Primary Anchor；
2. 核对显式 `[任务]` 表达和 Marker 行为；
3. 完成并检查 Now Work 退出；
4. Undo 并验证正文和领域状态；
5. 移动同一 Block、复制为新 Block、删除后 Undo，检查 Anchor；
6. 若 Logseq Undo 不恢复可解析身份，使用显式 rebind 并保留限制证据；
7. reload 后复核。

### 4.3 MiniProject

1. 正式化有限结果副本，补充当前推进、内部 Task 和普通内部 TODO；
2. 验证 Task / MiniProject 边界和唯一主归属；
3. 移动同一 UUID 与复制新 UUID，确认位置不等于归属；
4. 尝试类型迁移；若 V1 明确拒绝，记录为冻结/迁移缺口，不绕过；
5. 验证三问式关闭是否存在且能恢复；不存在则记录产品 Pilot 失败项。

### 4.4 Project

1. 创建 Project 副本及 Project 页面/入口；
2. 验证摘要、当前推进、Waiting/Blocked、Now Work、Re-entry 和 reload；
3. 关联 Task/MiniProject，检查多对象聚合与主归属；
4. 检查 Decision、Output、Closure 和页面/对象原子关系；
5. V1 未实现的冻结语义只记录，不用临时字段伪造通过。

## 5. 判定规则

- 只有四项要求都由真实 Desktop 证据支持、失败路径可见、恢复与清理通过，才标记 `V1_MVP_PILOT_SUCCESS`；
- 自动测试、已有 RT-MVP-001B..004 或“按钮存在”不能替代本次 Pilot；
- V1 明确延期的 Decision/Output、类型迁移、Project 原子页面若导致产品闭环不成立，结论为 `PARTIAL`，但仍可冻结 V1 并将缺口交给 V2；
- 发现缺陷时按 `diagnosing-bugs`：先构造最小确定性复现，再提出可证伪假设和回归测试，最后修复。

## 6. 恢复与清理

- Pilot 前后各生成恢复包；
- 清理只删除带本计划唯一页面/前缀的副本 Block，不删除未知内容；
- Domain 中已创建的 Pilot 对象若 V1 无物理删除能力，保留为明确 `CANCELLED/ARCHIVED` 或只读迁移证据，并在报告列出；
- 清理后检查 Pilot 页面、临时截图、Pending Commit、Anchor 冲突和 Git worktree；
- 证据截图只存忽略目录，报告记录路径和 checksum，不提交含业务内容的原图。
