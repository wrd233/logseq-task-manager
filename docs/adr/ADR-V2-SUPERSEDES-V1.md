# ADR：V2 取代 V1

- 状态：accepted
- 日期：2026-07-20
- 关闭决定：OD-001
- 影响规则：D-055、D-067、D-189..191、D-208、D-220

## 背景

V1 已通过可信运行内核的 Desktop 验证，但其 Phase/Signal、FileStorage 和插件内直写结构与 V2 冻结语义冲突。长期并存会形成两套生命周期、状态轴、Store、UI 和写入路径。

## 决定

V2 成为唯一长期运行和正式写入模型。V1 仅作为 copied-data Pilot 对象、只读迁移来源、恢复证据和历史兼容入口保留，不新增长期产品能力，也不建设 V1/V2 模式切换。

优先复用 V1 的 Domain 约束方式、Application Command、Anchor、SemanticCommit、Undo、Recovery、Logseq Adapter、Diagnostics 和测试纪律；与 V2 语义冲突的 Phase、Signal、FileStorage 当前状态源和插件内直写必须通过迁移替换，不原样继承。

## 影响

- 当前工作约定和完成判定转向 V2 v1.1；
- V1 Pilot 仍需真实完成，以决定哪些交互资产可复用；
- V1 文档保留历史真实性，但状态文档必须明确其已冻结；
- 新功能只实现 V2 Lifecycle / Condition / Focus 和单一 Service 写入链。

## 回滚边界

V2 迁移切换前可继续只读使用 V1 证据并恢复 V1 快照；切换后若 V2 验证失败，回滚是恢复迁移前快照和停用 V2 写入，不启用双写。

## 验收

- 根工作约定不再要求新增 Phase/Signal；
- V2 代码不导入 V1 Store 作为当前权威；
- 迁移和运行测试证明只有一个当前写入模型；
- 追踪矩阵区分 `REUSE_EVIDENCE` 与 V2 `DONE`。
