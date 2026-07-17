# MVP Runtime Assumptions

| Capability | Status | MVP handling | Evidence / pending test |
|---|---|---|---|
| Plugin lifecycle / Main UI | DEFENSIVELY_SUPPORTED | 官方 SDK 注册，卸载无持久监听 | RT-MVP-001 |
| Toolbar / Command / Slash | CONFIRMED_BY_AUTOMATION | 类型检查和 bundle 完成 | RT-MVP-001 |
| Current Block read | DEFENSIVELY_SUPPORTED | null/未知 shape 返回结构化错误 | RT-MVP-002 |
| Block UUID rewrite | CONFIRMED_BY_AUTOMATION | Fake + 长 Unicode + hash 前置检查 | RT-MVP-003 |
| UUID move/delete/undo | UNVERIFIED | `move_content` 高影响且 Adapter 拒绝执行 | RT-MVP-003 |
| Page rename identity | CONFIRMED_BY_AUTOMATION | object_id 与页面名无关 | RT-MVP-003 观察 SDK 行为 |
| FileStorage round trip | DEFENSIVELY_SUPPORTED | namespace registry + checksummed A/B slot | RT-MVP-004 |
| FileStorage physical/sync traits | DO_NOT_DEPEND_ON | 恢复包可下载；不假设随 Graph 同步 | RT-MVP-004 |
| Event delivery / duplicates | DO_NOT_DEPEND_ON | MVP 按需查询，不以事件作为提交前提 | 后续观察 |
| Settings persistence | DEFENSIVELY_SUPPORTED | No Agent 默认；设置变化重建 Provider | RT-MVP-001 |

状态含义：`CONFIRMED_BY_RUNTIME` 只允许真实 Desktop 证据升级；当前没有任何正式插件 Runtime 项被虚假标记为已通过。
