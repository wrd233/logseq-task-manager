# Pending Runtime Tests

> 第二次 Runtime Fix 后的单一集中检查点，预计 5-10 分钟。本轮只验证 CSS-safe 入口、首次空 Store、诊断和重复加载；不执行 Capture、Commit 或其他 Graph 写入。启动会创建插件私有空 Store，不写 Graph 正文。

正式插件加载路径：

```text
/Users/wangrundong/work/任务管理中心-logseq插件/apps/task-copilot-logseq-plugin
```

| ID | Topic | Graph write | Status |
|---|---|---|---|
| RT-MVP-001A | Bootstrap Shell、Toolbar、五个 Command、Slash Open、Main UI/Diagnostics、reload | 无；不要执行 Capture | PENDING AFTER FIX |
| RT-MVP-002 | Capture / Proposal / Commit / Undo / Now / Re-entry | 后续集中功能验收 | DEFERRED UNTIL 001A |
| RT-MVP-003 | UUID / Anchor / conflict | 后续集中功能验收 | DEFERRED UNTIL 001A |
| RT-MVP-004 | FileStorage reload / backup / recovery | 后续集中功能验收 | DEFERRED UNTIL 001A |

## 5-10 分钟检查点

1. 暂时 Disable Capability Lab 和 `ai-task-copilot-logseq-bridge`。
2. 从 Plugins 页面 Reload Task Copilot；若需重新 Load unpacked，选择上面的插件根目录，不能选择 `dist/`。
3. 确认右上角出现 Tooltip 为 `Task Copilot` 的 `TC` Toolbar 入口，并点击一次。
4. 按 `Command+Shift+P` 搜索 `Task Copilot`，确认五个命令都存在。
5. 点击 `Task Copilot: Open`。
6. 确认出现完整主界面，Console 无 `invalid selector`、`file not existed` 或 `should not join with empty dir`；若其他深层初始化失败，则确认出现 Runtime Diagnostics，并点击 `Copy diagnostics`。
7. 在 Developer Console 复制所有 `[Task Copilot]` 日志；不要点击 Capture 或其他写入动作。
8. 截图主界面或 Diagnostics。
9. 完全退出并重新打开 Logseq，再重复步骤 3-6，确认 Toolbar 不重复、界面仍能打开。

回传：Logseq 版本、两次启动是否都有 Toolbar、五个命令是否齐全、截图、复制的 diagnostics（如有）和所有 `[Task Copilot]` Console 行。完成本检查不会写 Graph；清理只需重新启用另外两个插件。
