# stage-workbench 实施交接

2026-10-03。产品行为见 [设计](../design/stage-workbench-design.md)，职责、图例、存储与恢复见 [架构](../architecture/stage-workbench-architecture.md)。三个增量由本分支同一 session 逐步实施，没有委派或联系其他 session。

## 起点、隔离和提交

| 项目 | 实际值 |
| --- | --- |
| origin | `https://github.com/wrd233/logseq-task-manager.git` |
| 初次 fetch 锁定 | `1298ac2937ac18daf82d38f852e0f93a44f32dc9` |
| 用户指定继续整合的新远端 main | `acb1f4a3adb5d7122632245f0c2456853d4f6897` |
| 有意更新基线 | 用户确认最新 main 包含 workspace-context 后 fetch，保存自身实现，再 merge 上述明确 SHA；未追逐后续 main |
| 分支 | `codex/stage-workbench` |
| 独立工作树 | `/Users/wangrundong/.codex/worktrees/stage-workbench/任务管理中心-logseq插件` |
| OS / CPU | macOS Darwin 24.1 / arm64 |
| 工具链 | Node 20.20.2，npm 10.8.2；使用已核验的 node@20 路径，没有改系统默认运行时 |
| AGENTS.md | 仓库及适用父路径未发现 |

初始 checkout 的 origin、HEAD、status 和 worktree list 均核验，原 checkout 没有拉取切换/清理操作。自身 node_modules、dist、临时目录、Graph、profile、descriptor、SQLite、材料与进程隔离。没有 push、PR、合入 main、部署、删除工作树或生产 Graph 写入。Git 仅为代码交付，不是产品阶段认可。

本地提交链：`3ca0f98`（content 实际 Journal 历史与私有 UI 回调）、`b84815b`（阶段核心与原位审阅）、`acdb028`（整合明确的 workspace-context 远端提交）、`a9d6173`（正式 live-source 窄端口）、`d439eeb`（Desktop stat 兼容）、`55de492`（恢复提交、草稿、材料快照与修订事实）、`03c90f5`（当前/提交正文区分）、`7c50030`（source/材料编辑接线）。本文件的文档提交及最终 HEAD 见 `git log` 与交付回复。

## 本地入口和程序契约

真实插件 iframe 的 `window.taskCopilotWorkbench.stages`：

| 方法 | 输入与行为 |
| --- | --- |
| scope | 当前已授权的 content scope；无授权诚实 unavailable |
| begin | `{goal,requestKey:UUID,expectedStageId:UUID\|null,fileIds?:UUID[]}`，保存实际起点并明确切换当前目标 |
| read | `{stageId}`，读取不可变阶段、修订、认可、候选和问题 |
| history | 当前授权 scope 的历史与当前可写归属，包含存储恢复提示 |
| submit | `{stageId,expectedRevision,patch,correctionOf?}`，消费合法 content Patch；先记录当前观察，再通过既有 executor 实际写入，返回原 ApplyResult 加 stageRevision/stageProblem |
| checkpoint | `{stageId,expectedRevision,requestKey,requestIds?:string[],fileIds?:UUID[],correctionOf?}`，查询真实 Journal 和当前来源，不能提交 caller facts/正文快照/actor |
| reconcile | `{stageId,expectedRevision,requestKey}`，只读真实 Journal 历史进行关联对账，不调用正文 apply/retry/recover |
| activate | `{stageId,expectedStageId,requestKey:UUID}`，明确继续已有阶段，不认可旧阶段 |
| resolveCandidate | `{stageId,expectedRevision,candidateRevision,requestKey:UUID}`，选择已保留的证据分支；不写正文、不语义合并 |

`correctionOf` 为 `{stageId,revisionId,sourceId}`，必须引用同一工作范围的真实历史快照。Patch.metadata.stageId 必须匹配当前阶段，runId 只作线索。外部程序来源保持 local-capability/未知作者；没有公开 accept 或授权回调，不能自证 USER。公开 API 可供已发布外部桥通过可选 adapter 消费，本轮只验证插件本地正式程序入口，未验证跨进程 transport。

本地命令为「开始有意义阶段」「提交当前阶段结果」「查看阶段历史」「认可当前所见阶段版本」；认可快捷键 `mod+alt+enter`。开始命令展示/聚焦目标输入。历史在既有工作视图的紧凑区域，显示目标、时间、认可、修订选择、两种比较基线、继续阶段及候选处理。认可在 UI 私有 acceptLocal 路径冻结 revision/hash；新修订不能在 await 期间一起被认可。

待认可版本与当前原文不同，就近点击「查看待认可版本」进入不可变版本阅读后认可；不会把后续编辑顺带认可。已有认可不受此限制影响。材料往返会沿用 content 的授权撤销，公开程序方法没有因此自动恢复授权；用户点击原位纠正/提交/认可等真实本地动作，由私有入口重新核验范围。

