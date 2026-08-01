# Consolidated Runtime Checkpoint（集中 Desktop 复验）

> 状态：本清单已执行完毕——自动化与非视觉 Desktop 复验 PASS、独立视觉 Gate 于 2026-08-01
> 解除（`VISUAL_GATE_RESULT_2026-08-01.md`）、剩余人工项由产品负责人 waiver 收口。
> 以下为原清单，保留作为执行记录。

> 自动化与非视觉结构工作已穷尽（Plugin 406/406、origin 9/9、scoped-outcome 4/4、根级 check PASS）。
> 剩余实质工作依赖一次集中的用户/审查者运行时操作，总时长建议 ≤30 分钟。

## 1. 加载当前构建

```text
Logseq 0.10.15 → Settings → Advanced → Developer mode
/Users/wangrundong/work/任务管理中心-logseq插件/apps/task-copilot-logseq-plugin （含 dist/）
Plugin Manager → Load unpacked plugin → 选择上述目录
```

当前安装的稳定 r8 插件保留不动；验证后如需恢复，重新 Load unpacked 到原 r8 目录即可。

## 2. 代表矩阵（每项记录 route、AX/DOM 摘要、数据读回）

| # | 流程 | 通过条件 |
|---|---|---|
| 1 | 整理当前页：无候选 | 只显示中性 empty；无提交按钮；待整理计数为 0 |
| 2 | 整理当前页：部分非法 | empty + 非法计数；无提交 |
| 3 | 整理当前页：真实候选 | 预览 N 项 → 加入待整理 → 队列 N 项 |
| 4 | Block 来源 → 分析 → 返回 | 返回同一 Block；reload 后自动恢复 Page+anchor（或明确 fallback） |
| 5 | Apply / Undo / PENDING 继续 | 唯一 active surface；1 primary + 1 cancel；取消回同一 Review |
| 6 | MiniProject / Project Grill 三轮 | 首屏问题+输入；完整理解折叠可展开；退出/取消可恢复 |
| 7 | 对象工作区 | 无 SQLite/Anchor/Association/Lifecycle/Primary Ownership/大写类型/版本号可见 |
| 8 | Review 时间 | 日常层本地时间；ISO 只进技术详情 |
| 9 | 表单失败（等待/暂停） | dialog 内错误可见；正文与正式状态零写入 |
| 10 | Light/Dark × 1000/760 | 无横向溢出、无焦点陷阱、主次可辨 |
| 11 | datetime-local | 鼠标/键盘/VoiceOver 可读回并提交，或字段级失败说明（OPEN_MANUAL_GATE） |

## 3. 截图与证据

保存到 `tmp/runtime/cognitive-ux-hardening/current/`（Git ignored），并在
`docs/implementation/task-copilot-v2-ux/cognitive-ux-hardening-2026-08-01/CUX_EVIDENCE_INDEX.md`
登记；随后交给独立视觉 reviewer（见 `VISUAL_GATE_REQUEST.md`）。

## 4. 数据读回

```bash
PATH=/opt/homebrew/opt/node@20/bin:$PATH
tc --service-descriptor "$HOME/Library/Application Support/Task Copilot/runtime/"*.service.json status
tc ... doctor
tc ... object list --json
```

要求：Doctor PASS、Pending/Recovery 0、对象数与队列/界面一致、无凭据或隐私进入截图/日志。

## 5. 完成后

把结果（`DESKTOP_BEHAVIOR_PASS` / 失败清单 / `VISUAL_GATE_PENDING|PASS`）写入
`CUX_PROGRESS_REPORT.md` 与本目录 evidence；视觉未通过前不得宣布 Goal 完成。
