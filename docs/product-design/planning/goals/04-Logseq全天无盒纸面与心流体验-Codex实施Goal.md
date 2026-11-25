# 实施 Goal 04：Logseq 全天无盒纸面与心流体验（Codex 跨机推进包）

> 状态：已定稿可实施规格（2026-11-25 `/grill-me` + 多轮交互原型验收定稿）。
> 适用对象：在任意另一台开发机上执行的 Codex 主代理（不依赖原设计机的任何绝对路径或本地临时文件）。
> 设计总纲：[02-全天动线与产品表现设计.md](../../02-全天动线与产品表现设计.md)
> 决策基线：[DECISION-REGISTER.md](../../DECISION-REGISTER.md)（`D-50 ~ D-68`，本包核心落位 `D-64 ~ D-68`）
> 视觉与微交互唯一基准原型：[full-day-workbench-prototype.html](../../prototypes/full-day-workbench-prototype.html)（零外网 CDN 依赖，可直接用浏览器打开核对每一个间距、动效与交互细节）

---

## 1. 跨机开工前自检（不要假设环境）

开始写任何业务代码之前，必须先在当前机器核对以下基线，**不得依赖文档中历史 commit 或特定本机路径**：

1. **Node 与包管理**：仓库 `package.json` 要求 `node >= 20.19 < 21`（npm 10.8.2）。若本机默认 Node 不是 20.x，先切换至 Node 20.x（不要修改 `package.json` 的 `engines` 字段来迁就本机环境）。
2. **Git 基线与工作分支**：
   - 执行 `git status --short --branch`、`git fetch --prune origin`、`git log -n 5 --oneline` 确认当前分支与最新 `HEAD`。
   - 建议基于最新的 `feat/personal-time-stage-v1`（已含 `D-63` Phase A 与本实施文档）新建特性分支（例如 `feat/logseq-flow-paper-v1`），或在用户指定的当前开发分支上按 Milestone 分步提交。
   - **工作区防误提交铁律**：严禁使用 `git add .` 或 `git add -A`，每次提交仅显式指定自己修改/新增的文件路径；不覆盖已有未提交改动；不使用 `--no-verify` 或 `git push --force`。
3. **开工门禁基线检查**：
   ```sh
   node -v
   npm ci --no-audit --no-fund
   npm run typecheck
   npm run build
   ```
   若在未改代码前基线即报错，先记录真实报错再决策，不要顺手乱改锁文件或无关包。

---

## 2. 不可违背的产品红线与设计约束

实现全程必须严格对照 [02-全天动线与产品表现设计.md](../../02-全天动线与产品表现设计.md) 与离线原型 [full-day-workbench-prototype.html](../../prototypes/full-day-workbench-prototype.html)：

1. **无盒纸面（Zero-Box Paper）与零说教文案**：
   - 消灭「卡片套卡片」、厚重圆角砖块、泛滥装饰图标；靠大留白、字重对比与 1px 淡线组织层次；
   - **严禁**在 UI 里写解释产品理念的副标题/提醒语（如“建议 1 项主线 · 护住当天硬骨头”“足够小且清晰”“绝不画密格”“绝不改写正文”等）；改用容量微点、实/虚线和悬停柔光引导视线；
   - **严禁**任何 emoji、禁用象形箭头、红色未读角标、倒计时焦虑器、完成率/健康度分数。
2. **不膨胀 Formal Kernel**：
   - **禁止修改** `apps/kernel-service`、`packages/domain`、`packages/sqlite` 的 schema 或正式状态机；所有时间槽、心流态、自由随记索引与晚间脚印均属于 `stage-runtime` / Companion 轻量运营层与 Logseq 插件层。
3. **原生 Logseq 笔记共存，不做自动收尾**：
   - 切到普通读书笔记或随笔页时，工作态按钮自动隐退，100% 保持普通 Logseq 体验；
   - **取消 Logseq 内的「收尾」按钮**：绝不在 Logseq 正文里自动插入「收尾整理」横幅或自动生成对外汇报大卡片（事务收尾由用户在 DSH / Agent 对话中共同完成）；
   - 中文输入法（IME `composing`）期间严禁强行抢焦点或调 `editBlock`（复用 `apps/logseq-plugin/src/host/native-source-set.ts` 已有保护策略）。
