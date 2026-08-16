# Unattended Runtime Evaluation (EXPERIENCE / EMPIRICAL, non-authoritative)

> 状态：2026-08-16，Phase 13 第一轮 soak / dogfood。

## 设置

- Logseq Desktop 0.10.15 + repo `logseq/` Graph + `/tmp/tc-demo` Kernel。
- 默认 unattended profile：DeepSeek fast/low-reasoning（1 call/run，12 calls/hour）。
- Fake soak 与 real DeepSeek 两种模式都跑过。

## Soak metrics

| 指标 | Fake soak | Real DeepSeek |
| --- | ---: | ---: |
| raw source changes | 12 | 1 |
| coalesced reconcile jobs | 5 | 1 |
| NO_CHANGE | 5 | 1 |
| CONFLICT | 0 | 1 |
| failed | 0 | 1（invalid key 场景） |
| remote calls | 0 | ≥1 |
| final runtime status | HEALTHY | HEALTHY after recovery |

证据：`/tmp/tc-phase13-runtime/soak-fake.json`、`soak-resume.json`。

## Dogfood findings

1. **多 Kernel service 实例是真实故障源**：旧实例没有 heartbeat，会抢 claim 同一 SQLite queue 并反复 GRAPH_ADAPTER_OFFLINE。清理到单实例后 queue 正常 drain。本轮没有实现单实例 lock；记录为 NEXT runtime health hardening。
2. Graph worker 心跳实际约 1s 而不是 250ms（Logseq iframe timer 节流），但低于 3s offline threshold，可用。
3. 12 个自然编辑 coalesce 为 5 个 job，证明 dedupe/coalesce 有效；没有每 keystroke 认知。
4. provider 401 不会影响自然写作；恢复后最新 job 成功，health 回 HEALTHY。
5. More 正常态确实安静（一行 `一切正常，后台维护中`），异常态才展开失败细节。
6. Now 在 catch-up 后只 resurface 有 ProjectIntent 现实的对象，没有 queue/retry 噪音。

## Screenshots

- `normal-now.png` / `normal-more.png`
- `ui-health-degraded.png`
- `now-after-catchup.png`

## Round 11 update（Phase 13.5 Runtime Hardening）

- 第 1 条“多 Kernel 实例是真实故障源”已落地修复：SQLite `runtime_leases` 单实例 lease，第二实例同 DB 启动即 `KERNEL_INSTANCE_ALREADY_RUNNING`（真实进程 exit 1 验证），stale lease 可接管。
- 真实 source-during-run soak：4/4 个对象在 RUNNING 期间注入新 source-change，旧 RUNNING job 全部 STALE + `lastOutcome=SUPERSEDED`，新 job DONE，无假 completion error。
- 真实 budget/health 语义由 `phase13-runtime.test.ts` + `real-soak.json` 覆盖：Graph offline 消耗 0 remote budget；连续失败 ≥2 → DEGRADED，只有真正成功才回 HEALTHY。
- 证据：`/tmp/tc-phase135-runtime/real-soak.json`。
