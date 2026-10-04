# 原文润色与真实块移动实施交接

2026-10-04。本地实现、生产 CLI/隔离 Desktop 移动闭环及完整门禁已交付；原生持续草稿、系统 IME/Undo 等实机验收缺口在下文单列。没有 push、PR、合入 main 或部署。

## 环境与不可变起点

- 远端：<https://github.com/wrd233/logseq-task-manager.git>。
- 本次 `fetch origin main` 得到的完整 main SHA 与实际 REMOTE_BASE_SHA 均为 `e666e7be1367e97dabf5f787c7dcb944ac70e815`；已验证它可从远端取得且属于 origin/main 历史，开发期间未追逐 main。
- macOS 15.1 / arm64；Node 20.20.2 / npm 10.8.2，命令局部选择 Node20，未修改系统默认运行时。package/lockfile 没有变化。
- 工作树：`/Users/wangrundong/.codex/worktrees/content-writeback-organize/任务管理中心-logseq插件`；分支 `codex/content-writeback-organize`。Codex managed worktree 从共同完整 SHA 创建；没有适用 AGENTS.md。未读取别的 session 活动目录或合入未发布分支。
- 原 checkout 的状态和其他 worktree 保留。依赖、dist、Graph、home/profile、材料与 Journal、companion/state/descriptor/evidence 都在本工作树；未加载生产 Graph。

设计：[产品设计](../design/content-writeback-organize-design.md)；架构：[协议、数据流与恢复](../architecture/content-writeback-organize-architecture.md)。这三份文档描述实际落点，历史 handoff 的“尚无 transport”不再适用。

## 提交与共享接线

| 提交 | 内容 |
| --- | --- |
| `981ff3e` | content 协议/结构权限、SDK 移动、保护、Graph 队列、durable 意图/恢复与紧凑冲突 |
| `42adf39` | StageRecorder/Store 对移动事实的保存验证及旧记录兼容 |
| `99089ed` | content/agent installer 最小命令与释放、router 能力协商、生产 CLI help 与独立 CLI 集成测试 |
| `87bf502` | 阶段结构 diff、当前位置观察及 work-view 最小位置展示 |
| `27d6fd6` | 31 项整理专用测试、已知正式 MiniProject 离线含糊字段保护 |
| 最终 docs 提交 | 本文及独立设计/架构；完整 HEAD 见交付回复或本地 `git log` |

共享入口改动集中于 `content-writeback/installer.ts`、`agent-workspace/{installer,router}.ts` 和 CLI `workspace-cli.ts`。最小审阅接线单独在 `stage-workbench/{diff,review}.ts`、`work-view/{review-port,renderer}.ts`。共同测试夹具增加原生移动模拟与计数；真正生产 CLI 测试在 `agent-workspace-entry.test.ts`。新结构逻辑在 `content-writeback/structure.ts`，没有一个新 controller 包揽所有职责。

没有改 index、共同 source-protocol/provider、panel-host、Kernel schema、canonical-writing、plugin-runtime、source-change-observer、graph-adapter、materials store 或使用手册/PDF。`[事务]` 只增加保守保护事实，未抢先实现 04 的正式标题兼容。

## 已交付范围

schemaVersion 2 的 move-block 支持 before、after、first-child；v1 文本与 insert-child、RequestRecord/StageEvent schema1 保持可读。真实默认 adapter 调用 SDK moveBlock，不删除重建、不写 Graph Markdown 文件。普通 TODO 可在明确结构权限中保持文本/状态地移动；文本权限没有扩大。正式/managed 子树、循环、根移动、跨范围/对象和原生编辑均受保护。

完整 structureVersion 作为首版严格拓扑前提；源/目标绑定正文版本及父级。同一请求逐项稳定执行，结构操作阻断跨操作的同块文本合并；依赖下一步必须重新读取。无跨程序 CAS 或跨块事务。

必要前结构、子树属性/归属、宿主应答与实际后结构进入既有 FileStorage Journal。相同键同 payload 返回原事实；不同 payload 拒绝。恢复查询不会重放未知移动；观察到预期位置仍保留 OUTCOME_UNKNOWN、作者未知。后来人工重新移动或编辑，不会被旧成功请求“纠正”回去。

阶段经过真实 router → submit → recorder/store；纯移动有 revision，同 UUID 显示结构变化。当前块再移动会提示实际观察位置/来源未知，保存的修订及认可仍只读。外部 agent 不能 begin 或认可。

