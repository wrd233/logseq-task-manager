# Sprint E Report: Objects Workspace Simplification

> 2026-08-01；基于 Sprint D 提交 `bd8496f`。

## 状态

```text
WRH-P2-03: DESKTOP_BEHAVIOR_PASS（视觉待 reviewer）
```

## 实现

- 默认层只展示“正式事项”列表（对象/状态/生命周期/条件 + 每行低频操作）；
- 新建领域、新建项目、关联两个事项移入折叠的“整理结构（创建领域、项目与关联）”；
- 所属关系与相关内容列表移入折叠的“查看所属与相关内容（N 条）”；
- 空列表时“整理结构”默认展开，保留唯一创建入口；
- 不删除任何能力；不重新设计 Project/MiniProject 领域模型。

## 自动检查

- 新增测试：默认层先渲染正式事项、创建器在 structure details 内、context details
  存在、空态展开创建区；
- Plugin 435/435 PASS；根级 `./scripts/check.sh` PASS（exit 0）。

## Desktop 证据

- `tmp/runtime/worksite-reentry-reading-hierarchy/current/sprint-e/`：
  `17-objects-dark-1000`、`18-objects-light-1000`（默认层：新建领域/新建项目/
  关联两个事项不可见）、`18b-objects-advanced-light-1000`（展开后可见）。

## 已知限制

- 视觉 reviewer 未执行；未做陌生用户研究。
