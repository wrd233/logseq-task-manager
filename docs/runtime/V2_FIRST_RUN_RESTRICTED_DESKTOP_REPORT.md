# V2 First-run / Restricted Desktop Report

日期：2026-07-22
状态：`V2_FIRST_RUN_AND_E2E15_DESKTOP_PASS`

## 结论

Logseq Desktop 0.10.15 真实完成：

```text
空 descriptor 首次启用
→ 三个受控入口逐项查看
→ 无 Service descriptor
→ 普通正文编辑
→ 协议不兼容 descriptor
→ Logseq reload
→ 普通正文再次编辑
→ 清除私有 descriptor 与删除测试页
```

整个过程中 SQLite Store 始终 `NOT_STARTED`，正式写入始终为 false；Graph 正文仍由 Logseq 正常编辑和持久化。没有自动扫描 Graph、读取 Recovery Bundle、启动迁移或调用模型。

## 首次启用

1. 清空 `serviceDescriptorPath` 与 Task Copilot 私有 `service.json` 后重启 Logseq，Plugin 显示 `SERVICE_DESCRIPTOR_PATH_REQUIRED`、Store `NOT_STARTED`、formal writes false、explicit-sync transport false。
2. 欢迎页只有三个入口：`开始使用`、`迁移现有内容`、`检查系统状态`；没有 input、textarea 或 select，也没有默认动作。
3. “开始使用”只说明 0600 descriptor 私有发现边界；“迁移现有内容”只说明只读 scan/preview/backup 和三个精确确认；“检查系统状态”只读取 Diagnostics。
4. 结构化日志只有 Plugin 生命周期与用户编辑触发的 bounded sync warning；Provider、Migration、Proposal、Commit 或正式 Store 写事件均为 0。

## Service 受限与正文可编辑

1. 使用 protocol v1、loopback 但没有监听进程的脱敏假 descriptor，Plugin 明确显示 `RESTRICTED · SERVICE_UNAVAILABLE`，仍保持正式写入关闭。
2. 在专用 Test Graph 页面创建普通 Block；Service 不可用时将正文从 `initial` 改为 `edited without Service`，Logseq API bounded read-after-write 返回相同 UUID 与新正文。
3. 再使用 protocol v2 descriptor，Plugin 明确显示 `RESTRICTED · SERVICE_PROTOCOL_MISMATCH`。重启 Logseq 后仍是同一受限原因、Store `NOT_STARTED`、formal writes false。
4. reload 后读回上一轮正文，再改为 `edited after protocol mismatch reload`；同一 UUID 与最终正文可读。
5. 编辑事件没有被冒充为正式状态：explicit-sync transport 始终 false，pending 为 0；无法安全解析的 event subtree 只把已有 `reconciliationRequired` 设为 true 并记录 bounded warning，没有创建第二权威或落盘队列。

## 清理

- 私有 `service.json` 与 `serviceDescriptorPath` 已清空；
- 专用 Test Graph 页面与 Block 已由 Logseq API 删除并读回不存在；
- 两份假 descriptor 和 CDP 运行脚本仅位于 ignored runtime，测试后移入系统废纸篓；
- CDP 测试实例在页面与设置已清理后未响应 AppleScript/TERM，因此对精确进程执行一次强制终止；Logseq 随后以无 CDP 参数的普通模式重启。

## 复杂度结论

本 Gate 没有代码、表、状态、协议、扫描器、恢复器或写路径变化。它复用了既有 first-run welcome、Service descriptor validator、restricted diagnostics、Logseq 正文编辑和 session-only explicit-sync recovery state，并补齐此前缺少的协议错误/reload/正文可编辑 Desktop 证据。
