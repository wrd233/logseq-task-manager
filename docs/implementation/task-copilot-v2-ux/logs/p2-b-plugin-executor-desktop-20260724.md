# P2-B Plugin Executor 与 UUID Move/Restore Desktop Gate

日期：2026-07-24  
状态：`PARTIAL_EXECUTOR_DESKTOP_GATE`  
宿主：Logseq Desktop 0.10.15，隔离测试 Graph

## 结论与边界

P2-B 的专用结构 SemanticCommit 已从 Service ledger 推进到防御性 Plugin executor，并在真实
Logseq Desktop 中证明同一会话内的 custom UUID Block 可以保留身份和语义正文完成移动与还原。
这不是完整 P2-B 完成：正式 Review→Commit UI、完成态 inverse Commit/Undo 与跨 reload Rebind
仍未完成，用户应用按钮继续关闭。

## 已实现路径

- `v2-mini-project-restructure.ts` 只执行 Service 返回的已准备结构计划；每个 Graph 写入前重新
  prepare/观察，写后由 Service verify，不由 Plugin 自行推进账本状态；
- `CREATE_BLOCK` 精确区分 first child 与 after-sibling，并传入机器生成的 `customUUID`；
- `MOVE_BLOCK` 精确区分 first child 与 after-sibling；
- 重放时，Service 返回 `COMPLETED`、`RECOVERY_REQUIRED` 或已补偿结果，Plugin 不重复 Graph 写；
- 失败时按 Service 返回的 reverse compensation 逆序 move/remove，任一观察不匹配都保留
  `RECOVERY_REQUIRED` 或返回 `MANUAL_RECOVERY_REQUIRED`，不会报告成功。

## 自动证据

- Plugin focused 4/4：正常 exact options、完成态重放零写、move 失败补偿 create、UUID 不匹配
  进入人工恢复；
- Local Service 114/114：包含 prepare replay 对 COMPLETED/RECOVERY_REQUIRED/
  FAILED_COMPENSATED 的终态恢复；
- Capability Lab 14/14：ownership alias、稳定 labPageId、exact host-added `id::` 与冲突拒绝；
- Plugin、Local Service、Service Client typecheck，Capability Lab lint/build/package/bootstrap/dist
  均通过。

## Desktop 协议与结果

1. 仅在 `Task Copilot Lab/` namespace、固定 owner、稳定 labPageId 且当前 runtime page UUID
   匹配 registry 的实验页运行；未知同名页、旧 registry 或 reload 后 UUID 冲突均拒绝写入。
2. 创建 parent 与 A/B/C 三个带 custom UUID 的 child，读取并核验初始顺序。
3. `moveBlock(C, parent, {children: true})`，核验 C/A/B。
4. `moveBlock(C, B)`，核验恢复 A/B/C。
5. 重新读取三个 UUID 与正文，只接受宿主为 custom UUID 增加的单一 `id:: <UUID>` 属性行。

结果：`PASS`。真实事件日志出现两次 `move-blocks` transaction；三个 custom UUID、语义正文和
最终顺序均保持，未执行删除。

## 宿主事实与有界结论

- Logseq runtime 暴露的页面属性键可能从 Markdown kebab-case 变为 camelCase；ownership
  adapter 同时接受两种宿主别名，但仍要求全部 marker 一致。
- `insertBlock(customUUID)` 会在正文尾部物化 `id:: <UUID>`；验证器只容许这个精确宿主变化，
  任何其他正文漂移都失败。
- File Graph 的 Page runtime UUID 在 reload 后会改变，即使页面正文包含 `id::`；因此不能用
  Page runtime UUID 宣称跨 reload 稳定身份。当前选择 fail closed，后续由产品化 Rebind 显式
  恢复 owner/stable labPageId 与新 runtime UUID 的绑定。
- 早期失败运行留下的实验页没有被自动清理，因为 reload 后 registry identity 已不匹配；这正是
  安全边界，不以名称扫描或强删绕过。

## 官方实现对应

- Logseq Editor API：<https://github.com/logseq/logseq/blob/master/src/main/logseq/api/editor.cljs>
- Logseq DnD handler：<https://github.com/logseq/logseq/blob/master/src/main/frontend/handler/dnd.cljs>
- Logseq outliner core：<https://github.com/logseq/logseq/blob/master/deps/outliner/src/logseq/outliner/core.cljs>

官方实现与 Desktop 观察共同支持当前 options 映射；SDK 类型单独不作为 Desktop 证据。

## 截图

- [UUID move/restore PASS](../screenshots/original/p2-b-01-uuid-move-restore-pass.png)
- [结构化结果与宿主事件](../screenshots/original/p2-b-02-uuid-move-restore-structured-result.png)

## 仍开放

1. 完成态结构 Commit 的 immutable inverse SemanticCommit/Undo；
2. 正式 Proposal Review 独立确认、Commit loading/error/recovery 与完成后回根 Block；
3. reload 后 Page/registry Rebind；
4. 整条 Grill→Preview→Proposal→Commit→reload→Undo→reload Desktop Gate。
