# Screenshot Index

## CURRENT

共同环境：`feature/task-copilot-mvp`，Logseq Desktop `0.10.15`，测试 Graph `logseq`，
Dark，窗口 `994×700`，真实 Plugin/Launcher/Service；无 API Key、token 或私人正文。

| 文件 | commit | 场景与用户动作 | 系统结果 | 下一步 / 已知问题 |
|---|---|---|---|---|
| `screenshots/p2-c-09-project-creation-undo-complete-dark.png` | `d81b1a84f165` | 从最近修改进入原 Review，显式确认专用 Project Creation Undo | 原 Commit 折叠为“已撤销”；Project、Anchor 与事务拥有的空 Page 已移除，Audit 与 inverse Commit 保留 | Page/MiniProject 来源关系仍待验 |
| `screenshots/p2-c-10-post-undo-reload-healthy-dark.png` | `d81b1a84f165` | Undo 后 reload，再打开用户系统状态 | Runtime/Store READY；未发现未完成修改或 Anchor 冲突；无需操作 | Graph switch 与 Light/窄栏仍待集中 Gate |
| `screenshots/p2-c-11-project-creation-entry-current-dark.png` | `d81b1a84f165` | 项目→正式事项与创建 | 当前入口明确要求先 Grill，再进入待我确认；旧直建 bypass 不可见 | Page/MiniProject 就近入口仍待 CURRENT 截图 |

## HISTORICAL

以下文件都是真实 Logseq/DeepSeek 运行证据，但不代表当前 `d81b1a8` 界面：

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
