# 代码瘦身与渐进重构

> 2026-10-01。以下是实施计划，未声明相关重构已完成。新工作区能力的产品实现不在这四轮的范围内。

先阅读[工作区协作需求](../requirements/2026-10-01-project-workspace-collaboration.md)和[架构分析报告](../architecture/2026-10-01-workspace-architecture-review.md)。架构报告给出目标方向；本目录将代码瘦身切成独立、可验证的轮次。

| 轮次 | 目标 | 主要边界 |
|---|---|---|
| 1 | 清理经证明的冗余，统一正式投影构造，解除工作视图对任务控制器的身份依赖，澄清文档权威 | 保持现有公开行为、协议、hash、schema 和功能启用语义 |
| 2 | 拆开共享运行时、应用编排和存储访问职责，收窄 Kernel 与协调器依赖 | 保持同一 SQLite 事务和投影恢复能力；不直接删除 legacy 提交链 |
| 3 | 整理工作视图状态与更新机制，降低重复读取和界面重建 | 以测量和行为验证为依据，保护输入、焦点、草稿和过期结果判断 |
| 4 | 在调用方迁移完成后收敛旧路径、过时入口及重复文档，完成回归 | 用调用证据、持久数据兼容性和故障场景决定删除范围 |

目前只有[第一轮 Codex 提示词](round-01-codex-prompt.md)是可直接执行的任务。后续提示词应依据上一轮实际 diff、测试结果和剩余耦合重新编写，不提前要求一次完成四轮。

## 第一轮值得核实的具体线索

- `packages/kernel/src/index.ts` 的 `projectionFor()` 与插件任务控制器的 `expectedProjection()` 重复构造正式投影及其 hash；两端处理的是同一份投影协议，应收敛且保持字节级协议兼容。
- 工作视图从 `features/task-center/controller.ts` 导入 `taskIdentity`；共享身份能力不应依赖其他功能的 UI 控制器。
- `work-view/model.mjs` 中的 `agentContext`、`checkAgentPatch`，`focus.mjs` 中的 `continuingLayout`，以及 `workspace/context.ts` 中部分类型，在当前已检查路径中只出现于定义、声明和测试，尚未发现生产调用；这是待核实线索，不是已证明可删的结论。
- `docs/vnext/README.md` 虽把 01–04 标为 historical / superseded，后续介绍仍建议把旧 01 当作“宪法”，容易误导新 agent。
- `docs/architecture/commit-state-machine.md` 和 ADR 003 主要描述早期跨介质提交链，而当前主路径是 formal commit + projection obligation；应说明当前/legacy/superseded 的适用范围。
- ADR 042 的 freeze 描述与根 README 已明确扩展的整合范围需要交叉标注；不能将历史冻结记录当作永远禁止当前需求的授权依据。

## 防御性逻辑的删减标准

值得优先检查的包括：内部类型已确定之后仍重复解析、同一纯规则在多处复制、已无调用方的兼容分支、无法达到的降级路径、改变关键失败语义的吞错，以及仅为证明未接入原型函数存在而保留的测试。

应保留或集中表达的包括：HTTP/模型/SDK/磁盘输入校验、trusted user channel、证据 proof/hash、来源版本和拓扑检查、写前检查及读回核对、编辑中草稿保护、异步 generation/epoch、幂等、事务、持久化恢复、数据库迁移兼容、队列失败后继续工作的机制。

每一处删除都应回答：它保护什么，输入边界在哪里，是否仍有调用方或持久数据依赖，删除后哪些行为验证能够证明等价。代码行数和 `if` / `catch` 数量不能代替这个判断。

## 文档处理原则

当前说明只保留一个明确入口。历史 ADR、阶段验收和失败注入证据应有状态与适用范围；可以归档和压缩重复说明，但不能仅因日期较旧而批量删除。生成的需求 HTML 从 JSON/template 重建，第三方 vendor 许可证、迁移资料、RC 操作指南和本轮需求/报告必须保留。
