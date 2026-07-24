# V2 开放决定

> 状态值：`ACCEPTED` 表示产品或迁移合同已经冻结；`ADR_REQUIRED` 表示产品语义已冻结、只需在实施前用 spike 选择最小技术方案。

| ID | 状态 | 冲突 / 问题 | 证据 | 方案 | 推荐 | 影响 |
|---|---|---|---|---|---|---|
| OD-001 | ACCEPTED | V2 取代 V1，禁止长期双语义 | 用户确认 2026-07-20；详细规范 D-055、D-067、D-208、D-220；V2 §5.3 | V1 只作为只读迁移来源、恢复证据和历史兼容入口 | `ADR-V2-SUPERSEDES-V1.md` | V2 是唯一长期写入模型；复用 V1 安全内核，不维护第二套生命周期、状态轴、持久化和 UI |
| OD-002 | ACCEPTED | FileStorage 只读导出后显式迁移到 SQLite，禁止双写 | 用户确认 2026-07-20；D-189..201；V2 §5.4-5.5、§34、§51 | 快照与只读扫描 → 预览 → 小批次写 SQLite → 一致性验证 → 显式切换 | `ADR-FILESTORAGE-TO-SQLITE.md` | 安装/升级不自动迁移；迁移幂等、可中断/继续/重试、可撤销单批；切换后 SQLite 唯一 |
| OD-003 | ACCEPTED | Phase / Signal 经可审阅映射迁入 Lifecycle / Condition / Focus | 用户确认 2026-07-20；D-055、D-067、D-208、D-220；V2 §22 | 确定性映射保留理由和损失；不确定项成为迁移候选 | `ADR-LEGACY-STATE-MAPPING.md` | 不隐藏保留 Phase/Signal；不机械一对一；不把自然语言强压成枚举 |
| OD-004 | ACCEPTED | Local Service 语言与通信 | V2 §30-32、§75；2026-07-20 loopback/auth/protocol spike | TS/Node 20 + 仅 `127.0.0.1` HTTP + 高熵 session token | `ADR-LOCAL-SERVICE-AND-SQLITE-DRIVER.md` | 单一 Service；client/descriptor/受限模式继续实现 |
| OD-005 | ACCEPTED | SQLite driver | V2 §34；Node 20.20.2/macOS arm64 spike | Service 内 `better-sqlite3` 12.10.x；同步短事务和 backup API | `ADR-LOCAL-SERVICE-AND-SQLITE-DRIVER.md` | 原生 ABI 锁定 Node20；Plugin 不加载 driver |
| OD-006 | ACCEPTED | Project structures 表还是 JSON | D-049..071；V2 §34.7；schema v11→v12 migration / Commit / Undo spike | bounded 单 JSON aggregate | `0006-project-structure-aggregate.md`；复用 Object version、Proposal 与 SemanticCommit，不新增 Project 子表 | 一屏读写、整体版本保护、可恢复；正文仍只在 Logseq |
| OD-007 | ACCEPTED | V1 remote 文档与当前事实不一致 | 2026-07-20 `origin` 与 `feature/task-copilot-mvp` 已由用户授权推送并验证本地/远端同 SHA | 保留 remote 与受保护 push workflow，文档以实测事实为准 | 已按用户授权完成一次受保护 push；后续不自动推送 | 文档与安全流程，不影响产品语义 |
| OD-008 | ACCEPTED | `@logseq/libs` major upgrade 是否能消除 audit 风险 | `0007-logseq-sdk-runtime-risk.md`；0.3.4 isolated type/test/build 与真实 Desktop type-only rejection spike | 立即强升；移除 runtime；保持并隔离 | 暂时保持 0.0.17 runtime；0.3.4 仍打包受 advisory 影响的 DOMPurify/lodash-es，纯类型依赖又无法建立 Logseq 0.10.15 `window.logseq` | 已知上游 release risk；升级前必须同时满足更安全依赖、129 tests/build 与 Desktop load/API Gate |
| OD-009 | ACCEPTED | SQLite schema 升级是否允许启动时静默执行 | V2 §34、§51、§53-56；数据安全优先 | 自动升级；显式快照后升级 | `ADR-SQLITE-SCHEMA-MIGRATION-LEDGER.md`；`initialize` 只报告 required，显式 API 先快照再事务升级 | 防止安装/启动静默改 DB；失败可重试；不影响 FileStorage 禁止双写 |
| OD-010 | ACCEPTED | Logseq iframe 无受支持 child-process API 时如何实现日常 Service 生命周期 | Desktop 0.10.15 require 缺失、SDK 无 spawn/exec；Launcher/LaunchAgent 自动与真实进程 Gate | iframe shell-out；继续每日终端；独立受控 Launcher | `0008-local-launcher-owned-service-lifecycle.md`：独立 authenticated loopback Launcher + Graph lease + exact owned child + owner-PID self-stop | 日常无需终端；Plugin 不获得任意进程能力；Graph 错配与 orphan fail closed；Desktop lifecycle Gate 独立验收 |

## 已关闭的总体方案确认点

用户已于 2026-07-20 正式确认：V2 取代 V1、FileStorage 只读迁移且禁止双写、旧状态经可审阅映射进入 V2。三项不再构成阻塞，也不得在后续实施中重新开放为普通实现选择。

OD-004/005 已由可运行 spike 关闭，OD-009 已由 schema v1 → v2 失败注入测试关闭。OD-006 已由 schema v12 的单聚合迁移、Proposal Commit/Undo 与一屏 Project UI spike 关闭。OD-008 已由隔离 0.3.4 兼容测试、包依赖审计和真实 Desktop runtime removal 反证关闭；OD-010 已由独立 Launcher/LaunchAgent、真实 crash/orphan/owned-shutdown Gate 关闭；当前不存在开放的 `ADR_REQUIRED`。
