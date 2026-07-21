# DeepSeek v4 真实在线测试报告

> 更新：2026-07-21
> 结果：`PROVIDER_DISCOVERY_PASS_LIVE_SMOKE_PARTIAL`，不是 Slice D 通过证据。

## 配置探测

- 受保护 Goal 附件中的 Key 仅在内存中用于一次有界探测；没有进入命令参数、环境变量、代码、Graph、Git、日志或本报告；
- `https://api.deepseek.com/models` 返回 HTTP 200，认证成功；实际发现模型 ID 为 `deepseek-v4-flash`、`deepseek-v4-pro`，未猜测模型字符串；
- macOS Keychain 中仍未发现 service 为 `task-copilot` 的长期凭据引用；
- 仓库、Graph、恢复包和报告未写入 Key、Authorization Header 或 Bearer token。

## 有界在线冒烟

- 使用已发现的 `deepseek-v4-flash` 做 1 次最小中文分类请求，超时 20 秒、无重试、最大输出 128 tokens；原始响应未打印或保存。
- 结果：HTTP 200，服务返回 `finish_reason=length`，但内容不是可解析的 JSON；因此 `structuredJsonValid=false`。
- 该结果证明 endpoint、认证和模型可达，不证明 Structured Output、Provider abstraction、Validator 或真实 Proposal 管道通过；不升级 E2E-21/22/24，也不宣称 Slice D。

## 已完成准备

- 在线测试计划已限定请求数、超时、取消、重试和原始响应保留；
- L1 Mock、L2 冒烟、12 个黄金案例与核心 5 案例稳定性 Gate 已定义；
- Slice D 继续保持未完成；HTTP 200 或 Mock 不能替代真实质量验收。

## 下一步解锁条件

先在仓库内完成 Provider abstraction、超时/取消、Structured Output 校验和 Proposal Validator，再以脱敏报告重新执行最多 3 次冒烟；任何认证、Schema 或安全失败都停止后续收费请求。正式接入仍必须经过 Review Center，不允许模型直接写入领域状态。