4. **晚间回望室只留用户自己的想法**：
   - **严禁**在回望室做「AI 聊一聊」、选择题或自动写入 AI 总结观点；AI 默认完全闭嘴，仅在用户主动点「给 1 句简单提问」时临时展示 1 句直白大白话短问，绝不落盘进用户日记。
5. **不强行覆写用户自己的 Logseq 第三方主题**：
   - 我们自控的浮层与侧栏默认读取 `--ls-primary-background-color` / `--ls-primary-text-color` 融入宿主主题，并保留暖白宣纸 / 暗纸双套语义 token（可选开关）。

---

## 3. 精准代码地图与 4 个分阶段 Milestone

请严格按 **M1 -> M2 -> M3 -> M4** 顺序推进；每个 Milestone 完成后跑通对应单测、`typecheck`、`lint`、`build` 与 `check:boundaries`，做一次干净提交，再进入下一个 Milestone。

### Milestone 1：日程模块无盒纸面重塑 + `本周 | 今日 | 明日` 接力闭环

**目标**：把现有 `TimeEngine` / `TimeHub` / `stage-runtime` 日程视图升级为原型中的「无盒纸面 + `本周 | 今日 · 早间拍板 | 明日 · 前晚构思`」完整接力，不破坏既有 `季节星区`、`D-63` 三口袋与 `time_*` MCP 契约。

- **重点改动文件**：
  - `packages/stage-runtime/src/time-types.ts`
  - `packages/stage-runtime/src/time-model.ts`
  - `packages/stage-runtime/src/time-engine.ts`
  - `apps/task-copilot-cli/src/time-hub.ts`（确保读取 Apple 日历硬日程时覆盖到明天日期，跨周日时自动多读 1 天）
  - `packages/stage-runtime/src/renderer.ts`（重构 `renderWeekView` / `renderTodayView` 并新增明日构思视图样式与交互）
- **核心行为要求**：
  1. `TimeSnapshot` 扩展 `tomorrowDate: string` 与 `tomorrowSlots: SlotSnapshot[]`（复用 `dayItems` 中 `date === tomorrowDate` 的真实记录与明日硬日程），支持 `本周 -> 放今天 / 放明天`、`今日上午满载 -> 顺延明天`、`明日 -> 澄清承诺原话 / 项目构思加入明日候选并放入明日槽位` 的真实状态闭环；
  2. UI 严格对标原型 Tab 1（日程模块）：无盒纯纸双栏（左重右轻，右侧默认略降对比、悬停恢复清晰）、每个槽位右上用极简容量微点（`cap-dots`）替代文字提示、每条事项展示「标题 + 项目/简短背景上下文 + 粒度轻标（页/块/日记）」；
  3. **注意力引导微交互**：悬停右侧待办的 `上 / 下 / 晚` 时，左侧对应槽位轻柔亮起 2px 静蓝左边界；刚放入或刚澄清出的条目触发 1.5s 极淡柔光呼吸（`beacon-flash`）后归于平静；
  4. 今日（早间拍板态）右侧默认静音折叠承诺原话与上层项目方向，切到明日（前晚构思态）自然展开；
  5. 保留既有 `季节星区` 视图及 `time_*` MCP 接口向后兼容。
- **验证要求**：补齐 `packages/stage-runtime` 单元测试（覆盖 `tomorrowSlots` 投影、跨周日读取、`defer-tomorrow` 到明日槽位联动、`week -> today/tomorrow` 动作），全部测试与 `npm run build` 绿灯。

---

### Milestone 2：Logseq 笔记现场 — Block Zoom-in 回锚、600ms 心流隐身、逐段聚焦与「抬头换气」

**目标**：让用户从日程进入独立 Page 事务或只在块中的 Block 级事务时，直接落回上次停笔那一行并柔光微亮；开始敲字后 600ms 丝滑进入心流隐身与逐段台灯聚焦；专注期彻底藏起计时与工单小抄，仅在主动「抬头换气」或触顶时浮现。

