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

## Phase 17 实测补充（multi-turn + FAST/DEEP）

- 简单恢复类问题用 FAST（reasoning low, max_output_tokens 900）：做到哪了 / 还在等吗 / 改完了吗 / 下一步是什么。
- ProjectIntent、边界、拆分用 DEEP（reasoning high, max_output_tokens 4000）；DEEP 输出预算不足会出现空 JSON，不要降到 2400 以下。
- 会话内保持 compact session state：visible turns（recent only）+ askedQuestionKeys + resolvedGaps + actionAllowed + pendingRecommendation。不要每轮把完整 transcript 塞给模型。
- 用户说“只是聊 / 先别改”后，`actionAllowed=false` 必须在 session state 显式设置，不能只依赖 prompt。
- 低风险 mutation 执行后必须重新读 `object context <id>`，下一轮基于新 formalVersion；不要继续使用旧 pack。
- 用户说“按你说的改”只授权上一轮已经给出的低风险建议；ProjectIntent / ownership / CREATE 仍只生成 DecisionPackage。
- 用户纠正后，在 session state 中覆盖旧 recommendation / 移除旧 gap，不要让旧判断在后续 turn 复活。
- ProjectIntent formation：证据不足时只建议 Objective，不生成 KR；KR 只在用户确认有可写死的结果边界时进入 DEEP recommendation。
- 项目已经清楚时自然停止；不为了“更有价值”制造下一轮治理。
