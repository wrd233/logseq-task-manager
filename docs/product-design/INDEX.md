# Task Copilot 文档导航

## 第一组：产品总览与原则

- [`01-产品总览.md`](01-产品总览.md)：产品定位、系统角色、三个工作尺度、共同原则、核心用户路径和范围。
- [`SOURCE-AND-STATUS.md`](SOURCE-AND-STATUS.md)：如何区分用户原话、当前倾向、代码事实、设计建议和未决项。
- [`DECISION-REGISTER.md`](DECISION-REGISTER.md)：当前工作基线与仍待明确的具体边界。

## 第二组：模块需求

- [`modules/01-Capture与Inbox.md`](modules/01-Capture与Inbox.md)
- [`modules/02-DSH工作现场.md`](modules/02-DSH工作现场.md)
- [`modules/03-工作接续与收尾.md`](modules/03-工作接续与收尾.md)
- [`modules/04-工作结构与编排.md`](modules/04-工作结构与编排.md)
- [`modules/05-变更与正式操作.md`](modules/05-变更与正式操作.md)
- [`modules/06-工作证据与历史.md`](modules/06-工作证据与历史.md)
- [`modules/07-个人规划.md`](modules/07-个人规划.md)
- [`modules/08-AI线索与有限领航.md`](modules/08-AI线索与有限领航.md)
- [`modules/09-视觉与主题.md`](modules/09-视觉与主题.md)

## 第三组：跨模块设计

- [`architecture/01-跨模块设计.md`](architecture/01-跨模块设计.md)：共享概念、存储边界、DSH 内联交互、权限、正式操作与回执、结构图、Journal、返回契约、风险。

## 第四组：实施任务安排

- [`planning/01-总体实施安排.md`](planning/01-总体实施安排.md)：Codex 主代理与 DSH 前端子代理分工、两条并行主线、P0–P5 粗里程碑、验收与任务卡模板。
- [2026-10-21 代码基线核查](planning/00-代码基线核查-2026-10-21.md)：原检查与末节远端刷新、独立安装/回归证据和验证边界。
- [Capture / Inbox × 结构历史并行契约 v1](planning/02-并行开发契约.md)：已发布的最小类型、单一文件所有权、两分支独立启动与接线门槛。
- [后续 Goal A：Capture / Inbox](planning/goals/01-Capture-Inbox-Goal.md)：日常闭环与适合委派的前端子任务。
- [后续 Goal B：结构历史](planning/goals/02-结构历史-Goal.md)：真实来源树只读回放、覆盖限制与前端子任务。
- [Capture G2 与宿主接线计划](planning/03-Capture-G2与宿主接线计划.md)：单设备持久化方案的条件批准、上下文校验与等待 A 已提交模块后的整合顺序。
- [Capture 7b49d00e 独立审查](planning/04-Capture-7b49d00e审查.md)：固定提交的 Standards / Spec 六项复现与 G2 阻塞，区分模块测试和真实宿主证据。

## 来源与参考材料

- [来源类别、版本锚点与入库记录](sources/README.md)：原始反馈和完整研究上下文仅保留在本地，不作为仓库内部链接目标。
- [基线维护说明](README.md)：独立文档的权威范围、候选验收条款与合订本规则。

## 建议阅读顺序与后续实施前提

1. 读 `01-产品总览.md` 与 `DECISION-REGISTER.md`。
2. 读 Capture/Inbox、DSH 工作现场、接续收尾三个高频模块。
3. 读跨模块设计，确定最小共享契约和权限边界。
4. 读实施安排作为后续参考；只有获得单独开发授权后，才核查代码/SDK、确定接口与实施顺序，并按当时的授权范围委派。当前文档入库不启动这些任务。
5. 所有 `leaning` 和 `unanswered` 都保留原状态。文档成稿不等于用户已经最终接受全部细节。