- **重点改动与新增文件**：
  - `apps/logseq-plugin/src/features/stage/focus-capsule.ts`（改造现有常驻大胶囊）
  - 新增 `apps/logseq-plugin/src/features/stage/flow-mode.ts`（管理打字防抖心流隐身、逐段台灯聚焦 CSS 注入与块级柔光定位）
  - `apps/logseq-plugin/src/index.ts`（接线日程直达 Page / Block Zoom-in、停点回锚、普通笔记自动隐藏工作态控制）
  - `apps/logseq-plugin/src/host/native-editor.ts`（复核/复用 `editBlock` 与防中文 IME 抢焦能力）
- **核心行为要求**：
  1. **Page + Block 双粒度进入**：复用 `WorkRef(sourceKind: 'block' | 'page')`。当 `sourceKind === 'block'` 时，通过 `logseq.App.pushState("page", { name: rootUuid })` 进入 Logseq 原生 Block Zoom-in（保留原生面包屑一键退回父页）；独立页则打开页面并滚动定位至上次停笔子块（`lastBlockUuid`）；
  2. **精准回锚与柔光微亮**：跳转后在非中文输入法 `composing` 状态下等待目标 `[blockid="..."]` 挂载（有限短轮询 <= 600ms，失败安全降级），调用 `editBlock` 并挂 1.5s 柔和背景呼吸类 `.tc-beacon`；
  3. **600ms 打字自动隐身 + 逐段台灯聚焦**：
     - 监听 `window.top.document` 编辑键盘输入，约 1s 防抖后给 `body` 挂 `tc-in-flow`，以 `600ms` 淡隐 Logseq 顶栏（`.cp__header`）、左侧栏与专注细条；鼠标移回窗口顶沿或按 `Esc` 立即（`180ms`）平滑恢复；
     - 逐段聚焦开关（默认开，可一键关）：使用 Chromium `:has()` 选择器让非当前编辑的同级 `.ls-block` 柔和淡化至 `opacity: 0.32`，**必须精确排除包含当前编辑子块的祖先 `.ls-block`**，并提供安全降级不误隐藏正文；
  4. **专注期藏计时与小抄 + 「抬头换气」**：
     - 专注运行中顶栏只保留极细 2px 静蓝边线（不再常驻跳动分钟数与绿色小抄胶囊勾引余光）；
     - 点击「抬头换气」或悬停顶边展开轻条，才安静告知“已专注 X 分钟”与后台待清工单/小尾巴数；查看/划掉后自动把焦点柔光拉回刚才停笔的块；
  5. **双速暂停停点**：点暂停弹出极简单行输入（回车即保存停点并同步 `TimeHub` + 更新本页/本块顶部受控停点块；点「先走」零等待放行并允许后台异步补停点草稿）；
  6. **严禁**在 Logseq 内添加自动收尾按钮或自动生成汇报大横幅，退出专注依然 100% 无损恢复专注前左右侧栏与原页面（延续 `D-61`）。
- **验证要求**：补齐 `flow-mode` 状态机、防抖/IME 保护与 `focus-capsule` 单元测试；在独立 Logseq 沙箱（参考 `docs/rc/LOGSEQ_SANDBOX.md` 或 `npm run sandbox:prepare`）进行真机 DOM 验证（验证 Page/Block Zoom-in、顶栏点击穿透、打字隐身与鼠标恢复、嵌套块逐段聚焦不误暗父块）。

---

### Milestone 3：「自由随记」原生块 + `Ctrl+.` 不离眼盲写 + 单向防抖悬浮窗

**目标**：把自由随记彻底融进 Logseq 原生大纲块，不脱离笔记，零审批弹窗打扰。

- **新增与改动文件**：
  - 新增 `apps/logseq-plugin/src/features/stage/free-notes.ts`
  - `apps/logseq-plugin/src/index.ts`（注册命令面板与快捷键，支持可配置防冲突）
