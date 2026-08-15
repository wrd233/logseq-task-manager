# Object Lens / Logseq UI 实验经验

> **本文性质：研究材料与经验参考，不是 UI Design Spec，不是产品规范，也不是任何冻结的决定。**
> 本文记录 `experiment/object-lens-cognitive-lab` 分支上 Object Lens / Logseq UI 原型实验得到的证据与判断，
> 供未来重新设计 UI 时参考。除明确标注为“vNext 既有权威约束”的部分外，本文不冻结任何具体 UI 形态、
> 布局、模式、尺寸、颜色或视觉语言。
>
> 后续 Object Lens 允许完全重新设计。Card、Semantic Map、Re-entry Flow、Peek / Focus / Review、
> Signal Band 等都只是曾经尝试过的研究材料；未来设计应回到 vNext 产品与治理基线重新推导。

## 1. 实验事实背景

- 基线与分支：实验从 `vnext == origin/vnext == ee31d4f` 分出，分支为
  `experiment/object-lens-cognitive-lab`（本地分支，无 upstream，从未 push）。
  完整实验代码与分阶段报告仍留在该分支，**没有、也不应随本文进入 vnext**。
- 实验分为四个连续阶段：
  1. **技术 Spike**：验证 Logseq 0.10.15 中正文内嵌渲染的可行路线（Macro Renderer vs Block Renderer Slot），
     以及从 Kernel 只读投影到 UI 的可行性。
  2. **Round 2 认知模型**：把 UI 从“字段卡”改成“认知角色 + 投影策略”，并用 V0–V3 四种视觉变体比较。
  3. **Interaction Lab**：一个真实 Logseq 合成页面，验证 Source / Semantic / Derived 三种交互闭环与缩放。
  4. **dsh 接管设计**：另一个独立页面，验证“一个主导问题 + 多条次要信号带”的 Re-entry Signal Lens（D4）。
- 全部 UI 代码在 `apps/logseq-plugin/src/prototypes/object-lens/`，全部 UI 测试在
  `apps/logseq-plugin/tests/object-lens*.test.ts`，全部实验报告在 `docs/prototypes/`；
  截图、evidence JSON、评审包在 gitignored `tmp/` 与嵌套 `logseq/`。这些是研究制品，不是产品实现。

### 1.1 各范式想解决的问题

| 实验 | 试图回答的问题 | 验证到什么程度 |
| --- | --- | --- |
| Macro Renderer | 显式锚点能否稳定承载多实例、切页、reload、离线 | 真机全链路验证；结论稳定 |
| Block Renderer Slot | 能否 0 污染自动注入、不写 Graph | 真机验证可行但风险明确；保留为实验路线 |
| V0 Card Baseline | 字段结构化摘要作为控制组 | 纯 DOM 原型 + 几何测量 |
| V1 Centered Semantic Map | 空间方位表达 direction/blocker/now/related/exit | 宽屏成立；420px 空间语义退化 |
| V2 Re-entry Flow | direction→now→change→next 的重入顺序 | 各宽度最省高度、语义顺序稳定 |
| V3 State-Slice | 状态驱动空间权重（强调角色占主导切片） | 原型验证；未做真人对比 |
| Interaction Lab | 三种信息类别需要三种不同的闭环吗 | Source/Derived 真实跑通；Semantic 仅为 MOCK |
| dsh D4 Signal Band | “一个主导问题 + 次要信号”是否够重入 | 真机页面全部面板可交互；未获真人判断 |

## 2. 跨 UI 形态仍然成立的验证事实

以下结论来自真实 Logseq Desktop 0.10.15 会话、代码与测试，不依赖未来 UI 具体长什么样。

### 2.1 挂载与宿主

- **Macro Renderer 是当前最稳的正文内嵌入口**：每个 `{{renderer ...}}` 是显式锚点；
  slot 每次页面渲染都会重建，但回调可靠；同页多实例、切页返回、plugin reload 后的 owner 属性清扫均验证通过。
