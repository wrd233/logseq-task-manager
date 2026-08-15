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
