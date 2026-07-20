# V2 Slice A Desktop 集中验收清单

> 状态：`READY_FOR_CONSOLIDATED_RUNTIME`。自动证据已覆盖首次启用分支、descriptor 校验、Service probe 和受限状态；以下仍需 Logseq Desktop 0.10.15 真实验收，不能用 Node 测试代替。

## 安全边界

- 使用专用空测试 Graph，不修改生产事项；
- 启动前记录 Graph 文件列表、FileStorage 键和 Service/Provider 请求计数；
- descriptor 仅存放在本机 0600 文件，截图、诊断、报告不得包含 token 或完整本地路径；
- 不启动迁移 Commit、Restore 切换或模型调用。

## A-RT-01 未配置的首次启用

1. 清空 `serviceDescriptorPath`，重新加载插件；
2. 打开 Task Copilot，确认只有“开始使用”“迁移现有内容”“检查系统状态”三个主入口；
3. 逐一点击，确认有明确反馈，迁移入口只解释 Preview/Confirm，不执行写入；
4. 打开 Diagnostics，确认 `SERVICE_DESCRIPTOR_PATH_REQUIRED`、`formal_writes_available=false`、`graph_editing_available=true`、Store `NOT_STARTED`；
5. 对比启动前后文件与请求计数：无 Graph 扫描产物、无 FileStorage 初始化、无 SQLite 迁移、无 Provider 请求；
6. 在 Logseq 中新建和编辑普通 Block，确认正文功能不受影响。

## A-RT-02 Service READY

1. 用专用测试 Graph 启动 `task-copilot-service`，确认 descriptor 是绝对路径、普通文件、权限 0600；
2. 将路径写入插件设置并 reload；
3. 确认 Diagnostics 为 `READY`，protocol/capabilities 与 Service 一致；
4. 确认诊断 JSON、Console、Graph、FileStorage 和截图均无 session token；
5. 再次 reload，确认重新 probe 且不缓存过期 token。
6. 确认 Diagnostics 显示 `V1 FileStorage inactive`，旧 Capture/Proposal/Commit 写入口不可执行；对比 FileStorage，确认未因 V2 启动创建或更新 V1 Slot。

## A-RT-03 故障与恢复

1. 停止 Service，重新打开插件；
2. 确认进入 `SERVICE_UNAVAILABLE` 受限态，不出现任何正式写入成功提示；
3. 确认 Logseq 原生正文仍可编辑；
4. 使用错误协议版本的脱敏 descriptor，确认 `SERVICE_PROTOCOL_MISMATCH`；
5. Service 保持停止时创建 `[任务] 断线同步测试`，快速改名两次；确认正文可正常保存，Diagnostics 显示 `explicit_sync.pending=1` 且没有正式写入成功提示；
6. 不 reload Plugin，恢复 Service 并在设置中重新触发连接；确认只提交最新标题、pending 回到 0，SQLite 中只有一个对象和一个 Primary Anchor；
7. 模拟一次超过会话边界的漏事件后 reload，确认当前版本只标记/保留一致性风险，不把它误报为已恢复；该项在 B4 低频一致性检查落地前记录为已知缺口。

## 通过标准

- A-RT-01..03 全部记录“预期 / 实际 / 证据”；
- 无静默扫描、迁移、模型调用或 V1/V2 双写；
- 任何 Service 错误都只限制正式领域写入，不影响原生正文；
- 不得在完成本清单前将 V2-FIRST-001 或 E2E-15 标记为 `DONE`。
