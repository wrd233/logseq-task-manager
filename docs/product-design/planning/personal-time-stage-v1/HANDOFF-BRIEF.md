# 个人主力工作台演进交接简报（`feat/personal-time-stage-v1`）

> 给下一轮执行会话（Antigravity）的完整上下文与行动指南。
> 创建日期：2026-11-21
> 当前分支：`feat/personal-time-stage-v1`（已基于 `codex/dsh-companion-closed-loop` 与 `codex/stage-live-canvas-v1` 干净合流并通过构建/测试门禁）

---

## 1. 唯一主线目标（Main Quest）

**打造一个「每天少操心、真正推进主线工作」的私人工作台。**

这不是对外发布的大而全效率平台，而是服务于用户本人日常深度知识工作的无断点外骨骼：
- 脑中闪念零摩擦留存（iPhone 快捷指令 + 科大讯飞语音 -> iCloud Drive -> Companion Inbox）；
- 顶层注意力不再靠机械词频硬聚，而是由外部 Agent 配合 `Attention Navigator` Skill 结合真实工作证据对话发掘、画布虚态提案、用户拍板凝固；
- 所有重要事物落进**四层纯语义有限时间容器**（季 -> 周 -> 日语义槽 -> 此刻专注），叠加 Apple 日历硬日程算出真实剩余空间，消除“漂浮在真空里的焦虑感”；
- 日常 85% 的时间依然安静留在 Logseq 原生笔记本里专心写作与推进，需要抬头看路或排期时再唤起悬浮活舞台。

---

## 2. 不可违背的产品与审美红线

1. **零 emoji、零花哨视觉**：所有 UI 文案、状态标识、Skill 提示语与交互反馈严禁使用 emoji；严格延续 `D-35` 安静工作笔记本风格，靠清晰的文字层级、留白和极低饱和度的色光/标签表达状态。
2. **纯语义时间容器为主，精确钟点为例外**：
   - 灵活工作只放进语义容器（本季 / 本周 / 上午·深潜、下午·推进、晚上·轻放）；
   - **绝不画 08:00–22:00 的刚性密格时间轴**；
   - 只有具备明确起止时间的事项（Apple 日历里的会议/约会/硬日程，或用户显式写入的单个「主线日历护盾块」）才展示精确钟点（例如 `14:00–15:30 团队周会`）。
3. **反焦虑、反虚假指标**：绝不显示虚构的“项目健康分”“自律打分”“完成率百分比”或血红逾期倒计时；未完成项次日不自动滚雪球挤爆今天，而是进入顶部的「昨日遗留托盘」等待轻处理。
4. **不膨胀 Formal Kernel**：`apps/kernel-service` 既有 `Project / MiniProject / Task` schema 保持冻结不动；时间容器、Area 四态、专注记录、iCloud Inbox 消费均属于本机中立 Companion 维护的轻量运营层。
5. **人做导演，Agent 做参谋**：严格保持三档边界（静默只读观察 -> 画布虚态 Ghost 提案 -> 用户确认后由虚化实落盘），绝不静默修改 Logseq 原文或越权替用户做决定；严格守住 `D-41 / D-47` 隐私与敏感文件黑名单拦截。

---

## 3. 已确认的交互设计定稿

### 3.1 悬浮活舞台三视角（统一抬头看路层）
- 顶部仅保留三档切换：**`季节星区 | 本周容器 | 今日容器`**，以及一个 **`向 Agent 讨论当前画面`** 入口；
- 右侧常驻 **`Inbox 浮带`**：专注执行或默认态折叠为极简计数（如 `Inbox · 5`），不闪烁催办；展开后支持悬停照亮归属、拖入左侧容器、批量交由 Agent 梳理，超过 14 天未触碰的碎片自动折入底部「已冷却」区支持一键归档（仍可搜索）。

