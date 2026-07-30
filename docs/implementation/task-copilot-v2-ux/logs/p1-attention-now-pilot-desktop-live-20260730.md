# P1 Attention Now 有界前台 Pilot Desktop Gate

## 结论

首批确定性时间信号已经在真实 Logseq Desktop 进入有界前台 Pilot：只把
`REVIEW_DUE` / `DUE` 装饰到既有正式 Now 卡片，不创建第二张提醒卡，不改变
Lifecycle、Condition、Focus、Ownership、正文或正式对象。`accepted-not-applied`、
`PENDING`、`RECOVERY_REQUIRED`、Anchor 风险与 Graph mismatch 继续由既有权威表面承接，
不在 Now 重复制造同义提醒。

本 Gate 关闭“首批确定性 Attention 没有任何真实前台处置证据”这一项 Partial，但不把
Attention 整体晋升为 Production。跨会话 disposition 是否需要派生持久化、真实
helpful/noise 比例、建议关注以及 Block Marker 仍开放。

## 运行环境

- 日期：2026-07-30
- 分支：`feature/task-copilot-mvp`
- Plugin commit：`3097c39b85d2`
- Logseq：`0.10.15`
- Graph：File Graph `logseq`（专用测试 Graph）
- 宿主 / Plugin 主题：host Light / Plugin Dark
- 窗口：约 `1000×754`
- Service / Store：`READY / READY`
- 最终诊断：formal writes `true`；Pending / Recovery / Source Conflict `0 / 0 / 0`
- Provider：本 Gate `0` 次；不涉及 Skill、Prompt 或 Validator 变化

## 自动证据

- Plugin typecheck：PASS。
- Attention runtime + UI 聚焦测试：`83/83` PASS。
- Plugin 全量测试：`370/370` PASS，`0` failed / skipped。
- Plugin build：PASS。
- 根级 `./scripts/check.sh`：PASS；规则覆盖 `145`，acceptance rehearsal PASS。
- npm audit 仍报告既有 `4` 项（`3 high / 1 critical`），本 Slice 未用破坏性
  `audit fix --force` 扩大范围。

新增回归覆盖：

1. accepted-not-applied 与时间信号同对象时，既有高优先级表面获胜，不重复生成 Now 卡；
2. `本次先不提醒` 在同一 scope 内保持 24 小时 session cooldown；
3. `本次不相关` 在同一 scope 内保持 7 天 session cooldown；
4. 事实消失自动失效，evidence scope 改变解除旧 disposition；
5. UI 只在同一正式卡片显示试用标记和两个低频处置，不暴露 Signal 枚举或 identity。

## 真实 Desktop 操作链

1. 从 Logseq `更多 → 插件 → Task Copilot → 重载` 装载精确构建。
2. 初始 Now 没有符合条件的时间样本；通过既有 Condition 控制器把测试对象
   `迁移测试任务` 设为 Waiting，填写有界 waitingFor / expectedResult / reason，并把
   reviewAt 设为 `2026-07-29 09:00`。正式状态经 Local Service 保存。
3. Now 重算后，该对象只在“需要回看”保留一张卡，卡片显示
   `Copilot 提醒 · 试用`；工具栏显示 `1 项到期复查`。
4. 展开同一卡片“更多操作”，可见 `本次先不提醒` 与 `本次不相关`。没有新增一级导航、
   Attention 列表或第二张提醒卡。
5. 点击 `本次先不提醒`：试用标记立即消失，正式卡片、Waiting 事实和主动作仍在；顶部
   明确说明“正式事项没有变化”。
6. 再次通过 Plugin Manager 真实重载：session disposition 清除，同一仍到期事实重新生成
   试用标记，证明当前为可重算 session-only，而不是隐藏 SQLite authority。
7. 点击 `本次不相关`：同一 session 再次只收起试用标记，正式事项不变。
8. 使用现有“确认是否已收到”入口把测试对象恢复为 Actionable；Now 回到原基线。最终系统
   状态为“可以正常使用”，技术诊断显示精确 commit、Service/Store READY 和 `0/0/0`。

## CURRENT 截图

| 文件 | 用户动作 | 主结论 |
|---|---|---|
| `current-ui/screenshots/p1-attention-now-pilot-current-3097c39.png` | 保存到期 Waiting 后查看 Now | 一张正式卡片承载试用标记；没有重复提醒卡 |
| `current-ui/screenshots/p1-attention-now-pilot-deferred-current-3097c39.png` | 点击“本次先不提醒” | 卡片与正式 Waiting 事实保留，只收起试用标记 |
| `current-ui/screenshots/p1-attention-now-pilot-reload-recompute-current-3097c39.png` | 真实 Plugin reload 后再看 Now | 同一事实按 session 重算，试用标记重新出现 |

三张图均为 `CURRENT`，不包含 API Key、Service token、正文 identity 或技术数据库路径。

## Pilot 数据与边界

- 人工构造的 eligible object：`1`
- 同屏正式卡片：`1`
- 重复 Attention 卡：`0`
- 代表性 disposition：`LATER 1`、`NOT_RELEVANT 1`
- Provider / Validator rejection / retry / abstention：`0 / 0 / 0 / 0`
- 正式写入：只有测试 Condition 的既有正式更新与最后恢复；两个 Attention disposition
  均为零正式写入。
- helpful/noise：本轮两个处置是同一人工样本的合同验证，不可当作真实 helpful/noise
  比率；因此不据此开放 Waiting 过久、Project 静默、LLM 跨对象观察或建议关注。

## 复杂度变化

- 新增正式状态：`0`
- 新增 Runtime：`0`（复用既有 `AttentionShadowSession`）
- 新增 Attention 类型 / Detector：`0`
- 新增 Recovery 分支：`0`
- 新增 Skill / Prompt / Validator：`0`
- 新增写入权威：`0`
- 新增长期 Partial：`0`
- 关闭既有 Partial：`1`（首批确定性 Attention 前台处置与 reload/recompute 代表 Gate）
- Partial 净变化：`-1`

结构化日志只记录 signal type 与 disposition 结果，不记录 object identity 或正文。跨会话
派生持久化保持未授权、未实现；是否需要它必须由后续多日真实噪声数据证明。

## 当前状态

- P1-A：`PARTIAL_RUNTIME_SHADOW_BOUNDED_NOW_PILOT`
- P1-B：`PARTIAL_TIMING_PILOT_OTHER_DETECTORS_SHADOW`
- P1-C：`PARTIAL_DESKTOP_FRONTSTAGE_TIMING_PILOT_HELPFUL_NOISE_OPEN`
- Block Marker：继续默认关闭 prototype
- 完整 Goal：`IN_PROGRESS`
