# Task Copilot V2 复杂度台账

> 状态：`ACTIVE`
> 适用范围：UX 产品化 Goal P0 / P1 / P2 / Final Release
> 原则：控制复杂度是交付完整 Goal 的方法，不是删减 Goal 的理由。

## 当前发布阻断台账

| 风险 | 等级 | 当前证据 | 统一缓解措施 | 阻断发布 |
|---|---|---|---|---|
| Partial 长期堆积 | HIGH | P0 宿主 Gate、P1 前台化、P2-E 失败链、P2-G 双重 Restore/Migration 失败链仍 OPEN | 暂停新正式对象/导航/Slice；每轮优先把已有 `PARTIAL/SHADOW/PROTOTYPE/AUTOMATED_ONLY` 升级为有代表性 Desktop 证据的 DONE | 是 |
| Recovery 语义分裂 | HIGH | Commit、Rebind、Restore、Migration 内部账本精细，但前台曾有分散术语与入口 | 所有场景只翻译为：未应用、可继续、已应用可撤销、需重新连接、需手工恢复；统一进入系统状态/最近修改/备份恢复，不创建第二 Recovery Kernel | 是 |
| 状态组合膨胀 | MEDIUM | 正式 Lifecycle/Condition/Focus 与 Proposal/Commit/Anchor/Service 等运行事实同时存在 | 新 UI 状态必须派生且 session-only；一对象只显示一个按数据安全、恢复、阻塞、时间的优先结论；新正式状态需单独证明不可替代性 | 是 |
| Agent / LLM 平行小系统 | MEDIUM | Context Recovery、Grill、Creation、Closure、Cross-object 都有场景差异 | 共享 Context Package、Fact/Inference/Unknown、Action Authority、Grill Turn、Preview Handle、Proposal Factory、Validator、Interaction Evidence 与 Provider/stale 处理；Skill 不得重建运行时 | 是 |
| Skill/Prompt/Validator 补丁化 | MEDIUM | 已有多个版本和真实 Provider 失败样本，但尚缺单一生命周期台账 | 只保留 `EXPERIMENTAL/SHADOW/CANDIDATE/PRODUCTION/RETIRED`；晋升看固定样本、真实 Provider、拒绝/重试/abstain/helpful-noise/越权；旧版退休而非永久兼容 | 是 |
| Desktop 验收笛卡尔积 | HIGH | 宿主、主题、宽度、错误和恢复组合已很多 | 三层代表矩阵：高频日常覆盖 Block/Page/sidebar/Query-reference/Light-Dark/窄栏/reload/Graph switch；复杂操作覆盖 Preview/HIGH/Commit/reload/Undo/stale/Recovery；低频高风险覆盖正常、一种失败、自动回滚、手工入口、restart | 是 |
| 文档/代码/截图漂移 | HIGH | 历史 Desktop 证据多，最新安全提交可能没有新 UI | 截图必须记录 commit 并分 `CURRENT/HISTORICAL/SUPERSEDED`；自动-only 安全修复不借用旧截图升级 Desktop 状态；每轮同步 status/progress/acceptance/plan/current-ui | 是 |
| 后台工程概念泄漏 | MEDIUM | `4dfe014` 的最新 Desktop 已证明“现在”移除重复运行条、“更多”使用用户维护语义、系统状态默认折叠工程诊断；高级 Review/Grill/Project/Migration/Restore 表面仍需逐场景复核 | 默认只显示一个主结论、1—2 条依据、一个主操作、最多两个快速处置；版本/ID/checksum/机器理由只进技术详情/Audit；以代表性复杂链继续压缩而不新增说明层 | 是 |

## 本轮变化（2026-07-26）

- 新增正式状态：`0`。
- 新增顶层导航：`0`。
- 新增 Agent Runtime / Prompt 系统 / Recovery Kernel：`0`。
- 复用：既有 Restore `ARMED/RECOVERY_REQUIRED/INVALID` 安全事实、Launcher per-Graph lifecycle gate、Local Service 离线 Restore/Doctor、用户系统状态与同一个恢复入口。
- 新前台状态仍为 `0`：准备/忙碌是 session-only UI 事实；固定确认只用于现有恢复命令，不进入 Domain。
- 恢复执行没有新增路径/快照 ID/SQLite 权限：Launcher 只编排进程，Local Service 从私有互锁推导唯一恢复点；失败保持同一安全锁和同一重试入口。
- 受控 `RECOVERY_REQUIRED` 已升级为 `MANUAL_RECOVERY_CONTROLLED_DESKTOP_DONE_REAL_DOUBLE_FAILURE_OPEN`：复用同一互锁、HIGH Review、离线 Restore、Doctor、清锁和重连，没有新增恢复页面或第二 Undo 逻辑。
- 删除/合并的重复机制：恢复成功后不再维护 Plugin 自己的陈旧只读结论，而是复用 bounded runtime recovery 刷新 `featureReady`、Store 与既有投影；健康/恢复页共用用户状态翻译，内部枚举只留技术详情。
- 本轮真实界面问题推动通用合同修复，不增加样本特例、Prompt、Skill 或 Validator；LLM 未调用，拒绝率/重试不适用。
- 仍阻断 P2-G：真实双重失败→HIGH Review→恢复→重连→reload、Light/窄栏、Migration failure/interruption。
- `25ddac9` / `4dfe014` 关闭高频壳层发布阻断：删除主面板重复运行条，统一“更多”、启动、知识库切换和系统状态的用户语言；连接恢复只有在正式修改也可用时才报告成功。
- exact build `4dfe014902a3` 已完成后台真实 Plugin reload、默认用户层工程词扫描 `0` 和三张 CURRENT Desktop 截图；工程概念泄漏由 HIGH 降为 MEDIUM，但高级 Review/Grill/Project/Migration/Restore 表面仍阻断发布。
