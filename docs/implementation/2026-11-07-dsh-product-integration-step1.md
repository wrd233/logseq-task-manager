# Task Copilot Integration Step 1：Structure History

## Git 基线与整合

2026-11-07 fetch 后：

- `origin/main`：`4acc2699a5740e54b6875b30ad3052a8aa89d625`，已含 Goal 1–3。
- `origin/codex/structure-history-ux-v1`：`81fc28a493441910dc97625587fe836f21d9cdb8`。
- merge-base：`018c3368bbe764a55cce466db36c8fcc4da43e37`。
- `main...feature` left/right：3 / 1。main 独有 `76d8eea2`、`e57c712c`、`4acc2699`；feature 独有 `81fc28a4`。
- 从 origin/main 创建独立 Worktree 和 `codex/dsh-product-integration-v1`，用双亲合并保留原分支提交。

无文本冲突。`structure-history/service.mjs` 自动合并后进行了逻辑核查：保留 Goal 3 的 `localProject` 目录解析，同时接入 UX v1 的因果链 facts、来源身份核验和 navigation。原工作区未提交改动、其他 Worktree、原始 Structure History 与 Planner 分支均未修改。未引入旧 WorkEvidence UX 分支，未合并 main，未进行版本发布。

推送时原本地钩子的精确分支白名单尚未列入本轮集成分支。依据本轮明确推送授权，使用忽略目录中的一次性钩子副本，仅增加该精确分支；保留其他远端、删除、WIP、敏感路径与凭据检查，不修改共享 Git hook 或全局配置。

## Goal 3 适配

沿用 `HistoryService → WorkbenchService.command → WorkbenchService.call → CompanionTransport`。Stage 历史与精确块读取仍分别使用 `stage.history` / `source.read`，不建立第二条读取通道。

Goal 3 根据 SessionAssociation 和实际 binding 发送 `{sessionId, workRef, scope, generation}`，既有宿主校验负责真实 WorkRef、只读 lease、scope 和来源策略。历史模块消费这条协议；没有自行授予来源连接、恢复旧写许可或读取整个 Graph。

本轮额外把历史来源的 Graph/root 两字段预检改为 contracts 的 `sameWorkScope`，同时核对 scope kind/pageName。来源缺失 scope、身份不匹配或范围已变时不读取、不生成跳转；范围外来源继续返回不可用。历史正文始终取不可变快照，当前读取结果单独展示，不回填历史。

## 保留的体验与修改文件

保留 Stage 父链时间轴、树默认视图、辅助结构图、真实变化列表、移动路径、删除前节点详情、历史/当前版本分离、核验后的 Logseq 入口，以及用户点击才插入的解释草稿。

主要文件：

- `apps/dsh-plugin/src/structure-history/client.jsx`、`styles.mjs`：原 UX v1 页面、样式与交互。
- `structure-history/model.mjs`、`structure-view/model.mjs`：原 UX v1 的 historyChain / lineage。
- `structure-history/service.mjs`：合并双方逻辑，并复用完整 scope 比较。
- `apps/dsh-plugin/tests/history.test.mjs`：原 UX v1 测试，新增一个真实 WorkbenchService 链路的集成回归。

公共页面注册、导航、样式、Planner 与 WorkEvidence 源码无需改动；当前 main 的注册机制与 UX v1 兼容。未改 StageStore、StageRecorder、存储格式、哈希链或差异算法。

## 自动验证

- DSH 全部现有测试加少量回归：55 / 55 通过。
- 既有 workspace-read-target、structure-history、structure-history.trust 测试：11 / 11 通过。
- workspace 类型检查通过；变更的 6 个源码/测试文件 ESLint 通过；diff whitespace 检查通过。
- `npm run build` 通过，含 DSH、Logseq、CLI、Kernel 和产物检查。
- 新增回归经过真实 BindingStore / WorkbenchService：B 的精确来源读取携带 B 的 WorkRef、scope、generation；未关联 A、Graph/root/kind 改变均拒绝；解绑后的迟到结果拒收；已保存历史文件字节不变。

