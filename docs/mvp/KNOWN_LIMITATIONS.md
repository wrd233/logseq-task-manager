# Known Limitations

- RT-BUG-001/002 已有自动化修复，但在 `RT-MVP-001B` 完成前不能升级为真实 Desktop PASS，也不能进入四项 Pilot。
- Source Resolver 只有在 Logseq 能按 page ID/UUID 返回页面实体时才能修复旧数字缓存；Block 缺失或页面无法确认时保留 Capture 并显示冲突，不猜测页面。
- `scrollToBlockInPage` 的真实聚焦/高亮细节仍需 Desktop 证据；Adapter 始终优先使用 Block UUID，而不是页面位置作为身份。
- Diagnostics 默认仅记录正文长度与 hash，不记录完整 Block 正文；日志是容量受控的内存 ring buffer，reload 后不会保留。
- UUID move/delete/undo、FileStorage reload/物理同步、完整恢复和 Pilot 仍按 `PENDING_RUNTIME_TESTS.md` 等待后续集中证据。
