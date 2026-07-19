# Pending Runtime Tests

> RT-BUG-001/002 修复后的最小 Desktop 回归已于 2026-07-19 通过。剩余 Desktop 验收仍合并为 RT-MVP-002..004；四项 Pilot 在该检查完成前仍暂停。

正式插件加载路径：

```text
/Users/wangrundong/work/任务管理中心-logseq插件/apps/task-copilot-logseq-plugin
```

| ID | Topic | Status |
|---|---|---|
| RT-MVP-001B | Journal Source Resolver、旧 Capture 修复、Inbox 六动作、Diagnostics、reload | **PASS 2026-07-19** |
| RT-MVP-002 | 其余 Capture / Proposal / Commit / Undo / Now / Re-entry | READY / PENDING DESKTOP |
| RT-MVP-003 | UUID move/delete/undo 与 Anchor conflict | READY / PENDING DESKTOP |
| RT-MVP-004 | FileStorage reload / backup / recovery | READY / PENDING DESKTOP |

## RT-MVP-001B 已执行步骤

1. 在 Plugins 页面 Reload 正式 Task Copilot；若需重新加载，选择插件根目录，不能选择 `dist/`。
2. 打开 `2026-07-18` Journal，新建一个临时测试 Block，选中后执行 `Task Copilot: Capture Current Block`。
3. Inbox 确认来源显示 `2026-07-18`（可带 `· Journal`），绝不是 `19`；既有数字来源 Capture 也应在 reload 初始化时安全修复，且 ID 不变。
4. 点击“打开来源”，确认 Main UI 关闭并定位到原始 Block。
5. 再打开 Inbox，点击“手工正式化”，确认内联表单立即出现；选择 TASK，填写完成标准和下一步，点击“创建并解决 Capture”。
6. 确认创建成功提示包含对象类型、正文位置、来源保留与 Capture 已解决；打开对象抽屉确认 Task 存在。
7. Reload 插件，确认 Task 仍存在、Capture 仍为已解决状态。
8. 用新的临时 Capture 分别点击“创建手工 Proposal”“关联现有对象”“暂缓”“无需行动”；每项至少应打开界面、完成操作或显示带诊断 ID 的明确错误，不得静默。
9. 打开 Diagnostics，依次运行 Source Resolver Probe 与 Inbox Action Probe，复制诊断信息并导出 JSONL。

本次未删除原始业务 Block；两条临时测试 Block 已在记录证据后移除。详细证据见 `docs/runtime/MVP_RUNTIME_TEST_LOG.md`。

```text
PLUGIN_COMMIT: 8c2f8e98ba59
LOGSEQ_VERSION: 0.10.15

SOURCE_DISPLAY: PASS - Jul 18th, 2026
OPEN_SOURCE: PASS - Main UI closed and the exact source Block was selected
MANUAL_FORMALIZE: PASS - inline TASK form opened and committed
TASK_CREATED: PASS - obj_20260719131111831_a208c4c6b0e646dbb4a5bef757a35554
CAPTURE_RESOLVED: PASS - source Anchor retained
OBJECT_DRAWER: PASS - Task visible
RELOAD_PERSISTENCE: PASS - real disable/enable cycle, Store generation 24 -> 25

CREATE_PROPOSAL: PASS - inline Proposal form opened
LINK_EXISTING: PASS - object lookup form opened
DEFER: PASS - review time and reason form opened
NO_ACTION: PASS - explicit confirmation, success feedback, audit retained

DIAGNOSTIC_ID: TC-20260719132749-6751cd29
CONSOLE_ERROR: none observed
DIAGNOSTICS_EXPORT: /Users/wangrundong/Downloads/task-copilot-diagnostics-1784467866631.jsonl
```

## 失败回传模板

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
