# P1-D Object / Now Narration 自动证据（2026-07-24）

结论：`PARTIAL_UI_AUTOMATED_PASS / VERSION_MATCHED_OBJECT_NARRATION / DESKTOP_OPEN`

## 投影与边界

- Plugin 从同一轮 Service `listObjects()` 与 `nowWork()` 结果构造 Object narration；
- 重复 Object identity 直接拒绝，不选择任一版本；
- 每张 Now 卡片只消费与 item `objectId + version` 完全匹配的 narration；
- Object version 不匹配时保留既有 Local Service reason，不显示旧结论；
- blocker 只按正式 `blockerObjectId` 读取，缺失时由 Application 输出 unknown；
- 到期 WAITING/PAUSED 与已完成 blocker 的具体复查动作只复用现有
  `v2-condition-open` Handler；
- next-action target 不匹配或资格不足时保持普通“更新状态”；
- 投影异常显示明确错误，继续显示只读 Service reason，不改变 Graph、SQLite、Focus、
  Condition、Proposal 或 Commit；
- Attention shadow 仍未显现。

## 自动证据

- Application tests：112/112、0 skipped；
- Plugin tests：208/208、0 skipped；
- Plugin typecheck/build：PASS；
- 覆盖 blocker exact match、duplicate identity、Object version mismatch、到期 WAITING
  用户结论/依据/unknown/现有 Handler 路由；
- 根级 `./scripts/check.sh`：PASS（145 条稳定规则；恢复演练 differences 为空）。

## 尚未声明

- 未完成 Anchor conflict/missing repair consumer；
- 未完成 Light/Dark、窄栏、右侧栏、Zoom、Query/引用 Desktop 对照；
- 未启用 LLM draft protocol；
- 未将 P1-C shadow 编排替换为正式 Now UI。
