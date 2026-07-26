# Screenshot Index

## CURRENT

共同环境：`feature/task-copilot-mvp`，Logseq Desktop `0.10.15`，测试 Graph `logseq`，
Dark，真实 Plugin/Launcher/Service；viewport 以各场景记录为准；无 API Key、token 或私人正文。

| 文件 | commit | 场景与用户动作 | 系统结果 | 下一步 / 已知问题 |
|---|---|---|---|---|
| `screenshots/p2-c-18-page-undo-confirm-current-dark.png` | `913bbda4528f` | Page 来源 Project 经完整 restart 后，从最近修改进入专用 Undo | 原账本 UUID 已漂移，但界面只要求撤销正式 Project/Anchor；明确复用来源 Page 保留、专用 Page 仅在仍属本事务且为空时删除 | Review 历史卡片仍偏长 |
| `screenshots/p2-c-19-page-undo-complete-current-dark.png` | `913bbda4528f` | 显式勾选并确认 Project Creation inverse Commit | Project、Anchor 与本事务拥有的空 Page 已安全撤销；Audit 与 inverse Commit 保留 | 删除事件会短暂触发一次正文核对，需冷启动收敛 |
| `screenshots/p2-c-20-page-post-undo-restart-healthy-current-dark.png` | `913bbda4528f` | Undo 后完整退出并重开 Logseq，再进入系统状态 | Runtime/Store/Service READY；Pending/Recovery/Source Conflict `0/0/0`；`reconciliationRequired:false`；来源正文仍在、专用 Page/Project 不在 | MiniProject、Light/窄栏仍开放 |
| `screenshots/p2-c-21-page-reuse-preview-current-dark.png` | `913bbda4528f` | 同一 Page 来源明确覆盖原“另建”材料，选择升级当前 Page；七项答案就绪并生成最终阅读 Preview | 关系为复用当前 Page；Project Object 仅以 Anchor 关联，不写 Page 属性/正文；仍为零正式写入 | readiness 事实区偏长，Preview 有重复“完成证据”标签 |
| `screenshots/p2-c-22-page-reuse-created-current-dark.png` | `913bbda4528f` | HIGH Review/Commit 完成后自动回到原 Page | 当前 Page 三段正文可见且无 ownership metadata；Graph 逐字段读回与创建前完全一致；Project/Anchor 已在正式投影 | 截图本身只显示返回现场，正式创建由 Audit/Graph 读回证明 |
| `screenshots/p2-c-23-page-reuse-undo-current-dark.png` | `913bbda4528f` | restart 后从最近修改执行 Page-aware inverse Commit | 用户结果明确“Project 与 Anchor 已撤销；复用的来源 Page 保持原样” | 仍需 MiniProject 来源 |
| `screenshots/p2-c-24-page-reuse-post-undo-restart-healthy-current-dark.png` | `913bbda4528f` | Page reuse Undo 后再次完整 restart | Runtime/Store/Service READY；`0/0/0`；reconciliation false；Project 不在投影，Page 逐字段等于创建前 | Light/窄栏与 MiniProject OPEN |
| `screenshots/p2-c-29-mini-evolution-grill-ready-current-dark.png` | `7d4f5e4721f5` | 从 OPEN MiniProject 发起演化；七项自适应 Grill 已解决 | 前台只保留用户事实、少量判断和一个主动作；不含 object/root ID、fact key 或错误的来源关闭建议 | 已确认事实区仍偏长 |
| `screenshots/p2-c-30-mini-evolution-preview-current-dark.png` | `7d4f5e4721f5` | 用户生成最终阅读 Preview | 专用 Project Page、持续成果/证据/内部闭环/当前接口完整；五个来源 Block 均为 `LINK_AS_SOURCE`，仍零正式写入 | 模型曾建议嵌入，但用户 link-only 决定与机器合同最终获胜 |
| `screenshots/p2-c-31-mini-evolution-high-review-current-dark.png` | `7d4f5e4721f5` | 从 Preview 进入待我确认 | 单一 `create-project` HIGH 组为 PENDING；Project/Page/Object/Commit 尚未创建 | Review 长正文仍需压缩 |
| `screenshots/p2-c-32-mini-evolution-accepted-high-current-dark.png` | `7d4f5e4721f5` | 勾选 HIGH 影响确认后只接受语义组 | 状态为 ACCEPTED；界面明确仍需提交前检查与最终创建 | “尚不能确认安全撤销条件”与可撤销动作的表达仍不一致 |
| `screenshots/p2-c-33-mini-evolution-created-project-current-dark.png` | `7d4f5e4721f5` | 最终确认后原子创建并自动打开新 Project Page | 专用 Page、Project v2 与 active Primary Anchor 已读回；来源 MiniProject 子树逐字段不变 | 新 Page 首屏直接显示 ownership/object/commit properties，工程味过重 |
| `screenshots/p2-c-34-mini-evolution-reload-reentry-current-dark.png` | `7d4f5e4721f5` | Logseq 页面 reload 后重新打开 Task Copilot 项目区 | 新 Project 的版本化当前接口可从正式投影重入；来源仍为 v14/OPEN | reload 初始核对提示会在同步后收敛 |
| `screenshots/p2-c-35-mini-evolution-undo-confirm-current-dark.png` | `7d4f5e4721f5` | 从最近修改对最新 Project Creation 发起专用 Undo | 明确撤销 Project/Anchor；来源 Page 永不删除，专用空 Page 仅在仍属本事务时删除 | 历史卡片密度偏高 |
| `screenshots/p2-c-38-mini-evolution-undo-source-return-current-dark.png` | `7a7492a407ed` | 最新构建重跑真实 DeepSeek→Preview→HIGH Review→Commit→reload 后执行专用 inverse Commit | Project、Anchor 与本事务拥有的空 Page 已撤销；路由精确返回原 MiniProject 根 Block并显示成功结果；来源四个子 Block 可见 | 右侧栏仍保留测试 Graph 旧页面，不属于本次正式变化 |
| `screenshots/p2-c-39-mini-evolution-undo-reload-healthy-current-dark.png` | `7a7492a407ed` | Undo 返回来源后再次 reload，打开用户系统状态并展开诊断 | Runtime/Store/Service READY；commit 与 Logseq 版本可见；Pending/Recovery/Source Conflict `0/0/0`；reconciliation false | Light/窄栏仍 OPEN |
| `screenshots/p2-d-05-project-narration-undo-reload-current-dark.png` | `ae2395523798` | MEDIUM 当前摘要完成真实 Provider、Review、Commit、reload、最近修改专用 Undo，再次 reload 后查看最近修改 | 原修改显示“已撤销”，inverse Commit 与 Audit 保留；顶部正确显示“Copilot 可用 · 建议需审阅”；Project 原摘要和全部结构字段已读回 | Review 正文仍偏长；Light/窄栏 OPEN |
| `screenshots/p2-d-06-project-impact-router-current-dark.png` | `ae2395523798` | 从正式 Project 点击“调整 Project” | 最新界面按低摩擦、审阅后应用、深度结构三层说明影响；MEDIUM 真实入口可用；Ownership/正文移动/Closure 不会降级 | LIGHT 可发现 Undo 与多类 HEAVY 纵向链仍 OPEN |
| `screenshots/p2-d-07-heavy-interface-accepted-current-dark.png` | `ae2395523798` | 用户填写完整 Project interface，独立接受单组 HIGH Proposal | Objectives、Deliverables、Work Stages、摘要与三项 Focus 已在最终预览；仍未正式应用，需提交前重验和最终确认 | 语义组名与 operation code 仍偏工程化 |
| `screenshots/p2-d-08-heavy-interface-reload-current-dark.png` | `ae2395523798` | 最终 Commit 后 reload，再打开“现在” | 新摘要和前两项 Focus 从 SQLite 正式投影可读；Provider 状态与 Runtime/Store READY | Now 卡只显示前两项 Focus，完整结构需下钻 |
| `screenshots/p2-d-09-heavy-interface-undo-current-dark.png` | `ae2395523798` | 从最近修改执行 Project interface 专用 inverse Commit | HEAVY 修改显示“已撤销”，历史证据保留；Project 重入回到原“进入点不明确” | 最终健康需 reload 证据 |
| `screenshots/p2-d-10-heavy-interface-undo-reload-healthy-current-dark.png` | `ae2395523798` | HEAVY Undo 后再次 reload，打开用户系统状态 | 系统首屏明确正常、能力可用、数据安全、无需操作；展开技术诊断可读 exact commit 与 `0/0/0` | Light/窄栏仍 OPEN |
| `screenshots/p2-d-11-light-condition-router-current-dark.png` | `58bf6306d04d` | 从 Project 重入进入影响路由 | Condition 与正式 Undo 可操作；无 inverse 的普通 Association 明确禁用，不计入最终 Gate | 路由较高；英文领域术语与 Light/窄栏仍需收口 |
| `screenshots/p2-d-12-light-condition-undo-after-reload-current-dark.png` | `58bf6306d04d` | Project PAUSED 后 reload，再从影响路由进入“撤销最近状态” | 明确“我先暂停”恢复为“可以行动”；确认时重验版本/Condition，不改变其他正式边界 | Condition 表单应更明确显示目标标题 |
| `screenshots/p2-d-13-light-condition-undo-reload-current-dark.png` | `58bf6306d04d` | 正式 inverse 完成后再次 reload，打开 Project 重入 | Project 回到 ACTIONABLE 的确定性基线；最终 v10，原摘要/Focus/空结构逐字段守恒 | 进入点本身仍不足，Context Recovery 属 P1 后续 |
| `screenshots/p2-e-01-closure-evidence-entry-current-dark.png` | `ec1a70d848d6` | 从 Project 重入进入影响路由 | Closure 只提供“整理证据”，明确不会生成 Proposal 或完成 Project | 路由仍有较多英文领域词；Light/窄栏 OPEN |
| `screenshots/p2-e-02-closure-evidence-empty-current-dark.png` | `ec1a70d848d6` | 用户打开空材料 Project 的 Closure 证据预览 | 原目标、交付、Decision、已完成工作均保持 unknown；不把模型、关联或孙级对象当成果 | 单屏高度不足以同时显示全部用户判断 |
| `screenshots/p2-e-03-closure-evidence-reload-recompute-current-dark.png` | `ec1a70d848d6` | 预览打开时 reload Plugin，再次进入同一路径 | session preview 未持久化；Runtime/Store READY，并从同一正式 Project v10 重算；前后零 Proposal/Commit | 真实 Provider 与正式 Closure 链仍 OPEN |
| `screenshots/p2-e-04-closure-evidence-judgments-current-dark.png` | `ec1a70d848d6` | 滚动到证据预览底部核对用户判断与操作 | 前台收敛为五项真正需要判断的内容；唯一按钮为“取消”，明确下一阶段才进入 HIGH Review/Commit | “Proposal/Primary Ownership/Commit”等工程词仍需状态翻译 |
| `screenshots/p2-e-10-closure-undo-available-dark-994x701.jpg` | `06907f34b8d2` | 在最新构建中 reload 已完成的 Closure，进入待我确认 | 完成卡只提供一个专用“撤销 Project Closure”；说明恢复 OPEN、移除本次 Closure且不改 Logseq Page | 前向 Provider/Review 截图来自 `1ec63ac`，见 HISTORICAL |
| `screenshots/p2-e-11-closure-undo-completed-dark-994x701.jpg` | `06907f34b8d2` | 勾选精确影响确认并执行 Closure inverse Commit | 即时结果明确“已撤销”，历史证据保留；自动返回 Project 重入，Project 再次可推进 | Review 历史列表信息密度仍高 |
| `screenshots/p2-e-12-closure-undo-reload-active-project-dark-994x701.jpg` | `06907f34b8d2` | 从 Logseq Plugin Manager reload Task Copilot 后重新打开 | Runtime/Store READY；Now Work 重新显示同一 Project；CLI 回读 OPEN v13、Closure absent，异常 Commit 0/0/0 | 当前构建的 failure/Recovery Desktop Gate OPEN |
| `screenshots/p2-g-07-rebind-capture-entry-dark-994x700.jpg` | `344c705ec446` | reload 发现一个合成正式事项的旧正文不可用，用户进入系统状态 | 前台只说明正式事项仍保留、受影响能力和数据安全；唯一主动作是“开始重新连接” | Rebind 专用 Undo 引导仍 OPEN |
| `screenshots/p2-g-08-rebind-capture-window-dark-994x700.jpg` | `344c705ec446` | 用户启动受控选择并回到 Logseq 新建替换 Block，再打开 Task Copilot | 明确 5 分钟上限、暂缓自动物化、取消/提交后恢复；Service 此时匹配正式对象数为 0 | 窗口期间其他显式编辑也会排队，故必须保持短时且用户主动 |
| `screenshots/p2-g-09-rebind-capture-preview-dark-994x700.jpg` | `344c705ec446` | 用户预览新正文并选择原连接不可用的事项 | 只显示标题、类型和翻译状态；无 UUID/Anchor ID/hash，正式事项与主归属保持说明可读 | 当前截图在勾选最终影响确认前 |
| `screenshots/p2-g-10-rebind-capture-success-dark-994x700.jpg` | `344c705ec446` | 用户勾选单独确认并提交正式 Rebind | 新正文连接成功、旧连接保留历史；恢复自动同步后匹配正式对象仍为 1 | 页面标题在即时窗口仍短暂显示正文核对，reload 后收敛 |
| `screenshots/p2-g-11-rebind-capture-reload-clean-dark-994x700.jpg` | `344c705ec446` | Plugin Manager reload 后打开用户系统状态 | Task Copilot 可以正常使用、数据安全、无需操作；Anchor issue 已消失 | Restore/Migration 与 Rebind Undo 引导仍 OPEN |
| `screenshots/p2-g-12-rebind-capture-build-identity-dark-994x700.jpg` | `344c705ec446` | reload 健康后展开技术诊断 | Plugin commit、Logseq 0.10.15、Runtime/Store/Service READY、`0/0/0` 与 explicit sync healthy 同屏 | 诊断属于证据层，不是日常必读 UI |
| `screenshots/p2-g-13-backup-catalog-current-6ae8f2f.jpeg` | `6ae8f2fcebd0` | reload 最新构建后进入“更多 → 备份与恢复” | 两个 Service 管理快照只显示时间、四项正式事项与完整性 PASS；无 ID/路径 | 当前产品 UI 的状态差异读回仍 OPEN |
| `screenshots/p2-g-14-restore-impact-review-current-6ae8f2f.jpeg` | `6ae8f2fcebd0` | 选择快照并由 Service 再校验 | 最终影响明确 SQLite 替换、Logseq 正文不改写、当前状态先保留恢复点；单独确认未勾选 | failure 注入仍 OPEN |
| `screenshots/p2-g-15-restore-success-current-6ae8f2f.jpeg` | `6ae8f2fcebd0` | 先验证未确认零请求，再勾选并正式 Restore | Service 自停并由 Launcher 重建；Plugin 自动回到 READY；成功态不再残留旧错误 | 即时重连过程很短，截图捕获最终稳定态 |
| `screenshots/p2-g-16-restore-reload-catalog-current-6ae8f2f.jpeg` | `6ae8f2fcebd0` | Plugin Manager reload 后再次打开快照目录 | 两个快照增至三个，恢复前恢复点跨 reload 可见且完整性 PASS | 反向 Restore 仍 OPEN |
| `screenshots/p2-g-17-restore-build-diagnostics-current-6ae8f2f.jpeg` | `6ae8f2fcebd0` | reload 后打开系统状态并展开技术诊断 | Commit、Logseq 0.10.15、Runtime/Store/Service READY、`0/0/0` 同屏 | 诊断只作为证据层 |
| `screenshots/p2-g-18-restore-state-delta-actionable-current-6ae8f2f.jpeg` | `6ae8f2fcebd0` | 测试 Task 已正式变为 PAUSED 后，从旧快照 Restore 并回到“现在” | Local Service 逐字段从 `PAUSED v6` 回到 `ACTIONABLE v5`；同一 Task 再次显示“当前可以继续推进” | 反向 Restore 的 PAUSED 读回由结构化 Service 证据承担 |
| `screenshots/p2-g-19-restore-state-delta-roundtrip-health-current-6ae8f2f.jpeg` | `6ae8f2fcebd0` | 再从自动恢复点反向恢复 PAUSED，最后恢复原 ACTIONABLE 基线并 reload | 正反往返均逐字段读回；最终 Runtime/Store/Service READY、`0/0/0`、reconciliation false | Restore failure 注入与 Light/窄栏仍 OPEN |
| `screenshots/p2-g-20-migration-readonly-scan-entry-current-15b976d.jpeg` | `15b976d28ec3` | reload exact build 后进入“更多 → 迁移” | 入口只允许明确选择 Recovery Bundle 和只读检查；当前没有迁移计划 | Dark 宿主上的 Plugin 仍为浅色表面；主题 Gate OPEN |
| `screenshots/p2-g-21-migration-readonly-scan-result-current-15b976d.jpeg` | `15b976d28ec3` | 原生文件选择器选取 2 KB 脱敏 Bundle 并点击只读检查 | 显示 2 项分类、正式变化 0、尚未创建计划；无 identity/hash/正文 | 逐项审阅入口尚未开放 |
| `screenshots/p2-g-22-migration-readonly-scan-abandoned-current-15b976d.jpeg` | `15b976d28ec3` | 用户点击“放弃这份材料” | 文件选择与摘要清空，顶部明确当前会话不再保留内容 | 不代表正式 Migration Undo |
| `screenshots/p2-g-23-migration-readonly-scan-reload-cleared-current-15b976d.jpeg` | `15b976d28ec3` | 再次扫描后直接 reload，重新进入迁移 | 回到未选择文件/没有计划，session 材料没有跨生命周期残留 | Graph switch 仍由自动 Gate 覆盖 |
| `screenshots/p2-g-24-migration-readonly-scan-invalid-current-15b976d.jpeg` | `15b976d28ec3` | 选择非法 JSON 并只读检查 | 未发起 Service scan；用户层错误可重试且旧摘要不残留 | Service failure 注入仍 OPEN |
| `screenshots/p2-g-25-migration-readonly-scan-build-health-current-15b976d.jpeg` | `15b976d28ec3` | 只读成功、放弃、reload 与非法输入后展开系统诊断 | exact commit、Logseq 0.10.15、Runtime/Store/Service READY、`0/0/0` | 诊断只作为证据层 |

