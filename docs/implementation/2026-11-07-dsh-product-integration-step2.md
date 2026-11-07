# Task Copilot Integration Step 2：Personal Semantic Planner

## 分支、依赖与冲突

2026-11-07 执行 `git fetch origin` 后：

| 分支 | 实际 HEAD |
| --- | --- |
| origin/main | 4acc2699a5740e54b6875b30ad3052a8aa89d625 |
| origin/codex/dsh-product-integration-v1 | 12d694d7863ff6206314c8e01231f995af5d18d4 |
| origin/codex/semantic-planner-ux-v1 | 39225770d507a818f35a1c3190408492e4c119e7 |
| origin/codex/semantic-planner-ux-refinement-v1 | c655682f0b72aaf1ae93fb1b0f300bb9bebbaf64 |

当前集成 Worktree 干净，继续在同一个 `codex/dsh-product-integration-v1` 上工作。Refinement 的祖先包含 Planner v1；v1...Refinement 为 0/1。集成分支与 Refinement 的 merge-base 为 `018c3368bbe764a55cce466db36c8fcc4da43e37`，left/right 为 5/2。

合并完整 Refinement 分支，纳入 `39225770` 和 `c655682f`，保留双亲提交关系；没有只挑最后一个提交。唯一文本冲突是 `apps/dsh-plugin/src/client.jsx` 的三处公共整合：

1. imports 同时保留 Goal 3 的 SingleFlight、工作发现与 Planner 模块。
2. 样式加入 plannerStyles，同时完整保留 workSwitchStyles / discoveryStyles / readingStyles。
3. 加入 Planner 的侧栏注册，保留 Goal 3 的导航监听、取消请求、会话隔离和 dispose/reset 处理。

`index.mjs`、router 和 contracts 自动合并后逐项检查。没有修改 main、两个原始 Planner 分支、其他 Worktree，也没有重做第一轮 Structure History 整合。未使用子代理或外部执行代理。

## 最终实现

PlannerStore、存储格式和 Refinement 样式保持原分支实现。今天、明天、本周、自定义语义时间段、可选时间范围、自由活动、工作引用、计划投入、实际投入、截止时间、拖动处理、顺序调整、快速实际投入、删除与撤销均保留。

默认仍在原 bindingStateDirectory 写独立的 `semantic-planner.json`，可用既有 Planner 分支的 `plannerStateDirectory` 配置。没有新数据库或迁移层；保留既有 version 1 → 2 的加载规则与撤销历史。计划、实际、截止字段的语义没有改动，Refinement 收起的字段仍可按需展开。

本轮额外改动很小：

- `planner-model.mjs` 增加原生草稿插入函数，保留捕获的 draftRev，把非空选区折叠到选区末端后插入。因此不会替换原选中文字或引用 chip，也不使用 setDraft / submit。
- `planner.jsx` 调用该函数，其余 Refinement 布局与交互保留。
- router 正确把 `[Project]` 工作标记映射为 PROJECT；原实现会把非正式 Project 标记归为 MINI_PROJECT。标记仅用于导航，不能冒充正式对象。
- 少量回归覆盖真实 WorkbenchService 定向读取、未关联会话拒绝、跨会话保留旧引用及选区草稿保留。

主要文件：`apps/dsh-plugin/src/{client.jsx,index.mjs,planner.jsx,planner-host.mjs,planner-model.mjs,planner-store.mjs,planner-styles.mjs}`、`apps/dsh-plugin/tests/{planner.test.mjs,host-proof.mjs}`、`apps/logseq-plugin/src/features/agent-workspace/router.ts`、`packages/contracts/src/workspace-agent.ts`、DSH README。

## Goal 3 与来源身份

引用路径只有一条：`planner-references → WorkbenchService.command → call → CompanionTransport → 现有 Logseq router`。新增的 `planner.references` 协议命令复用授权范围内的 sourceRead，不扫描其他 Graph，不建立另一套 Logseq 读取机制。

当前 Session 的 WorkRef、binding.scope 与 generation 继续由 Goal 3 附在 readTarget 中，真实宿主重新核验来源身份和只读 lease。Planner 引用保持旧 JSON 中的 `{graphId, blockUuid, objectId, kind, title}` 来源快照；没有为了添加 WorkRef 字段重写旧数据。新引用/更换引用必须出现在当前有效连接返回的列表中，客户端改写的标题会被真实来源结果替换。编辑未改变的旧引用可以离线或在另一会话中保留，不借此读取该引用正文。

选择引用不创建 Workspace、不重绑 Session，也不新增写许可。保存安排只改变个人 JSON，不调用 Formal Kernel 写端口。范围暂时只支持当前 Session 已连接的工作，不扩展 WorkCatalog。

