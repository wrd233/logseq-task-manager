# P1 Dynamic Now Pilot 对照 — 2026-07-28

> 状态：`SHADOW_RETAINED_FRONTSTAGE_GATE_FAILED`
> Plugin runtime commit：`1c18e9b0ff63`
> 分支：`feature/task-copilot-mvp`
> Logseq：`0.10.15`
> Graph：File Graph `logseq`（专用测试 Graph）

## 方法

在 Day 6 真实 Waiting Task 恢复为 Actionable、返回原 Block、打开 Now 并实际重载插件后，
通过正式 Local Service 只读取得同一时刻的 Object 与 Now Work 投影，再以现有
`projectV2DynamicNowShadow` 对同一正式事实和 Focus 顺序重算。没有读写 SQLite、没有修改
Graph、没有调用 Provider；输出只保留数量和目标是否可见，不保留正文、Object identity、
Graph key、descriptor、token 或路径。

## 对照

| 指标 | 正式 Now | Dynamic Now Shadow |
|---|---:|---:|
| 正式 Object 总数 | 11 | 同一输入 |
| 当前关注 / Continue | 1 | 1 |
| 接下来值得处理 / Review | 10 | 0 |
| 等待与复查 / Keep waiting | 0 | 0 |
| Copilot 建议 | 不适用 | 0 |
| 被抑制 OPEN | 不直接报告 | 10 |
| Day 6 刚恢复 Task 是否可见 | 是 | 否 |

## 结论

1. 正式 Now 能立即兑现“回复到达后回到行动”，但十张 Next 卡说明连续测试数据已让首页偏长。
2. Dynamic Now Shadow 严格只把未过期 Focus 中的 Actionable 放进 Continue；它会隐藏
   Day 6 刚由 Waiting 恢复、但尚未加入 Focus 的事项。
3. 因此不能把当前 Shadow 直接替换或开放为默认 Now。这样会为了减少列表而破坏事务连续性。
4. `suggestedAttention=[]` 继续是正确的安全边界；本次不借近期更新时间猜测用户优先级，
   不新增“刚恢复”正式状态，也不默认打开 Block Marker。
5. 下一次前台 Gate 应先用 Day 6 用户优先级变化和 Day 8 disposition/cooldown 证据回答：
   哪些明确新事实可以让非 Focus 事项进入“需要回看”，以及何时自动失效。只有在不隐藏
   用户刚恢复事项的前提下，才评估有界 Pilot。

## 复杂度

- 新增正式状态：0
- 新增 Runtime：0
- 新增 Recovery 分支：0
- 新增 Skill / Prompt / Validator：0 / 0 / 0
- 正式写入：0
- Provider：0
- P1-C 状态：继续 `PARTIAL_RUNTIME_SHADOW`，没有伪装成 Desktop Done
