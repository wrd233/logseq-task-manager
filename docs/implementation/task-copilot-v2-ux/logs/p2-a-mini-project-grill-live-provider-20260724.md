# P2-A MiniProject Grill — Real Provider Evidence — 2026-07-24

结论：`LIVE_PROVIDER_PASS / VALIDATOR_PASS / SESSION_DRAFT_ONLY / FULL_SERVICE_DESKTOP_OPEN`

## 安全配置

使用已安装 Launcher 的非敏感 Provider 元数据、既有 macOS Keychain reference 和实际
`deepseek-v4-flash`。Key 未进入命令行、仓库、Graph、SQLite、普通日志或本文；Gate 只输出
Schema 结果、计数、focus、版本和实际模型名，不输出 Prompt、原始响应、对象 ID 或正文。

## 两轮真实结果

```json
{"status":"PASS","firstFocus":"boundary","secondFocus":"outcome","firstReadiness":"CONTINUE","secondReadiness":"CONTINUE","firstFacts":2,"firstInferences":1,"firstUnknowns":1,"secondFacts":3,"secondInferences":1,"secondUnknowns":1,"firstHasRecommendation":true,"secondHasRecommendation":true,"authorityBoundary":"SESSION_DRAFT_ONLY","providerId":"deepseek","model":"deepseek-v4-flash","skillVersion":"1.0.0"}
```

- 第一轮机器 authority 选择 boundary；模型没有改变 focus/readiness；
- 用户边界回答作为带 opaque reference 的 session fact 加入第二轮；
- 第二轮机器 focus 转为 outcome，没有重复固定字段问卷；
- 两轮均给出事实、推断、未知和带至少一个 tradeoff 的 evidence-backed recommendation；
- Provider provenance 由机器替换，模型无法注入 Proposal、operation 或正式写权限；
- 输出未持久化，也没有进入 Structure Preview、Proposal Review 或 Commit。

## 完整 Service / Desktop 边界

在原位更新已安装 Node20 runtime 后，使用同一测试 Graph、Launcher lease 和真实 Provider
尝试完整 Service route。当前 Logseq Desktop Graph read bridge 未连接，Service 在读取正文
前明确返回：

```json
{"status":"FAIL","remoteCode":"GRAPH_READ_BRIDGE_UNAVAILABLE","httpStatus":503}
```

该失败符合 fail-closed 设计：没有使用文件猜测、缓存或伪造 Graph snapshot，也没有调用完整
route 的 Provider 或写入正式状态。因此本文只声明真实 Provider/Validator PASS；Logseq
Desktop bridge、Plugin 多轮交互、loading/error/stale/reload 和完整 Service live route 保持 OPEN。
