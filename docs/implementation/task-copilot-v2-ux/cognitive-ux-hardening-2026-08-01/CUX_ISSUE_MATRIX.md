# CUX Issue Matrix（2026-08-01 更新）

基线来自交接包 `09-CURRENT-ISSUE-MATRIX.csv`；状态列以当前 HEAD `179a6bc` 代码/测试为准。

| ID | 优先级 | 根因 | 历史问题 | 当前状态 @179a6bc | 本轮目标 | 验收 | Commit |
|---|---|---|---|---|---|---|---|
| CUX-P0-01 | P0 | Scoped Outcome | 无候选时成功与失败并存，队列为空 | 已实现 + Desktop PASS：空页与部分非法页均显示中性 empty、无提交按钮、无错误卡；队列计数一致 | 无候选→中性空结果；提示数与队列一致 | empty 中性测试 + Desktop 队列读回（2026-08-01） | af9c852 |
| CUX-P0-02 | P0 | Durable Origin | UUID Page route reload 后空白，anchor 丢失 | 已实现 + Desktop PASS（reload 与 quit/reopen）：稳定页面名路由、无空白/fallback、BLOCK origin 跨重载/重开持久化、解析器返回 RETURNED 并调用 anchor 滚动（有界跟随）；修复路由事件无限循环（resolved-token 守卫 + 750ms 节流）。可见滚动在本宿主无焦点/CDP 环境下未呈现，记 OPEN_MANUAL_GATE | reload/rename/move 后恢复 Page/Block；失败给一键 fallback | resolver 测试（11/11）+ Desktop reload/quit-reopen 全链（2026-08-01） | 13f47ec + 本批 |
| CUX-P1-01 | P1 | Active Surface | Apply/Undo/PENDING confirmation 与底层工作区同屏 | 已实现 + Desktop PASS（Apply 确认面）：唯一 active surface、1 checkbox/1 confirm/1 cancel、取消恢复同一 Review | Desktop 复验 + 测试补 PENDING/Recovery | 1 surface/1 primary/1 cancel；取消回同一上下文 | 179a6bc + 13f47ec |
| CUX-P1-02 | P1 | One-question Workspace | Grill 与创建器/关联/对象列表同屏 | 已实现 + Desktop PASS（真实 DeepSeek 首轮）：问题+输入置顶、理解折叠、关闭回原工作区 | 问题+输入置首；事实/推断/未知折叠 | DOM 顺序测试（407/407）+ Desktop 首轮 | 13f47ec |
| CUX-P1-03 | P1 | Progressive Disclosure | 日常层暴露 SQLite/Graph/Anchor/Association/Lifecycle 等 | 已实现 + Desktop PASS：对象工作区与 Condition 下拉均为用户语言（本次补修 select 术语泄漏）；技术说明进 details | 日常层用户语言；技术词进 details | 文本合同测试 + Desktop select 复验 | 13f47ec + 本批 |
| CUX-P1-04 | P1 | Scoped Outcome | 全局消息跨流程残留，取消报成功 | `beginUiAction` + scoped outcome 已实现；export 文案已修；新增“同工作区新动作替换旧结果、empty 非 error”测试 | 随 P0-01 收口并补时间序列测试 | action 生命周期测试 + Desktop timeline | af9c852 |
| CUX-P2-01 | P2 | Now Density | 筛选/卡片/披露/banner 叠加 | 筛选/排列已折叠进 “筛选与排列” details；“查看其余 N 项”折叠已有（历史提交）；单卡一主动作 | 默认心智简单；次级筛选后置/记忆 | DOM counts + 1000/760 visual gate | 结构已含历史提交；视觉 Gate 待做 |
| CUX-P2-02 | P2 | Provider Error | 错误不可行动且分类笼统 | 已实现：前台“这次整理没有完成…稍后重试”+ 重新分析 + 查看系统状态；日志保留结构化分类；测试覆盖 retry/status/safety 文案 | 前台安全重试/系统状态；技术层分类 | Provider mapping 测试（已有）+ Desktop failure | 已含历史提交；测试复核通过 |
| CUX-P2-03 | P2 | datetime-local | AX 看似有值但 DOM 读回为空 | 表单失败现在以 dialog-scoped error 显示在任务面内（Desktop PASS：WAITING 缺字段提交显示 dialog-scoped 错误、零写入）；字段级位置仍待人工确认 | 鼠标/键盘/VoiceOver 手工 Gate 或字段级错误 | dialog error 测试 + Desktop + 人工 accessibility gate | 45d8726；输入链 OPEN_MANUAL_GATE |
| CUX-P3-01 | P3 | Entry Discoverability | Block 动作埋在长菜单底部 | 命令面板高频入口已有（历史 P0-J） | 至少一条可发现 Toolbar/Command/shortcut | Command 注册测试 + novice visual gate | 登记 |
| CUX-P3-02 | P3 | Time Language | Review 显示原始 ISO 时间 | 已实现 + Desktop PASS：Review eyebrow 显示 `2026/7/31 20:35:03`；技术详情保留原值 | 日常层本地时间；ISO 只进技术详情 | 时间格式测试 + Desktop | 45d8726 |

## 证据状态定义

`NOT_STARTED` / `REPRODUCED_CURRENT` / `PLAN_SKILL_REVIEWED` / `IMPLEMENTED` /
`AUTOMATED_NONVISUAL_PASS` / `DESKTOP_BEHAVIOR_PASS` / `VISUAL_GATE_PENDING` /
`VISUAL_GATE_PASS` / `ACCEPTED`。无视觉结论不得越过 `VISUAL_GATE_PENDING`。
