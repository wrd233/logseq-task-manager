# Review empty state Desktop Gate

## 目标

修复真实 Closure Review 流程结束后“待我确认 → 待审阅”的错误用户结论。旧实现把固定为
false 的 legacy demo-agent flag 显示成“Agent 已关闭”，但同一会话中的 V2 Provider 刚刚
成功生成方案。

## 实现

- commit：`cd59228`
- 不新增 capability 状态；复用既有 `v2ProviderAvailable`
- Provider 可用：提示可整理当前页，或从“待整理”继续
- Provider 不可用：只说明当前没有方案，状态、期限和恢复等基础功能仍可使用
- 不改变 Proposal、Commit、Project、Provider、Skill 或 Recovery 合同

## 自动证据

- Plugin：`339/339`，0 skipped
- 根级 `./scripts/check.sh`：PASS
- stable rules：145
- recovery rehearsal：`differences=[]`

## Desktop 证据

- Logseq：`0.10.15`
- Graph：File Graph 测试 Graph
- 主题 / 窗口：Dark / 1000×720
- 操作：reload `cd59228` 构建 → 打开 Task Copilot → 待我确认 → 待审阅
- 结果：
  - 当前没有待审阅 Proposal；
  - 不再显示“Agent 已关闭”；
  - 15 条历史默认折叠；
  - 既有入口明确；
  - Service 与 V2 Provider 状态仍为可用。
- 截图：
  `../current-ui/screenshots/review-empty-current-dark-cd59228.png`（CURRENT）

## 复杂度

- 新增正式状态：0
- 新增 Runtime：0
- 新增 Skill / Prompt / Validator：0
- 新增恢复分支：0
- 新增 Partial：0
- 删除重复前台判断：1
