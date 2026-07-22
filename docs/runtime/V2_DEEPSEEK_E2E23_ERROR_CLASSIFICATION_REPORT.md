# V2 DeepSeek E2E-23 Error Classification Report

> 日期：2026-07-22
> 结论：`PASS`，E2E-23 可收口为 `DONE`

## 边界

- 不重复已通过的 Flash/Pro 22×2 黄金案例、L4 Desktop、迁移、Restore 或首次运行 Gate。
- 认证失败使用一个明确无效且非敏感的临时 token 向真实 DeepSeek endpoint 发出单次最小 Structured 请求；不使用或暴露用户 Key。
- 取消使用现有 macOS Keychain reference 解析真实配置，请求开始后 10ms 主动 Abort；只记录分类和耗时，不记录 Key、Authorization、响应正文或 request id。
- 限流不向 DeepSeek 制造请求洪峰；改用真实 loopback HTTP server 返回 429，验证生产 `fetch`、URL、请求外形、有限重试和最终分类。设计规范 E2E-23 明确允许“模拟或触发”。

## 结果

1. 真实 endpoint + 无效临时 token：HTTP 401 被映射为 `LLM_AUTH_FAILED`，`retryable=false`，只尝试一次。
2. 真实 endpoint + Keychain 配置：请求开始后 20ms 内收口为 `LLM_CANCELLED`，`retryable=false`；没有等待 timeout 或继续 retry。
3. loopback 真实 HTTP 429：请求路径为 `/v1/chat/completions`，Structured 请求外形和 Authorization header 存在性均正确；按既有上限共两次尝试后返回 `LLM_RATE_LIMITED / retryable=true`。
4. 已有在线证据继续覆盖真实 `LLM_OUTPUT_TRUNCATED`、`LLM_TIMEOUT` 和空 Structured Content；非法 JSON、空内容、截断、401/404/429/503、网络、取消和 timeout 的 Provider 回归为 10/10 PASS、0 skipped。
5. 三次本轮探测均只调用 Provider 层，没有打开 Graph、SQLite、Candidate 或 Proposal 写入口；错误消息与机器证据不含凭据值或失败响应正文。既有 Service/Generator 自动测试继续证明 Validator 前失败不产生 Proposal 或正式写入，L4 Desktop 已证明错误后编辑与 UI 可继续。

## 复杂度

没有代码、表、状态、协议、重试策略、错误码或恢复路径变化。本 Gate 只补齐真实配置下的安全分类证据，并继续用受控 HTTP 429 代替破坏性的线上限流制造。

脱敏机器证据：`docs/testing/deepseek-v4-e2e23-error-classification-2026-07-22.json`。
