# MVP Runtime Assumptions

| Capability | Status | MVP handling | Evidence / pending test |
|---|---|---|---|
| Plugin lifecycle / Main UI | CONFIRMED_BY_RUNTIME | 正式插件 bootstrap、多次 reload 与界面重建完成 | RT-MVP-001B/002/004 |
| Toolbar / Command / Slash | CONFIRMED_BY_RUNTIME | Toolbar 和五条 Command 在 Logseq 0.10.15 可见 | RT-MVP-001B |
| Current Block / Page reference read | CONFIRMED_BY_RUNTIME | number/string/object/UUID/name/originalName/journalDay 统一解析；真实 `19` 已解析为 Journal | RT-MVP-001B |
| Block UUID rewrite | CONFIRMED_BY_RUNTIME | 真实编辑冲突保留预期/当前证据并停写 | RT-MVP-003 |
| UUID move/delete/undo | CONFIRMED_BY_RUNTIME_WITH_LIMITATION | 移动保持 UUID；删除进入 missing；Logseq Undo 恢复正文后需显式 rebind；`move_content` 仍为 Feature Flag | RT-MVP-003 |
| Page rename identity | CONFIRMED_BY_AUTOMATION | object_id 与页面名无关 | RT-MVP-003 观察 SDK 行为 |
| Anchor observation | CONFIRMED_BY_RUNTIME | 按需扫描 active/missing/conflict；审计保存预期/当前证据；rebind 显式替换旧 Anchor | RT-MVP-003 |
| FileStorage round trip | CONFIRMED_BY_RUNTIME | checksummed A/B slot、前一 slot 恢复、13 文件恢复包和 differences 0 回读完成 | RT-MVP-002/004 |
| FileStorage physical/sync traits | DO_NOT_DEPEND_ON | 恢复包可下载；不假设随 Graph 同步 | RT-MVP-004 |
| Inbox UI event delivery / duplicates | CONFIRMED_BY_RUNTIME | 六动作、插件内表单、高影响确认、loading/成功/失败与诊断 ID 已实测 | RT-MVP-001B/002 |
| Source repair | CONFIRMED_BY_RUNTIME | 以 Graph + Block UUID + Anchor 为身份，旧数字缓存修复与冲突停写已实测 | RT-MVP-001B/003 |
| Structured diagnostics | CONFIRMED_BY_RUNTIME | JSONL 导出、两个只读 Probe 与故障诊断 ID 已实测 | RT-MVP-001B/002 |
| Settings persistence | CONFIRMED_BY_RUNTIME | Demo -> none，reload 后 `Agent disabled · 基础事务系统可用` 且 Store 持久 | RT-MVP-004 |

状态含义：`CONFIRMED_BY_RUNTIME` 只由真实 Desktop 证据升级；`WITH_LIMITATION` 保留已观测宿主差异，不将可恢复路径误写为原行为完全成功。
