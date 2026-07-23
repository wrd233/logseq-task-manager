# P0-C 低风险“接受并应用”Desktop 记录

- 日期：2026-07-23
- 环境：Logseq Desktop 0.10.15；Node 20.20.2 Local Service；ignored Test Graph；
  SQLite schema v12
- Provider：关闭；未调用 LLM
- 测试内容：虚构 `P0 Focus Gate`

## 前置

- 测试对象为 OPEN MiniProject、version 10、Condition ACTIONABLE、Focus 空；
- Primary Anchor 为 active，正文为 `#MiniProject P0 Focus Gate`；
- 通过 Local Service 提交唯一 READY/PENDING/LOW `REWRITE_BLOCK` Proposal；
- Proposal 只修改同一 Primary Anchor 与同一带版本对象，不含 Ownership、Closure、Lifecycle、
  Project structure、批量或跨对象写入。

## 操作与结果

1. Review 卡片显示红绿正文 Diff、语义 Diff 和“接受并应用”；
2. 点击后立即显示“正在接受并应用…”，该按钮及同卡片其他审阅动作均 disabled；
3. 同一连续流程完成 ACCEPTED、Graph scope/hash 与 Object version 重验、SemanticCommit
   prepare、Graph write、Domain write 和 verify；
4. 最终卡片显示 APPLIED、LOW、原 SemanticCommit ID 和“撤销本次生效”；
5. SQLite 读回对象 version 11、文本 `P0 Focus Gate — applied`，正向 Commit COMPLETED；
6. 独立确认 Undo 后，Graph 正文与对象文本均恢复 `P0 Focus Gate`；
7. 最终对象 version 12；正向 Commit UNDONE、逆向 Commit COMPLETED；
8. Pending/Recovery Required 计数 0，`pragma integrity_check` 为 `ok`，
   `foreign_key_check` 无记录；
9. 为取得普通 Block 现场 UUID 而新增的测试 Block 已从 Graph 删除；Focus、Condition 与
   Lifecycle 未改变。

## 自动边界

- `CREATE_OBJECT` 与受约束 `REWRITE_BLOCK` 均通过白名单单测；
- MEDIUM/HIGH、Ownership 和非单 Block shape 被拒绝；
- Graph/hash stale 在 prepare 前停止且零写入；
- 接受请求 transport 不确定时只调用一次，不自动重试或创建第二 Commit，并要求用户刷新；
- Plugin typecheck、147/147 tests、build PASS。

## 隐私

截图只包含虚构测试内容。descriptor 内容、session token、绝对路径、终端历史、API Key 和真实
业务正文均未进入截图、日志或 Git。
