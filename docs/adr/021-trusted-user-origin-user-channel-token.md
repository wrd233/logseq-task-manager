# ADR 021 — Trusted USER Origin：Plugin User Channel Token

- 状态：accepted
- 日期：2026-08-15
- 关联权威文档：`docs/vnext/05` 用户授权边界、`docs/vnext/06` 第 10/11 章、`docs/vnext/07` Phase 11.5

## 1. 决定

USER 授权事实只能从真实 Logseq Plugin 交互产生，External Agent 无论持有 Kernel bearer 还是 Graph bridge capability，都不能 fabricate `UserDecision` 的 authorization input。

- `graph-adapter.json` 新增 `userChannelToken`，与 `token` / `graphBridgeToken` 分离；Plugin 持有该 capability，CLI/External Agent 不持有；
- Kernel Service 新增 `POST /v1/user-events`，仅接受 `x-task-copilot-user-channel` 等于 `userChannelToken` 的请求；
- Kernel 持久化 `TrustedUserEvent`，`sourceChannel` 只允许 `PLUGIN_USER_CHANNEL`，状态机为 `PENDING → CONSUMED`；
- `compileUserDecision` 只接受 `{ trustedUserEventId }`；旧 `--utterance/--package` 输入路径删除；
- 短确认语从“前缀匹配”改为**归一化精确白名单**：`好, 好的, 同意, 确认, 就这样, 可以, 行, 纳入`；只做 trim + 去尾部标点/空白 + 去内部空白；
- `DecisionPackage` 增加 `presentationRevision` / `presentedAt`；event 携带的 revision 必须与当前 package 完全一致，否则 `STALE`；
- event 编译即消费（与 `UserDecision` 同事务），重复编译返回 `STALE`；Decision 绑定 `authorizationRef = event.id`。

## 2. 威胁模型

- 持有 `token` 的 External Agent：可以读决策包，但创建 trusted event 得到 `TRUSTED_USER_CHANNEL_REQUIRED`；
- 持有 `graphBridgeToken` 的 Graph Adapter：不同 capability，也不能创建 trusted event；
- 旧 descriptor / 旧 Plugin：缺少 `userChannelToken` 时 fail closed，不能退化为自由文本授权；
- 重放同一 event、回放旧 presentation revision、跨 package 复用 event：全部 `STALE` 或 `NEEDS_CLARIFICATION`。

## 3. 实现

- schema v13：`decision_packages.presentation_revision/presented_at`、`trusted_user_events` 表；
- Kernel：`recordTrustedUserEvent` / `listTrustedUserEvents` / 重写 `compileUserDecision`；
- Client：`PluginKernelDescriptor.userChannelToken`、`createTrustedUserEvent`；
- Plugin：`Task Copilot vNext：回应当前决策` 命令走 `requestTextPrompt → createTrustedUserEvent → compile → execute`；
- CLI：`decision compile` 只报 usage error，不再接受 utterance。

## 4. 不做什么

- 不做自由文本语义授权（“我觉得可以”、“如果合适就同意”）；
- 不做可被 Agent 调用的 USER 通道；
- 不在 Plugin 与 Kernel 之间存聊天 transcript；
- 不把 `userChannelToken` 写入 Logseq Graph 或 SQLite。
