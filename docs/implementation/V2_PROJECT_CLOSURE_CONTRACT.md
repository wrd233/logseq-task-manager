# V2 Project Closure 实施合同

## 用户结果

OPEN Project 可通过外部 Agent 提交的 V2 Proposal 形成 Closure。Closure 必须同时说明原始目标、实际结果、主要 Deliverable / Output、未完成 Objective 的原因与后续、遗留去向、关键 Decision 和未来重入总结。未完成 Objective 不阻止完成，但原因与 next step 不能为空。

## 权威与流程

```text
external Agent proposal
→ Validator
→ Review Center HIGH group confirmation
→ current Object version revalidation
→ one DOMAIN_WRITE SemanticCommit
→ Application complete_project
→ SQLite closure_json + Lifecycle COMPLETED + Focus removal
→ Proposal APPLIED
```

- Agent 仅生成 Proposal，不取得正式写权。
- Closure 与 `COMPLETED` 必须在同一个 HIGH 语义组中，不得拆分接受。
- 通用 Lifecycle Command 拒绝 Project `OPEN → COMPLETED`，不存在绕过 Closure 的第二完成路径。
- 最终提交必须精确确认 `COMPLETE_PROJECT_WITH_CLOSURE`。
- Plugin 在最终确认时重读 Proposal 并采集其 PAGE/BLOCK read scope，Service 补齐 SQLite OBJECT 观察后调用同一 Revalidation。
- SQLite 是 Closure 的单一机器权威；Plugin 对象工作区只读投影该字段。
- Logseq Project 页不自动移动或删除；Plugin 关闭后原页正文仍可读。

## 持久化与恢复

Schema v8 仅在 `objects` 增加受约束的 nullable `closure_json`：只有 `PROJECT + COMPLETED` 可以保存。v1..v7 仍必须先创建并只读校验快照，再显式升级。未新增表、扫描器、恢复器或兼容写路径。

Commit 先记录 PENDING 的单一 `DOMAIN_WRITE` step。Application 写入使用确定性 receipt；若进程在领域事务后、step 收口前中断，相同请求会读取 receipt 并继续完成，不会重复关闭。

## 当前 Gate

- Domain/Application/Persistence/Service/Client/Plugin UI 自动成功与失败路径已建立。
- 已证明：缺精确确认零写入；部分 Objective 未完成可合法关闭；Closure/Lifecycle/Focus/Receipt/Audit 一致；正常重放幂等；Domain receipt 成功但 Commit step 未收口时，Service 重启可继续完成。
- 固定 `external_agent` fixture 和真实独立 Agent 输出均已经 CLI 磁盘文件 `validate → submit → Local Service Review queue`；后者只读 Context Package 与 `design-project@1.1.0`，提交后 Project 仍为 OPEN，详见 `docs/runtime/V2_PROJECT_CLOSURE_EXTERNAL_AGENT_REPORT.md`。
- Logseq Desktop 0.10.15 已通过完整 Gate：可读 Closure/HIGH 组，组确认后仍为 `OPEN + v2`，最终确认后同一对象为 `COMPLETED + v3`，Proposal/Commit 分别为 `APPLIED`/`COMPLETED`；reload 后 Closure 可读、Focus 计数为 0 且 Now Work 不显示该 Project、原 Project 页可搜索打开。Pending/Recovery=0，SQLite integrity/FK 通过。
- E2E-20 为 `DONE`；详细证据见 `docs/runtime/V2_PROJECT_CLOSURE_EXTERNAL_AGENT_REPORT.md`。
