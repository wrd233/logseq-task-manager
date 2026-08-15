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
