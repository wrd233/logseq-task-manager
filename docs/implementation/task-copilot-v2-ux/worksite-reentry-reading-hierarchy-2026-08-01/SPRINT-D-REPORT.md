# Sprint D Report: Now Shell Density & Focus Hierarchy

> 2026-08-01；基于 Sprint C 提交 `5ef0040`。

## 状态

```text
WRH-P2-02: DESKTOP_BEHAVIOR_PASS（视觉待 reviewer）
WRH-P2-01: PARTIAL（Focus 短预览 + 层级已实现；视觉待 reviewer）
```

## 实现

- 正常系统可用状态不再是彩色 Banner：`.agent-state` 改为透明背景 + muted 单行文本
  （Desktop computed：background rgba(0,0,0,0)、color muted）；异常/受限状态仍保留
  现有 disabled 语义；
- “筛选与排列”折叠态去框化：默认无边框无背景、12px muted、weight 500；展开后恢复
  卡片式面板（`[open]` 规则），不删除任何入口；
- 保留：整理当前页、关闭、四个主导航、Focus 短预览、其他卡片折叠、查看其余 N 项。

## 自动检查

- 新增测试：agent-state/controls 样式断言 + Now shell 全部入口可达断言；
- Plugin 433/433 PASS；根级 `./scripts/check.sh` PASS（exit 0）。

## Desktop 证据

- `tmp/runtime/worksite-reentry-reading-hierarchy/current/sprint-d/`：
  `01-now-light-1000`（默认折叠态）、`13b-now-controls-open-light-1000`（展开态）、
  `metrics-1000.json`；
- CDP 实测：agent-state transparent/muted；controls border 0；summary 12px muted 500。

## 已知限制

- 未做陌生用户研究；视觉 reviewer 未执行。
