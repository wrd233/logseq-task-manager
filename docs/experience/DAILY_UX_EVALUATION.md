# Daily UX Evaluation (EXPERIENCE / EMPIRICAL, non-authoritative)

> 状态：2026-08-15，Phase 16A / Object Re-entry 第一轮实机。

## Scenario 1: Morning re-entry

- 目标：打开 Logseq 后 10 秒内知道从哪继续。
- 操作：Plugin 命令「打开今天」→ Now tab。
- 观察：Now 显示 2 个 Formal 对象（MiniProject 有 pending decision + Project 有最近变化）。
- 点击：每个卡片有「打开 Logseq 原文」「和 Agent 讨论」。
- 结论：满足 10 秒恢复；未显示内部术语。
- 截图：`/tmp/tc-phase16-real/ui/panel-now.png`。

## Scenario 2: Boundary confirmation

- 操作：切到「待我确认」。
- 观察：一条「把采购规格书整理改为等待采购确认」，按钮「回应当前决策」。
- 结论：sparse；没有暴露 CREATE/CHANGE_ENGAGEMENT enum。
- 截图：`/tmp/tc-phase16-real/ui/panel-confirm.png`。

## Scenario 3: Object conversation bootstrap

- 操作：Object Surface「和 Agent 讨论」复制对象上下文。
- 或 CLI：`task-copilot object context <id>`。
- 结论：Agent 不从零盘问；包含 formal version、current focus、waiting、recent changes、context refs、open issues、pending packages、active children、allowed/user-only actions、freshness。

## UX audit notes

- 第一版问题：重复 Kernel rerun 时 Now 出现重复卡片 → 已按 id dedupe。
- 第二版问题：内部 enum 与英文 action 列表只在 ObjectContext API 层，用户面板不显示。
- 第三版：面板 tabs 用「现在 / 待我确认 / 项目 / 更多」，按钮用用户语言。

---

# Phase 16B 迭代（2026-08-16，EXPERIENCE / EMPIRICAL）

## V1（full-screen modal）

- 操作：CDP 打开 `window.taskCopilotOpenDailyPanel()`。
- 观察：Now 出现 4 张几乎相同的卡（`最近有正式变化 / 保持可推进 / 继续推进当前事项`）；WorkMap 显示 `海丝项目（PROJECT）`；Confirmation 还是「回应当前决策」。
- 摩擦：全屏 overlay 挡住笔记；信息重复；enum 泄漏；卡片高度浪费。
- 截图：`/tmp/tc-phase16b-ux/ui/{now,confirm,workmap,more}-v1.png`。

## V2（side panel）

- 改变：root 从 100vw overlay 改为右侧 drawer（min(430px,52vw)，100vh，border-left）；Now cap 3 + attention weight；卡片只保留 reality / whyNow / continue；WorkMap 弱中文类型标签。
- 观察：Now 显示 pending decision 对象 + Project + 一个新对象；Confirmation 显示「进入等待：等待厂商新版」和「确认 / 暂不」；WorkMap 可读。
- 摩擦：Project reality 还是空泛；新对象仍然「已正式化」重复。
- 截图：`now-v2.png`、`workmap-v2.png`、`small-window-v2.png`。

## V3（reality / since-last-seen）

- 改变：Project reality 显示 child 数；无 baseline 时 whyNow 显示「新正式化的项目，包含 N 个子项」；`currentReality` 显示「还没有明确推进点」而不是「保持可推进」；continue 点改为「和 Agent 讨论下一步」。
- 观察：早晨 Now 更有信息量；evening 只有一条 `上次看过以后有新的正式变化` 的 WAITING resurface。
- 小窗口：960×640 侧栏可完整操作，不遮主编辑区。
- 证据：`/tmp/tc-phase16b-ux/ui/*.png`、`/tmp/tc-phase16b-ux/daily-sim.json`。

## Real daily simulation

- Morning：Now 空（已 baseline）。
- Midday：在 Journal 新增 3 条自然记录 → PAGE discovery `已完成 4 条记录的语义整理`，无候选（fake executor restraint）。
- Afternoon：Trusted USER 确认「法务探针验证改为等待厂商新版」→ `engagement=WAITING`。
- Afternoon reply：冻结厂商新版证据 → External Engagement Agent `WAITING→ACTIONABLE` low-risk apply → `COMMITTED`。
- Evening：Now 只 resurface 一条对象，`changesSinceLastSeen=2`，formalVersion 3。


---

# Phase 17 / 16C 迭代（2026-08-16，EXPERIENCE / EMPIRICAL）

## V2（workspace coexistence + Object Surface）

- 改变：header 收敛为 `Task Copilot ×`；tabs 去边框；Now 整卡点击进入 Object Surface；卡片按钮降为文本 link；WorkMap 整行点击、类型弱标签、Project 行显示 currentPhase；More 分「系统 / 工具」；Confirmation 空 whyNow 不渲染。
- 观察：正文区比 Phase16B 多出约 2vw；Project Object Surface 可显示 Objective/KR/Phase；小窗口 960×640 可用。
- 截图：`/tmp/tc-phase17-ux/ui/v2-*.png`。

## V3（copy / density polish）

- 改变：移除 `状态变为 可推进` 式内部表达，映射为用户语言；Project reentry summary 变为 `目前聚焦在「实施准备」`；ProjectIntent revision 后 Now 可 resurface（`项目目标或阶段有更新`）。
- 观察：V3 Now 只有 1 条高价值卡，卡片字段全部有现实依据；Project 详情 3 秒内可回答“为什么存在 / 当前在哪 / frontier / 继续”。
- 截图：`/tmp/tc-phase17-ux/ui/v3-*.png`。

## Project daily simulation

- Morning：ProjectIntent revision 1（Objective + 2 KR + 采购与实施准备），frontier = 采购规格书整理 / 法务探针验证。
- Midday：自然材料 PAGE discovery `已完成 8 条记录的语义整理`。
- Afternoon：Trusted USER 确认 currentPhase → `实施准备`（ProjectIntent revision 2，Project formal version 不变）。
- Evening：Now Project card 出现 `上次看过以后有新的正式变化`，reality = `目标：…；当前：实施准备`。
- 证据：`/tmp/tc-phase17-ux/project-daily.json`。
