# Goal 5：Personal Semantic Time Planning UX v1

## 基线与隔离

- 基线：`origin/main` = `018c3368bbe764a55cce466db36c8fcc4da43e37`（`feat: rebuild Work Evidence around file review and handoffs`）。
- 独立 worktree：`/Users/wangrundong/work/logseq-task-manager-semantic-planner-ux`。
- 分支：`codex/semantic-planner-ux-v1`，从 `origin/main` 创建；开工前 `ahead 0 / behind 0`。
- 旧实现参考：`origin/codex/semantic-planner-v1` = `7a7c5030`，merge base `2cb0ced7`；只阅读，不合并、不从中建分支。
- 未修改另外两条开发线的 worktree、服务、Profile 或端口；未使用子代理。
- 独立 DSH 环境：
  - `DSH_HOME=/Users/wangrundong/work/dsh-homes/semantic-planner-ux`
  - Profile `semantic-planner`，端口 `3097`（当前没有与他人共用）
  - Planner 数据：`state/planner/semantic-planner.json`
  - Binding / workspace：`state/bindings`、`state/workspace`
  - 合成 Logseq 工作目录：`synthetic-work`（Graph 作用域 `A:/A`，happy-dom + 本地 workspace companion）
  - 浏览器：Chrome headless + CDP `9337`，独立 profile 目录
- 验收结束后停止本任务专属的 DSH/companion/Chrome 进程，保留隔离数据。

## 复用的旧 Planner 实现

- `PlannerStore` 的单文件 JSON 模型、`atomicJson` 原子替换、串行写队列、`revision` 冲突保护与持久撤销栈。
- 现有 `planner.references` 只读能力：复用 Graph 身份索引（`lookupBlockIdentity`）和自然工作标签（`workObject`），继续限定在当前会话已授权的工作来源内。
- 侧栏 tab / 会话 header utility 的注册方式、今天/明天/本周的本地日期模型、默认语义时段与基础样式骨架。
- 旧版本 `version: 1` 数据可直接迁移到 `version: 2`，旧撤销快照也会补齐新字段，不会丢安排。

没有新建数据库、Workspace、WorkCatalog、Planner Agent 服务或第二套任务状态。

## 对 main 的必要整合

main 当前没有 Planner，因此旧实现是移植而非合并。整合点：

- `apps/dsh-plugin/src/index.mjs`：按 main 的异步插件安装方式接入 `installPlannerHost`，注册 `planner-*` 认证 RPC。
- `apps/dsh-plugin/src/client.jsx`：接入规划 tab、header 入口和 `plannerStyles`；复用 main 的右侧栏 slot 体系。
- **DSH 原生草稿**：使用 main 已提供的 `inputActions.captureInsertion()` / `insertText(text, span)`（与 Work Evidence 的 handoff 同一机制），不提交、不调用模型、不复制会话系统。
- `packages/contracts/src/workspace-agent.ts`：增加只读命令 `planner.references`。
- `apps/logseq-plugin/src/features/agent-workspace/router.ts`：在同一授权来源读取路径上返回 Project / MiniProject / Task / 自然工作标记的只读引用列表。
- 存储继续使用现有 JSON 持久化；正式对象只保存快照，不回写。

## 产品模型

`semantic-planner.json`（version 2）包含：

```text
slots:   id, name, start?, end?            有序语义时段，时间范围可选
entries: id, title, date, slotId,
         plannedMinutes?, actualMinutes?,
         dueAt?, reference?,            计划 / 实际 / 截止 / 只读工作引用
undo:    最近 30 次修改的完整快照 + 标签
```

明确分开：

- **计划投入**：日期 + 语义时段 + 预计分钟数，是“打算在这里做”。
- **实际投入**：用户显式记录（卡片 +15 或编辑器精确分钟），不会因为计划没完成就判失败，也不会因为实际更长就改 Formal 状态。
- **截止时间**：独立的本地 `datetime`，不随时段移动而改变。
- **外部日历事件**：本阶段不接入，也不伪装成用户安排。
- **工作引用**：可选的只读引用；自由活动不需要引用任何正式对象。

数组顺序就是同一时段内的展示顺序；拖动/上移下移会直接改写顺序并进入撤销栈。

## 交互与界面

