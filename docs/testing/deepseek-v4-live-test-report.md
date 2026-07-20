# DeepSeek v4 真实在线测试报告

> 日期：2026-07-20  
> 结果：`NOT_RUN_CONFIG_INCOMPLETE`，不是失败，也不是 Slice D 通过证据。

## 配置探测

- 进程环境中未发现可用的 DeepSeek / OpenAI-compatible Provider、Base URL、Model ID 或 API Key 配置名；
- macOS Keychain 中未发现 service 为 `task-copilot` 的凭据引用；
- 受保护 Goal 附件中的孤立 Key 未被读取到命令、复制、打印或用于猜测 endpoint/model；
- 仓库、Graph、恢复包和报告未写入 Key、Authorization Header 或 Bearer token。

## 为什么未调用

用户要求从实际配置读取 Provider、Base URL、Model ID 和 Key，并禁止假定固定模型字符串。当前只有不完整的受保护 secret，没有可验证的 Provider/Base URL/Model 组合，也没有 `RUN_LIVE_LLM_TESTS=1`。发起调用会违反配置真实性和凭据最小暴露原则。

## 已完成准备

- 在线测试计划已限定请求数、超时、取消、重试和原始响应保留；
- L1 Mock、L2 冒烟、12 个黄金案例与核心 5 案例稳定性 Gate 已定义；
- Slice D 继续保持未完成；HTTP 200 或 Mock 不能替代真实质量验收。

## 解锁条件

通过环境变量或 Keychain reference 提供以下完整运行配置：Provider 类型、Base URL、实际 Model ID、Key reference，并显式开启 bounded live gate。完成 Provider/Validator 管道后先运行最多 3 次冒烟，再决定是否进入黄金案例；任何认证、Schema 或安全失败都停止后续收费请求。