## 可复现 fixture 与生产 CLI

在独立 File Graph 原生建立 Area 页“个人工具”链接 Project 页“资料工作台”。后者包含以下自然块，没有预先插入报告标题：

```text
**[MiniProject]** 整理一份调研材料 #MiniProject
  [注] 条件仍需核验。
  无标记限制：只有引用齐全时采用。
    [链接](longdoc://synthetic-reference) 与块引用
      多行代码块
  [目标] 保留口吻与原始条件。
  [想法] 另一个例子不能代表全部情况。
  TODO 核对反例，不改变状态
TODO **[事务]** 核对引用资料
```

上例限制行与 `[注]` 是同一原块的换行；其余缩进表示真实子块。已提交逻辑夹具是 `tests/fixtures/content-writeback.ts` 和 `tests/content-writeback-organize.test.ts`。本轮真实 fixture 由受控 SDK bootstrap 建立，润色和移动都由独立的 built CLI 进程提交。

先本地绑定当前工作目录，再通过块菜单“允许 agent 润色并整理此工作原块”建立结构许可。沿用生产 companion（不新建匿名写服务器）：

```sh
node apps/task-copilot-cli/dist/main.js workspace serve --state-dir "$STATE_DIR"
node apps/task-copilot-cli/dist/main.js workspace status --directory "$WORK_DIR" --state-dir "$STATE_DIR" --client organizer --json
node apps/task-copilot-cli/dist/main.js workspace content read --directory "$WORK_DIR" --state-dir "$STATE_DIR" --client organizer --json > source.json
```

status 的 `contentProtocol` 必须广告 v2/move-block 且 `structureAuthorized=true`。用 source.json 的真实 UUID 生成封闭补丁；没有展示 section/DOM order：

```js
// node --input-type=module；SOURCE_UUID/TARGET_UUID 是本次读到的真实普通块。
import {readFileSync, writeFileSync} from "node:fs";
const s = JSON.parse(readFileSync("source.json", "utf8"));
const a = s.blocks.find(b => b.target.blockUuid === process.env.SOURCE_UUID);
const b = s.blocks.find(b => b.target.blockUuid === process.env.TARGET_UUID);
if (!a?.contentVersion || !b?.contentVersion) throw Error("Select available source blocks");
writeFileSync("move.json", JSON.stringify({
  schemaVersion: 2, requestId: "organize-001", scope: s.scope, metadata: null,
  operations: [{type: "move-block", operationId: "move-1", target: a.target,
    expectedContentVersion: a.contentVersion, expectedParentUuid: a.parentUuid,
    destination: b.target, expectedDestinationVersion: b.contentVersion,
    expectedDestinationParentUuid: b.parentUuid, position: "after",
    expectedStructureVersion: s.structureVersion}]
}), {mode: 0o600});
```

```sh
node apps/task-copilot-cli/dist/main.js workspace content apply --input-file move.json --directory "$WORK_DIR" --state-dir "$STATE_DIR" --client organizer --json
node apps/task-copilot-cli/dist/main.js workspace content result organize-001 --directory "$WORK_DIR" --state-dir "$STATE_DIR" --client organizer --json
node apps/task-copilot-cli/dist/main.js workspace content recover organize-001 --directory "$WORK_DIR" --state-dir "$STATE_DIR" --client organizer --json
```

重试同一文件返回历史；明确纠正要新 requestId 和当前 read。content.retry 的已有命令接受 `{previousRequestId,patch}`，只允许已证明未应用项。阶段先在本地“开始阶段”，再通过 `stage read` 取得 ID/revision；补丁 metadata.stageId 绑定该阶段，`stage submit --input-file stage-submit.json` 的输入为 `{stageId,expectedRevision,patch}`。它与 content.apply 共用同一 executor 和 Journal。

材料跟随引用同步的窄端口例：materials 在其已登记引用与别名证据中选定一个普通块和确切旧显示名，用 `content.read` 版本生成既有 replace-text，调用 `content.apply` 或 `content.retry`。不改 longdoc://ID，不让改名或关联自授正文范围权限。本轮没有改名 feature 或另造材料保存能力。

## 验证与证据

