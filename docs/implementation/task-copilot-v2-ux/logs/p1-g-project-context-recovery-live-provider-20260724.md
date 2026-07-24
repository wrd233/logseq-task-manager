# P1-G Project Context Recovery 真实 Provider Gate（2026-07-24）

结论：`LIVE_PROVIDER_PASS / VALIDATOR_PASS / ZERO_FORMAL_WRITE / DESKTOP_OPEN`

## 真实运行链

使用已安装的 macOS LaunchAgent `com.task-copilot.launcher`、测试 Graph 对应 SQLite、既有
macOS Keychain reference 和真实 DeepSeek Provider 执行：

`Launcher lease + heartbeat → owned Service → Project Context Package → recover-context@1.1.0 → DeepSeek → Unified UX Validator → release → owned shutdown`

没有把凭据值写入命令行、仓库、Graph、SQLite、日志、截图或本报告。运行配置只保存
Provider ID、无凭据 Base URL、实际 Model ID、`keychain:` reference、60 秒 timeout 与
4096 output-token 上限；私有 Launcher config 与 descriptor 均为 0600。

## 发现并关闭的真实缺口

1. 已安装 runtime 位于 `bin/service.js`，旧 Skill root 只识别 `dist/`，导致安装态
   Context Package 在读取 Skill 前返回不透明 500；现在 `dist/skills` 与 `bin/skills` 都有
   纯路径回归，真实 Context Package 生成 15 个文件。
2. Launcher 原先不能声明 Service 已支持的 Provider 配置，且子进程可能偶然继承环境；
   schema v2 现在只接受严格 allowlist 的非敏感 Provider 元数据和 `keychain:` reference，
   显式剔除继承的明文 key 与全部旧 Provider 环境。schema v1 可归一迁移。
3. Provider/Validator 异常原先可能坍缩为 `SERVICE_INTERNAL_ERROR`；现在 timeout 为 504、
   schema/Validator 拒绝为 422、其他 Provider 错误保留固定 machine code，响应不带正文。
4. runtime prompt 原先要求模型引用机器 fact/action ID，却没有把这些 ID 放进 prompt；
   `uxAuthority` 现在显式给出允许的 IDs，`recover-context` 升为 1.1.0 并禁止从 prose、
   object ID 或 evidence ref 猜测身份。
5. 首次长调用因测试客户端未 heartbeat 被 15 秒 lease TTL 正确回收；按真实 Plugin 每 5 秒
   heartbeat 后长请求保持同一 owned Service，release 后 Service 进程为 0、Launcher 保持 1。

## 脱敏结果

```json
{"status":"PASS","providerCapability":true,"contextFileCount":15,"projectCount":1,"schemaVersion":"task-copilot-ux-output-v1","facts":2,"inferences":1,"unknowns":1,"suggestedChanges":0,"nextActionEligible":true,"riskLevel":"NONE","requiresReview":false,"providerId":"deepseek","model":"deepseek-v4-flash","skillVersion":"1.1.0","formalObjectProjectionUnchanged":true}
```

- 输出通过严格 Unified UX Validator；
- 事实、推断和未知均有真实非空结果；
- 下一动作来自 Service allowlist，仍需 Plugin 对当前确定性投影再匹配；
- 调用前后正式 Object identity/version/updatedAt 投影完全一致；
- 失败尝试分别证明 20 秒 timeout 的 504 分类、Validator 422 零写入和 TTL owned shutdown，
  未为了得到 PASS 放宽 Validator 或关闭 lease 安全机制。

## 自动与剩余边界

- Launcher：15/15 PASS；Local Service：101/101 PASS；相关 typecheck/lint PASS；
- 最终根级 `./scripts/check.sh` PASS：全 workspace typecheck/lint/tests/build、Plugin package/
  bootstrap/dist、架构边界、145 条规则与恢复演练 `differences: []`；
- 这是 Service/真实 Provider 证据，不是 Logseq Desktop 点击、loading、渲染、主题、窄栏、
  reload 或 stale 视觉证据；这些仍保持 OPEN；
- P1-H 用户 disposition、噪声汇总和 persistence decision 尚未接入。
