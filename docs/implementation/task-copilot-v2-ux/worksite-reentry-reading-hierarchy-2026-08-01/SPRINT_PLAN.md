# Sprint A Plan: Now Card Reading Path

> Goal §6 合同；plan-design-review 审查对象（2026-08-01）。

## 1. 要解决的问题

- WRH-P1-01：标题下方纵向堆叠状态、查看依据、主按钮、更多操作，打断连续扫描；
- WRH-P1-02：更多操作 disclosure 占据主阅读路径；
- WRH-P1-07：760px 下按钮继续纵向堆叠，标题/操作语义分区不稳定；
- WRH-P1-08：overflow menu 的 AX 名称、Esc、外部点击、焦点返回缺失。

## 2. 目标结构（宽屏 ≥761px）

```text
┌──────────────────────────────────────────────────────────┐
│ 类型／来源                                     [⋯]       │
│                                                          │
│ 事项标题（完整主列宽度）                    [唯一主动作]   │
│ 当前状态（正常弱化，异常保留语义色）                       │
│ [Sprint B: 工作记录]                                      │
│ 为什么现在显示它（内容区末尾，默认折叠）                   │
└──────────────────────────────────────────────────────────┘
```

DOM 语义分区：

```html
<article class="card compact now-card ...">
  <div class="now-card-content">
    <div class="eyebrow">任务 · 来自当前关注</div>
    <h3>标题</h3>
    <div class="now-card-status">…状态…</div>
    <details class="now-explanation"><summary>为什么现在显示它</summary>…</details>
  </div>
  <div class="now-card-actions">
    <details class="more-actions"><summary aria-label="更多操作">⋯</summary>…</details>
    <div class="actions"><button class="primary">唯一主动作</button></div>
  </div>
</article>
```

- 主阅读列只含内容（eyebrow→标题→状态→解释）；Action Interruption Count = 0 控件；
- 操作列固定宽度 `--now-action-column`，不随按钮文字变化抖动；
- `⋯` summary 带 `aria-label="更多操作"`；expanded 状态由 toggle 事件同步 `aria-expanded`；
- Esc 关闭并聚焦回 summary；点击菜单外部关闭；
- 每卡保持恰好 1 个 primary；更新状态/期限/关注/排序全部留在更多菜单。

## 3. 目标结构（窄栏 ≤760px）

```text
类型／来源                                     [⋯]
事项标题（完整宽度）
当前状态
[Sprint B: 工作记录]
为什么现在显示它                   [唯一主动作]
```

- 标题不被按钮压缩；`⋯` 绝对定位于卡片右上稳定角落；
- primary 进入卡片 footer（`now-card-actions`），不再位于标题正下方；
- 无横向溢出；320% 文本缩放降级为纵向但保持内容→footer 语义。

## 4. 行为合同

1. 打开/关闭更多菜单：鼠标点击、键盘 Enter/Space、Esc、点击外部；
2. 关闭菜单（Esc）后焦点回到触发 summary；
3. summary AX 名称为“更多操作”（aria-label），不是无语义字符；
4. 展开状态同步 `aria-expanded`；
5. 解释入口“为什么现在显示它”默认折叠，位于内容区末尾，权重 muted；
6. 正常状态不再使用与标题同级的 `<strong>`；Recovery/PENDING 等真实异常保持强调；
7. 不新增第二套 UI 状态源；不写入 Store/Graph/SQLite。

## 5. 自动测试（新增/更新）

1. `renderNow`：每卡含 `.now-card-content` 与 `.now-card-actions`，content 在 actions 之前；
2. 每卡恰好 1 个 primary，且位于 actions 分区；
3. explanation summary 文案为“为什么现在显示它”；more summary 带 aria-label；
4. 正常 narration 状态无 `<strong>`；recovery 状态保留 strong；
5. CSS：`--now-action-column` 存在；宽屏 grid 两列；`@media (max-width:760px)` 块布局 +
   footer + 角落菜单；
6. 源码断言：Esc/外部点击/toggle aria-expanded 处理器存在；
7. 既有 407→新增后全量 Plugin 测试保持通过；根级 `./scripts/check.sh` PASS。

## 6. Desktop 与机器证据（Sprint A 后）

- 1000×720 Light/Dark：五张卡扫描、Focus 卡、长标题、overflow menu 打开；
- 760×720 Light/Dark：footer primary、角落 ⋯、无横向溢出；
- 每张附 visible-text / AX / interactive / ui-state / computed-style / route-data；
- 键盘 Esc 与焦点返回（真实 Desktop 操作记录）；
- 与 before（metrics-1000/760.json）对比：主阅读流控件数 3→0，primary 移入操作列。

## 7. plan-design-review 结果（7 passes，2026-08-01）

环境：AskUserQuestion 不可用 → prose 适配；designer binary 不可用 → 文本/ASCII 审查
（记录于 `SKILL-LOG.md`）。

| Pass | 初始 | 修复后 | 关键结论 |
|---|---|---|---|
| 1 Information Architecture | 5 | 9 | 内容区/操作区分离；固定操作列；解释入口后置 |
| 2 Interaction State Coverage | 6 | 9 | 菜单打开/关闭/Esc/外部点击/焦点返回；展开状态同步 |
| 3 User Journey & Emotional Arc | 6 | 8 | 首屏第二张卡提前进入视野；异常状态保留强调 |
| 4 AI Slop Risk | 8 | 9 | 不是通用卡片网格；保留既有 token/组件；无装饰性新增 |
| 5 Design System Alignment | 7 | 8 | 复用现有 `.card/.actions/--accent` token；不建新设计系统 |
| 6 Responsive & Accessibility | 5 | 9 | 760 footer + 角落菜单；AX 名称/键盘/DOM 顺序 |
| 7 Unresolved Decisions | 2 resolved, 1 deferred | — | 状态强弱的完整语义预算转 Sprint C；工作记录转 Sprint B |

总体：6/10 → 9/10（无视觉执行边界：视觉权重仍由独立 reviewer 最终判断）。

## 8. 非目标（本轮不实现）

- Worksite Preview（Sprint B）；
- 字重/颜色完整预算与 token 体系（Sprint C）；
- Now Shell 密度（Sprint D）；
- Objects 默认层简化（Sprint E）；
- Active Surface 宿主背景与时间/微文案全集（Sprint F）。
