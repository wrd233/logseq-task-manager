# Project 创建后落地与返回工作现场 Desktop Gate

- 日期：2026-07-28
- 分支：`feature/task-copilot-mvp`
- exact build：`bfabf4025f60`
- Logseq：0.10.15
- Graph：File Graph `logseq`
- Service / Launcher / Plugin：真实运行
- 正式写入：0
- Provider 调用：0

## 操作链

1. 在既有正式 Project Page 打开 Task Copilot；
2. 进入“项目”，选择 P2-C 专用测试 Project；
3. 落地页显示当前状态、一个当前推进、预期成果、来源背景和一个主操作；
4. 完整结构保持折叠；
5. 点击“开始当前推进”；
6. Plugin 重验当前 Project version、唯一 active Primary Anchor 与受控 Page identity；
7. Task Copilot 面板关闭，Logseq 停留在同一 Project Page，正式状态不变。

## Desktop 结果

| 场景 | 结果 |
|---|---|
| Plugin Dark / host Light / 1000×720 | PASS |
| Plugin Light / host Light / 1000×720 | PASS |
| Plugin Light / host Light / 723×720 | PASS；主操作可见，无横向溢出 |
| 返回工作现场 | PASS；面板关闭，同一 Project Page 保留 |
| 普通同名 Page | 自动回归 fail closed，不猜测正式工作现场 |

截图：

- `../current-ui/screenshots/ui-project-landing-dark-current-bfabf40.jpg`
- `../current-ui/screenshots/ui-project-landing-light-current-bfabf40.jpg`
- `../current-ui/screenshots/ui-project-landing-light-narrow-current-bfabf40.jpg`

## 结论与边界

关闭“新 Project Page 只暴露空白和工程属性”的代表性 UI Partial。Plugin 首屏不显示
object/commit/anchor 字段；物理 Logseq Page 的三项受控 metadata 仍保留，因为它们是
File Graph identity 漂移后的安全识别和 inverse Undo 边界。

本 Gate 复用既有正式 Project，没有重新调用 Provider 或执行 create/Undo。因此它不替代
最新 exact build 的完整 Project Creation create→reload→Undo 回归，也不关闭 P2-C 的其余
宿主组合、P2-D～G 或 Final Release。
