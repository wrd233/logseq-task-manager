# Known Limitations

- RT-BUG-001/002 与 `RT-MVP-001B..004` 已有真实 Logseq Desktop 0.10.15 证据；它们只是 V1/MVP 基线，不是 V2 runtime 证据，也不代替四项 copied-data Pilot。
- Source Resolver 只有在 Logseq 能按 page ID/UUID 返回页面实体时才能修复旧数字缓存；Block 缺失或页面无法确认时保留 Capture 并显示冲突，不猜测页面。
- `scrollToBlockInPage` 已能在 Desktop 关闭 Main UI 并选中原 Block；主题下的短暂高亮细节不作为身份或验收前提。
- Diagnostics 默认仅记录正文长度与 hash，不记录完整 Block 正文；日志是容量受控的内存 ring buffer，reload 后不会保留。
- Logseq 0.10.15 中，真实删除 Block 后 `Cmd+Z` 恢复了正文，但没有立即恢复可解析的原 Anchor 身份。插件保持 missing 并要求用户显式 rebind；该路径已实测，不猜测身份。
- `move_content` 仍是故意关闭的高影响 Feature Flag。已证明 Logseq 内建 Block 移动可保持 UUID，但 V1 Adapter 不代替用户执行物理移动，且位置始终不等于归属。
- FileStorage 的 A/B 回读、reload、下载恢复包与临时 Store 恢复已实测；仍不假设 FileStorage 会跟随 Graph 或第三方同步机制物理同步。
- 剩余 V1/MVP 门槛是四项 copied-data Pilot、Pilot 反馈修复与 `MVP_SUCCESS` root clean gate。
