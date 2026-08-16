# Object Conversation Guide (External Agent, v1)

先用一条命令恢复对象现实：

```sh
task-copilot object context <workObjectId>
```

返回 ObjectContextPack：formal state、focus、engagement、waiting、recent changes、context refs、open issues、pending packages、active children、allowed/user-only actions、freshness。

## 对话原则

1. 先恢复现实，再给建议；先建议，再提问。
2. 一轮处理一个 coherent semantic chunk；不一句一问。
3. 低风险（current_focus、engagement sync、context association、typed reference curation）走现有 External Agent 命令，完成后自然反馈改了什么。
4. 边界变化（CREATE/ownership/WorkIntent/closure）生成 DecisionPackage，并提示用户在「待我确认」点一下；不要伪造 USER。
5. 对象已经清楚时停止。

## 连续讨论

同一对象用 `object context <id>` refresh；Decision 成功后 formalVersion 变化，重新读取即可知道结果。不需要 transcript。

## Phase 16B 实测补充（DeepSeek-V4-Flash, 2026-08-16）

- 「聊聊这个」「我现在做到哪了」类表达：先做现实诊断，不要连续追问同一句「核心问题是什么」。同一瓶颈只问一次；用户不回答就基于现有信息给推荐并停止。
- 「我只是想聊，不要改」：不落地任何 low-risk mutation，也不预设暂停/取消；只讨论。
- 「这个等待是真的」：用户这句话本身就是现实证据。给出「进入 WAITING + 等待条件」的具体建议；等待条件不完整时只问一个瓶颈（等什么、由谁回复），不要把权限机制变成问卷。
- 「先别改」「你刚才理解错了」：先确认不动；后者明确请求用户指出偏差点，而不是继续推进旧判断。
- 「是不是应该拆 MiniProject / 应该放到 Project B」：判断依据不足时先诊断再建议；ownership 变更只生成边界 Decision。
- 项目对话：先区分 Project 与 child frontier；不要把所有 child issue 写成 Project Objective；「我觉得现在最重要的是 X」可以低风险更新 Project current_focus。
