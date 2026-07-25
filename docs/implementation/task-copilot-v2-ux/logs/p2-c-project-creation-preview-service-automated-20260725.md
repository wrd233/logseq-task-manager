# P2-C Project Creation Preview Service 自动证据

日期：2026-07-25

## 结论

P2-C 已从“Preview Validator / Provider generator 已存在”推进到可由公开 Service Client
调用的 authenticated Preview Service 合同。该结论只关闭 Preview Service 自动合同，
不等于 P2-C 完成，更不等于 P2 或整体交互产品化 Goal 完成。

## 已证明

- Blank/Page/MiniProject 请求只携带来源标识与有界 Grill 回答，客户端不能上传材料或
  Preview；
- Service 在调用 Provider 前重新构造来源权威并执行 machine readiness；
- Blank 不读取 Graph，成功 Preview 的 `sourceMaterials` 必须为空；
- Page 使用 depth 5 有界读取，语义空 Block 不进入材料，但完整 snapshot 仍参与 scopeHash
  重验；
- 未达到 readiness 时返回 `PROJECT_CREATION_PREVIEW_NOT_READY` 且 Provider 调用数不增加；
- Provider 返回后再次读取 Page/MiniProject；scope 变化返回 `GRILL_SOURCE_STALE`，不签发
  Preview；
- 成功只产生 session-only opaque handle。handle 容量 64、30 分钟过期、Service restart
  清空，不进入 SQLite、Graph、Audit 或普通日志；
- Preview 的 formal impact 固定为 0 Object、0 Page、0 move、0 rewrite、0 delete；
- Page/Object relationship 仍是 `PROPOSED_FOR_REVIEW`，不是正式事实。

## 自动测试

定向测试：

```text
npx tsx --test --test-name-pattern='Project Creation Grill uses' tests/service.test.ts
1 passed, 51 skipped
```

同一集成测试覆盖：

- Blank Grill → Blank Preview；
- Page Grill → machine ready；
- Page Preview not-ready；
- Page Preview success；
- Page Preview stale；
- MiniProject Grill success/stale；
- 每个 Preview/Grill 阶段的正式 Object 数与 Store 状态边界。

完整 Gate：

```text
Local Service 126/126
Service Client 12/12
./scripts/check.sh PASS
Rule coverage 145
Recovery rehearsal differences []
Repository boundary PASS
```

## 仍开放

- Preview handle 的 server-owned HIGH Proposal / Review 消费；
- 正式 Project prepare → Page create/verify → finalize 接线；
- 创建失败后的 Recovery、正式 Undo 与返回 Blank/Page/MiniProject 来源；
- reload 后正式对象和页面验证；
- `project-creation-modeling@1.1.0` 真实 DeepSeek 输出质量；
- Logseq Desktop 的 loading/error/stale/review/commit/recovery/undo/route Gate。
