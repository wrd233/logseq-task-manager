# 正常连接状态去重 Desktop Gate

> 日期：2026-07-28
> 状态：`CURRENT`
> 精确构建：`eba1c541d3af`
> Logseq：0.10.15 / File Graph / 1000×720
> 插件外观：显式 Dark；宿主当前表面：Light
> 场景：脱敏普通 Block → Task Copilot → 真实 Provider abstain

## 问题

`06b8762` 已把普通 Block 分析结果改成用户语言，但最新截图仍同时显示：

1. 持久状态：“Copilot 可用 · 建议需审阅”；
2. 普通启动成功横幅：“Task Copilot 已自动连接当前知识库；正式能力可以使用。”

两者表达同一事实，要求用户重复阅读，没有提供新的判断或动作。

## 修改

- 正常启动与宿主 ready 自动恢复不再写入一次性成功横幅；
- 持久状态仍负责表达“当前可用、建议需审阅”；
- Graph switch 仍保留“已为当前知识库重新建立连接；没有复用上一知识库的数据”，因为它
  增加了 database authority 隔离事实，不属于重复信息；
- 受限、失败、中断和恢复提醒保持不变。

## 证据

- Plugin：`343/343` PASS，0 failed，0 skipped；
- Plugin typecheck/build：PASS；
- 根级 `./scripts/check.sh`：PASS；
- 稳定规则：`145`；
- acceptance rehearsal：`differences=[]`；
- 精确构建 `eba1c541d3af` 完整 Force Reload；
- 真实 Provider 一次请求返回 abstain，前台只显示一条无需整理结论；
- 无 Validator rejection、无自动重试、无正式写入。

## 复杂度

- 新增正式状态 / Runtime / Recovery / Skill / Prompt / Validator：`0`
- 删除重复前台结论：`1`
- 新增 Partial：`0`
- 旧 `p0-k-09` 业务语言事实仍成立，但其含重复成功横幅的画面由本次证据接管。

## CURRENT 截图

- `../current-ui/screenshots/p0-k-10-analysis-single-status-current-dark-eba1c54.png`
