# Work Evidence UX v1 视觉验收

日期：2026-10-31（Asia/Shanghai）。本轮只做视觉验收与交付证据，不修改功能代码，不合并 main。

## 0. 先说结论：本分支与当前 main 的关系

- 本分支：`codex/work-evidence-ux-v1`，验收起点 `a3cf7127`（父提交 `ce52552a`）。
- `origin/main`：`018c3368 feat: rebuild Work Evidence around file review and handoffs`。
- 两者的 merge base 是 `2cb0ced7`（Capture host RPC 基线）。
- **`ce52552a` 不是 `origin/main` 的祖先，当前 main 的 WorkEvidence rebuild 也没有合入本分支。** 本轮按要求没有 merge / rebase / cherry-pick。
- 因此，以下截图展示的是本分支的 WorkEvidence UX 实现，不是 main 上 `018c3368` 那套 rebuild。两者不能直接当作同一实现比较；如果要判断合并后的最终形态，需要先由整合者决定保留哪条实现。

## 1. 运行环境与采集方式

- Worktree：`/Users/wangrundong/work/logseq-task-manager-work-evidence-ux`
- 分支：`codex/work-evidence-ux-v1`
- 合成 Git 仓库：`tmp/work-evidence-ux/run-afd2d66e-f6da-4762-98fb-3d6c878e9c01/体验 仓库`
- DSH 运行：`run-afd2d66e-f6da-4762-98fb-3d6c878e9c01`，地址 `http://127.0.0.1:59796`
- 隔离：该运行独占自己的 `DSH_HOME`、`work-evidence` profile、documents、bundle、状态目录和端口；没有使用日常 profile，没有启动或停止其他 Agent 的服务。
- 浏览器：本机 Chrome headless 156，独立临时 profile；通过 CDP 操作真实页面，截图使用 `Page.captureScreenshot`，不是静态 HTML、不是 AI 生成图片。
- 截图尺寸统一 1440×1000，保留 DSH 侧栏、会话区、模型选择等宿主上下文。
- 敏感内容：所有文件变化来自合成仓库；`.env` 只出现路径和“正文受限”，从未显示内容；`.task-workspace/status.json` 同样只显示路径和受限标记。截图中的绝对路径是本 Worktree 的合成运行目录，不是用户项目或凭据。
- 机器可读的运行事实见 [screenshots/environment.json](screenshots/environment.json)。

## 2. 截图索引

