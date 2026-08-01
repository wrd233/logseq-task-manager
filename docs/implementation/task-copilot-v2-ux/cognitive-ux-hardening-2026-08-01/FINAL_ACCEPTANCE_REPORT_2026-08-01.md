# Task Copilot Cognitive UX Hardening — Final Acceptance Report

```text
Goal Status: ACCEPTED_WITH_FOLLOWUPS
Overall Goal: COMPLETE
Visual Gate: PASS_WITH_MINOR_IMPROVEMENTS
Manual Accessibility Gate: NOT_RUN_OWNER_ACCEPTED_RISK
P3 Discoverability Study: DEFERRED_OWNER_ACCEPTED
```

> 说明：仓库状态系统无 `ACCEPTED_WITH_FOLLOWUPS` 枚举，按产品负责人指令使用 `COMPLETE`；
> 本报告显著位置保留 acceptance 与 waiver 说明。Goal 核心完成定义已达到；无已知 P0/P1
> 阻塞当前收口；未执行的人工输入与研究 Gate 被明确记录，不伪装为测试通过。

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

## 独立视觉 Gate 结果

独立视觉 reviewer（未参与无视觉实现）实际查看了当前构建截图与机器可读证据包，结论：

```text
VISUAL_GATE_RESULT = PASS_WITH_MINOR_IMPROVEMENTS
```

通过项与轻微改进项全文见 `VISUAL_GATE_RESULT_2026-08-01.md`。视觉列状态由 PENDING 更新为
`VISUAL_GATE_PASS`（含轻微改进项，不要求结构性改造）。

## 产品负责人对剩余人工 Gate 的决定

产品负责人已明确决定：不再为本 Goal 另外组织鼠标、键盘、VoiceOver 或新手发现性人工核验；
在不伪造测试结果的前提下接受相关剩余风险，并授权本 Goal 收口。

### datetime-local 手工输入 Gate

```text
Status: NOT_RUN_OWNER_ACCEPTED_RISK
Reason:
Product owner explicitly waived the remaining manual mouse,
keyboard and VoiceOver gate for this Goal after reviewing the
available automated, Desktop and independent visual evidence.
```

- 自动化和现有 Desktop 证据已完成；
- 尚未执行真实 VoiceOver 人工操作；
- 产品负责人知情接受；
- 后续如扩展无障碍支持，可在独立兼容性 Goal 中重新验证；
- 该事项不再阻塞当前 Goal。

### P3-01 新手发现性验证

```text
Status: DEFERRED_OWNER_ACCEPTED
```

- 高频入口已具有可发现路径（命令面板等）；
- 尚未进行新的陌生用户正式可用性实验；
- P3 问题；产品负责人接受为后续真实使用研究项；
- 不阻塞 Cognitive UX Hardening Goal。

### Graph switch、Block 移动和删除变体

```text
Status: DEFERRED_NON_BLOCKING
Evidence:
Relevant automated coverage remains passing.
```

## 转入后续 Goal 的事项（TRANSFERRED_TO_FOLLOWUP_GOAL）

以下新观察不重新算作原 Goal 未完成：

- Now Card Reading Path（标题下状态/依据/按钮/更多操作的阅读打断）；
- 操作区与内容阅读区分离；
- 主按钮宽屏右置；
- 窄栏卡片 footer；
- 来源 Block 子级内容只读预览；
- Semantic Visual Hierarchy（字重/颜色预算）；
- Objects 工作区进一步去后台化；
- Active Surface 背景工艺优化；
- 新手长期可用性研究。

推荐归入独立 Goal：

```text
Task Copilot Worksite Re-entry & Reading Hierarchy
```

## 原 CUX 问题关闭原则

- CLOSED：Scoped Outcome 假成功/矛盾结果/跨流程污染；Durable Origin reload、quit/reopen、
  往返与恢复场景；Apply/Undo/PENDING 底层竞争；Grill 与控制台同屏；内部术语暴露；
  dialog error 污染全局；Review 原始时间格式；其余由测试/Desktop/视觉证据覆盖的问题。
- OWNER_ACCEPTED_RISK：datetime-local 手工输入 Gate（未执行）。
- DEFERRED_OWNER_ACCEPTED：P3-01 新手发现性。
- DEFERRED_NON_BLOCKING：Graph switch、Block 移动/删除 Desktop 变体。
- TRANSFERRED_TO_FOLLOWUP_GOAL：上述视觉与交互工艺项。

## 最终结论

本报告回答 Goal §11.4 的问题：

- 用户现在少理解了什么：内部领域/实现模型词不再前置；假成功/失败语义消除。
- 少记住了什么：无需记忆上一步选择、队列状态或来源 Page 名；reload/重开自动恢复。
- 少寻找了什么：唯一问题与输入在首屏；表单错误在任务面内；次级操作折叠。
- 哪些页面形成了独立任务工作面：Apply/Undo 确认面、Grill 单问题工作区、中性结果面板。
- 哪些内部概念被后置：SQLite/Graph/Anchor/Association/Lifecycle/版本号/大写类型/管线词。
- 返回现场是否可靠：六类 Desktop 证据 PASS；失败给一键 fallback。
- 哪些问题被接受为后续项：见上节 waiver 与 TRANSFERRED 列表。
- 为什么当前 Goal 可以完成：自动化（410/410、12/12、typecheck/build、根级 check）、Desktop
  行为证据、独立视觉 Gate（PASS_WITH_MINOR_IMPROVEMENTS）与产品负责人 waiver 全部到位；
  无已知 P0/P1 阻塞；未执行项被如实记录且经负责人接受。

**Cognitive UX Hardening Goal：COMPLETE（ACCEPTED_WITH_FOLLOWUPS）。**
