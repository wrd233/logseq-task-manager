# V2 View 键盘、主题与 Review Center Desktop Report

> 日期：2026-07-22
> 环境：Logseq Desktop 0.10.15 / macOS arm64 / Node 20.20.2 / SQLite schema v11
> 结论：`PASS`，`V2-VIEW-001` 可收口为 `DONE`

## 真实键盘闭环

- Review Center 的“待整理 / 待审阅”不再冒充未实现方向键语义的 ARIA tablist，而是原生可遍历的 toggle button group；当前项使用 `aria-pressed` 表达。
- 在真实 Logseq iframe 中聚焦“待审阅”并发送 Enter，视图切换到 Proposal 空状态；重绘后焦点仍停留在同一按钮，`aria-pressed=true`。
- 聚焦“待整理”并发送 Space，Candidate 队列和当前页扫描入口恢复；重绘后焦点仍停留在“待整理”，且焦点环可见。
- 聚焦主导航的 `Now Work / 现在工作` 并发送 Enter 后，真实工作区切换为 Now Work、两张 Focus 卡片可见；重绘后同一按钮保持焦点并获得 `aria-current=page`。
- 焦点恢复按稳定的 `data-action / data-value / data-field` 标识匹配，不依赖中文文本、DOM 序号或新的持久状态。

## 深浅主题

- 在同一个真实 Desktop renderer 中分别模拟 `prefers-color-scheme: light` 与 `dark`，媒体条件精确切换且根级 token 不混用。
- Light：`bg #f6f7f4`、`surface #ffffff`、`text #1d2823`、`accent #176b50`。
- Dark：`bg #17201c`、`surface #202c27`、`text #edf4ef`、`accent #6dd8ac`。
- 两种模式继续使用原生 `color-scheme: light dark`，表单控件与插件表面共享同一主题边界；没有新增用户配置或第二主题状态源。

## Review Center 视觉收口

- 本轮真实验证了 Candidate / Proposal 两个空状态、切换语义、可见焦点和键盘连续性。
- 非空 Candidate 的原文优先、四处置和 CREATE/UPDATE 卡片见 `V2_CANDIDATE_REVIEW_DESKTOP_REPORT.md`；非空 Proposal 的上下文、最终预览、文本/语义 Diff、部分接受、高影响确认与 Undo 见 Slice C、DeepSeek、Ownership、Marker 和 Closure 专项报告。
- 因此不重复生成 Proposal 或调用在线 Provider；已有昂贵 Gate 的代码路径没有变化。

## 权威与收尾

- 键盘与主题只改变 DOM 焦点、ARIA 和 CSS 呈现；SQLite Audit 保持 4、Focus 保持两条 rank 0/1、Pending/Recovery Commit 为 0。
- 没有新增表、协议、扫描器、恢复路径、领域状态或 Graph 写入。
- 为绕过 Logseq 0.10.15 对 unpacked plugin `index.html?__v__=<package-version>` 的缓存，仅在运行时临时使用 prerelease version 作为 cache-buster；验收后源码已恢复 `0.1.0`，该临时值不提交。
- 脱敏机器证据：`docs/testing/v2-view-keyboard-theme-desktop-2026-07-22.json`。