| # | 文件 | 场景 | 视觉检查结果 |
| --- | --- | --- | --- |
| 1 | `screenshots/01-history-list.png` | 展开“历史观察”，显示 4 条记录（含首次无变化和后续增量；截图后该运行又增加了一条 20:12 的观察，不属于本图） | 通过。时间已本地化，状态与条数可读；历史列表较长时仍是简单按钮堆叠，没有搜索/分组。 |
| 2 | `screenshots/02-first-observation.png` | 首次观察（19:51:43）：0 个新提交、0 项工作区变化、0 个文件 | 通过。没有把首次观察伪造成增量；空状态下仍显示分析范围与交接按钮，略有认知负担。 |
| 3 | `screenshots/03-incremental-main.png` | 增量观察主界面：1 个新提交、5 项工作区变化、另有 1 项内部记录；文件列表、目录摘要 | 通过。目录、主按钮、摘要、文件类型的层级清楚；面板底部会截断下一行，需要滚动。 |
| 4 | `screenshots/04-inline-diff-staged.png` | 展开 `work.txt`，查看暂存差异 | 通过。Diff 在文件条目内展开，有“按需读取，正文不存档”提示和关闭按钮；提交按钮与两侧差异按钮并列，信息密度较高但可操作。 |
| 5 | `screenshots/05-inline-diff-unstaged.png` | 同一文件的未暂存差异 | 通过。暂存/未暂存可分别查看，标题明确；切换到另一侧时旧正文被替换，不叠加。 |
| 6 | `screenshots/06-restricted-env-internal.png` | `.env` 与 `.task-workspace/status.json` 的受限、折叠展示 | 通过。两者都显示“正文受限”，内部记录收在“工作区内部记录（1）”折叠区，展开后仍不显示正文。`.env` 行仍保留“分析此条”按钮，容易让人误以为会发送正文。 |
| 7 | `screenshots/07-history-reload.png` | 页面重载后恢复历史记录 | 通过。摘要明确写“历史记录 · 当时快照，非实时”，与 `10-fresh-sync.png` 的“刚同步”形成对照。 |
| 8 | `screenshots/08-structure-unavailable.png` | 无 Logseq 连接时进入结构视图 | 通过。显示“本轮没有可比较的真实结构快照：来源未连接、未授权、已变化或读取失败。文件变化仍可使用。”，并保留“返回文件列表”。比较基准下拉框全宽，视觉重量偏大；提示文案较长。 |
| 9 | `screenshots/09-handoff-editor.png` | 完整交接编辑界面 | 通过。交接文本、保存/取消、“未保存交接已暂存本浏览器”同时可见。文本包含观察引用、仓库路径与哈希，信息密度高，但对追溯是必要的；长文在 textarea 内滚动。 |
| 10 | `screenshots/10-fresh-sync.png` | 点击同步后的“刚同步”状态 | 通过。摘要为“刚同步 · 0 个新提交 · 5 项工作区变化，另有 1 项内部记录”，和重载后的“历史记录”明确区分。 |
| 11 | `screenshots/11-scope-primary.png` | 已选目录、主按钮与“只观察，不改变 DSH 工作区”边界 | 通过。主按钮在 DSH 深色主题下是清晰的浅色主操作；“只观察”边界与目录摘要同一行，未挤压主流程。 |
| 12 | `screenshots/leave-confirmation.json` | 未保存交接时的离开确认 | 部分通过（事件证据）。浏览器原生 `beforeunload` 对话框已真实触发，事件为 `type: "beforeunload"`、`hasBrowserHandler: true`；原生对话框不属于页面表面，`Page.captureScreenshot` 在对话框打开期间 6 秒超时，无法产出像素截图。这是 Chrome 的限制，不是页面没有触发确认。 |

### 离开确认的实际证据

`leave-confirmation.json`：

```json
{
  "type": "beforeunload",
  "hasBrowserHandler": true,
  "message": "",
  "defaultPrompt": ""
}
```

触发路径：生成交接草稿（不保存）→ 触发页面重新加载。此时 Chrome 阻止导航并要求用户确认；CDP 记录到 `Page.javascriptDialogOpening`，页面在确认前保持阻塞。验收中由 CDP 接受确认以继续，随后页面重载并恢复浏览器暂存的交接草稿。

## 3. 交互走查视频

文件：`work-evidence-walkthrough.mp4`，1440×1000，约 30.7 秒，2.5–3 fps，约 340 KB。

内容顺序：

1. 打开 WorkEvidence 面板，显示已选目录、主按钮和文件列表。
2. 展开 `work.txt` 的“差异与依据”，查看暂存差异。
3. 切换到未暂存差异。
4. 展开 `.env` 与 `工作区内部记录`，确认正文受限。
5. 展开历史列表，查看首次观察与增量观察。
6. 生成交接草稿，滚动查看完整编辑区。

说明：

- 视频由真实页面的周期性截图序列编码而成（约 320ms 一帧），不是 30fps 屏幕录制，也不是静态原型。它足够看清每一步状态变化，但不适合评估动画流畅度。
- 原生 `beforeunload` 确认框无法进入视频画面（同上：浏览器 UI，不进入 `Page.captureScreenshot`），其真实触发由 `leave-confirmation.json` 证明。

## 4. 视觉检查结论

### 已经足够成熟

