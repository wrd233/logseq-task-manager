# ADR 037 — Runtime Single Instance and Reconcile Supersession

- 状态：accepted
- 日期：2026-08-16

## 1. 决定

- 同一 Kernel DB / runtime scope 只允许一个 Active Kernel Runtime。
  - SQLite `runtime_leases` lease（schema v20）：instanceId、pid、acquired/heartbeat、leaseToken。
  - ttl 30s，服务每 10s 心跳；clean shutdown 释放；crash 后 stale lease 可被后续进程接管。
  - 第二实例启动失败：`KERNEL_INSTANCE_ALREADY_RUNNING`。
- RUNNING reconcile job 不再被数据库“假装杀死”：
  - 新 source enqueue 只 invalidate QUEUED；RUNNING 保持运行身份。
  - cognition 前 / cognition 后 / apply 前检查是否存在同对象 newer QUEUED job。
  - 被 supersede 的 RUNNING job 以 `STALE + lastOutcome=SUPERSEDED` 结束，不标记 source covered，不产生 completion error。
- remote budget 只在 `judge()` 真正调用前 reserve；Graph offline / context fail / semantic stale 消耗 0。
- 失败语义：consecutive failures ≥2 进入 DEGRADED；真正成功的 maintenance 才清零并恢复 HEALTHY；新 QUEUED job 不会洗掉未恢复的 DEGRADED。

## 2. 验收

- `phase13-runtime.test.ts`：双实例拒绝、stale lease 恢复、RUNNING supersession、offline 0 budget、连续失败→DEGRADED→成功恢复。
- Real soak 记录：`/tmp/tc-phase13-runtime/`。