- **今天 / 明天 / 本周**：今天为默认页；单日页没有重复的日期标题，只保留大标题、摘要和时段；本周为单列紧凑日历，空日期只保留一行入口，今天展开全部时段。
- **语义时段**：名称、顺序、可选起止时间；可增删、上下移动。删除时段时其中安排移到第一个时段，界面提前说明，可撤销。
- **快速创建**：时段内虚线入口或 `＋` 打开行内 composer，只填标题即可；计划 30/60/90 分钟、关联工作都可选。
- **行内编辑**：标题、日期、时段、计划分钟、截止时间、实际分钟、工作引用在一张卡内完成，不弹多层表单。
- **直接拖动**：卡片左侧 `⠿` 手柄拖动到其他时段；卡片之间显示插入线；卡片悬停/拖动时高亮目标时段。编辑器内还提供 ↑↓ 调整顺序（不依赖拖动）。
- **计划与实际**：卡片显示“计划 1h30m / 实际 30m”，有计划的卡片底部有轻量进度条；`＋15` 直接记录实际投入。
- **截止时间**：独立琥珀色标签“截止 明天 18:00”，与计划时段视觉分开。
- **工作引用**：Project / MiniProject / Task 小徽标 + 标题，蓝色左侧强调；自由活动保持绿色强调、无徽标。引用列表可搜索，限定当前绑定工作。
- **删除与撤销**：删除立即可撤销；状态行和 header 都提供撤销入口。最近 30 步持久保存。
- **带入对话**：卡片 `↗ 对话` 把标题、日期、时段与范围、计划、实际、截止、工作引用写入 DSH 原生输入框；有已有草稿时自动换行追加。**不发送、不调用模型**，并提示“已放入输入框，未发送”。
- **稳健性**：revision 冲突会重载最新版但保留编辑中的输入；损坏的 Planner 文件只让 Planner tab 报错，不会拖垮整个 Logseq workbench，也不会用空数据覆盖原文件。响应式布局适配 300–500px 右侧栏。

## 主要修改文件

新增：

- `apps/dsh-plugin/src/planner-store.mjs` — version 2 存储、迁移、CRUD、移动、排序、实际投入、时段、撤销。
- `apps/dsh-plugin/src/planner-model.mjs` — 本地日期、周范围、时长/截止格式化、拖动排序、DSH 带入文本。
- `apps/dsh-plugin/src/planner-host.mjs` — 认证 RPC、只读引用校验、损坏文件隔离。
- `apps/dsh-plugin/src/planner.jsx` — 规划交互界面。
- `apps/dsh-plugin/src/planner-styles.mjs` — 作用域样式。
- `apps/dsh-plugin/tests/planner.test.mjs` — 核心存储与迁移测试。
- `docs/implementation/goal-5-semantic-planner-ux.md` — 本文档。
- `docs/implementation/goal-5-semantic-planner-ux.png` / `goal-5-semantic-planner-week.png` — 合成数据截图。

修改：

- `apps/dsh-plugin/src/client.jsx`
- `apps/dsh-plugin/src/index.mjs`
- `apps/dsh-plugin/tests/host-proof.mjs`
- `apps/logseq-plugin/src/features/agent-workspace/router.ts`
- `packages/contracts/src/workspace-agent.ts`

## 测试与验证

- Planner 核心测试：7/7（日期/周、计划实际截止分离、CRUD、拖动顺序、时段、撤销、持久化、迁移、stale revision、写失败保持旧状态、损坏文件隔离）。
- DSH workbench 全量单测：49/49。
- `npm run test:host --workspace @task-copilot/dsh-logseq-workbench`（Node 24）：9/9 检查；新增 Planner 检查确认真实生产插件 RPC、免绑定自由活动、跨会话共享、只读引用校验、磁盘重载、Graph 写入计数不变。
- `npm run typecheck`：全 workspace 通过。
- `npm run lint`：全仓通过。
- `npm run build`：全仓构建通过。
- `npm run check:boundaries`：12/12，依赖边界通过。
- Contracts：10/10；agent-workspace 相关 Logseq 测试：18/18。
- `git diff --check`：通过（提交前复核）。

## 真实 DSH 验收（端口 3097，独立 Profile / 数据）

在真实 DSH Web UI 完成：

