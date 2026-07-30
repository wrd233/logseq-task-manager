# P2-A/B MiniProject current-build regression — 2026-07-30

## 结论

P2-A MiniProject Grill 与 P2-B 原位重构已补齐当前构建代表证据。正式事务链在 `39d73a0`
完成；只改 UI 信息层级的 `9e7a105` 又重跑真实 Provider Preview，确认 Preview 首屏优先、
讨论依据折叠且零正式写入。该结果不改变完整长期 Goal 的 `IN_PROGRESS`。

## 环境与基线

- branch：`feature/task-copilot-mvp`；代码 commits：`39d73a0`、`9e7a105`；
- Logseq Desktop：`0.10.15`；File Graph `logseq`；host Light / Plugin Dark；1000×720；
- 正式对象：`obj_20260730075549982_2507bf283ff8499f97e32c44749d2a44`，基线与终态均为
  `v4 / OPEN / ACTIONABLE`；
- Primary root Block：`6a6b037c-55fb-4818-83b4-eace1b20c190`；基线为根、一个“现有材料”
  Block 和两个原始子 Block；
- Key 仅通过既有安全本地配置使用，未进入仓库、普通日志、截图或本报告。

## 失败驱动修复

首次真实 Preview 暴露两个通用问题：请求可能长期保持 loading；Validator 失败会把内部错误
语言带到前台。`39d73a0` 在现有 controller 增加 130 秒 deadline，超时后保留 READY turn 与
回答并允许重试；Validator rejection、Provider unavailable 和 no-change 统一为“未应用、
原内容不变”的用户语言。自动回归证明迟到响应不会改变 session 或正式状态。本轮未人为等到
130 秒，因此 deadline 是 `AUTOMATED`，不是 Desktop timeout 证据。

真实截图随后又显示事实列表占满首屏，真正 Preview 落在折叠线下。`9e7a105` 只调整渲染：

- Preview 在讨论依据之前；
- 事实、判断和未知进入“查看讨论依据”；
- READY、Preview、Review 不再显示 Session/Proposal/Commit/SQLite/HIGH；
- 用户仍先“审阅方案”，之后才“确认应用”。

没有改变 Proposal、Commit、Recovery、Undo、Anchor、对象或 Graph 权威。

## 真实 Provider 与 Desktop

`39d73a0` 的结构样本使用五轮自适应 Grill 和一次 Preview，问题依次来自当前材料的边界、
成果形式、完成证据和旧“现有材料”Block 去向；不是固定问卷。Preview 明确：当前子树内建立
“输入材料”和“验收目标”，移动三个原 Block，删除 0。用户进入既有 HIGH Review，先审阅
方案，再确认应用。

正式 Commit 后出现两个新分组，所有原 Block UUID 和文字保持。Plugin Manager reload 后
结构保持；inverse Undo 后根、旧“现有材料”和两个原始 Block 的 UUID、文字、父子层级恢复；
再次 reload 后稳定投影一致，Doctor `PASS`。

`9e7a105` 又从恢复基线重新完成五轮 Grill + 一次 Preview，共六次真实 Provider 请求；
Validator rejection/retry/abstention 为 `0/0/0`。Preview 约 45 秒完成，低于 130 秒上限。
当前首屏先显示“尚未应用”、结果、范围、影响与唯一“进入变更审阅”，讨论依据折叠。随后
关闭讨论，没有进入 Review 或 Commit。

CLI 读回证明：对象仍为 `v4 / OPEN / ACTIONABLE`；四个 Block UUID、文字和层级与 Undo 后
基线精确一致；Doctor `PASS`，只有一条既有 stale Proposal WARN。本轮不把该历史 WARN 误写为
当前待审阅或恢复问题。

## 宿主有界结论

File Graph Page UUID 在 reload 间会变化，而 Page name、所有稳定 Block UUID、正文和层级保持。
这沿用既有 File Graph Page identity bounded limitation；不新增第二套 identity，不用 DOM hack。

## 复杂度与状态

- 新增正式状态 / Runtime / Recovery 分支 / Skill / Prompt / Validator / 写入权威：`0`；
- 复用：Grill Turn Contract、Preview Handle、Proposal Factory、Commit/Recovery Kernel、inverse
  Undo、current-ui；
- 关闭 current-ui 证据 Partial：`1`；新增长期 Partial：`0`；净变化：`-1`；
- P2-A/B：`DONE_CURRENT_BUILD_REPRESENTATIVE`；
- Final Release：`RELEASE_CANDIDATE_READY`；
- overall Goal：`IN_PROGRESS`。

## 当前截图

- CURRENT：`p2-ab-mini-preview-current-9e7a105.jpeg`；
- CURRENT_AT_39D73A0：`p2-ab-mini-grill-ready-current-39d73a0.jpeg`、
  `p2-ab-mini-high-review-current-39d73a0.jpeg`、
  `p2-ab-mini-confirm-apply-current-39d73a0.jpeg`、
  `p2-ab-mini-applied-current-39d73a0.jpeg`、
  `p2-ab-mini-applied-reload-current-39d73a0.jpeg`、
  `p2-ab-mini-undone-current-39d73a0.jpeg`、
  `p2-ab-mini-undone-reload-current-39d73a0.jpeg`；
- SUPERSEDED_UI：`p2-ab-mini-preview-current-39d73a0.jpeg`；
- HISTORICAL_PRE_FIX：`p2-ab-mini-grill-current-bbb6fd3.jpeg`。
