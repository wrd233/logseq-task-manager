# 后续 Goal B：真实工作结构历史的只读链路

状态：可交给后续 Codex 执行的任务说明；本文件不启动任务、不代替用户开发授权。先完成[并行契约](../02-并行开发契约.md)的 G0，与 A 消费同一共享接口 commit。产品目标见[工作证据与历史](../../modules/06-工作证据与历史.md)与[工作结构](../../modules/04-工作结构与编排.md)。本 Goal 只读；完整三投影与历史恢复仍按后续证据/决定推进。

## Goal 正文

你负责 Task Copilot 的工作结构历史开发线 B。用现有 StageHistory、StageStart、StageRevision.source 与 SourceSnapshot 建立真实数据的只读时间回放：同一张图展示已记录节点、文字与来源拓扑变化，位置尽量稳定，点击可核查历史来源；图不可用时提供完整文字目录与差异清单。不得制造未保存的历史或通过回放产生正文/正式写入。

开始前读取[代码基线](../00-代码基线核查-2026-10-21.md)、[并行契约](../02-并行开发契约.md)、[来源状态](../../SOURCE-AND-STATUS.md)、[待决登记](../../DECISION-REGISTER.md)、[跨模块设计](../../architecture/01-跨模块设计.md)、模块 04/06。参考锚点为 main `edd79c55ee84db64164e585deef8ce188b8778fc`、feature `fe0ac2162c2970797f4dfe42b658b915c10bac9a` 与 DSH tag `687f282e8625c6b8d11ff58211a90524be2e4317`；执行时必须重新核查。

### 入口检查与依赖

1. 核查工作区与主代理发布的 G0 集成 SHA / 共享类型；脏工作区或版本不一致先报告，不覆盖、不 reset/stash，不自行整合 feature。
2. G0 未满足时只准备，不复制 WorkRef/SourceRef/ReturnContext 实现。主代理只读封装已有本地 stage.api.history；如果入口在 DSH，由主代理补受 session/binding/租约保护的只读 transport，不在 renderer 中直读 Graph 或私有磁盘。
3. G1/G3 核对真实 provider 与选定已授权块范围。当前远端 stage.read 不是 history 枚举；没有阶段/页面校验不支持/损坏数据时，显示明确未覆盖，不能偷偷 begin/checkpoint/authorize 来填数据。
4. 缺少 mammoth 等依赖或 SDK 行为不兼容时保留集成阻塞。可以并行完成标注合成数据的 renderer，但 fixture 演示不能算真实历史链路完成。

### 输入输出与历史语义

- 输入：WorkUiContext、StageHistoryPort、SharedUiPort.openSource/returnFocus。使用已校验 StageHistory，而非 Agent 提供的任意“历史 JSON”。
- 第一帧是 StageStart.source；后续主链按 revision.parent 及 StageStore 重建结果，不能只按时间排序重建因果关系。节点 key 用 sourceId；读取 revision.id/at/sourceSetVersion/structureVersion 原值，不重建另一套持久历史。
- candidates、history.problems、stage.problems、storageNotes 和 acceptance 单独呈现。并发候选不冒充已选历史，Stage 用户认可不等于 Task 正式完成。
- 用现有 composeDiff 复用增删、正文、parentUuid/order/depth 差异与有限归因；布局可以派生，但不能修改来源。历史 null 正文显示未知，绝不用当前原文/AI 补齐旧标题或旧状态。
- StageFile.retention 为 record-only 或 content=null 时只展示元数据与缺失原因；不可为补历史而读取今天的文件或扩大敏感文件快照。
- 输出只读帧/选择状态、来源定位请求与文字回退；不调用 accept、activate、reconcile、submit、checkpoint、材料保存或 Kernel mutation。

### 三种投影的覆盖边界

1. **Logseq 来源树**：本 Goal 以现有 Stage 快照接真实 provider，完成可核查只读链路。
2. **正式对象树**：只能消费经验证的 Kernel 历史身份/归属/状态证据；当前 Stage 数据不提供完整正式历史，没有数据就显示未覆盖，不把来源缩进/标记解释成正式依赖或生命周期。
3. **代码模块图**：当前没有对应历史 provider，显示未覆盖；不以当前源码分析伪造过去模块关系。

三者在 UI 中明确区分。第 2/3 项未覆盖需列为产品模块尚未完成的范围与后续依赖；不能把本 Goal 的来源树切片宣称为模块 06 全部完成。若后续要求在此 Goal 一并交付三种完整投影，应先请求主代理补充真实 provider 任务，不能扩建通用历史模型。

