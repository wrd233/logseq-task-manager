# V2 开放决定

> 状态值：`NEEDS_CONFIRMATION` 表示会改变产品/迁移契约；`ADR_REQUIRED` 表示产品语义已冻结、只需在实施前用 spike 选择最小技术方案。

| ID | 状态 | 冲突 / 问题 | 证据 | 方案 | 推荐 | 影响 |
|---|---|---|---|---|---|---|
| OD-001 | NEEDS_CONFIRMATION | 根 `AGENTS.md` 仍以 V1/MVP 为持久 Goal，并强制 Phase/Condition/Signal；新设计冻结为 Lifecycle/Condition/Focus | 根工作约定；详细规范 D-055、D-067、D-208、D-220；V2 §5.3 | A 保持 V1 Goal；B 将 V1 文档冻结为历史并启用 V2 Goal；C 并行维护两套产品语义 | B。确认后先更新工作约定和状态文件，禁止 C 的双语义 | 决定后续是否能合法改 Domain、UI、规则覆盖和完成判定 |
| OD-002 | NEEDS_CONFIRMATION | ADR-0002 选择 JSON/FileStorage，V2 强制 SQLite 单一权威 | ADR-0002；D-189..191；V2 §5.4-5.5、§34 | A 原地转换；B V1 只读导出 + V2 新库导入；C 长期双写 | B。保留原字节与恢复包，经显式迁移批次导入；禁止 C | 需要 migration manifest、对象/状态映射、回滚与身份保留策略 |
| OD-003 | NEEDS_CONFIRMATION | V1 多阶段 Phase/Signal 与 V2 Lifecycle/Focus 不同 | V1 Domain；D-055、D-067、D-208、D-220；V2 §22 | A 丢弃旧值；B 确定性映射并保存 legacy evidence；C 保留隐藏 Phase | B。映射必须单独 ADR 和 fixture 驱动；无法确定的对象进入迁移确认 | 影响 objects schema、Now Work、历史事件、Undo、UI 文案 |
| OD-004 | ADR_REQUIRED | Local Service 语言与通信 | V2 §30-32、§75 | TS/Node + localhost HTTP；TS/Node + Unix socket；其他语言 | TS/Node 20 + 仅 loopback HTTP，复用现有 TS 类型和测试；用随机会话令牌/端口文件限制本机调用 | 新 `apps/local-service`、client SDK、启动/受限模式、协议版本 |
| OD-005 | ADR_REQUIRED | SQLite driver | V2 §34；当前 macOS sqlite3 3.43.2；根 Node 20.20.2 | native Node driver；WASM；sqlite3 CLI 子进程 | 独立 Service 中限时比较 native prebuild 与 WASM；优先短事务、备份 API、可迁移、arm64/Node20 可复现方案；不以 CLI 子进程为正式驱动 | 安装、打包、事务、并发、备份、CI 和发布体积 |
| OD-006 | ADR_REQUIRED | Project structures 表还是 JSON | D-049..071；V2 §34.7 | 规范化表；单 JSON；混合 | Objectives/Deliverables/Stages 使用表，少量显示配置可 JSON；正文仍只在 Logseq | 查询、版本、迁移、Project re-entry |
| OD-007 | ADR_REQUIRED | V1 remote 文档与当前事实不一致 | `git remote -v` 与 `docs/REPOSITORY_BOUNDARIES.md` | 删除 remote；更新事实；忽略 | 只更新事实，保留 no-push 约束；不删除或改写用户 remote | 文档与安全流程，不影响产品语义 |
| OD-008 | ADR_REQUIRED | `@logseq/libs` major upgrade 才能消除 audit 风险 | npm audit；当前 0.0.17，可用修复 0.3.4 major | 立即强升；保持并隔离；独立兼容 spike | 保持并记录，独立验证 0.3.4 的 API/runtime/bundle 后再决定 | 插件加载、DOM/API shape、安全风险 |

## 总体方案确认点

进入结构性实现前，请用户确认：

1. V2 Goal 正式取代 V1/MVP 作为当前持久 Goal；V1 文档和提交只作为历史证据保留；
2. V1 FileStorage 采用“只读导出 -> 显式迁移批次 -> 新 SQLite”而非双写；
3. V1 Phase/Signal 通过可审阅迁移映射进入 Lifecycle/Condition/Focus，不静默丢弃。

其余 OD-004..008 属于实现 ADR，可在不改变产品语义的前提下通过小型 spike 决定。