例如，在真实本地用户从工作块开始阶段并授权当前范围后：

```js
const w = window.taskCopilotWorkbench;
const h = await w.stages.history();
const stage = h.stages.find(s => s.start.id === h.current);
const current = await w.content.read();
// operations 必须以 current 的真实 target/contentVersion/parent 和合法范围构造。
const patch = {schemaVersion: 1, requestId: crypto.randomUUID(), scope: current.scope,
  metadata: {stageId: stage.start.id, runId: "explicit-local-run"}, operations};
const actual = await w.stages.submit({stageId: stage.start.id,
  expectedRevision: stage.revisions.at(-1)?.id ?? stage.start.id, patch});
// actual.status 与逐项事实保持原含义；stageProblem 不意味着正文未写。
```

## 实施与恢复要点

原位编辑以完整当前文构造最小合法局部操作，历史纠正记录关联。建议是原文标记子块，权限/TODO 保护不放宽。草稿绑定 scope、目标和 stage，重启后显式恢复并重新读取当前文，不自动提交。partial/unknown/stageProblem 留下双方可读内容和输入，重复请求先查询同 ID，不能更换 ID 重放未知写入。

内容来源来自正式 workspace reader 的内部 live port；content 专用读取继续负责原文编辑、保护和真实 parent。无绑定目录也使用同一 reader。StageStore 始终私有存储，没有目录内影子权威。绑定与目录不可用不改变私有历史，unbind/rebind 通过 sourceVersion 使晚到工作失效。文件只接入明确的已登记材料 ID，未知文件需先通过材料登记，没有第二套文件发现系统。

历史字符串/哈希保存于不可变事件和完整准备副本，索引可重建。材料正文实际保存和恢复仍由材料模块负责；Markdown 及上限内 txt/csv/json 可保存历史文本，二进制保留记录而无字节恢复保证。准备/发布损坏和 Journal 成功、阶段失败的恢复不会写正文。程序重启仅恢复存储和 UI 的阅读能力，没有离线补丁回放。

## 验证记录

最终源代码在本工作树执行一次完整 `npm run check`，退出码 0；日志为 `tmp/stage-workbench/full-check-final.log`。新增问题修复后才重复必要验证，没有改旧断言、跳过测试或降低门禁。日志只保留在自身 `tmp/stage-workbench/` 与 `tmp/logseq-sandbox/evidence/`，不提交 descriptor、token 或环境产物。

| 验证 | 实际结果 |
| --- | --- |
| 纯阶段核心针对性测试 | 16/16；`core-final.log` |
| 原位审阅 DOM/合成 SDK 针对性测试 | 7/7；`review-final.log`，包括后续原文不能冒充待认可版本 |
| 全仓业务测试 | 511/511，其中插件 283/283；0 fail、0 skip |
| Sandbox harness 测试 | 5/5 |
| 依赖边界测试与检查 | 12/12，Dependency boundaries verified |
| requirements / 全仓 typecheck / lint / build 及构建二进制 / Taste | 全部通过；Taste PASS，未自动激活候选 |
| docs 最终更新 | requirements 文档检查退出码 0，生成 44 节点地图；`docs-final.log` |

针对性测试分别验证纯核心、真实私有 FileStorage、实际 content executor、真实 MaterialService 文件、正式 workspace reader、Happy DOM/合成 SDK 的 UI 和安装器。覆盖两个块＋普通追加、同阶段直接纠正和原文建议、精确认可与后续人工编辑、历史纠错、两种基线、未知/partial/conflict、回包丢失、重复请求、阶段写入故障及重启对账、完整准备副本/撕裂发布、scope/dispose/重绑定晚到、分叉与候选选择、材料真实版本/权限、长块/重复文字/缺失 UUID、聚焦全部/返回、组合态和未变化节点，以及 actor/facts 注入拒绝。

Desktop 使用仓库现有 macOS harness，Logseq 0.10.15 / SDK 0.3.4，CDP 19333。连接前核验端口与 target URL 属于本工作树应用副本；所有 Graph、home、profile、Kernel、材料、工作区和证据在自身 sandbox。tasksEnabled=false，生产 Logseq 未连接或停止。冷启动插件通道可能尚未建立，核验归属后只重载自身插件。

已经留存的真实证据包括阶段 UI 原生目标输入、两块修改＋追加实际写回，变化区原生输入事件（isTrusted=true）及本地来源事实、原文建议、部分结果/身份恢复、点击具体版本认可、认可后 Logseq 原生 textarea 键入＋Escape 保存而旧认可不变、真实工作区绑定、材料文件保存和 reference 写保护、二进制记录。SDK 用于创建夹具/正式程序修订；它没有替代原生编辑验收。

