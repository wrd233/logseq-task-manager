# Task Copilot MVP Scope

## 产品边界

MVP 是嵌入 Logseq 的个人事务运行系统，不是 TODO 字段增强器。它提供低摩擦 Capture、独立领域对象、审计历史、可拆分 Proposal、可恢复 SemanticCommit、注意力投影和本地恢复包。

## 完整实现范围

- Capture、Task、MiniProject、Project；
- Area 的创建、编辑、列表和 Project 主归属；
- Phase、Condition、动态 Signal 三轴模型；
- 单主归属、依赖环检测、来源/上下文/产出等关系类型；
- Block UUID Anchor、正文 hash 前置检查、失联/冲突错误与重新绑定；
- 当前块捕获、Inbox、手工正式化；
- 对象抽屉、合法 Phase/Condition 命令；
- NoAgentProvider、DeterministicDemoProvider、External Agent 接口；
- Proposal 分项接受/拒绝、依赖阻断、SemanticCommit、补偿、Undo、启动恢复；
- Now Work、Project Re-entry、Audit/Recovery；
- 双槽 JSON Store、校验和、schema 保护、JSON/JSONL/Markdown 恢复包、临时 Store 恢复演练。

## 预留但不完整

Decision、Output、Resource、ExternalArtifact、PersonRef 可作为领域类型保存，但专属工作台、完整迁移/合并流程、Skill 系统、自定义 View DSL、文件工作区与外部系统集成不在本次 MVP。任何延期规则都列于 ADR-0004，不允许 Adapter 或 UI 私自补语义。

## 运行时边界

正式插件仅依赖官方 Logseq SDK 表面。未经 Desktop 证实的 `move_content` 保留为高影响语义操作，但 Adapter 会返回结构化 `MOVE_RUNTIME_UNVERIFIED`，不会猜测 UUID 移动行为或静默执行。