### 3.2 四层嵌套纯语义时间容器
1. **季节容器（90 天 · 季节星区 L0）**：
   - 顶层硬控 **4–7 个 Area**，引入四态角色 `focusRole: "main" | "side" | "maintenance" | "parked"` 与轻度领域区分 `domain: "work" | "life"`：
     - **工作与个人成长为主**：`1 个主线（居中微光）` + `2–3 个支线`；
     - **生活领域一并纳入，但在样式上轻度区分**（低饱和边框/独立分区），多用于 `维护模式`（记录每周最低底线，静默不报焦虑）与 `搁置`。
   - 升级 `pulse.ts` 权重：**真实错配提示（宣称主线连续 7 天零推进而杂活很热闹）优先于单纯的最近活跃度**；Inbox 暖琥珀光仅在悬停或整理态高亮，平时不抢主线注意力。
2. **周容器（7 天 · 本周容器）**：
   - 默认承接本周真正承诺的 **3–5 个推进块**（Major Moves）；遇到 Apple 日历固定日程密集的低能量周，建议容量自动收窄到 1–3 块；
   - 右侧默认拉取本季主线/支线待选项，顶部一行极细展示周一至周日的 Apple 日历硬日程占用概览。
3. **日语义容器（当天 · 今日容器）**：
   - 三只按脑力质地划分的语义槽：
     - **`上午 · 深潜`**（建议容积 1 项，护住当天主线硬骨头）；
     - **`下午 · 推进`**（建议容积 1–2 项中轻度推进/沟通/Inbox 整理）；
     - **`晚上 · 轻放`**（建议容积 1 项阅读/个人事，显式允许留白）。
   - **满载温柔阻力**：往已满槽位拖入新项时不报错拦截，而在边缘给出克制提示（例如“上午深潜已满，替换当前主线、顺延至明天上午，还是叠加？”）。
   - **昨日遗留托盘**：未完成项次日停在顶部极细一行，提供「放入今日 / 退回本周 / 撤掉」；连续 3 次落入遗留的项交给 Agent 按“不清晰 / 有抗拒 / 不重要”拆因。
4. **此刻微容器（Logseq 执行态）**：
   - 从今日容器点击「开始专注」，复用 `macos-focus.ts` 精确前置 Logseq 实例并定位对应工作，悬浮舞台退回边缘胶囊；
   - Logseq 顶栏仅显示一行安静的正向计时状态（非倒计时）：`上午 · 主线：xxx · 已进行 28m  [ 暂停 ]  [ 结束 ]  [ 拉远 ]`；点击结束时可选留一句停点便条，同时累计该主线本周真实投入时长。

### 3.3 Apple 日历三层轻协同（用户当前未重度用日历，循序渐进）
1. **只读硬日程（默认核心）**：读取 macOS 原生「日历」中具备明确起止时间的固定安排，叠入周/日语义槽中标出真实剩余空间；
2. **单键写入主线护盾块**：用户可对当天最怕被打断的 1 个「上午·深潜」块点一次「写入日历护盾」，同步至 iPhone 锁屏做温和提醒；
3. **反向日历足迹（可选）**：专注结束后的真实时间段可静默写入 Apple 日历独立子日历（如 `Task Copilot 足迹`，平时可折叠），供周日复盘做“宣称主线 vs 真实投入”的客观对照。

### 3.4 长久未碰 / 断档重启的「类 PPT 极简翻页小交互」
- 同时覆盖「单任务超过 7 天未打开回来继续」与「工作台超过 3 天断档后的久别重逢」；
- 纯白纸黑字、最多 **3 页**（无外部变化自动压缩为 2 页）、每页不超过 3 行主文，`空格 / 方向键` 顺滑翻页、`Esc` 随时跳过：
  - 第 1 页：上次离开时的意图与停点（附直达原块链接）；
  - 第 2 页：期间发生的客观变化（新增的相关手机语音碎片、关联目录文件改动、前置状态更新）；
  - 第 3 页：此刻 10–15 分钟能立刻动手的最小切口 + 主按钮「进入现场，开始专注」+ 合法退路「不再重要 -> 移入搁置/维护」。

