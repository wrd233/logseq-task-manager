# Known Deferred Items

核对日期：2026-10-02，第四轮交付。此页保留早期 deferred 清单的逐项去向；当前提交契约见 [API](kernel-api-contract.md) 与[状态机](commit-state-machine.md)，未来产品需求见[工作区协作需求](../requirements/2026-10-01-project-workspace-collaboration.md)。状态不代表重新执行历史发布验收。

| 原事项 | 当前状态 | 最小依据与剩余边界 |
| --- | --- | --- |
| MCP、通用模型/prompt/provider、排序与广泛 Skill | 部分实现 | `cognition.ts`、`deepseek.ts` 有受 ExecutionProfile 约束的 Fake/远程 executor；批准的封闭 Skill 和 composite 已实现；通用 MCP/provider 平台未实现 |
| 通用 SYSTEM/AGENT 正式写授权 | 仍未实现，权限边界保留 | Kernel `#prepare` / Proposal policy；仅批准的 Focus、Engagement 低风险变更可自动应用。WorkIntent 建议需 trusted USER；不能借 formal API 取得 USER 权限 |
| PARKED、父对象闭合、KR 结算、子对象处置、review/reminder/schedule | 部分实现 | Kernel Closure + `closure-readiness.ts` / `closure-assessment-coordinator.ts` 已支持 Task/MiniProject/Project USER 闭合与 OPEN 后代阻挡；PARKED 转换、KR 自动结算、处置规划、提醒和调度未实现 |
| 离线 marker 变化的重启对账 | 部分实现 | `marker-command.ts` 实时 TODO→DONE 已走 formal；SourceChangeObserver / 持久队列处理来源维护；尚无停机 marker 的持久 last-seen 扫描，不把离线 DONE 自动解释为新 USER 意图 |
| CANCELED/CANCELLED 原生 marker 约定 | 历史保留 | USER 取消已实现，保留自然文本/marker，通过 owned projection 表示取消；未宣称所有 Logseq 主机拥有统一取消 marker 契约 |
| Agent completion draft / richer Closure UI | 部分实现 | `closure-readiness.ts`、`object-surface.ts`、任务对象页已提供来源、评估和 USER 闭合/修订；外部 Agent 仅交付 completion DecisionPackage，不能直接完成 |
| Proposal inbox、排序、batch、跨对象会话和广泛自主权 | 部分实现 | Now/Confirmation/WorkMap/ObjectContext 及开放 DecisionPackage 已实现；通用 Proposal inbox、排序/batch 与跨任务调度未实现 |
| 直接编辑 managed 值自动成为语义命令 | 仍未实现 | `graph-adapter.ts` / managed ownership；label-only 编辑可重渲染，值/拓扑冲突 fail closed。不能自动反写正式值；重渲染不绕过待交付义务 |
| 自定义 label/color/order/template/DSL | 仍未实现 | `canonical-writing.ts` 和 Writing Language 默认渲染；工作视图展示偏好已存在，但不是正式投影 DSL |
| Project/MiniProject 只具 sparse WorkIntent | 已有实现，早期限制过时 | `project-intent.ts`、Kernel USER decisions、`object-surface.ts`、parent Closure；ProjectIntent/Ownership/闭合已实现，仍不强制自然笔记模板 |
| RECOVERY_REQUIRED 自动协调 | 仍未实现 | Kernel `recovery()` + Plugin recovery；人工协调项诚实显示，不能无证明终结 |
| 服务启动/launcher、OS secret store | 部分实现 | CLI `local-runtime.ts` 支持 start/status/stop/doctor/backup/restore；`server.ts` 有租约及启动失败清理。OS secret store/系统开机自启未实现；descriptor 私有 0600 |
| 远程同步、多用户、任意地址/端口、扩大的 server capability | 仍未实现 | Service 仅 loopback、单本地 USER，令牌能力分离；未因本轮扩大网络/身份权限 |
| 对话 USER confirmation/revision、外部 create/Closure、广泛 curation/归属/结构/batch | 部分实现 | trusted event→compile→execute、DecisionPackage、`applyUserRealityCorrection` 已有实现；外部 create/Closure 仍必须交给 USER。仅 typed ADD_REFERENCE，无通用内容维护/结构/batch 平台 |
| 自动 Taste 提炼/激活和 Skill 自修改 | 仍未实现 | immutable Taste/Skill、反馈及 `evaluate-taste-candidate.mjs` 已实现；评估不自动激活候选，不修改运行时批准 Skill |
| V1 数据兼容与内部 schema 升级 | 历史边界保留 | 无 V1 双写/迁移义务；vNext 自身迁移链必须保留。本轮 v23 保留历史定位和审计，v22 升级/失败回滚/未来版本拒绝有回归 |
| Whole-Graph presentation migration | 部分实现 | 当前项重渲染和正常持久 projection delivery 已实现；无整 Graph 扫描或长期 presentation migration 框架 |
| SDK 开发依赖与 audit | 历史记录保留 | `@logseq/libs` 锁定 0.3.4，dist 使用本地 SDK；早期文档曾记开发 audit 1 moderate/2 high 和 omit-dev=0，该数字是历史执行结果，本轮未重跑 audit，不宣称当前值 |
| Workspace、ContentPatch、FocusPlan、内容维护/审阅、动态剪枝和写作 Skill 产品 | 仍未实现，本轮范围之外 | [需求](../requirements/2026-10-01-project-workspace-collaboration.md)与冻结[架构报告](2026-10-01-workspace-architecture-review.md)是产品提案；本轮仅现有系统收尾 |

本轮实际自动化和隔离 Desktop 验证范围见[第四轮结果](../refactoring/round-04-results.md)。
