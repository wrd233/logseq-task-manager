# Issue Matrix（2026-08-01 基线）

来源：交接包 `09-ISSUE-MATRIX.csv`；状态以当前 HEAD `72aad27` 与机器证据为准。

| ID | P | Area | Problem | Target | Status | Evidence |
|---|---|---|---|---|---|---|
| WRH-P1-01 | P1 | Now Card | 标题下纵向状态/依据/主按钮/更多操作打断连续扫描 | 内容区与操作区分离；宽屏右侧主动作；窄栏 footer | DESKTOP_BEHAVIOR_PASS（视觉待 reviewer） | sprint-a metrics + bundles |
| WRH-P1-02 | P1 | Now Card | 更多操作 Disclosure 占据主阅读路径 | 稳定 overflow menu，键盘与焦点返回 | DESKTOP_BEHAVIOR_PASS | sprint-a/13 + Esc/外部点击证据 |
| WRH-P1-03 | P1 | Worksite Preview | Now 不呈现来源 Block 子级工作记录 | 只读有界预览、按需展开、打开正文 | DESKTOP_BEHAVIOR_PASS | sprint-b bundles + source-tree |
| WRH-P1-04 | P1 | Data Boundary | 预览可能复制到 SQLite 或形成第二编辑器 | UI projection；Graph 原文权威；无正式写入 | DESKTOP_BEHAVIOR_PASS（只读断言） | 控制器源码测试 |
| WRH-P1-05 | P1 | Performance | 多卡片 N+1 子树读取 | base-first、lazy、concurrency、cache | DESKTOP_BEHAVIOR_PASS | performance.json + 并发测试 |
| WRH-P1-06 | P1 | Visual Hierarchy | 对象/状态/上下文/解释/行动强调不稳定 | 五层语义角色、加粗和颜色预算 | DESKTOP_BEHAVIOR_PASS（视觉待 reviewer） | sprint-c bundles + computed styles |
| WRH-P1-07 | P1 | Responsive | 右侧动作可能压缩长标题 | 1000 两区，760 footer，语义一致 | DESKTOP_BEHAVIOR_PASS | sprint-a/02/04 |
| WRH-P1-08 | P1 | Accessibility | menu/disclosure/focus order 可能回归 | accessible name、Esc、focus return、DOM order | DESKTOP_BEHAVIOR_PASS | sprint-a bundles + 真实输入链 |
| WRH-P2-01 | P2 | Focus | Focus 项和其他项过于同质 | Focus 短预览；其他折叠；不夸张装饰 | PARTIAL（Focus 短预览已实现；视觉待 reviewer） | sprint-b/01/05/06 |
| WRH-P2-02 | P2 | Now Shell | Banner/Tab/筛选/卡片密度高 | 首屏突出重点项，系统结构降权 | DESKTOP_BEHAVIOR_PASS | sprint-d bundles + computed styles |
| WRH-P2-03 | P2 | Objects | 默认页面仍像对象管理后台 | 默认推进层；高级结构层 | DESKTOP_BEHAVIOR_PASS | sprint-e bundles |
| WRH-P2-04 | P2 | Active Surface | 宿主背景轻微语义竞争 | 背景 inert 且视觉降权 | DESKTOP_BEHAVIOR_PASS | sprint-f/19 |
| WRH-P3-01 | P3 | Microcopy | 状态/依据/时间可更用户化 | 可继续、为什么现在显示它、本地时间 | PARTIAL→CLOSED（核心项完成；剩余随使用观察） | sprint-f bundles + 单测 + sprint-g/21 |
| WRH-P3-02 | P3 | Research | 陌生用户对工作记录入口的理解未验证 | 新手发现性研究 | DEFERRED_CANDIDATE | 同交接包 |

## 收口规则

- `REPRODUCED_CURRENT` / `PLAN_SKILL_REVIEWED` / `IMPLEMENTED` /
  `AUTOMATED_NONVISUAL_PASS` / `DESKTOP_BEHAVIOR_PASS` / `VISUAL_GATE_READY` /
  `VISUAL_GATE_PASS` / `ACCEPTED`；
- 无视觉执行模型不得把 `VISUAL_GATE_READY` 写成 `VISUAL_GATE_PASS`。