- **核心行为要求**：
  1. **不离眼盲写（`Ctrl+.` / `Cmd+.`）**：在 `window.top.document` 屏幕中上部唤出无框单行输入条，敲完回车立刻关闭（`Esc` 取消），自动通过 `logseq.Editor.insertBlock` 将内容作为新子块追加到当前页面或当前 Zoom-in 块下的「自由随记」父块下（若尚无该父块则自动在末尾静默创建），然后自动恢复原块光标与心流；
  2. **原生块级轻量操作**：在「自由随记」父块行尾提供极低存在感的悬停文字动作（不挡正文、不弹审批）：
     - **`标给 Agent`**：通过轻量块属性或受控标记（如 `agent-ready:: true` 或轻量索引记录）标记该块可供 Agent 后台/DSH 整理；
     - **`悬浮`**：在 `window.top.document` 打开一个可拖拽的 `position: fixed` 极简素纸浮窗，读取并编辑该「自由随记」下的子块内容；
  3. **防并发冲突的写回契约（重要）**：
     - 悬浮窗**严禁**做逐字双向实时 `updateBlock` 竞写（避免 Logseq 光标跳动与数据覆盖）；
     - 采用**单向防抖写回**：打开悬浮窗时加载最新子块快照，用户在悬浮窗内编辑停手 `500ms` 或点击「贴回页内 / 关闭」时，经统一串行写队列同步回页内「自由随记」子块，若期间页内原块已被外部改动则安全追加而不静默覆盖。
- **验证要求**：单测覆盖「自由随记」父块幂等查找/创建、盲写追加、防抖写回队列与并发改动保护，以及真实 Logseq 沙箱验收。

---

### Milestone 4：冷启动 3 页关键词高亮 + 晚间「安静回望室（纯自我手记与想法生长线）」

**目标**：把冷启动重启卡与晚间自我沉淀闭环按无盒纸面落地，保持全套风格逻辑绝对统一。

- **重点改动文件**：
  - `packages/stage-runtime/src/restart-deck.ts`（新增结构化关键词高亮片段支持，每页硬控 `<= 3` 个重点词）
  - `packages/stage-runtime/src/renderer.ts`（无盒纯纸 3 页翻页、顶部 3 条细横杠进度、末页点击直达 `editBlock` 停笔行；新增「安静回望室」纯纸视角）
  - `apps/task-copilot-cli/src/stage-hub.ts` & `workspace-server.ts`（提供只读今日脚印聚合接口：汇总今日专注记录、iCloud 随口记反思流、工单清扫记录、今日 Journal 变更；提供想法生长条目追加写入与我的晚间手记写入今日 Journal 接口）
- **核心行为要求**：
  1. **冷启动 3 页纯纸恢复**：去阴影盒、顶部 3 条细横杠、每页仅对 2–3 个关键词做加粗与柔和着色（雾蓝标目标/直达入口，暖琥珀标唯一卡点），支持 `Space / ArrowLeft / ArrowRight / Esc`，末页直接定位并微亮上次停笔行；
  2. **安静回望室（100% 留我的想法）**：
     - 左侧极淡无框列出今天发生过的客观脚印，每条支持展开「原记录」与点击 **`顺着写`**（点击后该条脚印清晰高亮作伴、其余脚印淡退，光标直接落入右侧纯白手记区）；
     - 右侧大片无框空白手记纸面，点「存进今天日记」原样将用户自己的文字追加写入当日 Logseq Journal；
     - **严禁**任何 AI 聊一聊、选择题或 AI 总结落盘；仅在底角保留极淡按钮「写不出来时，给 1 句简单提问」，展示一句纯大白话客观短问（可换一句/关掉，永不写进日记）；
     - 下方衔接无框「正在养的想法」日期时间线，支持回车直接往后补写一条带今天日期的新体会，不催交 AI、不催拆事务。
- **验证要求**：单测覆盖今日脚印聚合（空数据/离线优雅降级）、手记写入幂等与只写用户原文、想法追加时间线与冷启动 3 页关键词上限约束；最后运行全仓 `npm run check`（或分项 `typecheck + lint + test + build + check:boundaries`）与隔离沙箱实机验收。