### 3.5 三大日常节拍（结合语音捕获与社区实践）
- **早上开局（<= 2 分钟）**：看一眼今日 Apple 日历硬日程 -> 10 秒处理昨日遗留 -> 选 1 件事放进「上午·深潜」 -> 点开始专注进 Logseq（早上不整理 Inbox）。
- **晚上 / 下班路上收尾（<= 3 分钟）**：离开电脑前 20 秒点结束留 1 句停点；下班路上/散步时用 iPhone 快捷指令「随口记」（科大讯飞语音转文字）一口气倾倒今天感受与明天挂念，进 `TaskCopilotInbox` 卸压。
- **周日复盘（10–15 分钟）**：由 `Attention Navigator` Skill 扛掉 80% 整理税——看 5 行客观事实镜 -> 批量分流本周语音 Inbox -> 锋利点破主线错配 -> 结合下周 Apple 日历空档虚态装盒并预置周一上午 1 件事 -> 凝固结束。

---

## 4. 仓库基线、代码落点与环境前置条件

### 4.1 分支与决策编号基线
- `main` (`409c793e`)：保持干净，已与 `origin/main` 同步。
- `codex/dsh-companion-closed-loop` (`236210b1`)：DSH 隐私闭环 + 写回 FLIP + `macos-focus.ts`（`D-47 ~ D-49`）。
- `codex/stage-live-canvas-v1` (`925cf10b`)：初版全局态势与共视活画布（已合流并在统一分支中顺延为 `D-50 ~ D-54`）。
- **`feat/personal-time-stage-v1`（当前 HEAD，已合流并全绿）**：所有后续实施均在此分支上推进。

### 4.2 关键代码地图
- Stage 核心引擎：`packages/stage-runtime/src/{types.ts, engine.ts, pulse.ts, renderer.ts}`
- Companion 中枢与 MCP：`apps/task-copilot-cli/src/{workspace-server.ts, stage-hub.ts, mcp-handler.ts, macos-focus.ts}`
- 现有语义时段规划（待上收到中立 Companion 复用，勿从零重写）：`apps/dsh-plugin/src/{planner-model.mjs, planner-store.mjs, planner-host.mjs, planner.jsx}`
- 双宿主舞台壳体：`apps/dsh-plugin/src/stage/`、`apps/logseq-plugin/src/features/stage/`
- 现有 Skill 目录：`skills/`（已有 6 个旧 Formal Kernel Skill，新 Skill 建议落位 `skills/attention-navigator/SKILL.md`）
- 详细 Skill 产品规格见同目录：`docs/product-design/planning/personal-time-stage-v1/ATTENTION-NAVIGATOR-SKILL-SPEC.md`

### 4.3 本机环境与踩坑提醒（非常重要）
1. **Node 版本切换**：本机默认 `/opt/homebrew/Cellar/node/25.6.1/bin/node` 存在 `libsimdjson.29.dylib` 缺失问题；**执行任何测试/构建前务必设置**：
   ```sh
   export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
   ```
   （已验证 Node `v20.20.2` 下 `stage-runtime`、`task-copilot-cli`、`dsh-plugin`、`logseq-plugin` 全部测试、typecheck、boundaries 与双插件 build 全绿。）
2. **iPhone 语音捕获已实测可用 + macOS TCC 权限注意点**：
   - 用户 iPhone 已配好快捷指令「随口记」，写入路径为 iCloud Drive 的 `TaskCopilotInbox/yyyyMMdd-HHmmss.md`，Mac 对应路径为 `~/Library/Mobile Documents/com~apple~CloudDocs/TaskCopilotInbox/`。
   - **关键踩坑**：macOS TCC 会对未授权进程访问 `com~apple~CloudDocs` 返回 `EPERM (Operation not permitted)`。Companion 实现 iCloud Inbox 监听时，必须做到：
     - 支持可配置监听目录（默认指向 `TaskCopilotInbox`，也支持 env/配置覆盖以便测试与回退）；
     - 遇到 `EPERM` 时 Fail Open 不崩溃，在自检/状态接口明确给出可读的 macOS「隐私与安全性 -> 文件与文件夹」授权指引；
     - 消费后做好幂等去重与安全归档（避免重复导入，也不误删用户原始备份）。
