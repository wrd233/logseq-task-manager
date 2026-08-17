# Task Copilot Production Dogfood 最小闭环

本目录保存 Production Dogfood 最小设计文档、决策记录与运行配置示例。

## 配置

Kernel Service 启动时读取 `TASK_COPILOT_DOGFOOD_CONFIG` 指向的 JSON 文件；未设置时默认读取 state 目录下的 `dogfood.json`。

```json
{
  "maintenance": true,
  "formalization": false,
  "closure": false,
  "roots": ["project-id-A", "miniproject-id-X"]
}
```

- `roots`：按当前 Formal ownership 自动包含 descendants。
- `maintenance`：是否允许后台低风险自动维护（current_focus / engagement / waiting / Context Association）。
- `formalization` / `closure`：后续 Stage C 再打开。
- 不配置或配置缺失时保持现有 unrestricted 行为，避免破坏非 Dogfood 部署。

## 自然语言纠错

在 Logseq 中：

1. 先打开一个正式事项（设置当前 WorkObject）。
2. 在任意 block 写下纠正，例如“不是，我还可以继续本地测试”。
3. 运行命令：`Task Copilot vNext：纠正当前事项的现实`。

该 block 会先被冻结为 Evidence，再通过 USER authority 的 `/v1/dogfood/correction` 编译为受治理的 Formal 修正。