---

## 4. 交付物与汇报门槛

完成全部或阶段 Milestone 后，Codex 必须交付：
1. 实际分支名、共同基线 SHA 与每个 Milestone 的干净 commit 列表；
2. 变更文件清单及关键设计偏离/可逆默认说明；
3. 实际执行的命令与真实退出结果（`typecheck`、`lint`、`test`、`build`、`check:boundaries`）；
4. 真实 Logseq 隔离沙箱的逐项验收记录（明确标注哪些已实机验证、哪些受限于当前机器环境如 Apple 日历/iCloud TCC 权限或物理中文 IME 尚未实机验证，绝不假称通过）。

---

## 5. 一键发给另一台电脑 Codex 的完整开工提示词

> 将下方引用块内的内容直接复制发送给另一台电脑上的 Codex 即可启动推进。

```text
请作为主开发代理，在当前仓库中按规范分阶段实施 Task Copilot「Logseq 全天无盒纸面与心流体验」。

第一步：先完整阅读以下仓库内文档与离线原型，再核查当前代码基线（不要跳过阅读，也不要假设历史 SHA 或本机绝对路径）：
1. docs/product-design/02-全天动线与产品表现设计.md
2. docs/product-design/DECISION-REGISTER.md（重点 D-55 ~ D-68）
3. docs/product-design/planning/goals/04-Logseq全天无盒纸面与心流体验-Codex实施Goal.md
4. docs/product-design/prototypes/full-day-workbench-prototype.html（视觉层级、无盒排版、微交互与动效的唯一参考基准）

第二步：环境与分支自检：
- 确认当前 Node 版本满足 package.json 要求（>=20.19 <21），不要修改 package.json engines。
- 执行 git status / git branch / git log -n 5 核对当前工作树与基线；若处于 feat/personal-time-stage-v1 且工作树干净，请新建独立特性分支（如 feat/logseq-flow-paper-v1）推进；若已有用户指定分支则在其上推进。
- 先跑一遍基线 npm run typecheck 与 npm run build 确认仓库健康。

第三步：严格按 Goal 04 文档中的四个 Milestone 顺序落地（M1 日程模块无盒纸面与本周/今日/明日接力 -> M2 Logseq 笔记现场 Block Zoom-in 回锚、600ms 打字心流隐身、逐段聚焦与抬头换气 -> M3 自由随记原生块、Ctrl+. 盲写与单向防抖悬浮窗 -> M4 冷启动 3 页关键词高亮与晚间纯自我手记回望室）：
- 每个 Milestone 完成后都必须补齐单元测试，跑通受影响 workspace 的 typecheck、lint、test、build 与 check:boundaries，并用显式文件路径（严禁 git add . 或 git add -A）做一次干净 commit，汇报进度与验证证据后再进入下一个 Milestone。

硬性红线（全程严守）：
1. 严禁修改 apps/kernel-service、packages/domain、packages/sqlite。
2. 全 UI 严格执行无盒纸面（Zero-Box）：去卡片套卡片、去装饰图标、零说教副标题文案、零 emoji、零禁用象形箭头、零红点与倒计时焦虑。
3. Logseq 笔记现场取消自动收尾按钮，绝不自动往正文塞整理块或页首大汇报横幅（收尾留给 DSH/Agent 对话）；切普通笔记时自动隐藏工作态按钮；中文 IME composing 期间禁止抢焦点。
4. 自由随记悬浮窗采用单向防抖（500ms / 关闭写回）同步页内子块，不做逐字双向竞写，避免光标跳动与覆盖。
5. 晚间安静回望室 100% 留用户自己的文字，严禁做 AI 聊一聊、选择题或把 AI 观点写进日记。
6. 全部完成后按 Goal 04 第 4 节要求交付 commit 列表、真实命令输出与隔离 Logseq 沙箱验收清单（未实机验证项诚实列明）。

先完成第一步阅读与第二步基线核查，给我输出 10 行以内的开工核查摘要，确认无阻塞后直接开始实施 M1。
```
