# ADR 036 — Runtime Health Semantics

- 状态：accepted
- 日期：2026-08-16

## 1. 决定

Runtime health 只暴露四个状态：

- `HEALTHY`：无长期 backlog，最近一次维护成功。
- `CATCHING_UP`：有 queued jobs / projection backlog，系统正在追赶。
- `PAUSED`：用户主动暂停后台维护。
- `DEGRADED`：projection degraded，或最近一次 reconcile job FAILED。

规则：

- 单次 timeout / 单次 provider failure 不立即 DEGRADED；进入 bounded retry。
- 最近一次 job DONE 后 health 自动恢复 HEALTHY（即使历史存在 FAILED jobs）。
- Now 不显示 health；health 只在 More。
- More 正常态只显示 `runtimeSummary`；异常态显示失败/待处理细节。
- Graph offline 不影响 Kernel Formal reads；恢复后 runtime 继续。

## 2. 验收

- `phase13-runtime.test.ts`：PAUSED / DEGRADED 断言。
- Real Desktop：invalid key → `DEEPSEEK_HTTP_401` FAILED → More 显示“后台理解暂时不可用”；valid key 恢复后新 job DONE → More 显示“一切正常，后台维护中”。
- Screenshots：`/tmp/tc-phase13-runtime/ui/{normal-more,ui-health-degraded}.png`（不入 Git）。
