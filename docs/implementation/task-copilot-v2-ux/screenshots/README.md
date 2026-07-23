# Screenshots

本目录只保存经过脱敏、与当前实现 commit 对应、可进入版本控制的运行证据。

每张图片必须在 `../06_TEST_AND_EVIDENCE_PLAN.md` 规定的元数据中登记。原始私人截图、descriptor、终端历史、API Key、绝对路径和真实业务内容不得进入本目录。

当前本地 UX 调研原图位于 `docs/research/current-ux-evidence/screenshots/original/`，在完成内容审查并明确纳入某个 Slice 前不自动复制。

## 当前证据

| 文件 | 类型 | 结论 |
|---|---|---|
| `original/p0-a-01-descriptor-filesystem-path-rejected.png` | 真实 Logseq Desktop 0.10.15 | 独立 Service 已存在时，filesystem descriptor 路径仍被当前 renderer 的 FileStorage fallback 判为 `SERVICE_DESCRIPTOR_PATH_INVALID`；P0-A 正式写入 Gate 必须先完成 P0-H 私有 handshake |
| `original/p0-h-01-private-descriptor-import-ready.png` | 真实 Logseq Desktop 0.10.15 | 选择本地 descriptor 后，校验内容只进入固定插件私有 key；主 UI 显示 Runtime/Store READY 和不暴露 token/path 的成功反馈 |
| `original/p0-h-02-private-descriptor-reload-ready.png` | 真实 Logseq Desktop 0.10.15 | reload 后无需再次选择文件，插件直接恢复 Runtime/Store READY |
| `original/p0-a-02-block-context-menu.png` | 真实 Logseq Desktop 0.10.15 | 正式 MiniProject Block 的原生右键菜单显示 Focus toggle 和会话 Undo 两项稳定意图 |
| `original/p0-a-03-focus-added.png` | 真实 Logseq Desktop 0.10.15 | 从原 Block 加入当前关注并获得原地成功反馈 |
| `original/p0-a-04-focus-removed.png` | 真实 Logseq Desktop 0.10.15 | 同一 Block 再次触发后移出当前关注并获得原地反馈 |
| `original/p0-a-05-focus-remove-undone.png` | 真实 Logseq Desktop 0.10.15 | 会话内 Undo 将刚移出的对象恢复到关注集；Local Service 读回一致 |