## HISTORICAL

以下文件都是真实 Logseq/DeepSeek 运行证据，但不代表当前 `913bbda` 界面：

| 文件 | 状态 | 构建状态 | 仍可证明 | 被替代原因 |
|---|---|---|---|---|
| `p2-c-01-project-creation-entry-dark.png` | SUPERSEDED | `c9c29b7` | 三来源入口曾真实可达 | `p2-c-11` 使用当前提交重拍 |
| `p2-c-02-blank-grill-first-question-dark.png` | HISTORICAL | `c9c29b7` + 待提交 Validator 修复 | DeepSeek 中文单问通过 | 拍摄时源码并非可引用 commit |
| `p2-c-03-blank-grill-answer-dark.png` | HISTORICAL | 同上 | 回答进入 session，不写正式状态 | 同上 |
| `p2-c-04-blank-grill-ready-dark.png` | HISTORICAL | 同上 | 多轮后机器 readiness 到达 Preview | 同上 |
| `p2-c-05-final-reading-preview-dark.png` | HISTORICAL | 同上 | Blank Preview 合法、无来源材料、关系待 Review | 同上 |
| `p2-c-06-project-creation-review-dark.png` | HISTORICAL | 同上 | HIGH Proposal Review | 同上 |
| `p2-c-07-accepted-not-applied-dark.png` | HISTORICAL | 同上 | 接受不等于应用 | 同上 |
| `p2-c-08-project-created-after-reload-dark.png` | SUPERSEDED | `0b4ffc622fcc` | 同一恢复事务正式创建并跨 reload 可读 | 后续真实 Undo 又发现并修复 action/deletePage 契约 |
| `p2-c-09-project-creation-undo-complete-dark.png` | SUPERSEDED | `d81b1a84f165` | Blank 专用 Undo 完成 | `p2-c-19` 使用最终 identity 漂移修复重拍 |
| `p2-c-10-post-undo-reload-healthy-dark.png` | SUPERSEDED | `d81b1a84f165` | Blank Undo 后 reload 健康 | `p2-c-20` 使用最终构建与完整 restart 重拍 |
| `p2-c-11-project-creation-entry-current-dark.png` | HISTORICAL | `d81b1a84f165` | Grill-first 入口、旧直建 bypass 不可见 | 当前构建未重拍入口 |
| `p2-c-12-page-readiness-current-dark.png` | HISTORICAL | `8658643` 前后的 Page Gate 运行 build | Page 七维 readiness 由机器控制 | 早于最终 identity/diagnostics 修复 |
| `p2-c-13-page-preview-current-dark.png` | HISTORICAL | 同上 | 真实 Page Preview 逐条保留三段来源 | 同上 |
| `p2-c-14-page-high-review-current-dark.png` | HISTORICAL | 同上 | 单组 HIGH Review 与零正式影响 | 同上 |
| `p2-c-15-page-project-created-current-dark.png` | HISTORICAL | 同上 | Project/Anchor/受控 Page 正式创建 | 同上 |
| `p2-c-16-page-reload-restricted-dark.png` | HISTORICAL | 同上 | raw reload 曾留下受限诊断现场 | 最终构建已修复 mounted diagnostics refresh |
| `p2-c-17-page-restart-recovered-current-dark.png` | HISTORICAL | 同上 | 完整 restart 后 Service 恢复 | 随后发现 runtime UUID 漂移会阻断旧 Undo |
| `p2-c-25-mini-evolution-identity-leak-historical-dark.png` | HISTORICAL | `7d4f5e4` 前的真实 MiniProject Grill build | Validator 曾让 object/root identity 和未授权替代方案进入前台 | identity 现在只能留在机器 Context，不得进入问题或建议 |
| `p2-c-26-mini-evolution-safe-grill-current-dark.png` | SUPERSEDED | `7d4f5e4` 前的真实修复 build | 第一轮 identity 修复后能安全继续 Grill | 后续又发现 fact key 与 closure 对象问题，已由 `p2-c-29` 替代 |
| `p2-c-27-mini-evolution-fact-key-leak-historical-dark.png` | HISTORICAL | `7d4f5e4` 前的真实 MiniProject Grill build | 模型曾复制 `answer-*` / `source-*` 机器键 | frontstage Validator 已拒绝机器 fact key |
| `p2-c-28-mini-evolution-wrong-closure-target-historical-dark.png` | HISTORICAL | `7d4f5e4` 前的真实 MiniProject Grill build | 模型曾把 Project 内部闭环误解为关闭/归档来源 MiniProject | Skill 1.5.0 明确 closure 对象是新 Project 的运行/复盘闭环 |
| `p2-c-36-mini-evolution-undo-complete-current-dark.png` | SUPERSEDED | `7d4f5e4721f5` | Project/Anchor/专用空 Page 的 inverse Commit 当时已安全完成 | 完成后误回 Journal；`p2-c-38` 已证明最新构建返回原 MiniProject 根 Block |
| `p2-c-37-mini-evolution-undo-reload-healthy-current-dark.png` | SUPERSEDED | `7d4f5e4721f5` | 当时 reload 后 `0/0/0` | `p2-c-39` 使用含来源返回修复的 `7a7492a407ed` 重拍 |
| `p2-d-01-project-impact-router-current-dark.png` | SUPERSEDED | `419c9e6de950` | 16 类影响路由曾真实可达 | `p2-d-06` 使用 MEDIUM 链和 Copilot 状态修复后的当前提交重拍 |
| `p2-d-02-project-narration-review-current-dark.png` | HISTORICAL | `eb1ff07424bd` | 真实 DeepSeek 草稿通过 Validator 后进入单组 MEDIUM Review，正式状态仍未改变 | 顶部仍使用误导的旧 V1 `Agent disabled` 文案；`ae23955` 已修正 |
| `p2-d-03-project-narration-applied-current-dark.png` | HISTORICAL | `eb1ff07424bd` | Commit 后摘要可读，current focuses 与结构字段不变 | 当时尚未发现最近修改把 narration 错路由到通用 Block Undo |
| `p2-d-04-project-narration-undo-current-dark.png` | SUPERSEDED | `f6d0429` | 专用 Project interface inverse Commit 已恢复原摘要 | `p2-d-05` 使用 Copilot 状态修复后的提交并包含 reload 后最近修改证据 |
| `p2-e-05-closure-user-confirmation-dark-994x701.jpg` | HISTORICAL | `1ec63ac` | 确定性证据后只收集用户必须判断的 Closure 事实 | 后续 Undo 构建为 `06907f3`，未重拍同一步 |
| `p2-e-06-closure-user-judgments-filled-dark-994x701.jpg` | HISTORICAL | `1ec63ac` | 实际结果、逐 Objective disposition、遗留、Decision 与未来重入已在前台确认 | 同上 |
| `p2-e-07-closure-real-provider-loading-dark-994x701.jpg` | HISTORICAL | `1ec63ac` | 真实 DeepSeek loading 时确定性基线和用户输入仍保留 | 同上 |
| `p2-e-08-closure-real-provider-high-review-dark-994x701.jpg` | HISTORICAL | `1ec63ac` | 真实 Provider 结果通过 Validator 后进入单组 HIGH Review，仍未正式写入 | 同上 |
| `p2-e-09-closure-commit-completed-no-undo-dark-994x701.jpg` | SUPERSEDED | `1ec63ac` | 真实 Commit 已完成，同时暴露完成态没有专用 Undo 的产品缺陷 | `06907f3` 已补齐并由 `p2-e-10`～`p2-e-12` 替代 |
| `p2-g-01-anchor-missing-dark-994x700.jpg` | SUPERSEDED | `46b45c3f11e1` | 真实 missing Anchor 用户状态与阅读卡 | `p2-g-07` 使用受控捕获构建替代 |
| `p2-g-02-rebind-reading-preview-dark-994x700.jpg` | SUPERSEDED | `46b45c3f11e1` | identity-free Preview 与候选翻译真实可达 | `p2-g-09` 使用当前构建与无竞态目标替代 |
| `p2-g-03-rebind-confirmed-dark-994x700.jpg` | HISTORICAL | `46b45c3f11e1` | 单独确认和候选选择未泄露机器身份 | 同一新 Block 已被普通同步先物化，随后安全拒绝 |
| `p2-g-04-rebind-target-already-owned-rejected-dark-994x700.jpg` | HISTORICAL | `46b45c3f11e1` | Service 对已有正式连接目标零写入拒绝 | 当前 `344c705` 已把同类拒绝提前到确认前，并加入捕获窗口 |
| `p2-g-05-rebind-success-dark-994x700.jpg` | SUPERSEDED | `46b45c3f11e1` | 使用既有未物化测试 Block 的正式 Rebind 成功 | `p2-g-10` 证明用户可新建替换 Block 且无竞态 |
| `p2-g-06-rebind-reload-clean-dark-994x700.jpg` | SUPERSEDED | `46b45c3f11e1` | 旧链 reload 后系统健康 | `p2-g-11`/`12` 使用当前构建替代 |

仓库其他目录中的既有截图也继续按历史证据处理，除非索引明确登记为 `CURRENT`。

## 新截图登记模板

| 字段 | 值 |
|---|---|
| 文件 | `screenshots/<scene>-<step>-<timestamp>.png` |
| 状态 | CURRENT / HISTORICAL / SUPERSEDED / PROTOTYPE |
| branch / commit | |
| 插件构建时间 | |
| Service / Launcher 版本 | |
| Logseq / Graph | |
| 主题 / 窗口 / 宿主位置 | |
| 前置条件 | |
| 用户动作 | |
| 系统结果 | |
| 下一步 | |
| 已知问题 | |
| 替代的旧证据 | |
