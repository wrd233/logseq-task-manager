# P0 高频壳层与系统状态用户语言 Desktop Gate

## 结论

状态：`HIGH_FREQUENCY_ENGINEERING_LANGUAGE_DESKTOP_DONE_ADVANCED_SURFACES_OPEN`

本 Gate 使用最新构建重新验证“现在”“更多”和“系统状态”三处高频界面。普通用户层不再
展示 Runtime、Store、Graph、Launcher、Service、Commit、SQLite、Plugin 等内部运行词；
精确构建、运行阶段和诊断数据仍保留在用户主动展开的技术详情中。它关闭高频壳层的工程
概念泄漏 Partial，但不代表所有 Proposal、Grill、Migration、Restore 与 Project 高级界面
都已完成同一轮压缩。

## 运行基线

- branch：`feature/task-copilot-mvp`
- commit：`4dfe014902a3f26bc5c783260d1dc8ae1ffe4d43`
- Plugin：`0.1.0`，构建时间 `2026-07-26 20:11:31 +0800`
- Logseq Desktop：`0.10.15`
- Graph：专用测试 Graph `logseq`
- theme：Dark
- window / viewport：`1068 × 788` CSS px，截图 `2136 × 1576` px
- 场景：当前真实运行 UI，不是设计稿、静态原型或旧截图复用
- 操作方式：后台 Computer Use 通过 Electron loopback CDP 操作 DOM 和截取当前窗口；不发送
  全局鼠标事件，不切换系统前台应用
- 隐私：截图与报告不含 API Key、descriptor token、数据库路径或私人正文

## 用户纵向检查

1. 从 Plugin Manager 对 exact build 执行真实 reload；
2. 打开 Task Copilot，启动结论为“已自动连接当前知识库；正式能力可以使用”；
3. “现在”只保留用户导航、任务结论与可执行动作，不显示运行组件条；
4. “更多”把维护能力收敛为最近修改、系统状态、备份恢复、迁移和结束本次使用；
5. “系统状态”首屏固定回答发生了什么、影响、仍可用、数据安全和是否需要操作；
6. 默认折叠技术诊断；展开后核对 Plugin commit `4dfe014902a3`、Logseq `0.10.15`、
   正式修改可用及 Pending / Recovery / Source Conflict `0 / 0 / 0`；
7. 折叠用户层对约定的工程词集合扫描命中 `0`。

## 安全与复杂度结果

- 恢复后的连接成功不再只看连接状态和 client 存在；必须同时满足
  `formalWritesAvailable`，否则保持用户层受限结论。
- 新增正式状态：`0`。
- 新增顶层导航：`0`。
- 新增 Agent Runtime、Prompt、Skill、Validator 或 Recovery 分支：`0`。
- 删除/合并：删除高频顶栏重复运行条；系统健康、知识库切换与维护入口复用同一用户状态
  翻译；技术身份只保留在折叠诊断。
- LLM / Provider：本 Slice 不调用；Validator 拒绝率和重试次数不适用。

## 自动证据

- Application status narration focused tests：PASS；
- Plugin user-system-status / UI focused tests：PASS；
- Plugin：`328/328`；
- Launcher：`29/29`；
- Local Service：`160/160`；
- Service Client：`13/13`；
- Shared：`9/9`；
- 根级 `./scripts/check.sh`：PASS。

## CURRENT 截图

- `../current-ui/screenshots/p0-e-05-daily-shell-clean-current-dark.png`
- `../current-ui/screenshots/p0-h-08-more-productized-current-dark.png`
- `../current-ui/screenshots/p0-i-03-system-status-translated-current-dark.png`

三张均为 commit `4dfe014902a3` 的真实 Logseq Desktop 截图；早于该提交的通用壳层、
“更多”和健康系统状态截图不再作为这些公共界面的当前权威。

## 仍开放

- Proposal Review、Grill Me、Project 结构、Migration 与 Restore 高级界面的逐场景压缩；
- P0 Graph switch、slash / command palette / custom binding 与多宿主来源返回；
- Light / Dark、窄栏与编辑态的代表性集中视觉 Gate；
- P1 Attention、Dynamic Now、Project Context Recovery、Block Marker 的正式前台 Gate；
- P2-E failure / stale / Recovery、P2-F noise gate、P2-G real double-failure 和 Migration
  failure / interruption。
