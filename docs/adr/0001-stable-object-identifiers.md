# ADR-0001：稳定对象标识

- 状态：accepted
- 日期：2026-07-17
- 影响规则：MAP-ANC-001、MIG-001、PRI-012

## 背景

对象身份不能依赖页面名、Block 路径、正文哈希或 Logseq 物理位置。

## 决策

MVP 使用 `<kind>_<UTC milliseconds>_<128-bit random prefix>` 作为本地稳定 ID。时间部分便于排查，随机熵防止复用；测试可注入确定性 ID factory。正文哈希只用于并发前置检查，不参与身份。

## 后果与验证

该方案不是 UUIDv7，但满足“其他稳定方案”的 Goal 许可，浏览器和 Node 均无需额外依赖。`packages/shared/tests/shared.test.ts` 验证 ID 与正文、页面路径无关。
