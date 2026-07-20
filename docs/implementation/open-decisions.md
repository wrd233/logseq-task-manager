# V2 开放决定

> 状态值：`ACCEPTED` 表示产品或迁移合同已经冻结；`ADR_REQUIRED` 表示产品语义已冻结、只需在实施前用 spike 选择最小技术方案。

| ID | 状态 | 冲突 / 问题 | 证据 | 方案 | 推荐 | 影响 |
|---|---|---|---|---|---|---|
| OD-001 | ACCEPTED | V2 取代 V1，禁止长期双语义 | 用户确认 2026-07-20；详细规范 D-055、D-067、D-208、D-220；V2 §5.3 | V1 只作为只读迁移来源、恢复证据和历史兼容入口 | `ADR-V2-SUPERSEDES-V1.md` | V2 是唯一长期写入模型；复用 V1 安全内核，不维护第二套生命周期、状态轴、持久化和 UI |
| OD-002 | ACCEPTED | FileStorage 只读导出后显式迁移到 SQLite，禁止双写 | 用户确认 2026-07-20；D-189..201；V2 §5.4-5.5、§34、§51 | 快照与只读扫描 → 预览 → 小批次写 SQLite → 一致性验证 → 显式切换 | `ADR-FILESTORAGE-TO-SQLITE.md` | 安装/升级不自动迁移；迁移幂等、可中断/继续/重试、可撤销单批；切换后 SQLite 唯一 |
| OD-003 | ACCEPTED | Phase / Signal 经可审阅映射迁入 Lifecycle / Condition / Focus | 用户确认 2026-07-20；D-055、D-067、D-208、D-220；V2 §22 | 确定性映射保留理由和损失；不确定项成为迁移候选 | `ADR-LEGACY-STATE-MAPPING.md` | 不隐藏保留 Phase/Signal；不机械一对一；不把自然语言强压成枚举 |
| OD-004 | ADR_REQUIRED | Local Service 语言与通信 | V2 §30-32、§75 | TS/Node + localhost HTTP；TS/Node + Unix socket；其他语言 | TS/Node 20 + 仅 loopback HTTP，复用现有 TS 类型和测试；用随机会话令牌/端口文件限制本机调用 | 新 `apps/local-service`、client SDK、启动/受限模式、协议版本 |
| OD-005 | ADR_REQUIRED | SQLite driver | V2 §34；当前 macOS sqlite3 3.43.2；根 Node 20.20.2 | native Node driver；WASM；sqlite3 CLI 子进程 | 独立 Service 中限时比较 native prebuild 与 WASM；优先短事务、备份 API、可迁移、arm64/Node20 可复现方案；不以 CLI 子进程为正式驱动 | 安装、打包、事务、并发、备份、CI 和发布体积 |
| OD-006 | ADR_REQUIRED | Project structures 表还是 JSON | D-049..071；V2 §34.7 | 规范化表；单 JSON；混合 | Objectives/Deliverables/Stages 使用表，少量显示配置可 JSON；正文仍只在 Logseq | 查询、版本、迁移、Project re-entry |
| OD-007 | ACCEPTED | V1 remote 文档与当前事实不一致 | 2026-07-20 `origin` 与 `feature/task-copilot-mvp` 已由用户授权推送并验证本地/远端同 SHA | 保留 remote 与受保护 push workflow，文档以实测事实为准 | 已按用户授权完成一次受保护 push；后续不自动推送 | 文档与安全流程，不影响产品语义 |
| OD-008 | ADR_REQUIRED | `@logseq/libs` major upgrade 才能消除 audit 风险 | npm audit；当前 0.0.17，可用修复 0.3.4 major | 立即强升；保持并隔离；独立兼容 spike | 保持并记录，独立验证 0.3.4 的 API/runtime/bundle 后再决定 | 插件加载、DOM/API shape、安全风险 |

## 已关闭的总体方案确认点

用户已于 2026-07-20 正式确认：V2 取代 V1、FileStorage 只读迁移且禁止双写、旧状态经可审阅映射进入 V2。三项不再构成阻塞，也不得在后续实施中重新开放为普通实现选择。

其余 OD-004..008 属于实现 ADR，可在不改变产品语义的前提下通过小型 spike 决定。
