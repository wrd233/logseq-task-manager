# ADR-0003：Vanilla TypeScript UI

- 状态：accepted
- 日期：2026-07-17
- 影响规则：ARC-LAYER-001、DISC-001..003、PLG-UI-001..003、REV-UI-001

## 决策驱动因素

Proposal Review 需要清晰状态和事件委派，但首版组件量有限；Capability Lab 已证明 Vanilla TS 可由 esbuild 生成单 bundle，且不引入另一套运行时生命周期。

## 决策

正式插件使用纯 TypeScript 字符串 renderer 和统一事件委派。UI 只调用 `TaskCopilot` 命令/查询；状态机、关系和提交合法性不在 renderer 中实现。窄屏和暗色主题由单一 CSS 适配。

## 重审条件

当独立可测试交互组件数量或局部状态复杂度显著增加时，可评估 Preact/Lit，但必须保留现有 Application 接口和纯 ViewModel 测试。
