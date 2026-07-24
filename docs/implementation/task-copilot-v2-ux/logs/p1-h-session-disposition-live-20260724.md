# P1-H Session Disposition 真实 Service Gate（2026-07-24）

结论：`AUTOMATED_PASS / LIVE_PROVIDER_SERVICE_PASS / ZERO_FORMAL_WRITE / DESKTOP_OPEN`

## 交付链

Project 重入草稿获得 session-only opaque interaction handle。Plugin 卡片提供
`HELPFUL / NOT_NEEDED / INACCURATE / TOO_MUCH / DO_NOT_REPEAT` 和撤回；Local Service
只接受严格枚举或 `null`，按 Skill/Prompt/model 版本汇总结构计数，不保存正文、对象身份、
Prompt、原始响应、异常正文或 handle。

`DO_NOT_REPEAT` 的边界是当前 Service session 内同一 scene + Skill version。选择后在 Provider
调用前返回 409 `UX_OUTPUT_SESSION_SUPPRESSED`；动态 Context Package 时间戳和 prompt hash
不能绕过用户意图。撤回立即恢复，Service restart 自然清空。该机制没有 Domain、SQLite 或
Graph 写入口，也不替代正式 Proposal/Commit/Undo。

## 真实运行证据

安装态 runtime 按 `Local Service build → Launcher build → package runtime → install` 更新；首次
只重建 Launcher 的尝试真实暴露旧 `dist/service.js` 被打包、响应缺 handle，因此未计为通过。
重建完整链后，使用既有私有 LaunchAgent、Keychain reference 和真实 DeepSeek Provider 执行：

```json
{"status":"PASS","providerCapability":true,"schemaVersion":"task-copilot-ux-output-v1","skillVersion":"1.1.0","hasInteractionHandle":true,"helpfulRateAfterHelpful":1,"noiseRateAfterTooMuch":1,"doNotRepeatCount":1,"suppressionCode":"UX_OUTPUT_SESSION_SUPPRESSED","providerSkippedWhileSuppressed":true,"withdrawn":true,"ratedAfterWithdraw":0,"summaryContainsInteractionHandle":false,"formalObjectProjectionUnchanged":true,"heartbeatsDuringGate":1}
```

release 后进程证据为 Launcher 1、owned Service 0；Launcher config 与 pairing descriptor 均为
0600。凭据值未进入命令行、仓库、Graph、SQLite、日志、截图或本报告。

## 自动验证与剩余边界

- Application 123/123、Local Service 102/102、Plugin 226/226，均 0 skipped；相关 typecheck PASS；
- 覆盖 feedback set/change/withdraw、handle eviction/跨 session 失效、summary/export 脱敏、
  duplicate busy/stale/runtime generation guard、Provider 前抑制和正式对象零变化；
- Plugin UI 为自动验证，不是 Desktop 点击证据；Light/Dark、窄栏、loading/error/stale 与真实
  反馈按钮交互仍保持 OPEN；
- 单次真实反馈能证明指标链正确，不能证明噪声阈值已经可接受，也不足以授权跨会话持久化。
