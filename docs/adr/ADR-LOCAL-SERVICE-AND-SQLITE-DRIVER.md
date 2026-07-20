# ADR：Node 20 Local Service 与 better-sqlite3

- 状态：accepted by spike
- 日期：2026-07-20
- 关闭决定：OD-004、OD-005

## 决定

V2 使用单个 Node.js 20 Local Service，通过仅绑定 `127.0.0.1` 的版本化 HTTP 协议服务 Plugin/CLI。每次进程启动使用高熵 session token；无 token 的请求返回 401。Plugin、CLI 和迁移器不得直接打开 SQLite。

SQLite adapter 使用 `better-sqlite3` 12.10.x，且只存在于 Service/persistence Node 边界。事务保持同步且短小，不跨 event-loop tick；启用 foreign keys、WAL 和有界 busy timeout。备份使用 SQLite backup API，不复制活动 WAL 文件。

Node 20 没有内建 `node:sqlite`，因此不为等待 Node 升级阻塞 V2，也不通过 `sqlite3` CLI 子进程建立正式 Store。原生模块必须用仓库固定的 Node 20 安装/构建；错误 ABI 在 typecheck/test/build Gate 前暴露。

## Spike 证据

- macOS arm64 / Node 20.20.2 成功加载 SQLite 3.53.1；
- 初始化幂等且绑定 Graph identity；未知 schema、损坏字节拒绝且不覆盖；
- expected version 与 idempotency receipt 在同一事务；
- backup 可独立打开并通过 integrity/foreign-key Doctor；
- Service 仅绑定 loopback，认证、health/status/doctor/只读 objects 路由通过；不存在意外写路由。
- runtime descriptor 原子写入且权限 0600；Client 同时校验 descriptor 与运行协议，Service 退出清除 descriptor；
- `tc status/doctor/object` 只经 Service，具有稳定 JSON envelope 与退出码；真实独立进程冒烟通过。
- schema v3 具有可审计 migration ledger 和受约束 SemanticCommit step ledger；v1/v2 升级必须显式创建并校验快照，事务失败全量回滚并可重试。
- 离线 Restore 原语会先校验候选快照和当前库恢复点，再原子替换；注入的激活后失败会回滚原库并保留恢复点。
- Desktop 0.10.15 实测 plugin iframe 不暴露 Node `require`。Service 继续原子创建 0600 descriptor；Plugin 通过 Logseq 官方私有 FileStorage bridge 按受限文件名 key 读取它。该文件只用于会话发现，不是领域状态源，不构成 FileStorage/SQLite 双写；Electron Node reader仅作为兼容能力保留。

## 限制与后续

本 ADR 不表示 V2 全部完成。Service 已开放受约束显式同步、Anchor 与 Restore 路由；Plugin 的首次启用、私有 descriptor 发现、Service READY、原生正文编辑和一次断线最新值恢复已通过 Desktop，剩余 Anchor/移动复制/子树 Gate 仍见集中清单。
