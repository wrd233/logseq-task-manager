# P1-D Anchor Repair Narration 自动证据（2026-07-24）

结论：`PARTIAL_UI_AUTOMATED_PASS / EXISTING_REBIND_CHAIN / DESKTOP_OPEN`

## 用户层投影

- 只投影 Primary Anchor 的 `missing` / `conflict`；`active` / `replaced` 保持安静；
- 卡片先显示对象标题、确定性结论、最多两条关键依据和信息未知；
- 最多展示 5 项，超出数量明确汇总，不把完整问题列表压到系统状态首屏；
- 用户投影不包含 object ID、Anchor ID、Graph ID、Block UUID 或 content hash；
- 复制和导出的 diagnostics snapshot 仍只含冲突计数，不含对象标题或该用户投影。

## 修复边界

- 唯一按钮复用已有 `v2-rebind-open`，未新增恢复命令、状态机或正式写入路径；
- 用户需先在 Logseq 选择一个明确的显式对象 Block；
- 既有预览只列同类型、非 replaced、非当前 Block 的候选 Anchor；
- 最终提交继续要求独立高影响确认，并重验 Block UUID、正文 hash、input version、对象类型、
  标题、Object version、旧 Anchor status/hash 与 Service discovery generation；
- 旧 Anchor 只保留为 `replaced`，新 Anchor 成为唯一 `active`，object ID 与 Ownership 不变；
- Service 受限时不显示可执行修复动作；
- loading/error/preview/success 重绘后位于用户层，不再被默认折叠的工程诊断隐藏。

## 自动证据

- Plugin tests：213/213、0 skipped；
- Plugin typecheck/build：PASS；
- 覆盖 missing/conflict 选择、active/replaced 排除、重复 identity fail closed、身份不泄漏、
  5 项上限、Service 受限动作禁用和用户层/技术层位置；
- 根级 `./scripts/check.sh`：PASS（Node 20.20.2；145 条稳定规则；恢复演练
  differences 为空；Repository boundary PASS）。

## 尚未声明

- 未完成真实 Logseq Desktop 的 missing/conflict → 选择新正文 → 预览 → 取消/确认 → reload；
- 未完成 Light/Dark、窄栏、Zoom、Query/引用场景的视觉和宿主验证；
- 未完成 P1-D LLM draft protocol；
- 因而 P1-D 与 P1 仍为 `PARTIAL_UI_AUTOMATED`。
