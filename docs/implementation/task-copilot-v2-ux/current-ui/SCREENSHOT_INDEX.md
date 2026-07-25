# Screenshot Index

## CURRENT

共同环境：`feature/task-copilot-mvp`，Logseq Desktop `0.10.15`，测试 Graph `logseq`，
Dark，viewport `1567×1104`，真实 Plugin/Launcher/Service；无 API Key、token 或私人正文。

| 文件 | commit | 场景与用户动作 | 系统结果 | 下一步 / 已知问题 |
|---|---|---|---|---|
| `screenshots/p2-c-18-page-undo-confirm-current-dark.png` | `913bbda4528f` | Page 来源 Project 经完整 restart 后，从最近修改进入专用 Undo | 原账本 UUID 已漂移，但界面只要求撤销正式 Project/Anchor；明确复用来源 Page 保留、专用 Page 仅在仍属本事务且为空时删除 | Review 历史卡片仍偏长 |
| `screenshots/p2-c-19-page-undo-complete-current-dark.png` | `913bbda4528f` | 显式勾选并确认 Project Creation inverse Commit | Project、Anchor 与本事务拥有的空 Page 已安全撤销；Audit 与 inverse Commit 保留 | 删除事件会短暂触发一次正文核对，需冷启动收敛 |
| `screenshots/p2-c-20-page-post-undo-restart-healthy-current-dark.png` | `913bbda4528f` | Undo 后完整退出并重开 Logseq，再进入系统状态 | Runtime/Store/Service READY；Pending/Recovery/Source Conflict `0/0/0`；`reconciliationRequired:false`；来源正文仍在、专用 Page/Project 不在 | MiniProject、Light/窄栏仍开放 |
| `screenshots/p2-c-21-page-reuse-preview-current-dark.png` | `913bbda4528f` | 同一 Page 来源明确覆盖原“另建”材料，选择升级当前 Page；七项答案就绪并生成最终阅读 Preview | 关系为复用当前 Page；Project Object 仅以 Anchor 关联，不写 Page 属性/正文；仍为零正式写入 | readiness 事实区偏长，Preview 有重复“完成证据”标签 |
| `screenshots/p2-c-22-page-reuse-created-current-dark.png` | `913bbda4528f` | HIGH Review/Commit 完成后自动回到原 Page | 当前 Page 三段正文可见且无 ownership metadata；Graph 逐字段读回与创建前完全一致；Project/Anchor 已在正式投影 | 截图本身只显示返回现场，正式创建由 Audit/Graph 读回证明 |
| `screenshots/p2-c-23-page-reuse-undo-current-dark.png` | `913bbda4528f` | restart 后从最近修改执行 Page-aware inverse Commit | 用户结果明确“Project 与 Anchor 已撤销；复用的来源 Page 保持原样” | 仍需 MiniProject 来源 |
| `screenshots/p2-c-24-page-reuse-post-undo-restart-healthy-current-dark.png` | `913bbda4528f` | Page reuse Undo 后再次完整 restart | Runtime/Store/Service READY；`0/0/0`；reconciliation false；Project 不在投影，Page 逐字段等于创建前 | Light/窄栏与 MiniProject OPEN |

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
