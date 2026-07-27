# P0-K 普通 Block 分析前台语言 Desktop Gate

> 日期：2026-07-27
> 状态：`CURRENT`
> 精确构建：`06b8762933f8`
> Logseq：0.10.15 / File Graph / Dark / 1000×720
> 测试材料：脱敏专用页面 `Task Copilot Lab/P0 K Host Gate 20260727`

## 最新界面发现

`72f4817` 的真实来源移动/删除 Gate 同时暴露了一个前台缺陷：普通来源 Block 经真实
Provider 判断无需正式化时，用户看到“未创建 Proposal”。结果本身正确，但要求用户理解
内部管线词，违反普通路径的心智预算。

## 修改

- `NO_PROPOSAL`：改为“这条内容暂时不需要整理”，保留一条有界理由；
- 建议已生成：只说明已放入“待我确认”、正文和正式状态尚未变化，不显示内部 ID；
- 能力不可用、连接中断和生成失败：统一说明本次未完成、正文和正式状态没有变化及可重试；
- Provider 原因最多显示 180 字，并在前台替换
  `NO_PROPOSAL / Provider / Proposal / Commit / Store`；
- 结构化日志仍保留内部结果类别，未改变 Provider、Validator、Proposal 或 Commit 合同。

## 自动证据

- Plugin：`343/343` PASS，0 failed，0 skipped；
- Plugin typecheck/build：PASS；
- 根级 `./scripts/check.sh`：PASS；
- 稳定规则：`145`；
- acceptance rehearsal：`differences=[]`；
- 既有 npm audit 仍为 4 项（3 high / 1 critical），本 Slice 未使用破坏性 force fix。

## 真实 Desktop / Provider

1. 构建并加载精确提交 `06b8762933f8`；
2. 完整 Force Reload 后重新打开脱敏专用页面；
3. 从普通来源 Block 菜单进入“Task Copilot：处理这条内容”；
4. 真实 Provider 一次请求返回 abstention：
   “当前 Block 内容仅为脱敏占位符，无实际语义，无法提取可正式化的对象”；
5. 前台显示：
   “这条内容暂时不需要整理。当前 Block 内容仅为脱敏占位符，无实际语义，无法提取可正式化的对象。”；
6. 没有 Validator rejection、没有自动重试、没有 Proposal/Commit/正文或正式状态写入。

## 复杂度

- 新增正式状态：`0`
- 新增 Runtime：`0`
- 新增恢复分支：`0`
- 新增 Skill / Prompt / Validator 版本：`0`
- 新增 Partial：`0`
- 前台减少 5 组管线词，内部 authority 与审计合同不变。

## CURRENT 截图

- `../current-ui/screenshots/p0-k-09-analysis-no-proposal-user-language-current-dark-06b8762.png`
