# MVP Runtime Assumptions

| Capability | Status | MVP handling | Evidence / pending test |
|---|---|---|---|
| Plugin lifecycle / Main UI | DEFENSIVELY_SUPPORTED | 官方 SDK 注册，卸载无持久监听 | RT-MVP-001 |
| Toolbar / Command / Slash | CONFIRMED_BY_AUTOMATION | 类型检查和 bundle 完成 | RT-MVP-001 |
| Current Block / Page reference read | DEFENSIVELY_SUPPORTED | number/string/object/UUID/name/originalName/journalDay 统一解析；数字 ID 查询页面且不直接展示 | RT-MVP-001B |
| Block UUID rewrite | CONFIRMED_BY_AUTOMATION | Fake + 长 Unicode + hash 前置检查；Graph 变化时即使 UUID/正文相同也停写 | RT-MVP-003 |
| UUID move/delete/undo | UNVERIFIED | `move_content` 高影响且 Adapter 拒绝执行 | RT-MVP-003 |
| Page rename identity | CONFIRMED_BY_AUTOMATION | object_id 与页面名无关 | RT-MVP-003 观察 SDK 行为 |
| Anchor observation | CONFIRMED_BY_AUTOMATION | 按需扫描 active/missing/conflict；审计保存预期/当前证据；rebind 显式替换旧 Anchor | RT-MVP-003 |
| FileStorage round trip | DEFENSIVELY_SUPPORTED | namespace registry + checksummed A/B slot；registry 先于 manifest 激活 | RT-MVP-004 |
| FileStorage physical/sync traits | DO_NOT_DEPEND_ON | 恢复包可下载；不假设随 Graph 同步 | RT-MVP-004 |
| Inbox UI event delivery / duplicates | CONFIRMED_BY_AUTOMATION | delegated click、顶层 rejection catch、四态反馈与 loading 重复提交锁；不以 SDK 事件作为提交前提 | RT-MVP-001B |
| Source repair | DEFENSIVELY_SUPPORTED | 以 Graph + Block UUID + Anchor 为身份，页面名仅作缓存；无法确认时冲突停写 | RT-MVP-001B |
| Structured diagnostics | CONFIRMED_BY_AUTOMATION | 300 条内存 ring buffer、默认正文 hash/length、JSONL、只读 probes | RT-MVP-001B |
| Settings persistence | DEFENSIVELY_SUPPORTED | No Agent 默认；设置变化重建 Provider | RT-MVP-001 |

状态含义：`CONFIRMED_BY_RUNTIME` 只允许真实 Desktop 证据升级；当前没有任何正式插件 Runtime 项被虚假标记为已通过。
