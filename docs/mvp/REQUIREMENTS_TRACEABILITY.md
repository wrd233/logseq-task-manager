# Requirements Traceability

## 约束链

| 约束层 | 规范规则 | 主要实现 | 自动证据 | Desktop 证据 |
|---|---|---|---|---|
| 不可变原则 | PRI-001..015 | Domain/Application 深模块、克制 UI | 全套测试、边界检查 | 集中检查点 |
| 对象语义 | SEM-COMMON、SEM-TASK、SEM-MINI、SEM-PROJ、SEM-AREA、SEM-CAP | `packages/domain` | `domain.test.ts` | 对象抽屉 |
| 关系归属 | REL-OWN、REL-DEP、REL-PLC、REL-SRC、REL-GRAPH | 关系命令与循环/类型/深度校验 | `domain.test.ts` | Anchor 移动/页面观察 |
| 生命周期 | LIF-* | Phase 矩阵、Condition 证据、Signal 计算 | `domain.test.ts` | Phase/Waiting 操作 |
| 信息权威 | INF-* | 正文 Port、Domain Store、Event、投影分离 | 边界检查、持久化测试 | 正文关闭可读 |
| Anchor | MAP-* | 独立 object_id、Anchor hash、RuntimeShapeAdapter | Adapter 测试 | 移动/删除/重命名 |
| 审计回滚 | AUD-* | DomainEvent、before/after、逆向 Commit | Application 测试 | Commit/Undo UI |
| 捕获正式化 | CAP-* | Capture command、Inbox、手工/Demo 正式化 | Application 测试 | 当前块实测 |
| Proposal/Commit | COM-*、REV-* | 操作 DAG、部分接受、Saga、补偿 | 128 组组合、故障注入 | Review UI |
| 注意力/呈现 | VIEW-*、TXT-*、DISC-* | ViewModel + 纯 renderer | UI/Views 测试 | 主题、键盘、密度 |
| Agent 边界 | AGT-* | No Agent/Demo Provider + Application 命令 | Application/UI 测试 | 设置切换 |
| 架构 | ARC-* | workspace 依赖方向、Ports/Adapters | `check-mvp-boundaries.mjs` | 不适用 |
| 插件 | PLG-* | Toolbar/Command/Slash/Main UI | build/dist/UI test | 插件加载 |
| 恢复 | SYN-* | 冲突停写、双槽、恢复包、启动扫描 | persistence/application/rehearsal | FileStorage 重载 |

## 十项 MVP 门槛

`docs/goal/MVP_ACCEPTANCE_MATRIX.md` 保存门槛级状态。自动通过不替代 Desktop 证据；Desktop 未执行前只能达到 `AUTOMATION_COMPLETE`，不能宣称 `MVP_SUCCESS`。

## 延期规则

`docs/mvp/rules.json` 中的 `deferredNonGoal` 必须同时出现在 ADR-0004。若要启用其中任一能力，必须先接受新 ADR、补全命令/校验/审计/测试，不得只增加 UI 按钮。
