# Specification Baseline

## 权威来源

- 规范：`references/个人事务运行系统-视觉阅读版.pdf`
- 标题：个人事务运行系统：语义、工作流、Agent 与 Logseq 插件一体化设计报告
- 版本：视觉阅读版 v1.0，基于规范基线 v0.9.0
- 页数：142
- SHA-256：`77b7e614db19d9353739b329bc970abafd9f05976c8a357ac61a78ab60c70625`
- Goal：`docs/goal/MVP_GOAL.md`

PDF 原则和稳定规则 ID 是领域语义权威。Capability Lab 只提供 SDK/运行形态证据，不能改写对象、关系、状态、权威或提交语义。

## 读取证据

2026-07-17 首次运行完成：

- 完整文本抽取与 1-25 章逐章阅读；
- 145 条稳定规则索引核对；
- 封面、目录、规则概览及 01、03-05、07-19、21、24、附录等 25 个代表页渲染抽检；
- 确认图示与文本的约束链一致，未发现排版导致的语义歧义。

## 本轮适用解释

规则处置只有三类：

- `AUTOMATED`：实现和自动证据已存在；
- `AUTOMATED_RUNTIME_PENDING`：实现和自动证据已存在，但真实 Logseq Desktop 行为必须集中验证；
- `DEFERRED_NON_GOAL`：MVP 明确预留或非目标，由 ADR-0004 约束，不能被实现成半套隐性语义。

完整清单由 `docs/mvp/rules.json` 和 `docs/mvp/RULE_COVERAGE.md` 保存并自动校验。