- 针对性核心/entry/阶段/审阅：112/112 通过；其中整理专用 31 项覆盖三种移动、非空子级、身份/属性保留、草稿/模拟组合态、前提/保护/归属、意图后的变更、未知/超时/部分成功、同键冲突、旧记录、损坏最新记录、重载及阶段 UI。
- 完整 `npm run check` 退出 0：docs:requirements、全部 typecheck/lint、workspace tests 564/564（插件 330）、sandbox 5/5、build/内置二进制检查、边界 12/12、taste:eval PASS。无跳过断言、无 Kernel/材料权限回归修补；`git diff --check` 通过。
- 独立 production CLI 自动集成测试包含真实 index 注册/释放、私有 companion、router、scope 许可切换、v2 stage submit/result/recover/replay 和历史不可变；其 Logseq 宿主是模拟 SDK，不冒充 Desktop。
- 实机：本工作树独立 Logseq 0.10.15 / SDK 0.3.4、CDP 127.0.0.1:19338。已先核验端口空闲和进程/app/profile/home/Graph 归属，未使用固定 19333 或另一 session 的进程。tasksEnabled=false，无 Kernel 启动。
- 实机由 built CLI 完成 before/after/first-child、普通 TODO 及非空子级前插入；实际 UUID、多层子树、块引用、材料链接、代码、换行均读回。润色只替换一个原始片段，标记和限制保留。
- 实机还验证陈旧拓扑冲突、混合批次部分成功、阶段纯结构/混合提交、结果/恢复/同键回放、紧凑冲突界面真实呈现（没有文本 editor）。插件重载与整应用冷启动后重新加载/授权，原记录可查询，同键重试不恢复后来的位置/正文，阶段历史不变。

原始私有证据保留在本工作树 `tmp/content-organize/evidence/`：full-check.log、targeted-final.log、desktop-cli-facts.json、native-child-existing.json、native-structure-conflict.json、native-partial.json、desktop-conflict-ui.json/png、restart-query-replay.json、restart.log、cold-restart.log、local-reading-after-disconnect.json。默认真实 Journal 在 `tmp/logseq-sandbox/home/.logseq/storages/task-copilot-vnext/`。这些合成数据未作为公开日志或凭据提交。

## 实机缺口与最小复验

原生 textarea 打开及输入确实在 Desktop 发生；本轮 CDP 输入/焦点尝试中，宿主随后结束编辑，出现版本冲突或在已提交正文上的移动。没有证据证明“持续未结束的原生草稿遇到独立 CLI 时保持编辑态并拒绝移动”通过。相关尝试保留在 native-guard.log、native-focused-active.json 等，不能以逻辑 EditingGuard/模拟 composition 的通过代替。实现未调用保存、取消或 exitEditingMode 来处理用户草稿；演练脚本的 exit 是对隔离 fixture 的显式测试收尾。

最小人工复验：在隔离实例保持原生光标与未结束草稿，对该块/其子树/相邻目标提交新读版本的 CLI 移动，确认 BLOCKED、草稿/光标不变；再用真实中文 IME、Undo 复验。自动化焦点环境的差异需与 01 的原生往返接线一起核对。冷启动演练在 Graph SDK 就绪后重载插件并重新授权，未声称自动恢复连接/权限。

系统中文 IME、系统 Undo、DB Graph、其他 OS、生产资料和跨电脑远程 agent 未实机验收。Graph/scope/dispose 的晚到与超时已有逻辑/集成覆盖，未在 Desktop 制造不可取消移动期间的 Graph 切换。材料本轮运行现有全部回归，未进行真实文件系统拖放/重命名验收。

## 整合事项

1. 按用户授权使用上述本地提交；无需额外 provider/transport。01 消费真实来源目标、版本和结构，统一原生焦点与阅读上下文；当前 SDK 行的位置观察只作显示。
2. 02 在可信已登记引用中调用现有文本 API；跟随证据、文件改名、materialId 与别名策略仍由它负责。
3. 04 的已提交标题兼容接入后重跑正式/事务保护；本分支没有将不认识标签当作授权。
4. 最终整合独立运行完整门禁，并完成上述原生草稿/IME/Undo/Graph 晚到实机缺口；不把本轮自动化尝试升级为这些通过证据。

停止本轮自有 Desktop/companion，保留 worktree、profile、Graph 和证据。外部连接停止后本地阅读/材料/历史仍由既有能力提供，没有默认 agent 或模型依赖。
