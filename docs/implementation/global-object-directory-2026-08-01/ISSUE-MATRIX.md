# Issue Matrix — 当前“正式事项”与 Goal 差距

> 证据均来自 Phase 0 基线（`BASELINE.md` 与 `tmp/runtime/global-object-directory/baseline/`）。
> 状态：OPEN = 待实现；`SPRINT-x` 为归属实施分段。

| ID | 现象 / 证据 | 用户风险 | Goal 要求 | 归属 | 状态 |
|---|---|---|---|---|---|
| GOD-001 | 入口名“正式事项与创建”位于“项目”区，用户易误以为只管理 Project | 找不到 Task/MiniProject/Decision/Output 全局入口 | 用户层名称“全部事项”或语义等价，说明覆盖所有正式记录 | Sprint A | OPEN |
| GOD-002 | 每行平铺取消/完成/梳理/升级/编辑/调整等按钮，51 个可见按钮 | 按钮墙、纵向浏览成本高、误操作风险 | 默认不铺开全部操作；次级操作进入 overflow/展开 | Sprint A/D | OPEN |
| GOD-003 | 无标题搜索 | 记得部分标题的旧对象无法快速找到 | 标题搜索（防抖、清除、空结果、中文/大小写/特殊字符、与筛选组合） | Sprint B | OPEN |
| GOD-004 | 无“全部/当前关注/在 Now”注意力筛选 | 无法稳定只看关注或 Now 对象 | 高频注意力筛选，Focus 用正式 FocusSelection | Sprint B/C | OPEN |
| GOD-005 | 无类型/Lifecycle/Condition 筛选 | 无法盘点“进行中的项目”或已完成/取消 | 类型、Lifecycle、Condition 筛选；关闭对象不暗示当前 Condition | Sprint B | OPEN |
| GOD-006 | 无稳定排序 | 无法按更新时间/标题/期限组织 | 至少一种稳定默认排序 + 用户可调整 | Sprint B | OPEN |
| GOD-007 | 无结果计数、清除筛选、加载/失败 scoped state | 用户不知道对象为何消失、状态不可信 | 当前条件/计数清楚；空结果中性；加载与失败 scoped | Sprint B | OPEN |
| GOD-008 | 列表无“打开原文”；只有 Now 卡与 Project 卡有 | 旧对象必须先加入 Now 才能回原文 | 每个有来源对象可直接打开原文，复用 Durable Origin；无来源时诚实 fallback | Sprint A | OPEN |
| GOD-009 | 行内无条件区分 Lifecycle 与 Condition；代码对所有 lifecycle 都渲染 Condition | 关闭对象显示“进行中/可以行动”误导 | OPEN 显示 Condition；非 OPEN 默认只显示 Lifecycle；历史 Condition 只进技术层 | Sprint A | OPEN |
| GOD-010 | 列表无关注标记/加入/移出入口；现有入口只在 Now/Re-entry/Block 右键 | 不在 Now 的旧对象无法主动关注 | 目录内加入/移出关注；关注筛选；不改 Lifecycle/Condition | Sprint C | OPEN |
| GOD-011 | 列表无 Now 暗示（分区） | 无法区分“正在 Now / 接下来 / 等待” | 低权重 Now 标记与分区；不写回领域 | Sprint C | OPEN |
| GOD-012 | 无归档 UI（领域已支持 COMPLETED/CANCELLED→ARCHIVED） | 已完成/已取消对象无法归档 | 若合同完整，在次级操作提供归档；仍走 Proposal/Review | Sprint D | OPEN |
| GOD-013 | Service 无 `GET /focus` 只读端点；Plugin 只能经 `/now-work` 推断 OPEN focus | “当前关注”筛选不能覆盖正式 FocusSelection 全量 | 新增只读 `GET /focus` + client 方法；不改变写入路径 | Sprint C | OPEN |
| GOD-014 | 4px 横向溢出（1000/760/1440 均测得） | 横向滚动与裁切风险 | 760px 无横向滚动；不依赖宽表格 | Sprint E | OPEN |
| GOD-015 | 新控件（搜索/筛选/排序/overflow/标记）无键盘/AX/对比度专项证据 | 可访问性风险 | 键盘顺序、ARIA 状态、focus ring、对比度、无重复 ID | Sprint E | OPEN |
| GOD-016 | 50+/100/500 对象规模无性能证据 | 目录在规模下卡顿/疲劳 | 性能报告（渲染/搜索/筛选/排序/DOM 行数） | Sprint E | OPEN |

## 关闭规则

- 每项关闭必须同时有：代码路径、自动测试名、失败路径、机器证据（Desktop 适用时）、文档；
- 视觉类证据只能由独立视觉 reviewer 签发，`STRUCTURAL_REVIEW_PASS` 不等于 `VISUAL_GATE_PASS`；
- 不因“当前数据没有关闭对象”而跳过非 OPEN Condition 合同——用单元测试与 fixture 覆盖。