Structure History 服务、视图模型、样式和 WorkbenchService 与第一轮相比没有改动。两页使用不同注册 ID 与 CSS 前缀，复用 DSH 原生侧栏/分栏。

## 自动验证

- DSH 测试：64 / 64 通过（含 Planner 既有 7 项、第一轮历史回归和新增的 2 项回归）。
- 既有 workspace-read-target、workspace-integration、workspace-reading：19 / 19 通过。
- 安装版 DSH 0.2.1-rc.2 SDK host proof：9 / 9 通过。使用生产插件、HTTP companion、合成 Logseq SDK 和本地脚本模型，**与下述真实桌面验收分开**。见 [SDK 结果](evidence/integration-step2-2026-11-07/sdk-host-proof.json)。
- workspace typecheck 通过，相关改动文件 ESLint 通过，`git diff --check` 通过。
- `npm run build` 通过，包含 DSH / Logseq / CLI / Kernel 和产物核查。
- 既有测试覆盖旧 version 1 JSON 的安排与撤销保留、version 2 重载、截止/投入独立、顺序、跨时段移动和失败写入不破坏上次状态。

## 本轮真实页面走查

复用第一轮的独立 DSH profile / HOME / DSH_HOME / binding 目录与合成测试 Graph，启动本轮构建的 DSH 插件、真实 Logseq Desktop 0.10.15 和生产 companion。DSH 端口 3093。没有 fixture companion、Graph SDK 注入、私人 Graph 或外部模型调用。

Logseq 对工作 B 显式建立新只读连接后，切回阅读工作 A；DSH 仍使用工作 B 的原生会话。Planner 测试安排均从实际 UI 创建。历史仍使用第一轮明确标记的两个 Agent 测试快照，不宣称新录制了真实 Stage。

| 场景 | 实际结果 |
| --- | --- |
| 启动和页面注册 | 原生会话头部同时有规划、工作历史入口；两个页面可切换、并排显示 |
| 今天/明天/本周 | 三种视图显示正确本地日期；本周显示两项安排及独立汇总 |
| 自由活动/工作安排 | UI 新建“自由阅读与散步”和“核对工作 B 的结构历史”成功 |
| 自定义时间段 | 改名“上午专注与阅读”并保存，原安排未丢失 |
| 引用 | Logseq 阅读 A 时，Planner picker 只返回 B 的工作标记，保存后带稳定 Graph/block 引用 |
| 字段独立 | 计划 60 分钟、实际 30 分钟、截止明天 18:30 分别保存；快速 +15 后实际 45，计划和截止不变 |
| 编辑移动/顺序 | 编辑日期/时段入口将安排移到上午，编辑器上移调整顺序成功 |
| 删除/撤销 | 删除后列表移除；撤销恢复引用、计划、实际和截止 |
| 草稿 | 选中整段第一轮旧草稿后带入安排，旧文字完整保留，新增标题/时间段/投入/截止/引用；未发送，仍只有原先的一轮消息 |
| 重载 | Chrome 重载后两页恢复，安排、时间段、投入、截止、引用、撤销能力和草稿仍存在 |
| 历史与来源 | Planner 操作后历史仍是原两个时点；历史正文与真实 B_ONLY_942 当前正文分开，核验成功并生成入口 |
| 并排 | 原生分栏左侧 Structure History、右侧 Planner 同时显示；保存同屏截图 |

[生产 RPC 与磁盘验证](evidence/integration-step2-2026-11-07/live-rpc.json)进一步核对：当前 DSH 来源不含 A；PlannerStore 从磁盘重载与页面数据一致；生产撤销/排序恢复相同安排；Planner 操作前后历史目录和测试 Graph 文件 SHA-256 完全一致。

本地实际截图：`tmp/integration-step2/history-and-planner.png`。截图是实际 DSH 原生分栏，没有生成或拼接。整窗含个人浏览器工具栏，因此留在本地忽略目录，不推送到仓库。

## 尚未解决的验收项

- **真实拖动尚未验收通过**：多次通过本机自动化从拖动手柄投放到空时段，未观察到可确认的移动；不能据此区分工具手势限制与实际 DnD 问题。本轮保留原拖动实现，没有用程序修改数据冒充鼠标拖动成功。底层移动/撤销测试和真实页面的编辑移动/顺序调整已通过，实际手工拖动仍需复核。
- 系统级 `logseq://` 原文唤起、真实 Stage 新录制全流程沿用第一轮未验收边界；本轮已复验真实来源读取和历史正文隔离。
- 没有模型响应质量、触屏拖动、跨设备同步、长期运行或私人 Graph 验收。外部模型网络在独立宿主中阻断。

交付前停止本轮独立 DSH / Logseq / companion，保留测试 Graph、JSON、草稿与宿主状态供后续整体体验验收。原功能分支保留；仅推送集成分支，不合并 main。