3. **严禁误提交未跟踪目录**：仓库根目录存在 `_clone/` 和 `项目进展快照/`，每次 `git add` 必须显式指定文件路径，绝不要运行 `git add .` 或 `git add -A`。
4. **Git `pre-push` 守卫**：`.git/hooks/pre-push` 维护了用户显式批准推送的分支白名单；不要使用 `--no-verify`，推送新分支前需征得用户确认。

---

## 5. 推荐的三段短冲刺实施计划

每个 Sprint 保持精悍、可独立验证，且推进顺序严格围绕“最快在真实主力环境用起来”：

### Sprint 1：iCloud 语音入池 + 四态星区升级 + `Attention Navigator` Skill
- Companion 增加 `iCloud Drive/TaskCopilotInbox/` 增量监听消费（含 `EPERM` 友好诊断、幂等消费、14 天未动自动标记冷却态），复用既有 Inbox 结构并标来源 `ios-shortcut` / `flomo`；
- 升级 `packages/stage-runtime` 极简字段：`StageArea` 增加 `focusRole`（`main | side | maintenance | parked`）、`domain`（`work | life`）、`quarterGoal`、`antiGoal`、`weeklyMinimum`；调整 `pulse.ts`，突出“主线长期零推进错配”，收敛 Inbox 默认抢镜亮灯；
- 依据 `ATTENTION-NAVIGATOR-SKILL-SPEC.md` 落地 `skills/attention-navigator/SKILL.md` 及对应 MCP 工具说明，让用户立刻能用外部 Agent 跑通第一轮「先口述全景 -> 对照笔记补全 -> 活舞台虚态凝固」。

### Sprint 2：纯语义时间中心（季/周/日）+ Apple 日历三层协同 + Logseq 安静专注胶囊
- 将 `apps/dsh-plugin` 里的语义时段模型上收抽离到中立 Companion（复用 `planner-model.mjs` 逻辑），补齐「本周容器（3–5 块）」「今日三槽（上午·深潜 / 下午·推进 / 晚上·轻放）」「昨日遗留托盘（记录连续遗留次数）」「满载温柔阻力提示」，并暴露极简 `time_*` MCP 原语；
- 接入 macOS 原生 Apple 日历桥接（只读有明确起止时间的固定日程 -> 叠入周/日槽计算剩余容量；单键写入单个上午主线护盾块；可选专注结束后写入独立足迹子日历）；
- 在悬浮活舞台实现 `季节星区 | 本周容器 | 今日容器` 三视角平滑切换（零 emoji、克制排版）；
- 在 Logseq 顶栏实现安静的正向专注计时胶囊，点击今日容器「开始专注」经 `macos-focus.ts` 直达目标 Logseq 原文现场，结束时可选留 1 句停点并反哺本周真实投入时长。

### Sprint 3：类 PPT 极简翻页重启 + 主力真实环境接入
- 实现 2–3 页纯文字「类 PPT 翻页重启小交互」（单任务 >7 天未碰恢复 & 工作台 >3 天断档久别重逢，键盘翻页、`Esc` 跳过、无变化自动略过第 2 页）；
- 同步更新 `docs/product-design/modules/10-全局态势与共视活画布.md`、`07-个人规划.md` 与 `DECISION-REGISTER.md`；
- 输出一份极简的「真实主力 Logseq Graph 启用清单」（包含 Companion 自启、macOS iCloud/日历权限授权一步自检），正式进入 14 天主力 Dogfooding 周期。

---

## 6. 给下一轮 Antigravity 会话的开工检查清单

1. 先完整阅读本文件与同目录 `ATTENTION-NAVIGATOR-SKILL-SPEC.md`，确认当前分支为 `feat/personal-time-stage-v1`；
2. 动手写代码前，先用 5 行以内向用户确认是否直接按 **Sprint 1** 启动（或用户想先调整某个字段/优先级）；
3. 严格执行 Node 20 环境验证与零 emoji 审查；每完成一个 Sprint 交付实测结果与简洁说明，避免一次性铺开过大改动。