- Macro 的代价是 Graph 中一行 `{{renderer ...}}`；这个“污染”是显式、可控的。
- **Block Renderer Slot 是内容替换型，不是追加型**：注册后 root block 原文不会自动显示，
  插件必须自行渲染原文；slot 重建时 payload 可能为空对象，需回退 `Editor.getBlock`；
  按 UUID 注册且没有增量发现订阅。因此 0 污染成立，但产品化风险显著高于 Macro。
- `provideUI` 的 key 必须 CSS-safe（含冒号会静默注入失败）；实例 key 要包含
  `mode + objectId + rootBlockUuid + slot` 而不是 slot id 本身。
- 插件 reload 不会清空宿主 DOM 中旧注入节点；需要 owner 属性清扫。
- Logseq 宿主 `data-on-click` 委托在大型注入面板上不可靠；插件应在自己注入的子树内挂事件委托，
  并做去抖（本实验测得重复 click 派发，需要 300ms 去抖）。
- `logseq.Editor.editBlock(uuid)` 在 0.10.15 不进入编辑态；真实编辑要 `scrollToBlockInPage` + 原生双击。
- 主题切换会重建宏 slot，prototype 面板状态回到默认值；正式 UI 必须把状态持久化与 slot 生命周期解耦。
- CSS 使用 Logseq variables 即可自动适配 Light/Dark，不需要硬编码颜色。

### 2.2 Kernel 只读投影与 UI 解耦

- 从 Kernel `showObject` 读 WorkObject + Primary Anchor，映射成 presentation model 的路径真实可用；
  Kernel offline 时安全降级为一行“暂不可用”不产生红错，也不阻塞正文工作。
- 一个纯投影层（raw inputs → projected model → HTML）让缺失字段省略、状态强调、深度过滤、related 缩放
  全部可单元测试；宿主逻辑只留 mount/事件/跳转，真机只验证宿主行为。这个分层是本实验性价比最高的工程决定。
- 展开/收起是 local UI state，不进 Kernel；这符合 vNext 权威基线“不用领域实体解决 UI 问题”的方向
  （`docs/vnext/01` 第 110 条，Projection / local UI state / Receipt / query 优先）。

## 3. 认知层结论（较高可信度）

这些判断来自实验观察与弱代理测量，不是真人验收；但跨布局范式的重复度较高。

### 3.1 Object Lens 的核心价值是降低重入成本

- 判断 Object Lens 好坏的标准不应是“信息是否一屏”或“字段是否完整”，而是：
  **下一次进入这个 WorkObject 时，能否快速恢复足够的认知并继续工作。**
- 实验中最一致的三条重入问题：
  1. 上次关注以后发生了什么（meaningful change）；
  2. 现在真实处于什么状态（state / blocker / exit）；
  3. 接下来最自然的推进方向是什么（now / next）。
  这三者是**认知职责**，不意味着未来 UI 必须做三个卡片、三个 section 或固定自上而下排列。

### 3.2 “完整可查”与“默认展示”必须分开

- Project 的完整 ownership tree 具有可查价值，但 20+ 子对象默认全展示会让 Lens 变成标签垃圾场。
- 实验验证的缩放规律：0/2/5 个相关对象直接展示即可；8/15/25 使用“状态分组 + 全局 4 chip + 每组溢出计数”，
  15 与 25 的渲染高度相同（396px），子对象数量不再线性放大视觉。
- “工作前沿”（Active / Waiting / Recently Changed，隐藏“其他”桶）比完整 ownership 列表更像重入信息；
  完整列表应该保留在可查询的路径里，而不是默认画面上。

### 3.3 Meaningful Changes 比 changelog 更有价值

- 1–3 条“有意义的近期变化”（自然语义，不含 Commit ID、不做 timeline）能回答“上次以后发生了什么”。
- 弱代理测量中，带 change 的 Review 深度可回答 6 问中的 5–6 问，阅读量约 63–135 字符；
  这**不是**真人速度证据，只说明信息组织本身能承载这些答案。
- changes → evidence → source 的追溯链在 prototype 中表现为可点击跳转到真实 source block；
  验证时必须核对最终 hash anchor，而不是只看面板出现。

### 3.4 状态强调改变“读题顺序”，而不是只改颜色

