# Pending Runtime Tests

> 当前允许结束于 `AUTOMATION_COMPLETE` 的唯一剩余证据组。总时长设计为 20-25 分钟；除明确步骤外，不写真实业务内容。

正式插件加载路径：

```text
/Users/wangrundong/work/任务管理中心-logseq插件/apps/task-copilot-logseq-plugin
```

测试 Graph：

```text
/Users/wangrundong/work/任务管理中心-logseq插件/logseq
```

| ID | Topic | Feature affected | Prepared commit | Graph write | Status |
|---|---|---|---|---|---|
| RT-MVP-001 | 加载、Toolbar/Command/Slash、No Agent/Demo 设置、reload | Lifecycle / entry / no-agent | 待最终 Commit | 仅 Slash 所在临时块可能受 Logseq 自身输入影响 | PENDING |
| RT-MVP-002 | Capture → Inbox → 手工对象；Demo 部分接受 → Commit → Undo；Waiting/Now/Re-entry | TST 001/002/004-008/010 | 待最终 Commit | 是，仅专用临时 Block | PENDING |
| RT-MVP-003 | UUID edit/move/delete/undo、missing/rebind、正文二次编辑冲突 | TST 003/006 | 待最终 Commit | 是，仅专用临时 Block | PENDING |
| RT-MVP-004 | FileStorage reload、备份下载、恢复校验、Pending 扫描 | TST 009 / reliability | 待最终 Commit | 不写正文；写插件私有存储和下载目录 | PENDING |

## 集中执行步骤

1. 在测试 Graph 新建一条明显标记为 `Task Copilot Runtime Test YYYY-MM-DD` 的临时 Block，记录 Logseq 版本和 Block UUID。
2. Build 已由根检查完成。用上方正式插件目录 `Load unpacked plugin`；确认只出现一个圆形 Toolbar 入口，Command Palette 可打开，reload 三次不重复。
3. 保持 Agent `none`：捕获当前块，手工正式化 Task，设置 Waiting（填写 waiting_for、expected_result、review_at），检查对象抽屉与现在工作；正文不应出现大段属性。
4. 新建第二条临时 Block，将 Agent 切为 `demo`：生成 Proposal；接受 rewrite/create/resolve，拒绝 move/ownership；Commit 后确认正文原地替换、对象 UNASSIGNED、审计有 before/after；随后 Undo。
5. 对一个已绑定 Block 依次编辑、同页移动、删除、Undo 删除，记录 UUID 是否保持。删除期间对象不得消失；用另一临时 Block 测试“重新绑定当前块”。
6. 在 Proposal 生成后手工修改正文，再尝试 Commit；预期停止并显示冲突，不覆盖用户修改。
7. 在审计与恢复中“创建备份并导出”，reload 插件，确认对象仍在；执行“验证最近恢复包”，预期差异为 0，并记录下载文件名。
8. 删除仅用于本检查的临时 Blocks；插件私有 Store 如需保留用于 Pilot 可不清理。若要完全清理，先保留下载恢复包，再卸载插件并手工删除 Task Copilot 插件数据。

## 反馈格式

复制 `docs/goal/RUNTIME_FEEDBACK_TEMPLATE.md`，至少填写：Logseq 版本、每个 RT 的 PASS/FAIL/PARTIAL、UUID 观察、FileStorage reload、下载文件名、Console 完整错误栈、清理结果。失败时不要反复点击 Commit；保留当前 Block 和 Console 证据。

用户回复后恢复指令：读取该反馈、更新本文件与 Acceptance Matrix，修复、全量回归，再进入小规模 Pilot。