| Desktop 实际链路 | 保留证据 |
| --- | --- |
| 开始阶段、两块修改＋普通追加、原位实际键入保存 | `stage-initial-result.json`、`stage-native-edit.json` |
| 建议写入真实原文、partial/身份恢复，恢复前后只有一个正文子块 | `stage-native-suggestion.json`、`stage-suggestion-facts.json`、`stage-identity-recovery.json` |
| 精确认可及后续原生人工编辑，旧认可 hash/ID 保持 | `stage-acceptance.json`、`stage-after-native.json` |
| 聚焦存在范围外变化、实际鼠标看全部/返回，plan 和未变化节点保持 | `stage-lens-before.json`、`stage-lens-all.json`、`stage-lens-return.json` |
| 历史当时内容/认可、横向自然段布局、旧版选择 | `stage-history.json`、`stage-history-final.png`、`stage-history-layout.json` |
| 真正文件版本/只读保护/二进制记录、登记普通文本快照 | `stage-materials.json`、`stage-plain-file.json` |
| 材料实际打开后返回相同工作/历史；本地纠正重新读当前文，无新修订 | `stage-material-navigation.json`、`stage-material-return-view.json`、`stage-material-return-authorized.json` |
| 自身已绑定目录暂时不可用，历史仍展开保存的第二版 Markdown，之后还原目录 | `stage-files-unavailable-expanded.json` |
| 停止并重启自身 Desktop/Kernel，9 个修订 ID 与原认可完全保留，文本历史仍可读 | `stage-restart.json` |
| 最终构建重载后停止自身 Kernel；原生人工编辑使当前文不同，打开实际提交版本并点击认可 | `stage-kernel-stopped.json`、`stage-kernel-free-status.json`、`stage-final-native-events.json`、`stage-pending-snapshot-current.json`、`stage-pending-snapshot-shown.json`、`stage-kernel-free-acceptance.json` |

最后一项没有自动新增阶段或修订；两个明确点击的版本认可并存，原认可原样保留，后来人工文字仍只在当前源。界面重载/重启/恢复不是阶段生成器。

结束时通过现有 `sandbox:stop` 关闭本轮身份核验过的进程；最终 status 显示自身 Desktop/Kernel 均不运行，Graph、材料和证据保留。没有停止生产 Logseq 或其他 session 进程。

Desktop 暴露两点并保留证据：SDK 追加建议后 Logseq 进入原生编辑态，身份补写被既有 guard 记为 OUTCOME_UNKNOWN；结束原生编辑后明确调用已有 resumeIdentity，只核验/补身份，再阶段对账，正文数量保持 1。另有 0.10.15 stat 缺 mode，目录读取返回嵌套数组、IPC 错误跨 realm；host 兼容只依据真实 stat size＋readdir/ENOTDIR 分类，不猜权限错误或未知结果。没有改 executor 状态语义。

历史截图曾暴露隐藏 grip 后正文挤入窄 grid 列；最终使用 visibility 保留列位置并明确正文列，保留旧图 `stage-history.png` 和修复图，最终正文宽度 875px。原生编辑驱动需要先定位自己的夹具页；目标不在当前页时 SDK editBlock 未打开输入，未将失败当作验收。定位后真实 input 事件与后续保存均留存。

真实中文 IME、系统剪贴板/Undo、原生键盘选择与快捷认可驱动、真实双 Graph/外部进程竞争、断电、长期使用、Windows/Linux 未验收。组合态与快捷回调只在 DOM/合成 SDK 中验证。初次 CDP Enter/全选驱动未达到预期，改用真实鼠标点击与原生 input 插入；保留原事实，不将该驱动冒充键盘验收。没有本轮生产 Kernel 完成/暂停实机操作；阶段实现不导入/调用正式状态写入，既有领域回归由全仓门禁覆盖。

## 共享路径与整合条件

共享修改只有：

- content 的 executor.history 和 installer 的公开 history、私有 authorize/apply/lifetime，状态与正文写回语义不变。
- work-view controller/renderer 与新增自有 review-port.ts；保留 lens controller、composition 与生命周期。
- workspace context-service 的 readSource/sourceVersion 和 installer 的内部 source port；公开 workspace API 不扩大。
- host/desktop-files.ts 的实际 Desktop stat 兼容，以及独立回归测试。此路径与小分支可能重叠，整合须保留两边真实桥接形状断言。
- index.ts 的最小安装/dispose/stages namespace、正式 source 和材料 provider 注入；不整体重排组合根。

本分支没有改 CLI、Kernel、SQLite、正式任务领域、公共 transport、依赖/lockfile 或材料业务实现。共享接线单独提交。小/中分支整合应消费这份 Stage schema 与窄 API；认可保留私有本地用户入口。没有已发布 agent-workspace 交付提交，因此真实外部 transport 联调为条件项，不能把本地程序入口称为跨进程验收。极端损坏、并发目标链选择、文件重定位/迁移与跨进程 CAS 的边界见架构；保留证据并失败关闭，不自动回滚/覆盖。