- ACTIONABLE 主导向 now、WAITING 主导向 blocker（含控制方/解除后）、接近完成主导向 exit、
  最近变化主导向 change；强调角色不在当前深度时回退 now 或 none（已修过这一缺陷）。
- 实验观察：把某个角色设为视觉主导（权重/主导带），比给状态加颜色 badge 更有助于“扫一眼”。
- 这仍是原型结论；主导问题是否真的比字段卡更快，仍需要真人评审，不能当作既定规范。

### 3.5 深度与稀疏

- Peek（一行 23px）/ Focus（少量关键角色）/ Review（完整重入）三档在原型中有效区分了信息预算。
- 稀疏原则：没有值的角色不生成占位；信息少的对象 Lens 自然变小（最小展开约 39px）。
  不制造“暂无 / 未知”是实验反复确认的正确行为。
- 同页多对象默认 Peek 显著降低页面拥挤感；14 个 Lens 同页收起态实测无干扰。

## 4. Source / Formal Semantic / Derived Cognition 的区别

这是本轮实验最重要的交互模型发现，且与 vNext 信息分层一致：**三者不是同一个 “Edit Mode”。**

| 类别 | 本质 | 本实验验证状态 |
| --- | --- | --- |
| Source | 回到 Logseq 原文 / 原生编辑 | **真实跑通**：Lens 点击 → `scrollToBlockInPage` → 原生双击进入 TEXTAREA → 编辑 → `DB.onBlockChanged` → Lens 刷新；测试后精确恢复 block |
| Formal Semantic | 通过受治理的 semantic operation 修改正式状态 | **未打通**。Lab 的 inline edit 是明确标注的 MOCK，只改 local UI state，不触达 Kernel / Proposal / Commit |
| Derived Cognition | 查看依据、质疑、讨论、重新计算 | **部分跑通**：查看依据 → Evidence 面板 → 跳转 synthetic source block 的锚点验证通过；质疑/讨论/重算未实现，Agent 面板只是 prompt 复制原型 |

必须继承的教训：

- 任何未来 UI 都不能把 Source / Semantic / Derived 统一抽象成一种编辑模式；它们的失败模式与权威边界不同。
- 未接 Kernel 的 Semantic mock 必须在 UI 上显式标注，不能伪装成真实正式变更。
- Source 闭环是实验中最自然的“回到工作表面”出口；未来 UI 即使完全换形态，也应有等价的回原文能力。
- Derived 认知应指向 Evidence，并与正式状态分开展示；本实验没有解决“可信度 / conflict 如何表达”，属于开放问题。

## 5. Mind-map / Semantic Map 得到了什么

- V1 语义图**不是**失败方案：在宽屏上空间方位表达 direction/blocker/now/related/exit 是成立的；
  但在 420px 退化为纵向堆叠，空间语义基本消失，且比 V2 重入流高 40–60px（420px：364 vs 306）。
- 本实验**没有证明**空间图真的提升理解速度，只证明“可以实现”和“窄屏退化”；
  “看起来像图”不等于“理解更快”。这是尚未证明项。
- 空间关系表达的价值应当在“关系本身需要被视觉化”时才使用；对于固定几个重入问题，
  线性/信号带布局在本实验中已够用。
- “使用 mind map”不应成为产品目标；未来完全可以用列表、对话、分栏或其他范式。不要因为 V1 存在而预设地图路线。

## 6. Renderer / Plugin 实现经验

- **入口选择**：Macro Renderer 适合“用户显式放置认知入口”和稳定产品化；Block Slot 适合“0 污染自动注入”的实验轨道，
  不默认启用。不要为了 0 污染把脆弱路线提前产品化。
- **中间投影模型价值大**：`LensViewModel` / `ProjectedLensModel` 把 Kernel 数据、synthetic fixture、offline 状态
  统一成 UI 输入；渲染器只认投影模型，不直接依赖 `logseq` 或 Kernel client。未来 UI 应继续保留这类纯投影层。
- **不需要大型图可视化库**：本实验只用纯 TS + HTML 字符串 + CSS + 少量 SVG connector 就完成了四种 Variant、
  多实例和缩放验证。是否引入图库应由未来交互需求决定，而不是默认继承“做图”。
