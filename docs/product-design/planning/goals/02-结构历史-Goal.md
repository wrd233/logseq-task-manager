# 后续 Goal B：真实工作结构历史的只读链路

状态：完整后续 Goal 提示词。由用户在电脑 B 发起本 Goal 后执行；当前准备任务不启动实现。目标分支 `codex/work-structure-history-v1`，与 A 使用同一共同基线和共享类型，不必等待 A 的未合并代码。产品目标见[工作证据与历史](../../modules/06-工作证据与历史.md)与[工作结构](../../modules/04-工作结构与编排.md)。本 Goal 只读；完整三投影与历史恢复仍按后续证据/决定推进。

## 独立检出与运行

在新目录执行，已有同名目录/分支先保护其工作。仓库使用 Node `>=20.19 <21`、npm 10.8.2；DSH 宿主独立使用其支持的 Node 22.19+（本机验证环境为 Node 24），不要更改仓库 engine。

```sh
git clone --single-branch --branch codex/work-structure-history-v1 https://github.com/wrd233/logseq-task-manager.git task-copilot-history
cd task-copilot-history
git status --short --branch
git fetch --prune origin
git log -1 --oneline
node --version
npm ci --no-audit --no-fund
npm run typecheck
npm run build
```

真实 Logseq 使用构建后的 `apps/logseq-plugin`，DSH 接入参考 `apps/dsh-plugin/README.md`，另设隔离 profile，不覆盖日常环境。上述命令只验证开发启动；最终历史体验必须另有真实宿主证据。

## Goal 正文

你负责 Task Copilot 的工作结构历史开发线 B。用现有 StageHistory、StageStart、StageRevision.source 与 SourceSnapshot 建立真实数据的只读时间回放：同一张图展示已记录节点、文字与来源拓扑变化，位置尽量稳定，点击可核查历史来源；图不可用时提供完整文字目录与差异清单。不得制造未保存的历史或通过回放产生正文/正式写入。

开始前读取[代码基线](../00-代码基线核查-2026-10-21.md)末节、[并行契约](../02-并行开发契约.md)、[来源状态](../../SOURCE-AND-STATUS.md)、[待决登记](../../DECISION-REGISTER.md)、[跨模块设计](../../architecture/01-跨模块设计.md)、模块 04/06。准备任务的输入 main 为 `669726965693595c860dbc235b85a5adc1d82900`；本次准备提交是两条分支起点。执行时重新 fetch 核查，不盲用历史 SHA；不依赖未合并的一键 DSH feature。

### 入口检查与依赖

1. 核查工作区、共同基线与 `apps/logseq-plugin/src/workspace/copilot-ui-port.ts`；有已有工作或分歧先保护并报告，不覆盖、不 reset/stash，不自行整合 feature。fetch 失败停止依赖远端状态的操作。
2. 共享类型已跟踪即可独立实现本线数据适配和播放器，不等 A。模块内可接入注入的 stage.api.history provider；共享入口及 DSH 受 session/binding/租约保护的只读 transport 由共同基线主代理串行接线。共享需求写本模块 `INTEGRATION-REQUEST.md`，不在 renderer 中直读 Graph/私有磁盘，不复制公共类型。成果提交并普通推送本分支，交回 PR；不自行合并 main 或另一条线，不 force-push。
3. G1/G3 核对真实 provider 与选定已授权块范围。当前远端 stage.read 不是 history 枚举；没有阶段/页面校验不支持/损坏数据时，显示明确未覆盖，不能偷偷 begin/checkpoint/authorize 来填数据。
4. 依赖用已提交 lock 的 npm ci 安装；早期本机 mammoth 缺失是历史环境记录，不能直接认作干净检出失败。实际安装失败或 SDK 不兼容时报告；不顺带修改锁文件。可先完成标注合成数据的 renderer，但 fixture 演示不能算真实历史链路完成。

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

通道不可用或尚无外发授权时交付下方独立前端提示词，不假称已委派；Codex 可继续本线工作。若用外部 Flash，先说明发给 DeepSeek 官方 API 的具体内容并获得最小目录授权；检查秘密，只提供批准的脱敏范围与合成 fixture，自包含任务含 cwd/允许文件/禁止范围/接口/验收/唯一 idempotency_key。查询沿用原 key；不要与 Worker 改同文件；Codex 独立复核实际 diff 与测试。工具可见不代表通道已验；另一电脑没有本机 Worker 目录时使用提示词，不依赖绝对路径。

