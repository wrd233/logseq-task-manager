# Pending Runtime Tests

> RT-MVP-001B 与合并的 RT-MVP-002..004 已在 Logseq Desktop 0.10.15 完成。当前不再有未执行的 V1/MVP 框架级 Desktop 测试；剩余运行时门槛是需用户参与的四项 copied-data Pilot。V2 仍另行等待 OD-001..003 确认。

正式插件加载路径：

```text
/Users/wangrundong/work/任务管理中心-logseq插件/apps/task-copilot-logseq-plugin
```

| ID | Topic | Status |
|---|---|---|
| RT-MVP-001B | Journal Source Resolver、旧 Capture 修复、Inbox 六动作、Diagnostics、reload | **PASS 2026-07-19** |
| RT-MVP-002 | 其余 Capture / Proposal / Commit / Undo / Now / Re-entry | **PASS 2026-07-19/20** |
| RT-MVP-003 | UUID move/delete/undo 与 Anchor conflict | **PASS WITH DOCUMENTED LOGSEQ UNDO LIMITATION 2026-07-19/20** |
| RT-MVP-004 | FileStorage reload / backup / recovery | **PASS 2026-07-19/20** |

## 当前剩余的运行时项

1. 四项 copied-data Pilot：需要用户选定或提供代表性事项，不能由测试 Graph 代替。
2. Pilot 反馈修复与回归。
3. `MVP_SUCCESS` root clean gate。

RT-MVP-003 的限定结论：真实 Block 移动保持 UUID；删除会产生 missing；Logseq 0.10.15 的 `Cmd+Z` 恢复了正文但未立即恢复可解析的原 Anchor 身份，插件没有猜测，而是经显式确认的 rebind 恢复 active 身份。

RT-MVP-004 的最终回读：恢复包 13 个文件，对象 5、关系 1、事件 40、Missing Anchor 1、差异 0；Pending Commit 扫描为安全恢复 0 / 需人工 0。

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