- **回归维度**：多 Lens 实例、不同 frontier 规模（0/3/8/20/25 related）、420–900px 视口、Light/Dark、
  plugin reload、slot 重建都应作为 UI 回归维度保留；这些维度暴露了 V1 窄屏退化、主题重建、旧 DOM 残留等真实缺陷。
- **source click / navigation / real editing 边界**：scroll + 原生双击可进入编辑态；`editBlock` 不可靠；
  程序化跳转要验证最终 anchor。正式 UI 不应把这些宿主 workaround 当成可以长期依赖的 API 能力。
- **事件委托与清扫**：自己子树内委托 + owner 属性清扫 + 去抖，是 Logseq 注入 UI 的实用基线模式。
- **不要复制第二套 mount**：dsh 复用现有 mount，是正确做法；实验早期两套并行生命周期曾造成重复工作。

## 7. 不应从本实验机械继承的内容

以下内容是实验选择或原型形态，**不是约束**：

- 不要求沿用 V0 / V1 / V2 / V3 任一布局；
- 不要求沿用 Card、Semantic Map、Re-entry Flow、Signal Band 或任何具体布局；
- 不要求保留 Peek / Focus / Review 三档或它们的名称；
- 不要求 Object Lens 是卡片，也不要求它是 mind map；
- 不要求沿用当前 CSS、尺寸、间距、色彩、attention rail 或高度预算；
- 不要求沿用 prototype 中的信息排列、认知角色命名或 kind grammar；
- 不要求把 prototype 代码 merge 进 vnext，也不要求把 Macro/Block Slot 结论当成永久技术选型；
- 不要求继承 “V2 主候选” 或 “D4 候选” 等阶段性推荐——这些推荐明确等待用户判断，且从未通过真人验收；
- 不要求把实验中的 Synthetic fixture、Lab 页面、dsh 页面视为产品页面。

### 权威关系

- **实验代码 = research artifact；经验文档 = reference material；
  vNext architecture / product governance docs（`docs/vnext/`、`docs/architecture/`、`docs/adr/`）= authoritative baseline。**
- 本实验没有修改 Domain / Kernel / SQLite / Skill / Writing Language，也没有发现需要推翻任何正式决策的冲突。
  若未来发现本文任何观察与 vNext 权威文档冲突，以正式决策与后续 ADR 为准，并把本文视为“实验观察 / 潜在张力”。
- 尤其注意 vNext 基线 PART XXI 已规定一级入口是「现在 / 需要我判断 / 项目 / 更多」，
  并已明确 Project 是“稳定重入工作面”；Object Lens 未来无论做成什么，都应从这个基线重新推导，
  而不是从本文的 prototype 出发。

## 8. 值得未来继续研究的开放问题（少量）

- Object Lens 最适合的长期视觉语法是什么（文字摘要 / 语义图 / 信号带 / 对话式都可能）？
- re-entry 与 working mode 是否需要不同表现（Peek 与正在工作时的 Lens 可能不是同一种东西）？
- Meaningful Changes 与 Cognitive Baseline 如何进入正式 UI，而不重复 changelog？
- Active Frontier 在真实大 Project 下如何扩展；4-chip 上限是否长期成立？
- Derived Cognition 的可信度 / conflict / 质疑入口如何表达？
- 多 Object Lens 共存时的信息预算上限，以及 Lens 与 Agent 对话的低摩擦协作形态。
- Block Slot 的 0 污染路线何时成熟（payload 为空、内容替换、无增量订阅仍是上游风险）。

## 9. 研究材料位置（未进入 vnext）

- 代码：`apps/logseq-plugin/src/prototypes/object-lens/`（仅实验分支）
- 测试：`apps/logseq-plugin/tests/object-lens*.test.ts`（仅实验分支）
- 分阶段报告：`docs/prototypes/object-lens-*.md`、`dsh-*.md`（仅实验分支）
- 真机证据：gitignored `tmp/desktop/`、`tmp/round2/`、`tmp/dsh/`（screens / evidence JSON / review packages）

完整实验分支仍然保留：`experiment/object-lens-cognitive-lab`。需要更细证据时去那里读报告与代码，
不要凭本文一句话做产品决策。
