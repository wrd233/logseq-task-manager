# P1-G Project Context Recovery Service 自动证据（2026-07-24）

结论：`AUTOMATED_PASS / SERVER_OWNED_AUTHORITY / ZERO_FORMAL_WRITE / PLUGIN_OPEN`

## 用户链路

Local Service 已提供第一个 unified UX 生产入口。客户端只声明要恢复的正式 Project 身份与
预期版本；服务端从 SQLite 单一权威、现有关系/Focus/Anchor/Commit、只读 Context Package
和内置 Skill 构造模型上下文。模型只选择机器 fact/action/evidence ID，不能提交事实文本、
动作目标、Prompt、scope、risk、review 或 provenance。

## 安全边界

- exact-key 请求只允许 `objectId` 与正整数 `expectedVersion`；
- missing、非 Project、stale、额外客户端字段均在 Provider 前拒绝；
- allowed action 只映射现有 `OPEN_SOURCE` / `OPEN_REVIEW` 只读路由；
- Provider 期间 Project version 变化时丢弃结果；
- 输出不进入 Domain、Proposal、SemanticCommit、Graph、SQLite 或持久 cache；
- daemon 仍只通过 out-of-band secret reference 解析 Provider，响应和证据均不含凭据。

## 自动证据

- Local Service：100/100 PASS，0 skipped；
- Service Client：12/12 PASS，0 skipped；
- Local Service 与 Service Client typecheck：PASS；
- 覆盖信息不足的诚实输出、机器事实替换、只读动作、上下文指纹、零正式写入、
  stale-before-provider、错误对象类型、客户端字段注入与 Provider disabled。

## 尚未声明

- Plugin Project 重入卡尚未消费此输出；
- 尚未运行真实 DeepSeek context-recovery 语义 Gate；
- 尚未验证 Logseq Desktop loading/error/stale、主题、窄栏与动作解析；
- 因此 P1-G 与 P1 仍未完成。