委派前阅读系统 `/Users/wangrundong/work/codex-dsh-system/README.md` 与当时适用的 AGENTS.md，核对 `config/projects.json` 精确目录许可。默认 hub、read_only=true；写入任务须有对应最小目录写入授权。Flash 固定单 Worker、180 秒内、最多 16 次请求，不自动升级/重试/递归，不额外套 Codex 调度子代理；终端降级按 README 明确 backend。不要改变全局 provider、主模型或登录。

### 验收与停止条件

- 由真实 SourceReader + StageRecorder/Store 在合成 Graph 环境生成阶段开始及多次修订，经过实际只读 provider 进入 UI；另设固定 fixture 测试损坏/分叉/缺失，不混淆两类证据。
- 验证新增、删除、正文和 parent/order/depth 变化，旧帧在当前来源改变后字节/版本不变；候选不入主链、丢正文不补造、无历史与无变化不同。
- 覆盖空 history、被删除来源、无权限、断连、页面不支持、损坏/并发候选、大数据截断、减少动效和图形失败回退。纯布局拖动/切帧不调用任何写 API；用 spy/计数及存储前后比较证明零写入。
- 验证 scope/session/generation 切换后旧异步结果被丢弃，不把来源文本当指令；来源定位与返回不改变绑定、cwd 或原生草稿。
- 运行新 structure-history 测试和已有 stage-workbench、stage-review、workspace-context、workspace-reading、DSH service 回归；受影响 workspace typecheck/build。主代理接线后补 agent-workspace-entry、host-proof 与根 check，并核查生成差异。
- 用真实 DSH/Logseq 与独立合成 Graph/profile 复核入口、来源、焦点、窄屏和只读约束。host-proof 的替身 SDK 与脚本模型不能替代该验收。

只有真实 provider + 来源树回放 + 文字回退 + 零写入 + 宿主验收有证据时，报告此只读切片完成；同时明确正式对象树/代码图/历史恢复仍未覆盖。只有 fixture UI 时，保持整体 Goal 未完成并列 G1/G3/G4 阻塞。

交付实际 diff/commit、远端分支或 PR、共同基线 SHA、数据覆盖表、命令与退出结果、真实/合成证据、未决事项和后续 provider 依赖。共享接线由共同基线主代理先发布再获取；等待时可交回模块成果，整体 Goal 不算完成。完成后停止，不自行开始历史恢复、正式结构编辑或全目录扫描。

## 独立前端子任务提示词（通道不可用时直接交付）

> 你负责 Task Copilot 结构历史的纯只读播放器。cwd 为本次提交任务指定的、经用户批准的脱敏 `structure-history` 目录。Codex 先提供只读 `ui-input.md`，写明固定 props、模块内帧/差异 view model 和醒目标注“合成数据”的多帧 fixture；缺少输入就报告，不猜造公共历史接口。
>
> 只允许新增或编辑当前目录 `player.jsx`、`styles.mjs`，导出 React `StructureHistoryPlayer`。渲染已保存帧的时间选择、以 sourceId 保持位置的来源树、增删/正文/父子位置变化高亮、该帧正文/差异面板、来源定位回调、候选/损坏/缺失状态与完整文字目录回退。未保存正文显示未知；当前来源定位与历史正文展示是分开的动作。
>
> 不改共享类型、数据适配、StageStore、RPC、入口、全局 CSS、Kernel、依赖或配置；不读真实 Graph、私有磁盘或今天文件，不写入/校正历史，不实现编辑/accept/checkpoint/旧版恢复。不将来源树冒充正式对象树/代码图；无依赖历史就显示未覆盖，不从缩进推正式依赖。图失败/窄屏/减少动效仍可用，变化带文字或形状提示。
>
> 交回允许文件变更、props 使用说明、缺失/分叉/空帧演示与未验证清单。你无终端权限，不声称跑过测试；Codex 独立检查 diff、跑布局/只读交互测试并验证真实 provider 与宿主。Worker 的限制/幂等键由提交方按本文及 AGENTS.md 填写，不递归委派。