Node 使用项目要求的 Homebrew Node 20。系统默认 Node 25 因缺少 simdjson 动态库不可启动，未修改全局 Node 或系统依赖。

## 本轮真实页面冒烟

独立 Worktree 下复用现有隔离启动器：全新的 HOME、DSH_HOME、profile、绑定目录和测试 Graph，DSH `0.2.1-rc.2` 端口 3093，真实 Logseq Desktop `0.10.15`、真实 companion 和插件。未修改个人 Graph，未复用其他 Worktree 的 profile。外部模型网络阻断，未发送数据给外部模型。

内置浏览器连接超时后，使用本机 Chrome 新标签页走查真实 DSH 页面；Logseq 通过独立应用副本打开本轮测试 Graph。

| 检查 | 结果 |
| --- | --- |
| 页面注册、导航与打开 | 会话头部“工作历史”打开原生侧栏；全屏与退出正常 |
| 时间轴 / 树 | 两个历史时点切换，节点/父级/变化同步；首时点显示阶段起点 |
| 变化与详情 | 新增、删除、移动、改名和正文变化显示；删除节点仅在变化列表中，详情显示删除前正文 |
| 关闭与焦点 | 关闭删除节点详情后，焦点恢复到原变化行 |
| Goal 3 来源 | Logseq 阅读 A_ONLY_731，DSH 历史核对仍返回 B_ONLY_942，无 A 正文；使用生产 readTarget 协议 |
| 正文分离 | 历史显示 B_HISTORICAL_SNAPSHOT_V2；“今天的内容（不是历史正文）”单独显示真实 B 原文 |
| Logseq 入口 | 真实来源核验后生成正确 Graph 名称与块 UUID 的 logseq:// 入口 |
| Agent 解释 | 点击“解释本阶段”只插入原生草稿，未触发发送/生成 |
| WorkEvidence | 原生“工作回顾”正常打开；生产 evidence-view 正常返回 |

[生产 RPC 记录](evidence/integration-step1-2026-11-07/live-rpc.json)。本地截图保存在 Worktree 的忽略目录 `tmp/integration-step1/screenshots/`，未提交包含浏览器个人书签/其他标签图标的整窗截图。

历史 UI 数据是通过现有 HistoryStore 种入的两个明确标记 `fixture:true` 的 Agent 快照，包含移动/删除/新增等差异；**不宣称是这次在 Logseq 产生的真实 Stage 修订**。其 Logseq 引用来自本轮真实 Graph 的 sourceId 和版本，来源核对经过生产 DSH / companion / Logseq 路径；没有 fixture companion 或 Graph SDK 注入。Stage 因果链和真实历史导入由既有自动测试覆盖。

为了使原生会话进入对话页面，发送过一条本地验收消息；外部网络阻断导致重试，随后手动停止。解释按钮的验证在停止后进行，草稿保持未发送。模型回答质量不属于本轮结果。

## 尚未验收与边界

- 没有点击系统级 `logseq://` 入口：系统协议处理器不是本轮独立应用副本，为避免唤起其他实例，本轮只验证真实来源核验后的入口生成；**真实窗口跳转仍待验收**。未改变全局协议注册。
- 本轮未做新的真实 Stage 录制全流程，也未完整走查 Planner。Planner 源码保持 main 原样；Stage/结构历史既有测试与项目构建通过，不能替代 Planner 全流程验收。
- 未跑庞大测试矩阵、长期运行或个人 Graph 验收。原 UX v1 记录中的旧截图/验收结论属于原分支，不能当作本轮新增验证。
- 验收结束后停止本轮身份校验过的 DSH、Logseq 和 companion；独立状态与测试 Graph 保留在本 Worktree 的 `tmp/work-context-desktop/` 供复验。