1. **创建自定义语义时段**：把“上午核心时间”改为“清晨深度工作 07:30–10:30”，新增“午后散步”（无时间范围），保存后重载仍在。
2. **安排自由活动**：创建“阅读论文”“整理会议记录”“傍晚散步”，不需要关联 Logseq 或正式任务。
3. **添加已有工作引用**：启动隔离的合成 Logseq companion（Graph `A:/A`，不接触真实 Graph），在 DSH 会话绑定 `synthetic-work`，通过规划卡片的“关联已有工作”真实选择 `MiniProject「个人语义时间规划」` 并保存；JSON 写入 `graphId/blockUuid/objectId/kind/title` 只读快照。picker 同时列出 Project / MiniProject / Task 三种类型，Project / Task 的保存校验由 host-proof 覆盖。
4. **拖动到其他时段**：用 CDP 真实鼠标拖拽把“整理会议记录”移动到其他时段；拖动过程中出现目标高亮和插入线，保存后 JSON 位置正确。
5. **调整顺序**：在编辑器里把“整理会议记录”下移，卡片顺序和 JSON 数组顺序同步。
6. **修改计划投入**：“研究项目架构”改为 90 分钟，摘要/卡片/进度条更新。
7. **记录实际投入**：卡片 `＋15` 记录；编辑器精确设置；“研究项目架构”30 分钟、“阅读论文”15 分钟、“整理项目结构笔记”20 分钟；撤销可回退。
8. **截止时间独立**：给“研究项目架构”设 `11/1 18:00`、给引用安排设 `11/2 17:30`，之后拖动换时段，截止时间不变；计划时段可以自由移动。
9. **删除并撤销**：删除“整理会议记录”，状态行出现撤销；撤销后卡片、顺序和 JSON 恢复。
10. **重载 DSH**：页面重载 + 停止/重新启动独立 DSH 宿主（新 token）后，5 个时段、6 项安排、引用快照、撤销栈与计划/实际/截止全部恢复。
11. **带入 DSH 原生草稿**：点击“阅读论文”的 `↗ 对话`，原生输入框出现标题、`清晨深度工作（07:30–10:30）`、计划 45 分钟、实际 15 分钟、`MiniProject「个人语义时间规划」`；输入框中原有内容保留；未发送、未调用模型。
12. **不修改正式对象**：Planner 只读写自己的 JSON；引用只经过只读 `planner.references`；host-proof 在引用前后断言 Graph 写入计数不变。没有创建 Task、没有改 Formal Kernel 状态或截止日。

证据：

- 本地完整截图目录：`/Users/wangrundong/work/dsh-homes/semantic-planner-ux/screenshots/`
  - `41-final-real.png`（今天 + 实际引用 + 草稿带入）
  - `42-final-week-real.png`（本周）
  - `25-narrow-editor.png` / `26-narrow-settings.png`（窄侧栏表单）
- 仓库内截图：`docs/implementation/goal-5-semantic-planner-ux.png`、`goal-5-semantic-planner-week.png`。

## 尚未完成 / 限制

- 引用选择限定当前会话已绑定 Logseq 工作的授权来源，不做全 Graph 浏览；切换会话可选择其他工作。未绑定会话只能保存自由活动。
- 真实 DSH 引用选择使用合成 Logseq SDK/companion 完成，未在用户真实 Graph 或真实 Logseq 桌面端操作；生产 Logseq 插件路径由 host-proof 覆盖。
- 单机、单宿主写入；不支持多设备同步或多进程同写同一 JSON，也不做跨日自动滚动/外部日历。
- 截止时间使用本地 naive datetime，没有时区转换；不支持跨夜时段范围。
- 拖动为桌面 HTML5 拖放；触屏拖动未验证。编辑器内提供 ↑↓ 和时段下拉作为替代。
- 本周视图的空日期“＋”先落在第一个时段；保存后可再改时段。
- 撤销最近 30 步，无 redo。
- 没有自动排程、重复安排、外部日历写入、Task 自动创建或 Formal 生命周期写入（均为刻意边界）。
- 会话 header 的“◷ 规划”入口在真实会话 header 中出现；本次验收主要使用右侧栏“个人时间规划”入口（draft hero 不渲染 session header）。

## 与其他两条开发线的共享文件交集

- `apps/dsh-plugin/src/client.jsx`：Goal 3 / Capture 可能增加 import 与 header/tab 注册；本分支增加 planner import、header、tab、样式。冲突集中在文件头与注册区。
- `apps/dsh-plugin/src/index.mjs`：本分支增加 `installPlannerHost` 与 route spread；Goal 3 若增加工作上下文路由会相邻。
- `apps/dsh-plugin/tests/host-proof.mjs`：本分支在 bind/read 验收后插入 Planner 段；其他线若改同一测试段可能冲突。
- `packages/contracts/src/workspace-agent.ts`：`workspaceCommands` 追加 `planner.references`；与 Goal 3 的命令白名单相邻。
- `apps/logseq-plugin/src/features/agent-workspace/router.ts`：在 `sourceRead()` 后追加只读 `planner.references` 分支；与 Goal 3 的来源路由修改相邻。
- 不共享：`planner-*.mjs/jsx`、`tests/planner.test.mjs`、Planner 样式、本文件与截图。
- 未修改 `styles.mjs`、Capture、Structure History、Work Evidence 或 WorkEvidence 实现。
