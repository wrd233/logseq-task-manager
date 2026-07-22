# ADR：Logseq Desktop 瞬态 Graph 只读桥接

- 状态：accepted by automated integration; Desktop Gate pending
- 日期：2026-07-22
- 对应：D-132、D-133、D-135；V2 §35.8、§37.2-37.3、§39；E2E-13

## 问题

CLI 必须能确定性读取 `block / page` 少量范围并导出 Context Package，但 Local Service 不能通过 SQLite 获得 Logseq 正文，CLI 也不得扫描 Graph 文件或猜测页面名到文件名的映射。现有 object/project Context 只能表达 SQLite 正式事实，无法完成设计规定的 Graph Context。

## 决定

复用唯一 Local Service 的 loopback token 协议，增加一个仅内存、仅只读、按请求工作的 Logseq Desktop bridge：

1. Plugin 以有界 long-poll 等待一个 Graph 读取请求；
2. CLI 的 `graph page/block/resolve` 或 `context export --scope block/page` 仍只调用 Local Service；
3. Plugin 只经 Logseq API 读取目标 Page/Block，规范化最多 256 Blocks、1 MiB 正文、Page depth 0..5、Block parents 0..8；
4. Service 重新验证请求、结果形态、UTF-8 大小、唯一 UUID、Block 语义 hash、Page revalidation hash 与整个 scope hash；
5. Context Package 把 Logseq snapshot 与 SQLite 正式对象/Anchor/关系明确分层，继续标记为 `READ_ONLY_DERIVATIVE`，输出目录仍为 0700、文件 0600、manifest 最后写入。

桥接请求、结果和正文不进入 SQLite、FileStorage、日志、Doctor 导出或新的缓存；没有新表、第二状态源、Graph 写路径、扫描器或补漏器。Service 停止、Plugin 重连、目标不存在、超时、越界或 hash 不一致都 fail closed，绝不回退到旧快照或文件扫描。

## 为什么不是其他方案

- 直接读 Markdown 文件会绕过 Logseq 当前权威视图，并要求猜测页面/文件映射；拒绝。
- 把 Page/Block 快照长期写入 SQLite 或 FileStorage会形成正文副本和 stale 同步问题；拒绝。
- 要求用户先在 Plugin 手工“准备导出”会增加临时缓存与额外用户概念；拒绝。
- 新建第二个 Desktop 服务或 WebSocket 平台会扩大运行面；当前单请求 long-poll 已能覆盖既定 Gate。

## 自动证据与限制

- Broker 已证明 Desktop 缺席、busy、timeout、过期 result 和 Service stop 均结构化失败；
- Logseq Adapter 已证明 Page depth、Block children/parents、resolve、去重、正文/总量上限和 `id::` 身份行语义 hash；
- 真实 Local Service + CLI 集成已写出含 `graph/page.json`、正式对象、Skill、hash manifest 的私有 Context Package，前后 Object/Proposal/Commit 计数不变；
- Doctor 只报告 bridge connected/not-connected 与等待计数，不导出正文。

这些自动证据不替代 Logseq Desktop：真实页面名/UUID、Block tree shape、reload/reconnect 和 CLI→Desktop Review 跨入口仍须在集中 Desktop Gate 验收。