- **主流程入口**：目录摘要、单一主按钮和“只观察，不改变 DSH 工作区”在同一视觉层级，用户能判断当前对象和边界。
- **文件层级**：路径、变化类型、提交数、受限标记在同一行组内；默认的“待分析”噪声已移除。
- **局部 Diff**：差异回到具体文件条目内，避免底部第二个全局差异块；暂存/未暂存并列，关闭清晰。
- **历史语义**：“刚同步”与“历史记录 · 当时快照，非实时”区分明确，符合“不是实时状态”的产品要求。
- **内部记录与敏感路径**：`.task-workspace` 不再混在主文件列表里，但仍可追溯；`.env` 和内部文件正文受限，截图中没有泄露。
- **交接**：编辑区、保存/取消、未保存浏览器备份提示同时可见；离开确认真实生效。

### 仍然明显的认知负担或视觉问题

1. **面板没有 sticky header**：滚动到 Diff 或交接区后，“工作变化 / 收起”会离开视口，用户需要回滚才能收起或确认上下文。
2. **摘要行较长**：在 1440 宽度下已占两行；窄屏可能变成三行，目录、时间、提交、变化、内部记录全挤在一行。
3. **“分析此条”重复且多为禁用**：无模型时每个文件都有一个灰色按钮，视觉上像大面积的不可用功能；`.env` 受限行也有该按钮，容易被误解为可以送正文。
4. **空状态仍有较多控件**：首次观察 0 文件时仍显示分析范围、交接、历史；对“刚建立基线”的场景偏重。
5. **内部记录入口在列表最底部**：用户可能只看到 5 个文件，忽略“另 1 项内部记录”；虽然摘要中有计数，但入口不够显眼。
6. **结构视图的比较基准下拉框过宽**，提示文案偏长；无 Logseq 时功能整体不可用，视觉上仍占较大面积。
7. **交接文本是追溯型原文**：路径、引用、哈希、未知项密度高；对“快速浏览”不友好，但对审计是合理的，需要用户接受这种取舍。
8. **历史列表没有搜索/分页**：当前 5 条可读，长历史会变成很长的按钮列表。
9. **未验证窄屏/移动布局**：本轮只有 1440×1000 桌面宿主；面板 `width:min(560px,88vw)` 的窄屏表现没有实测。

### 总体自我评价

作为个人试用版，这一轮的 WorkEvidence **主路径已经可读、可操作，信息层级比上一版明显清楚**：用户能先判断“哪个仓库、发生了什么、哪些文件”，再进入单个文件 Diff 和交接。它仍然更像一个“带调试/审计密度的工具面板”，而不是可以无解释直接交给普通用户的产品界面；主要提升空间在 sticky header、摘要压缩、禁用分析的呈现，以及内部记录/受限文件的提示方式。

## 5. 证据边界

- **已通过代码与自动化验证**：内部 `.task-workspace` 路径受限与 diff 再校验、旧观察仍受限、交接不展开内部路径、无关 churn 不影响所选文件 diff、所选文件变化仍返回 `SOURCE_CHANGED`；CLI 35/35、模块 34/34、typecheck、ESLint、DSH bundle 构建。
- **已通过真实 DSH 操作验证**：面板打开、目录选择、首次/增量观察、文件列表、暂存/未暂存 diff、历史重载、结构降级、交接生成与编辑、未保存离开确认事件；均由真实宿主和 CDP 操作驱动。
- **仅通过合成 Git 数据验证**：提交、暂存/未暂存、删除、重命名、未跟踪、`.env`、`.task-workspace` 都是本运行自己的合成 fixture，不代表真实项目的内容或规模。
- **尚未验证**：真实模型分析与澄清、真实 Logseq Graph/Profile、原生草稿插入与发送、真实用户人工走查、窄屏、长历史/性能、跨机器/跨浏览器暂存。

## 6. 复建

```sh
cd /Users/wangrundong/work/logseq-task-manager-work-evidence-ux
PATH=/opt/homebrew/opt/node@24/bin:$PATH node --import tsx apps/dsh-plugin/scripts/work-evidence-playground.mjs start run-afd2d66e-f6da-4762-98fb-3d6c878e9c01
```

启动终端会打印本次运行的本机认证 URL；不要公开该 URL。需要全新样例时用 `new`，不要复用其他 Goal 的运行。
