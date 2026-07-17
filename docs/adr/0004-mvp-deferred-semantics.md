# ADR-0004：MVP 延期语义与非目标

- 状态：accepted
- 日期：2026-07-17
- 影响规则：EXT-*、INF-EVT-002、MIG-*、REL-OUT-001、REV-FAT-003、SEM-DEC-001、SEM-PROJ-002、SEM-RES-001、SKL-*、SYN-CON-003、VIEW-CUS-*

## 决策

本次 MVP 不实现对象迁移/拆分/合并、专属 Decision/Output/Resource 工作流、Agent Skill 系统、自定义 View DSL、文件工作区/Git/Zotero、长期拒绝偏好学习和 Agent 冲突合并草案。类型和接口可预留，但 UI 不提供会产生半套事实的入口。

## 原因

这些能力不属于 Goal 的十项门槛，或被 Goal 明确列为非目标/预留。仓促实现会扩大高影响写入面，并削弱核心 Capture、Review、Commit、Undo 和 Recovery 的可靠性。

## 启用门槛

任一延期能力进入产品前必须：接受新 ADR；补领域命令和稳定 rule_refs；补权限、审计、回滚/恢复；补黄金样例与故障测试；更新规则覆盖和 Desktop 清单。
