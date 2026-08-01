# Task Copilot Cognitive UX Hardening — Final Acceptance Report（草案，等待独立视觉 Gate）

> 状态：`AUTOMATION_COMPLETE` → `CONSOLIDATED_RUNTIME_CHECKPOINT`；Goal 未完成。
> 本报告回答 Goal §11.4 的六个问题，并逐项给出证据等级与 Gate 状态。
> 视觉结论一律 `VISUAL_GATE_PENDING`，直到独立 reviewer 完成。

## 1. 用户现在少理解了什么

- 不再需要理解 SQLite/Anchor/Association/Lifecycle/Primary Ownership/大写类型/版本号：
  日常对象工作区与对话框全部用户语言（visible-text 合同测试 + Desktop 复核）。
- 不再需要分辨“假成功 vs 失败”：无候选整理只显示一个中性结果，与队列一致。
- 不再需要理解 Proposal/Commit 管线词：Review 用“系统理解/会改变/不会改变/是否已生效”。

## 2. 少记住了什么

- 不需要记住上一步选择/状态：确认面携带最小影响摘要；Grill 每轮重显唯一问题与已确认事实。
- 不需要记住来源 Page 名：Durable Origin 跨 reload/quit/reopen 自动恢复（六类 Desktop 证据）；
  失败时给一键 fallback。
- 不需要记住“是否已生效”：Result/Review 明确“已审阅尚未应用/已应用/已撤销”。

## 3. 少寻找了什么

- 唯一问题与输入在 Grill 首屏首位；完整理解折叠在“查看系统理解与已确认事实”。
- 表单失败在任务面内可见（dialog-scoped error），不再需要去全局 banner 找原因。
- 次级操作（筛选/排列/更多处置）折叠；一个判断一个主动作。

## 4. 哪些页面变成了清楚的任务工作面

- Apply/Undo/PENDING 确认：active-surface-shell（主导航不在 DOM，Desktop AX/DOM 证实）。
- MiniProject/Project Grill：对话式单问题工作面，三轮真实问答保持上下文。
- 整理当前页：中性结果面板（空/部分非法/真实候选语义一致）。
- 返回现场：稳定路由 + 自动恢复 + fallback 对话框，不出现无解释空白。

## 5. 哪些内部概念被后置

SQLite、Graph、Anchor、Association、Lifecycle、版本号、大写对象类型、Commit/Proposal 管线词
全部移入“技术说明/查看完整依据/技术详情”；日常层保持语义准确但不再前置。

## 6. 返回现场是否可靠

- reload / quit/reopen / 跨页往返 / Page 改名+UUID 再生 / 同路由 boot：Desktop PASS（六类证据）。
- Block anchor 可见滚动：PASS（滚到块可见；scroller 0→411.84，块 910→498）。
- Graph switch 与 Block 移动/删除：解析器 12/12 单测覆盖，Desktop 变体待补。

## 逐项 Gate 状态

| 项目 | 自动化 | Desktop | 视觉 | 备注 |
|---|---|---|---|---|
| CUX-P0-01 空/部分非法/真实候选 | PASS（410/410） | PASS | PENDING | 队列读回一致 |
| CUX-P0-02 Durable Origin | PASS（12/12） | PASS（六类） | PENDING | 见证据目录 |
| CUX-P1-01 Active Surface | PASS | PASS（Apply/Undo） | PENDING | PENDING 继续共用同一 render 路径 |
| CUX-P1-02 One-question Grill | PASS | PASS（三轮真实 DeepSeek） | PENDING | 含 Provider 长度错误+重试 |
| CUX-P1-03 Progressive Disclosure | PASS | PASS | PENDING | visible-text 0 内部词 |
| CUX-P1-04 Scoped Outcome | PASS | PASS | PENDING | 新动作清理/取消不假成功 |
| CUX-P2-01 Now 密度 | 结构保留（折叠已有） | 结构 PASS | PENDING | 未做大改 |
| CUX-P2-02 Provider 错误 | PASS | PASS | PENDING | 文案+重试+系统状态 |
| CUX-P2-03 datetime AX | 结构（dialog error）PASS | PASS（结构） | PENDING | 输入链 OPEN_MANUAL_GATE |
| CUX-P3-01 入口发现性 | 命令面板已有 | — | PENDING | novice gate |
| CUX-P3-02 时间语言 | PASS | PASS | PENDING | 本地时间 |

## 独立视觉 Gate 请求

请 reviewer 使用 `VISUAL_GATE_REQUEST.md` + `CUX_EVIDENCE_INDEX.md` 中的截图与证据包，
对上述每一项给出 `VISUAL_GATE_PASS/FAIL/需改进`。未通过前本 Goal 不完成。
