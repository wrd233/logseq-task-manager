# P2-G Migration 逐项审阅与计划创建自动证据

日期：2026-07-26
最终代码提交：`c660f2d00be55bfcf606a3f64d329deaab193473`

## 本轮关闭的纵向范围

`session-only Recovery Bundle → 服务端只读扫描 → 逐项阅读/决定 → 正式 Validator →
PREVIEWED 迁移计划账本`

- Service scan 只给当前会话返回每项 160 字符以内的规范化单行摘录、来源类型和机器分类；
  完整正文、内部 identity、hash、evidence 和文件内容不进入 UI snapshot、账本或日志。
- Plugin 只在当前会话保留 Bundle、identity token 映射和决定；clear、reject、新扫描、
  失败、reload 或 Graph switch 都释放材料。
- 机器建议缺失时不再静默默认 Task/Open/Actionable；结构冲突不能选择导入。
- 所有非 `IMPORT` 决定必须记录有界判断依据。该规则同时存在于 Plugin 前置检查和正式
  Domain Validator，旧客户端或直接 Service 请求不能绕过。
- 计划创建只写 Migration Review ledger，状态为 `PREVIEWED`；不导入正式对象，不创建
  batch，也不创建恢复点。
- Preview 响应丢失进入不确定态：锁住决定，只允许同决定幂等重试或放弃重扫，不能误报
  “未保存”。

## 安全与失败边界

- Bundle schema/hash/time/count/classification distribution、唯一 identity、title bounds、
  suggested mapping 和 Condition 均由客户端与 Service 再校验。
- controller 级并发提交被拒绝；失败和成功都会释放 raw/session-private material。
- review note、WAITING/BLOCKED/PAUSED 文本最大 4000 字符，blocker identity 最大
  512 字符。
- WAITING 秒级事实和 BLOCKED blocker identity 在用户没有语义修改时精确保留，不被分钟级
  UI 或无 identity 表单静默抹除。
- 双轴审查结果：Standards PASS；Spec PASS。最后一个 Spec P1——非 IMPORT 可绕过理由——
  已在 `c660f2d` 由 Domain/Application/Service 三层测试闭合。

## 自动证据

- Domain：`44/44` PASS；
- Application：`168/168` PASS；
- Local Service：`154/154` PASS；
- Plugin：`304/304` PASS；
- Domain/Application/Local Service typecheck：PASS；
- Node 20.20.2 根级 `./scripts/check.sh`：typecheck、lint、全部 workspace tests、build、
  Plugin/package/boundary、145 rules、acceptance rehearsal `differences: []` 和 outer repo
  boundary 全部 PASS；
- `git diff --check`：PASS。

正式 Import、Verify、Activate、恢复点、失败续跑和 Undo 不在本 Slice 的完成声明内，继续
作为 P2-G 下一关键路径。
