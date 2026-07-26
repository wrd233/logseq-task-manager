# P2-G Restore 受控人工恢复 Desktop Gate

## 结论

历史状态：`MANUAL_RECOVERY_CONTROLLED_DESKTOP_DONE_REAL_DOUBLE_FAILURE_OPEN`

当前状态：真实连续双重故障已由 `fe0b590034ac` 的
`p2-g-restore-double-failure-desktop-live-20260727.md` 关闭为
`REAL_DOUBLE_FAILURE_MANUAL_RECOVERY_DESKTOP_DONE`。本文只保留受控前置条件的历史证据，
不再代表当前 Restore 恢复实现。

本 Gate 在隔离测试 Graph 中建立符合生产互锁格式的受控 `RECOVERY_REQUIRED` 前置条件，
完整验证用户层状态、独立 HIGH Review、保存当前歧义状态、恢复保留基线、健康检查、清锁、
Service 重连、Logseq 完整退出和 restart。它证明产品化人工恢复链可用，但不是对生产 Restore
连续双重故障的安全注入，因此不关闭真实 double-failure Gate，也不关闭 P2-G 或完整 Goal。

## 运行基线

- branch：`feature/task-copilot-mvp`
- commit：`16bde9ad88a5`
- Plugin：`0.1.0`，当前构建
- Logseq Desktop：`0.10.15`
- Graph：隔离测试 Graph `logseq`
- theme：Dark
- 场景：真实运行 UI，不是设计稿或静态原型
- 操作方式：Codex bundled Computer Use runtime 通过 Electron loopback CDP 控制 Logseq
  DOM，并用指定窗口截图；全程不发送全局鼠标事件，前台应用保持不变
- 隐私：专用虚构对象；截图、日志和报告不含 API Key、私人正文或数据库路径

## 受控前置条件

1. 活动库保持 5 个已知基线对象，并保留一个已校验恢复点；
2. 仅在隔离库加入一个合成歧义对象，活动对象数变为 6；
3. 写入生产格式、精确 Graph 绑定且已确认恢复点的安全互锁；
4. Launcher/Plugin 只读投影显示正式能力受限，未执行任何恢复或清锁捷径。

## 用户纵向链

1. 用户从“更多 → 系统状态”看到一个主结论：需要人工恢复；
2. 点击“准备恢复”，进入独立 HIGH Review；
3. 未勾选确认时不执行恢复；
4. 勾选后由 Launcher 在同一 Graph lifecycle gate 内启动 one-shot maintenance；
5. maintenance 先保存当前歧义状态，再从互锁推导唯一保留恢复点；
6. 复用既有离线 Restore 与健康检查，全部通过后 exact clear 互锁；
7. Plugin 复用 bounded runtime recovery，刷新正式能力、Store 和现有投影；
8. 用户层回到“Task Copilot 可以正常使用”；
9. 完整退出 Logseq，owned Service 停止；重启 Logseq 后 Launcher 重建 Service；
10. 再次打开系统状态，健康结论和正式写能力保持。

## 真实发现与修复

首次运行没有被当作验收成功，而是推动三项通用修复：

1. `36af862`：人工恢复页曾显示数据库、SQLite、Doctor 等工程术语；改为用户事实与单一动作，
   内部信息只留折叠技术详情。
2. `f57eb36`：底层已恢复且 Service READY，但 Plugin 仍显示陈旧只读状态；恢复分支改为复用
   既有 bounded runtime recovery，并同步 `featureReady`、Store、工具栏和 Project Page Head。
3. `16bde9a`：健康页仍暴露 Focus、Condition、Project、Anchor、Audit、Rebind 等内部概念；
   统一翻译为当前关注、暂时做不了、项目、审阅、撤销和正文连接。

这些修复没有新增正式状态、顶层导航、Recovery Kernel、Undo 逻辑、Prompt、Skill 或
Validator 特例。

## 结构化结果

- interlock：cleared
- active Doctor：PASS
- active objects：5
- controlled ambiguous object：不在活动库
- safety snapshot：PASS，仍保留合成歧义对象
- user system status：READY
- Store：READY
- Service：READY，formal writes enabled
- Pending / Recovery / Source Conflict：`0 / 0 / 0`
- user-facing forbidden engineering terms scan：0
- 完整 restart：PASS

## 自动证据

- focused status narration / system status / recovery guide / UI tests：PASS
- Launcher：`29/29`
- Local Service：`160/160`
- Service Client：`13/13`
- Plugin：`328/328`
- Shared：`9/9`
- 根级 `./scripts/check.sh`：PASS

本 Slice 不调用 LLM/Provider；Validator 拒绝率与模型重试次数不适用。

## HISTORICAL 截图

- `../current-ui/screenshots/p2-g-47-restore-recovery-controlled-entry-current-dark.png`
- `../current-ui/screenshots/p2-g-48-restore-recovery-high-review-current-dark.png`
- `../current-ui/screenshots/p2-g-49-restore-recovery-success-current-dark.png`
- `../current-ui/screenshots/p2-g-50-restore-recovery-restart-health-current-dark.png`

四张均为 commit `16bde9ad88a5` 的真实 Logseq Desktop 截图，现已由 `fe0b590034ac` 的
真实连续双重故障 `p2-g-55`～`59` 替代为当前证据。

## 仍开放

- Restore Light / 窄栏代表性视觉 Gate；
- Migration failure / interruption / resume；
- 主面板顶栏和“更多”维护卡的 Runtime/Store/Graph/Launcher/Service/Commit 工程词压缩。
