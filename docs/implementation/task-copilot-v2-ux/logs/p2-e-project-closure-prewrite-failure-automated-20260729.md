# P2-E Project Closure 写入前失败与有界恢复 Gate

## 结论

状态：`DONE_BOUNDED_RECOVERY_CONCLUSION`

Project Closure 只有一个原子 Domain step。恢复合同固定为：

- 已有 Domain receipt 的 post-write 中断：SemanticCommit 保持 `PENDING`，继续同一 Commit；
- 尚无 receipt 的写入前失败：零 Closure 写入，Commit 终止为 `FAILED`，用户重新发起；
- 失败期间 Project 版本变化：Commit 终止为 `FAILED`，Proposal 转为 `STALE`，用户重新检查；
- receipt、step 或错误码互相矛盾：按账本损坏 fail closed，不重放 Domain 写入；
- `RECOVERY_REQUIRED` 继续只用于已有应用步骤需要补偿的多步骤操作，不为 Closure 单步失败
  人为创建。

这关闭 P2-E 的最后一个恢复 Partial，不扩张 Recovery Kernel。

## 实现

精确实现 commit：`98df827c3a609639ed7d306a93dd3cdceb8e29f3`

- Local Service 增加测试专用 `beforeProjectClosureDomainWrite` 故障点；
- 失败收口前重验 Project 与 Proposal；
- FAILED replay 使用只读已审阅 Closure shape inspector，不放宽 accepted planner；
- Service Client 显式返回 Closure-only FAILED 结果，不影响其他 Project structure Commit；
- Plugin 在请求前退出最终确认对话框，失败后展示当前审阅状态；
- FAILED/STALE 卡只使用用户语言，均不显示确认应用按钮或内部错误码。

新增正式状态：`0`
新增 Runtime：`0`
新增 Recovery 分支：`0`
新增 Skill/Prompt/Validator：`0`
真实 Provider 调用：`0`

## 自动证据

根级：

```text
Node 20.20.2
./scripts/check.sh
PASS
```

覆盖：

1. generic pre-write failure → FAILED → Service restart → stable replay → new Closure initiation；
2. concurrent Project version change → `V2_PROJECT_CLOSURE_COMMIT_STALE_RECOVERED` → Proposal STALE；
3. contradictory atomic receipt → ledger corrupt fail closed；
4. receipt-backed post-write interruption 仍继续原 PENDING Commit；
5. accepted planner 拒绝 FAILED，read-only inspector 可读取已审阅 shape；
6. FAILED/STALE 前台安全说明、无确认应用按钮、无内部错误码；
7. 首次 HTTP 500/409 后最终确认对话框不再遮挡真实审阅状态。

根级检查同时通过 typecheck、lint、全部 workspace tests、build、plugin integrity、
architecture boundaries、145 stable rules 和 acceptance rehearsal。npm audit 仍报告既有
`3 high + 1 critical`，未在本 Gate 内执行自动升级。

## Desktop 证据

- Logseq：`0.10.15`
- Graph：File Graph `/Users/wangrundong/work/任务管理中心-logseq插件/logseq`
- 主题：Dark
- 窗口：约 `1000×730`
- Plugin / Service build：`2026-07-29T00:27:47+0800`
- 截图：`2026-07-29T00:28:36+0800`
- 操作：More → Plugins → Task Copilot → 重载 → 打开 Task Copilot → 待我确认 → 待审阅
- 结果：当前待审阅 `0`；22 条历史默认折叠；最新构建可加载并连接正式 Service。

CURRENT：

`../current-ui/screenshots/p2-e-closure-review-clean-after-reload-dark-98df827.jpeg`

边界：生产入口没有安全的失败注入开关，因此 FAILED/STALE 专用卡只登记为
`AUTOMATED_ONLY`。本截图证明精确构建 reload 和当前审阅清洁状态，不冒充真实生产故障。

## 复杂度变化

- Partial：`-1`
- 新增长期 Partial：`0`
- Recovery Kernel 分支：`0`
- 用户恢复入口：`0`
- 平行写入权威：`0`

P2-E 已关闭；P2、P0、P1、P2-F/P2-G 和完整产品化 Goal 仍为 `IN_PROGRESS`。
