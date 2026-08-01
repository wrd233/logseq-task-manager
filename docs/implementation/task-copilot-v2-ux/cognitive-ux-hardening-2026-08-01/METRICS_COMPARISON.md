# Cognitive UX Metrics Comparison（审计基线 → 2026-08-01 构建）

> 基线来源：`cognitive-audit-2026-07-31/README.md`（HISTORICAL_VISUAL_OBSERVATION + VERIFIED_CURRENT at 08825d8）。
> “当前”来源：本目录 Desktop Gate 记录（STRUCTURAL_FACT / AUTOMATED / DESKTOP_BEHAVIOR_FACT）。
> 视觉结论此前一律 `VISUAL_GATE_PENDING`；收口时已由独立视觉 Gate 解除
> （`VISUAL_GATE_RESULT_2026-08-01.md`）。以下对比以结构/行为证据为主。

## 1. 整理当前页（无候选）

| 指标 | 审计基线 | 当前 |
|---|---|---|
| 可见 outcome 数 | 2（假成功“已放入待我确认”+“检查未完成”） | 1（中性“没有新增需要整理的内容”+ 已扫描块数/非法计数） |
| Concept Budget | 需分辨成功/失败语义与队列关系 | 一句话结论 + 无提交按钮 |
| Carried Context | 用户需自行核对队列是否为空 | 结果与队列事实一致（待整理 0） |
| Context Isolation | 同屏混入 AI 分析与旧 banner | 单个 scoped 面板；旧瞬时结果随新动作清除 |

## 2. Apply / Undo / PENDING 最终确认

| 指标 | 审计基线 | 当前 |
|---|---|---|
| 可见主动作数 | 2（顶部+底部同名“确认应用”） | 1（唯一确认按钮）+ 1 取消 |
| Visual Competition | 底层 Review 卡、历史、旧消息同屏 | `nav[aria-label=主要工作区]` 不在 DOM；仅确认面 |
| Carried Context | 需判断哪个按钮生效 | checkbox 语句 + 唯一动作；取消恢复同一 Review |
| Context Isolation | 无 | active-surface-shell（Desktop DOM/AX 证实） |

## 3. MiniProject / Project Grill

| 指标 | 审计基线 | 当前 |
|---|---|---|
| 首屏内容 | 长报告先行，问题/输入在下方；底层 Project 管理面可见 | 唯一问题+输入置顶；理解/事实/推断折叠；底层工作区不渲染 |
| Concept Budget | 需理解 Area/Association/对象列表/状态轴 | 来源+问题+输入+退出；三轮真实问答上下文保持 |
| Carried Context | 需记住回答到哪一步 | 已确认事实随轮次累加，折叠可查 |
| Context Isolation | 无 | 对话式 surface；关闭回原工作区 |

## 4. 日常对象工作区

| 指标 | 审计基线 | 当前 |
|---|---|---|
| 内部词可见数 | 多（SQLite/Anchor/Association/Lifecycle/Primary Ownership/大写类型/vN） | 0（visible-text 合同测试 + Desktop 复核；技术说明进 details） |
| Concept Budget | 需理解数据库/连接/生命周期模型 | 项目/事项/成果/归属/当前状态 |
| Visual Competition | 创建器+关联+列表+术语混排 | 用户语言卡片；下拉也使用用户语言（修复 select 泄漏） |

## 5. 返回现场（Page/Block/reload）

| 指标 | 审计基线 | 当前 |
|---|---|---|
| reload 后页面 | UUID 路由空白 “Page no longer exists!!” | 页面名路由稳定加载；无空白/无 fallback（Desktop PASS） |
| Block anchor | 丢失，需手工搜索 | 可见滚动恢复（scroller 0→411.84，块 910→498 进视口） |
| 持久化 | 无 | BLOCK origin 跨 reload/quit/reopen 持久化；改名+UUID 再生与同路由 boot 恢复 PASS |
| Carried Context | 用户需记住 Page 名 | 无需记忆；解析失败时有一键 fallback 对话框 |

## 6. 时间与错误表达

| 指标 | 审计基线 | 当前 |
|---|---|---|
| Review 时间 | 原始 ISO | 本地化（`2026/7/31 20:35:03`） |
| 表单错误 | 全局 banner / 无反馈 | dialog-scoped error 在任务面内显示；零写入 |
| Provider 失败 | 笼统“稍后重试” | “这次整理没有完成…稍后重试”+ 重新分析 + 查看系统状态 |

## 局限

- 以上“减少”均为结构/行为证据；视觉权重、留白、对比度等仍需独立视觉 Gate。
- Now 整屏密度（CUX-P2-01）未做结构性改动，仅保留既有折叠；视觉 Gate 再判断。

## 收口补充（2026-08-01）

- 独立视觉 Gate 已解除：`PASS_WITH_MINOR_IMPROVEMENTS`，主要改善方向（任务可识别、唯一主动作、
  Active Surface、One-question Grill、Progressive Disclosure、无横向溢出、outcome 来源清楚）
  已由 reviewer 确认。
- 后续候选项（Now 阅读路径、操作区/阅读区分、语义视觉层级、Objects 去后台化等）不改变本轮
  指标结论，已转入 `Task Copilot Worksite Re-entry & Reading Hierarchy` 独立 Goal 候选。
- Now 阅读路径与工作现场预览属于下一 Goal，不倒推本 Goal 未完成。
