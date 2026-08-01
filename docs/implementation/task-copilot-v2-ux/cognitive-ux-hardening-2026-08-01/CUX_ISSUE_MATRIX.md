# CUX Issue Matrix（2026-08-01 更新）

基线来自交接包 `09-CURRENT-ISSUE-MATRIX.csv`；状态列以当前 HEAD `179a6bc` 代码/测试为准。

| ID | 优先级 | 根因 | 历史问题 | 当前状态 @179a6bc | 本轮目标 | 验收 | Commit |
|---|---|---|---|---|---|---|---|
| CUX-P0-01 | P0 | Scoped Outcome | 无候选时成功与失败并存，队列为空 | 已实现：空/全非法候选返回中性 empty（不再 throw），无提交按钮；成功/失败并存已消除；`beginUiAction` 保证新动作清旧结果 | 无候选→中性空结果；提示数与队列一致 | empty 中性测试（14/14+4/4 通过）+ Desktop 队列读回 | 本 Sprint 提交 |
| CUX-P0-02 | P0 | Durable Origin | UUID Page route reload 后空白，anchor 丢失 | 已实现：`resolveAfterReload`（PARKED/RETURNED/RETURNED_PAGE_ONLY/SOURCE_UNAVAILABLE）+ 有界重试 + fallback 对话框 + 正常返回后写稳定 pageName 路由；origin 保留到下次一般入口 | reload/rename/move 后恢复 Page/Block；失败给一键 fallback | route resolver 测试（9/9）+ Desktop reload/reopen | 本 Sprint 提交 |
| CUX-P1-01 | P1 | Active Surface | Apply/Undo/PENDING confirmation 与底层工作区同屏 | 所有 dialog 已是唯一 active surface（结构） | Desktop 复验 + 测试补 PENDING/Recovery | 1 surface/1 primary/1 cancel；取消回同一上下文 | 已含于 179a6bc；待复验 |
| CUX-P1-02 | P1 | One-question Workspace | Grill 与创建器/关联/对象列表同屏 | 已实现：Grill 首屏唯一问题+输入置顶；系统理解/事实/推断/未知折叠进 “查看系统理解与已确认事实”；预览态预览优先 | 问题+输入置首；事实/推断/未知折叠 | DOM 顺序测试（405/405）+ 三轮 Desktop | 本 Sprint 提交 |
| CUX-P1-03 | P1 | Progressive Disclosure | 日常层暴露 SQLite/Graph/Anchor/Association/Lifecycle 等 | 已实现：领域/关联/归属/相关内容/正式事项均改用户语言；类型/生命周期/状态/交付状态/版本号不再出现在日常行；技术说明进 details；新增 visible-text 合同测试 | 日常层用户语言；技术词进 details | 文本合同测试 + visual gate | 本 Sprint 提交 |
| CUX-P1-04 | P1 | Scoped Outcome | 全局消息跨流程残留，取消报成功 | `beginUiAction` + scoped outcome 已实现；export 文案已修；新增“同工作区新动作替换旧结果、empty 非 error”测试 | 随 P0-01 收口并补时间序列测试 | action 生命周期测试 + Desktop timeline | 本 Sprint 提交 |
| CUX-P2-01 | P2 | Now Density | 筛选/卡片/披露/banner 叠加 | 未动 | 默认心智简单；次级筛选后置/记忆 | DOM counts + 1000/760 visual gate | 待提交 |
| CUX-P2-02 | P2 | Provider Error | 错误不可行动且分类笼统 | 未动 | 前台安全重试/系统状态；技术层分类 | Provider mapping 测试 + Desktop failure | 待提交 |
| CUX-P2-03 | P2 | datetime-local | AX 看似有值但 DOM 读回为空 | 未动 | 鼠标/键盘/VoiceOver 手工 Gate 或字段级错误 | 人工 Desktop accessibility gate | 保持 OPEN_MANUAL_GATE |
| CUX-P3-01 | P3 | Entry Discoverability | Block 动作埋在长菜单底部 | 命令面板高频入口已有（历史 P0-J） | 至少一条可发现 Toolbar/Command/shortcut | Command 注册测试 + novice visual gate | 登记 |
| CUX-P3-02 | P3 | Time Language | Review 显示原始 ISO 时间 | `ui.ts:753` 直接输出 `record.updatedAt` | 日常层本地时间；ISO 只进技术详情 | 时间格式测试 | 待提交 |

## 证据状态定义

`NOT_STARTED` / `REPRODUCED_CURRENT` / `PLAN_SKILL_REVIEWED` / `IMPLEMENTED` /
`AUTOMATED_NONVISUAL_PASS` / `DESKTOP_BEHAVIOR_PASS` / `VISUAL_GATE_PENDING` /
`VISUAL_GATE_PASS` / `ACCEPTED`。无视觉结论不得越过 `VISUAL_GATE_PENDING`。
