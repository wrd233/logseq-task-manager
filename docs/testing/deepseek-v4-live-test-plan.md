# DeepSeek v4 真实在线测试计划

> 状态：PLAN ONLY / NOT RUN。受保护的 Goal 附件包含用户提供的 API Key，但本文件不会复制、显示或引用该值；Provider、Base URL 和实际 Model ID 尚未形成已验证的完整运行配置，显式 live gate 也未开启，因此未发起任何真实调用。

## 1. 目标与边界

证明真实配置能从 Logseq Context 经 Prompt 五层、DeepSeek Structured Output、Proposal Validator 到达 review-ready Proposal，同时任何成功或失败都不能直接修改 Graph 或正式 Store。

- 默认测试与 CI 只运行 Mock；
- 真实调用必须同时存在显式 live 开关和运行配置；
- API Key、Authorization Header、Cookie、Token 永不进入 Git、Graph、命令示例、普通日志、默认诊断和正式报告；
- 测试 fixture 脱敏；原始响应有限保留且默认忽略；
- 没有真实 API 证据时 Slice D 状态必须是 `NOT_STARTED` 或 `IN_PROGRESS`，不能 DONE。

## 2. 运行配置

实际变量名在 Provider ADR 中冻结，建议：

```text
DEEPSEEK_API_KEY       secret value, never printed
DEEPSEEK_BASE_URL      user supplied endpoint
DEEPSEEK_MODEL         actual model identifier, not hard-coded
RUN_LIVE_LLM_TESTS=1   explicit live gate
```

配置加载顺序：Keychain reference 优先，其次进程环境；配置文件只保存 secret reference。启动前打印 Provider、脱敏 Base URL、Model、案例数、最大请求数和最大重试数，不打印 Key。

## 3. 四层测试

### L1 Provider Mock

- request URL/body/header 组装与 secret reference；
- actual model/base URL；timeout/cancel；429/5xx/network；
- invalid JSON、empty/missing field、Structured Output schema；
- retry cap/退避；错误映射；普通/Debug/diagnostic/report 脱敏；
- 断言 Candidate、Proposal 和 Graph/Store 写入次数均为 0，直到 validator 成功且用户审阅。

### L2 真实在线冒烟

最大 3 个成功请求，另用 Mock 或用户明确允许的安全方式验证错误分类：

1. health-like 最小中文 Structured Output；
2. 中文事实提取，确认实际 model/request_id/token/duration；
3. cancel/timeout 控制，不写 Graph/Store。

认证失败、模型不存在、限流和 Provider 异常必须在真实 endpoint 上用用户批准的安全方案取得在线分类证据，例如隔离的无效凭据、无效模型或 Provider 提供的测试/限流机制。L1 Mock 可以先验证映射，但不能替代 L2 Gate；若无法安全触发，L2 保持未通过，不以重复请求制造费用或封禁风险。

### L3 12 个在线黄金案例

| ID | 类别 | 主要断言 |
|---|---|---|
| DS-01 | Journal 明确承诺 | 保留事实/时间表述，生成可拆分候选 |
| DS-02 | 普通记录 | 不正式化，不制造 Proposal |
| DS-03 | Task / MiniProject | 类型边界合理，高影响独立 |
| DS-04 | 更新已有 Project | 检索候选不变成正式归属，不重复建 Project |
| DS-05 | Decision | 只提议已确认且持续影响的选择 |
| DS-06 | Output | 区分 Deliverable/实际 Output，要求 produced_by |
| DS-07 | 信息不足 | 明确未知，不杜撰人、日期、设备和归属 |
| DS-08 | 一句话 revise | 复用 intent/proposal，版本递增，不建分支 UI |
| DS-09 | 去重/合并 | 相邻重复要求只保留一个当前 Candidate/Proposal |
| DS-10 | 克制结构 | 不创建空模板和无意义字段 |
| DS-11 | 候选归属 | candidate evidence 与 confirmed ownership 分开 |
| DS-12 | 中文表达 | 高密度、低噪声、词语级重点、原文事实完整 |

每例经过：Context manifest -> Prompt bundle -> provider -> schema parser -> proposal validator -> text/semantic diff render data。任何一环失败都不得登记 Candidate/Proposal 或写正式数据。

### L4 发布前质量验收

- 核心 DS-01/03/04/07/12 各重复 3 次；总计至少 22 次案例运行；
- 人工记录直接接受、部分接受、调整后接受、拒绝；
- 记录 Schema 失败、杜撰、类型/归属误判、过度结构化、Profile 违反；
- P0 必须为 0：凭据泄露、模型直接写 Graph、非法输出被接受、静默覆盖、静默高影响降级。

## 4. 产物

```text
artifacts/llm-live/<run-id>/   # ignored
  manifest.json
  report.json
  report.md
  cases/
  logs/

docs/testing/deepseek-v4-live-test-report.md  # 脱敏正式结论
```

manifest 记录 run_id、时间、Provider、实际 model、脱敏 endpoint、Prompt/Skill/Profile/Proposal/Domain Schema 版本、case/request/token/duration/retry、pass/fail/manual-review 数量。

## 5. 安全检查

运行前后扫描 Git tracked/untracked、Graph、普通日志、Debug 默认导出、诊断包和报告：

- 不得出现 Key 原文、`Authorization:`、Bearer token；
- 原始用户正文只使用脱敏 fixture；
- 请求有 max count、timeout、cancel、retry cap；
- 报告只保存必要的脱敏片段和 hash；
- 测试失败时默认停止后续收费案例，不无限重试。

## 6. Gate 判定

只有 L1 PASS、L2 真实 PASS、L3 12 例完成、核心 5 例三次稳定性完成、正式脱敏报告存在、P0=0，且 review-ready 质量人工通过时，Slice D 才可标记完成。HTTP 200、Mock PASS 或“模型返回了 JSON”均不足以通过。
