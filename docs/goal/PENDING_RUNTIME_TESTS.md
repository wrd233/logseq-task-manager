# Pending Runtime Tests

> RT-BUG-001/002 修复后的单一集中 Desktop 检查点，目标时长 10 分钟以内。四项 Pilot 仍暂停；本检查只验证“来源正确、按钮能执行、失败可观察”。

正式插件加载路径：

```text
/Users/wangrundong/work/任务管理中心-logseq插件/apps/task-copilot-logseq-plugin
```

| ID | Topic | Status |
|---|---|---|
| RT-MVP-001B | Journal Source Resolver、旧 Capture 修复、Inbox 六动作、Diagnostics、reload | PENDING AFTER AUTOMATED FIX |
| RT-MVP-002 | 其余 Capture / Proposal / Commit / Undo / Now / Re-entry | DEFERRED UNTIL 001B |
| RT-MVP-003 | UUID move/delete/undo 与 Anchor conflict | DEFERRED UNTIL 001B |
| RT-MVP-004 | FileStorage reload / backup / recovery | DEFERRED UNTIL 001B |

## 最小 Desktop 回归（不超过 10 分钟）

1. 在 Plugins 页面 Reload 正式 Task Copilot；若需重新加载，选择插件根目录，不能选择 `dist/`。
2. 打开 `2026-07-18` Journal，新建一个临时测试 Block，选中后执行 `Task Copilot: Capture Current Block`。
3. Inbox 确认来源显示 `2026-07-18`（可带 `· Journal`），绝不是 `19`；既有数字来源 Capture 也应在 reload 初始化时安全修复，且 ID 不变。
4. 点击“打开来源”，确认 Main UI 关闭并定位到原始 Block。
5. 再打开 Inbox，点击“手工正式化”，确认内联表单立即出现；选择 TASK，填写完成标准和下一步，点击“创建并解决 Capture”。
6. 确认创建成功提示包含对象类型、正文位置、来源保留与 Capture 已解决；打开对象抽屉确认 Task 存在。
7. Reload 插件，确认 Task 仍存在、Capture 仍为已解决状态。
8. 用新的临时 Capture 分别点击“创建手工 Proposal”“关联现有对象”“暂缓”“无需行动”；每项至少应打开界面、完成操作或显示带诊断 ID 的明确错误，不得静默。
9. 打开 Diagnostics，依次运行 Source Resolver Probe 与 Inbox Action Probe，复制诊断信息并导出 JSONL。

不要删除原始业务 Block；测试临时 Block 可在记录证据后手工删除。若任一步失败，停止重复提交并回传下面模板。

```text
PLUGIN_COMMIT:
LOGSEQ_VERSION:

SOURCE_DISPLAY:
OPEN_SOURCE:
MANUAL_FORMALIZE:
TASK_CREATED:
CAPTURE_RESOLVED:
OBJECT_DRAWER:
RELOAD_PERSISTENCE:

CREATE_PROPOSAL:
LINK_EXISTING:
DEFER:
NO_ACTION:

DIAGNOSTIC_ID:
CONSOLE_ERROR:
DIAGNOSTICS_EXPORT:
```
