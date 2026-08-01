# Desktop Gate 记录（2026-08-01）

> 环境：Logseq 0.10.15 / macOS / 插件 r11 build（select 术语修复后 `b443d589b268`；
> durable-origin anchor 恢复增强后 `e280d7d2ca7b`）/ Local Service READY / schema 12 / 测试 Graph `logseq`。
> 采集方式：Chromium CDP（`--remote-debugging-port=9222`）读取真实 renderer DOM/AX 文本并截图，
> 由无视觉执行模型整理；**视觉结论仍为 VISUAL_GATE_PENDING**，截图已提交独立 reviewer。

## 已验证项（DESKTOP_BEHAVIOR_FACT）

| CUX | 流程 | 结果 |
|---|---|---|
| CUX-P0-01 | 空页整理当前页（TC CUX Empty 20260801，普通块） | 中性 empty：“没有新增需要整理的内容 / 已读取前 1 条内容；没有发现新的明确标记内容”；无提交按钮；无“这次检查没有完成” |
| CUX-P0-01 | 部分非法（`[任务]` 缺标题 + 两个有效块已自动同步为正式对象） | 中性 empty + “1 个显式标识存在冲突或缺少标题，未列为可写候选”；无提交按钮 |
| CUX-P1-01 | accepted-not-applied → 确认应用；历史已应用项 → 确认撤销 | Apply：打开后 `nav[aria-label=主要工作区]` 不存在；仅确认面：checkbox + 确认应用 + 取消；取消后恢复同一 Review 卡（“方案已审阅，等待确认应用”）。Undo：历史“撤销项目更新”确认面同样无主导航、1 checkbox + 1 确认撤销 + 1 取消 |
| CUX-P1-02 | MiniProject Grill（真实 DeepSeek） | 首屏=“这一轮只确认一件事/问题/你的回答/继续讨论”；`data-field=v2MiniProjectGrillAnswer` 位于 `details.grill-context` 之前；details 默认 closed；展开可见理解/事实/推断/未知/建议；关闭返回同一 objects 工作区 |
| CUX-P1-03 | 对象工作区 + Condition 对话框 | 对象行/创建器/关联/所属关系全用户语言；Condition 阻碍下拉此前泄漏 `OUTPUT/TASK/MINI_PROJECT/PROJECT`，本次已修复并复验为 成果/任务/小项目/项目，`hasRawCodes=false` |
| CUX-P0-02 | Block 来源流全链（真实右键菜单 → 处理这条内容 → 真实 DeepSeek NO_PROPOSAL → 返回原内容） | 返回后路由为 `#/page/TC%20CUX%20Empty%2020260801?anchor=...`（页面名路由，非 UUID）；durable origin BLOCK token 持久化于 FileStorage（schemaVersion 1 + graphKey + BLOCK/pageUuid/blockUuid）；随后 hard reload：页面正常加载、无 “Page no longer exists!!”、无 fallback 弹窗、正文可见。anchor 滚动恢复由 resolver 单测覆盖（同页 + Block 可解析 → RETURNED + scroll） |
| CUX-P2-03 结构 | Waiting 表单缺字段提交 | dialog-scoped error 在任务面内显示：“未完成：WAITING 必须说明正在等待谁或什么。系统不会静默覆盖或重复提交。”；零正式写入 |
| CUX-P3-02 | Review eyebrow | 显示 `2026/7/31 20:35:03`（本地化），不再显示原始 ISO |
| Now/入口 | Now 首屏 | 一卡一主动作；“筛选与排列”折叠；“查看其余 8 项”折叠；Copilot 状态条用户语言 |

## 截图（供独立视觉 Gate）

- `tmp/runtime/cognitive-ux-hardening/current/01c-now-dark-760.png`（Dark 窄栏）
- `tmp/runtime/cognitive-ux-hardening/current/01d-now-dark-1000.png`（Dark 标准）
- `tmp/runtime/cognitive-ux-hardening/current/01b-now-light-760.png`（Light 窄栏）
- `tmp/runtime/cognitive-ux-hardening/current/05-now-light-1000.png`（Light 标准，真 Light 模式）
- `tmp/runtime/cognitive-ux-hardening/current/02-confirmation-apply-light-1000.png`
- `tmp/runtime/cognitive-ux-hardening/current/02b-confirmation-undo-light-1000.png`
- `tmp/runtime/cognitive-ux-hardening/current/03-grill-question-first-light-1000.png`
- `tmp/runtime/cognitive-ux-hardening/current/04-objects-user-language-light-1000.png`

> 注：02/02b/03/04 为插件 Dark 外观（审计稳定外观）下采集；01/01b/01c/01d/05 为切换插件
> `appearance` 设置后按 Light/Dark × 标准/窄栏重新采集；设置已备份并恢复为 dark。
> 窄栏证据：shell clientWidth 756、scrollWidth 756、overflowX hidden（无横向溢出）。

## 数据读回

- 插件 Diagnostics（真实 renderer）：Runtime READY / Store READY / Local Service READY · formal writes true /
  当前 Graph `logseq` / Pending / Recovery / Source Conflict `0 / 0 / 0` / explicit sync pending 0。
- 待审阅 (1)：即审计遗留的 accepted-not-applied Proposal，未正式应用（保持原状）。
- 新增测试对象：`CUX 候选甲`（TASK）、`CUX 候选乙`（OUTPUT）经显式同步成为正式对象；`[任务]` 空标题保持普通非法块。

## Gate 状态

- 自动化：Plugin 409/409、origin 11/11、scoped-outcome 4/4、typecheck/build、根级检查（提交前重跑）。
- Desktop 行为：上述矩阵 PASS（真实 Logseq renderer DOM/AX + 截图）。
- 视觉：**VISUAL_GATE_PENDING**——截图与 `VISUAL_GATE_REQUEST.md` 已就绪，等待独立 reviewer。
- 未覆盖（保持 OPEN）：Light/Dark × 760 全流程矩阵（Now 四主题/视口已采集，其余流程仅标准宽度）、
  datetime-local 鼠标/键盘/VoiceOver 手工 Gate、P3-01 新手发现性。
- 右键菜单链路已打通（右键 Block 圆点唤起原生菜单 → 点击 “Task Copilot：处理这条内容”）；
  durable-origin “Block 入口 → 返回 → reload” 全链已在真实 Desktop PASS（见上表）。
