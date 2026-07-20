# V2 当前实施状态

## 当前 Slice

V1 frozen / Slice A0 complete / Slice A1-A3 foundation in progress

## 当前阶段结论

```text
V1_RUNTIME_KERNEL_PASS
V1_MVP_PILOT_PARTIAL
V1_FROZEN_FOR_MIGRATION
V2_MIGRATION_DESIGN_READY
```

`V1_MVP_PILOT_SUCCESS` 未达到：Capture 与 Task 通过；MiniProject/Project 的主归属、推进、聚合以及 Decision/Output/Closure 没有形成低摩擦闭环。V1 不再扩建长期能力，这些差距转入 V2。

## 本轮完成

- 复核分支、remote、恢复包、Agent、FileStorage、测试 Graph 和 root checks；
- 正式接受 OD-001..003，并冻结三份 ADR；
- 在 Logseq Desktop 0.10.15 使用专用 copied-data 页面完成 Capture、Task、MiniProject、Project Pilot；
- 建立 Pilot 前后 0600 恢复包，回放 differences 为 `[]`，Pending/Recovery Required Commit 均为 0；
- 明确 V1 可复用内核、冻结边界和淘汰语义；
- 完成 FileStorage → SQLite 主权交接设计及 Legacy 状态映射；
- 完成 DeepSeek 安全配置探测；因缺少 Provider/Base URL/Model/secret reference 的完整配置，未发起真实调用。
- 建立 V2 六类对象、Lifecycle/Condition/Focus 纯 Domain seam；不含 Phase/Signal；
- 通过 Node 20/macOS arm64 SQLite Spike：Graph-bound 初始化、schema/损坏保护、版本/幂等写入、Doctor 和独立备份；
- 建立仅绑定 `127.0.0.1`、session-token 认证的只读 Local Service health/status/doctor/object 骨架。

## 当前证据

- Git：`feature/task-copilot-mvp`，checkpoint 时 HEAD 与 upstream 相同；本轮改动尚未提交；
- 自动检查：2026-07-20 `./scripts/check.sh` PASS，91 tests、145 rules、0 skipped；
- Runtime：`docs/runtime/V1_MVP_PILOT_REPORT.md`；
- Recovery：Pilot 前后 bundle 均已做 checksum/readback；Pilot 后 8 objects、14 captures、23 proposals、20 commits、1 relation、66 events；
- Pilot 后恢复包 SHA-256：`4e9dd666697b94ca0d6b81e7dc7bd0c12c82d0f432b2363eddfbc95a1a602612`；
- DeepSeek：`docs/testing/deepseek-v4-live-test-report.md`，状态 `NOT_RUN_CONFIG_INCOMPLETE`。

## 冻结与复用

- 复用：Domain/Application 分层、object_id、Anchor observation/rebind、Proposal DAG、SemanticCommit/inverse Commit、Pending/Recovery、A/B 恢复、Diagnostics、Logseq Adapter 和 runtime 测试纪律。
- 冻结只读：V1 FileStorage、恢复包、旧 Phase/Signal、Proposal/Commit/Event 历史。
- 淘汰：V1 长期写入模型、Phase/Signal 当前轴、Plugin 直写 Store、长期 V1/V2 双模式和双写。

## 下一步

1. 完成 Slice A1 对象特定约束、Application command 与 V1 read model 隔离；
2. 扩展 Slice A2 Anchor/Ownership/Commit/migration ledger、锁与 restore validate；
3. 完成 Slice A3 Service client、启动发现、协议错误和 Plugin 受限模式；
4. 在 Slice A-C 闭环后接入 Provider abstraction，再运行 bounded DeepSeek live gate；
5. Desktop Gate 仍需集中验证首次启用、受限模式、迁移 Preview/Undo 和 SQLite 恢复。

## 仍需用户决定

当前没有新的产品语义决定。真实 DeepSeek Gate 需要用户以环境变量或 Keychain reference 提供完整 Provider、Base URL、Model ID 与 Key 引用；这不阻塞 Slice A-C 自动化工作。