### 需要实现的体验

- 默认展示当前可证明结构，并标明对应修订时间；“当前”不是对整个项目实时完整性的保证。时间选择在已保存帧间切换，无记录时间段显示未知/间隔。
- 同一图局部高亮增删、改名/正文与移动，布局保持稳定；变化同时有文字/形状说明，不只靠颜色。
- 点击节点可读该版本保存的来源，或明确选择定位今天的来源；已删除/失效来源有可读回退，版本不一致有提示。
- 图失败、数据过大、窄屏与减少动态效果时文字目录/差异仍完整可用。列表与图共享选择，返回原 session/触发位置，不改 cwd。
- 不增加结构编辑、历史恢复按钮或假成功动画。“先只读、后恢复”是当前任务切片和设计建议，不替用户决定整体实现排期。

### 文件范围与 DSH 子任务

本线可新增/维护 `apps/logseq-plugin/src/features/structure-history/`、`apps/dsh-plugin/src/structure-history/` 及两侧 tests 的 `structure-history.*test.*`。Stage protocol/store/recorder/diff/source-protocol 只读复用。公共类型、入口、RPC 与公共 CSS 由主代理串行修改；禁止修改 A 的 capture-inbox 文件、Kernel/domain/sqlite、权限/迁移、配置/依赖/锁文件及 SDK/profile。

**适合 DSH 的前端子任务**：固定 SharedUiPort / StageHistoryPort 接口，输入醒目标记的合成 StageHistory fixture，完成只读时间轴、稳定 sourceId 布局、局部高亮、来源按钮、问题/空态及文字回退。renderer 不接真实 Graph、不落盘、不重写快照校验、不自行选择模型或改变正式语义。Codex 负责 provider 适配、归因与历史完整性、零写入审查和真实宿主集成。

通道不可用时 Codex 可独立执行该前端任务。若用外部 Flash，先说明发给 DeepSeek 官方 API 的具体内容并获得最小目录授权；检查秘密，只提供批准的脱敏范围与合成 fixture，自包含任务含 cwd/允许文件/禁止范围/接口/验收/唯一 idempotency_key。查询沿用原 key；不要与 Worker 改同文件；Codex 独立复核实际 diff 与测试。工具可见不代表通道已验。

委派前阅读系统 `/Users/wangrundong/work/codex-dsh-system/README.md` 与当时适用的 AGENTS.md，核对 `config/projects.json` 精确目录许可。默认 hub、read_only=true；写入任务须有对应最小目录写入授权。Flash 固定单 Worker、180 秒内、最多 16 次请求，不自动升级/重试/递归，不额外套 Codex 调度子代理；终端降级按 README 明确 backend。不要改变全局 provider、主模型或登录。

### 验收与停止条件

- 由真实 SourceReader + StageRecorder/Store 在合成 Graph 环境生成阶段开始及多次修订，经过实际只读 provider 进入 UI；另设固定 fixture 测试损坏/分叉/缺失，不混淆两类证据。
- 验证新增、删除、正文和 parent/order/depth 变化，旧帧在当前来源改变后字节/版本不变；候选不入主链、丢正文不补造、无历史与无变化不同。
- 覆盖空 history、被删除来源、无权限、断连、页面不支持、损坏/并发候选、大数据截断、减少动效和图形失败回退。纯布局拖动/切帧不调用任何写 API；用 spy/计数及存储前后比较证明零写入。
- 验证 scope/session/generation 切换后旧异步结果被丢弃，不把来源文本当指令；来源定位与返回不改变绑定、cwd 或原生草稿。
- 运行新 structure-history 测试和已有 stage-workbench、stage-review、workspace-context、workspace-reading、DSH service 回归；受影响 workspace typecheck/build。主代理接线后补 agent-workspace-entry、host-proof 与根 check，并核查生成差异。
- 用真实 DSH/Logseq 与独立合成 Graph/profile 复核入口、来源、焦点、窄屏和只读约束。host-proof 的替身 SDK 与脚本模型不能替代该验收。

只有真实 provider + 来源树回放 + 文字回退 + 零写入 + 宿主验收有证据时，报告此只读切片完成；同时明确正式对象树/代码图/历史恢复仍未覆盖。只有 fixture UI 时，保持整体 Goal 未完成并列 G1/G3/G4 阻塞。

交付实际 diff/commit、共享接口 pin、数据覆盖表、命令与退出结果、真实/合成证据、未决事项和后续 provider 依赖。完成后停止，不自行开始历史恢复、正式结构编辑或全目录扫描。
