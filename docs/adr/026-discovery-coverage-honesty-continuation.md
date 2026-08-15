# ADR 026 — Discovery Coverage Honesty and Continuation

- 状态：accepted
- 日期：2026-08-15
- 关联：docs/vnext/07 Phase 12.5、ADR-024

## 决定

Bounded Discovery 绝不允许静默截断。

- 每个 DiscoveryRun 记录 `scopeTotal / selectedCount / processedCount / coveredCount / remainingCount / continuationToken`；
- `scopeTotal` 是 scope 解析后的完整 source 数；batch cap 只影响 `selectedCount`；
- cap 后 remaining > 0 → status `PARTIAL`，`continuationToken` 编码下一批 source identity + hash；
- 下次 continue 时按 token 恢复 refs，重新读 source 并校验 hash；hash 变化或 source 缺失不静默跳过；
- 本地 prefilter（empty/property、active association、materialized candidate source、同 hash 已完成 source）记 `ALREADY_COVERED`，不计入 remote processed，但进入 scope coverage；
- `整理今天` 逐 batch 继续（默认上限 3），最终用户看到“还有一部分尚未完成，已保留进度”，不把 processed 数当成功。

## 不做什么

- 不做通用 cache platform；
- 不把 cursor 当作绝对真相；
- 不硬要求一次发完全部 block。
