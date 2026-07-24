# P2 Slice 计划：复杂对象治理

## P2-A：MiniProject Grill Me

状态：`PARTIAL_UI_AUTOMATED`

已完成的有界部分：Application 已建立 session-only Grill Turn 契约。机器按当前材料中的
critical、priority 与 evidence 选择最大开放不确定性，机器独占 readiness；四个维度和
未分类材料未全部安全解决前不得进入结构预览。模型只能返回理解草稿、事实引用、推断、
未知、最多三问和带取舍的建议，未知 ID、越界证据、固定字段外输出及提前结束均 fail closed。
该契约没有 Proposal、operation 或正式对象写入能力，术语边界见根目录 `CONTEXT.md`。
Local Service 已接入版本化 `mini-project-modeling@1.1.0`、精确 Primary Anchor 子树的
Logseq read bridge、正式对象 Context Package、结构化 Provider、前后 Object/Anchor/子树
stale 重验和两轮 answer→next-focus 自动闭环。回答只成为当前请求的 session fact；路由
不写 SQLite/Graph，也不生成 Proposal。

真实 `deepseek-v4-flash` 已在 Keychain-only 配置下完成两轮 Provider→Validator Gate：第一轮
聚焦 boundary，用户边界回答后第二轮转向 outcome，两轮均保留事实/推断/未知与带取舍建议。
当前 Logseq read bridge 未连接，完整 Service live route 明确返回
`GRAPH_READ_BRIDGE_UNAVAILABLE`，因此没有把 Provider 层 Gate 冒充 Desktop/Service live PASS。

Plugin 已接入 Objects 卡片，并让既有“处理这条内容”在正式 MiniProject Block 上按点击时
身份路由 Grill，未增加固定宿主菜单项；提供 session-only 多轮
理解/事实/推断/未知/建议/问题 UI。每轮前后重验对象，Provider error 保留上一轮，stale、
duplicate、Graph switch/restricted/cleanup 清空与返回原 Block 均已有自动合同；UI 不暴露
Proposal/Review/Commit 动作。独立最终阅读/结构预览也已接线：Application Validator 强制
每项原材料恰好出现一次、root 保留、越界 evidence 拒绝、未归类原位保留和机器零删除；
Service 前后重验同一 Object/Anchor/subtree；Plugin 展示阅读结果与 impact，但没有应用按钮。
真实 `deepseek-v4-flash` 在两次 fail-closed 纠偏后已通过 3/3 材料守恒 Gate。仍未完成：
Graph bridge 完整 live route、真实 Desktop 的 loading/error/reload/返回原 Block与预览，
Proposal Review、Commit/Undo、交互证据接线。

循环：

1. 读取有限子树；
2. 总结当前理解；
3. 区分正式事实、Copilot 判断与未知；
4. 找最大真实分歧；
5. 每轮提出一组相关问题并给推荐；
6. 用户修正后更新理解；
7. 边界、成果、完成判断与无法归类内容都有安全去向后停止；
8. 生成最终阅读预览；
9. 进入 Proposal Review；
10. 正式 Commit 与 Undo。

不得把标题、成果、背景、动作、完成标准逐项固定询问。

## P2-B：MiniProject 原位重构

状态：`PARTIAL_PROPOSAL_CONTRACT_AUTOMATED`

代码审计确认现有通用 Proposal Commit 只能执行一个 Block patch，正式 Adapter 也仍拒绝未完成
Desktop Gate 的 move；因此不复用该路径伪装多 Block 原子性。Application 已新增 Preview→HIGH
Proposal 纯构建合同，Domain 新增受约束 `CREATE_BLOCK` 并收紧 `MOVE_BLOCK` payload：每项操作
记录机器 UUID、正文 hash、原/目标父级与前一相邻位置；原材料不允许 rewrite/delete，未归类
材料不移动，所有操作保持一个不可拆组。focused 13/13、Application 135/135、Domain 42/42 PASS。
该 Proposal 当前只可审阅，通用 Commit 继续 fail closed；专用 ledger/Plugin executor/Desktop
identity Gate 尚未完成。

默认保留原根 Block；原始事实零丢失；无法归类内容进入待判断/原始材料；结构只使用最小骨架和按需区块。

预览必须同时包含：

- 最终阅读效果；
- 标题/成果变化；
- 移动的 Block 数；
- 新增归纳；
- 删除内容（正常应为 0）；
- 无法归类内容；
- 技术 Diff 二级展开。

部分接受只按独立语义组，不按 SQL/Patch/Step。最终一次 SemanticCommit，成功后回根 Block。

## P2-C：Project 创建 Grill Me

状态：`NOT_STARTED`

所有入口：

- 空白新建；
- 当前 Page 升级；
- MiniProject 演化。

都经过至少一轮自适应 Grill Me。材料充分时只确认一个关键边界；材料不足时继续到 Project 是什么、最终形成什么、边界、内部闭环、当前接口和页面/对象关系稳定。

最终仍复用既有 Project prepare → Page create/verify → finalize 原子链。

## P2-D：Project 结构操作路由

状态：`NOT_STARTED`

| 级别 | 示例 | 用户摩擦 |
|---|---|---|
| 轻 | Focus、Condition、reviewAt、明确的一句摘要、普通 Association | 直接命令 + Undo |
| 中 | LLM 摘要优化、更新进入点、连接对象但不改主归属 | 接受并应用 |
| 重 | Ownership、批量子对象、MiniProject 拆建、移动正文、Objectives/Deliverables、拆分合并、Closure、外部 Agent | 讨论、预览、选择、正式应用、Undo |

改变“怎么看项目”可以轻；改变“项目包含什么”必须重。

## P2-E：Closure 证据起草

状态：`NOT_STARTED`

MiniProject 聚合：子树、DONE、Output、Decision、原状态和遗留。

Project 聚合：原目标、Deliverables、Output、Decision、完成 MiniProject、未完成对象、等待/阻塞、遗留、future summary。

用户只处理真实判断。信息不足必须保留 unknown，不杜撰成果。遗留可转 Task、连接已有事项或仅记录，但每项必须有明确去向。

## P2-F：跨对象观察

状态：`NOT_STARTED`

只允许提出：

- 多个 Task 可能属于同一 MiniProject；
- 遗留未承接；
- Project current interface 可能失效；
- Association / Ownership 候选。

要求：

- 先影子模式；
- 候选数量有上限；
- 给出证据；
- 明确是 Copilot 判断；
- 不自动改变 Ownership/Focus；
- 进入待我确认。

## P2-G：Recovery/Rebind/Restore/Migration 向导

状态：`NOT_STARTED`

### Recovery

统一表达“继续完成这次修改”，复用原 semantic_commit_id，禁止创建重复操作。

### Rebind

统一表达“重新连接正文”；候选显示阅读预览，不显示 UUID 列表；保留旧 Anchor 历史。

### Restore

复用既有校验、恢复点、停写、原子切换、Doctor、descriptor 清理和 Service 停止。向导不得另建恢复流程。

### Migration

一次性出现：scan → preview → decisions → backup → import → verify → activate；完成后退出日常 UI，不恢复双写。

## P2 完成否决条件

- Grill Me 变成固定问卷；
- 结构预览遗漏原始事实；
- 未分类内容被静默删除；
- LLM 自动改变 Ownership/Focus；
- Closure 杜撰成果；
- Recovery 用新 Commit 掩盖旧 PENDING；
- Restore/Migration 要求用户复制内部 UUID 或数据库路径；
- 任一高影响流程无法恢复或 Undo。
