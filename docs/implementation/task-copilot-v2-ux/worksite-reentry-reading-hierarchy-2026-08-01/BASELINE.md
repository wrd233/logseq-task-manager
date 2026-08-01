# Baseline（2026-08-01 当前构建）

> 与交接包 `03-INHERITED-CONTRACT-AND-BASELINE.md`、`04-CURRENT-VISUAL-TRANSCRIPT-AND-TARGET.md`
> 对应。当前本地工作区与当前构建优先于交接包旧截图。

## 环境事实

| 项目 | 当前值 | 证据 |
|---|---|---|
| 日期 | 2026-08-01（Asia/Shanghai） | 本会话 |
| 分支/HEAD | `feature/task-copilot-mvp` @ `72aad27311cb3a60e535e3920e9995306a30aa23` | `git status/log` |
| 工作区 | 仅用户既有 `apps/task-copilot-local-service/package.json`（logseq id，未暂存） | `git diff --stat` |
| 嵌套 Graph | `logseq/` 被外层忽略；dirty 只作信息展示 | check.sh / boundary |
| Logseq | `0.10.15`，Renderer 运行中，remote-debugging 9222 | `ps` + CDP |
| Launcher | `com.task-copilot.launcher` PID 1059 | `launchctl list` |
| Local Service | `~/Library/Application Support/Task Copilot/bin/service.js`；DB `tmp/runtime/manual-v2/task-copilot.sqlite` | `ps aux` |
| 加载中的 Plugin | `tmp/releases/task-copilot-cux-c807376-r11/task-copilot-plugin`（r11） | Logseq iframe src |
| Node（检查用） | `/opt/homebrew/opt/node@20/bin/node` v20.20.2 | `node --version` |
| 当前 HEAD 与 r11 差异 | 仅 durable-origin 路由/fallback 与用户语言 select（`ui.ts` 14 行），不涉及 Now 卡片 | `git diff c807376..HEAD --stat` |

## 当前 Now 卡片结构（机器证据）

`tmp/runtime/worksite-reentry-reading-hierarchy/current/metrics-{1000,760}.json`：

```text
eyebrow（类型/来源）
h3（事项标题）
p（状态：当前可以继续推进）
details（查看依据，默认折叠）
div.actions > button.primary（继续处理/打开正文/更新当前状态）
details.more-actions（更多操作，默认折叠，含更新状态/设置期限/关注/排序）
```

- 主按钮 x=53（1000）/39（760），位于纵向阅读路径，不与标题同行；
- 首卡高 235px，第二张卡标题 y=624（1000）/635（760），首屏约 1.5 张卡；
- 每卡恰好 1 个 primary；13 张卡、28 个 details 组、87 个 interactive 元素；
- Now 可见文本不含 SQLite/Anchor/Lifecycle/Commit/Proposal 等内部词（当前 capture 复验为 0）。

## 与本包 baseline 截图的一致性

- 交接包 `references/current-baseline/bundles/now-light-1000` 的 visible-text 顺序与当前 DOM
  一致：标题→状态→查看依据→主按钮→更多操作；
- 交接包截图（2002×1440，CSS ~1000）与当前证据（CSS 1000/760，DPR 1）等价结构；
- 当前 Now 数据（13 卡，其中 5 张首屏 + 8 张折叠）与交接包 transcript 同源。

## Objects 当前默认层（Sprint E 基线）

`17-objects-dark-1000/visible-text.txt`：

- 默认同时出现：新建领域、新建项目、关联两个事项、相关内容/相关事项选择器、正式对象列表；
- 58 个 interactive 元素；默认层仍像“对象能力管理面”，技术词已后置（交接包观察一致）。

## 已知不可改变合同（本轮不重开）

同 Goal §1：Proposal/Commit/Undo/PENDING/RECOVERY 语义、SQLite/Local Service 权威、
UI 不直接写 Store、正文仍由 Logseq 持有、不新增第二编辑器/恢复系统/平行 Runtime。
