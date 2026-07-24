# P1-D Status Narration Plugin Consumer 自动证据（2026-07-24）

结论：`PARTIAL_UI_AUTOMATED_PASS / DETERMINISTIC_CONSUMER / DESKTOP_OPEN`

## 用户层接线

- `status-narration-runtime.ts` 只把 Service 的 Proposal、SemanticCommit 与 Runtime
  Diagnostics 结构化事实适配到 Application `StatusNarration`；
- System 五问首屏的 headline、最多两条依据和 rule provenance 来自统一契约；
- Proposal Review 先显示结论、依据与 unknown，内部状态、Provider/model 与 rule id
  只放在折叠详情；
- Recent Changes 先显示 Commit 结论与依据，技术 identity、checksum 与 error code
  继续只在折叠详情；
- Proposal accepted-not-applied 仍使用既有审阅与 Commit 路径；
- Commit Undo 资格仍由 operation-specific Handler 与版本/正文/Ownership 前置校验决定；
  `StatusNarration` 不产生写入，也不从 `COMPLETED` 猜测 Undo 可用；
- PENDING / RECOVERY_REQUIRED 没有新增第二个恢复命令。

## 自动证据

- Application tests：112/112、0 skipped；
- Plugin tests：204/204、0 skipped；
- Plugin typecheck/build：PASS；
- 新增 adapter、System、Proposal Review、Recent Changes 的 conclusion/evidence/unknown/
  provenance 与安全动作边界测试；
- 根级 `./scripts/check.sh`：PASS（145 条稳定规则；恢复演练 differences 为空）。

## 尚未声明

- 未完成 Object/Anchor/Now Work consumer；
- 未完成 Light/Dark、窄栏、右侧栏、Zoom、Query/引用场景的 Desktop 对照；
- 未启用 LLM draft protocol；
- 未把 Attention shadow 变为用户可见。
