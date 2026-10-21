# 后续 Goal A：Capture / Inbox 日常闭环

状态：完整后续 Goal 提示词。由用户在电脑 A 发起本 Goal 后执行；当前准备任务不启动实现。目标分支 `codex/capture-inbox-v1`，共享类型已随[并行契约](../02-并行开发契约.md)进入共同基线；真实适配器仍待后续接线，不必等待另一条开发线。原始产品目标见[Capture / Inbox](../../modules/01-Capture与Inbox.md)和[DSH 工作现场](../../modules/02-DSH工作现场.md)。

## 独立检出与运行

在新目录执行以下命令。已有同名目录/分支时先核查并保留其工作，不覆盖。仓库安装/检查使用 Node `>=20.19 <21`、npm 10.8.2；宿主 DSH 另用它支持的 Node 22.19+（本机验证环境为 Node 24），不要改仓库 engine 来兼容宿主。

```sh
git clone --single-branch --branch codex/capture-inbox-v1 https://github.com/wrd233/logseq-task-manager.git task-copilot-capture
cd task-copilot-capture
git status --short --branch
git fetch --prune origin
git log -1 --oneline
node --version
npm ci --no-audit --no-fund
npm run typecheck
npm run build
```

真实 Logseq 安装使用构建后的 `apps/logseq-plugin`，DSH 构建/隔离 profile 的接入参考仓库 `apps/dsh-plugin/README.md`，不要覆盖日常 profile。上面的 build 是启动准备验证，最终功能仍须满足下面的真实宿主验收。

## Goal 正文

你负责 Task Copilot 的 Capture / Inbox 开发线 A。实现从 DSH 快速记录、可靠保存、Inbox 回看/编辑/搜索/归档，到带原文与真实来源进入原生 DSH 草稿、返回原现场的闭环。复用已有来源、材料与会话机制；不要实现第二套聊天、正式任务库、Journal 同步或共享协议。

开始前读取[代码基线](../00-代码基线核查-2026-10-21.md)末节、[并行契约](../02-并行开发契约.md)、[来源状态](../../SOURCE-AND-STATUS.md)、[待决登记](../../DECISION-REGISTER.md)、[跨模块设计](../../architecture/01-跨模块设计.md)和模块 01/02。输入 main 为 `669726965693595c860dbc235b85a5adc1d82900`，本次准备提交是两条分支起点；执行时重新 fetch 核对实际 SHA，不盲用历史 SHA。未合并的一键 DSH feature 不在依赖中。

### 入口检查与依赖

1. 检查实际 HEAD、工作区、共同基线及 `apps/logseq-plugin/src/workspace/copilot-ui-port.ts`。若有已有工作或分歧，保护并报告，不 stash/reset，不覆盖。fetch 失败则停止依赖远端状态的操作。
2. 确认共享类型已跟踪后即可实施本线模块，不等 B；port 的真实实现仍由共同基线主代理串行接入。需要共享改动时写本模块 `INTEGRATION-REQUEST.md`，不能自行复制公共文件。获授权的本线成果应提交并普通推送本分支，最终交回 PR；不自行合并 main 或另一条线，不 force-push。
3. 由本线 Codex 与主代理完成 G2：确认具体可靠存储、无项目保存、断连/重启草稿和读回方案。优先复用 MaterialService / 私有存储基础，验证适用性后再选择；单设备限制需明确，不能默认为跨设备同步，也不能以 Journal 为存储捷径。
4. 依赖按已提交 lock 用 npm ci 安装；早期本地缺 mammoth 的记录不等于干净检出必然缺依赖。安装失败、SDK 变化或宿主插槽不适配时记录实际阻塞；不修改依赖/锁文件来顺带修环境。纯 UI 可使用明确标记的模拟 Store，但不能据此完成生产闭环验收。

### 输入与模块输出

- 输入：共享 WorkUiContext / SharedUiPort、主代理批准的 CaptureStore。scope/binding 允许为空，不要求选择项目；保存范围不等于用户已授权任意项目文件读取。
- 输出：模块本地轻量记录、可编辑版本和队列状态、可查询保存结果、用户触发的草稿引用文本；不新增正式 WorkObjectKind 或全局通用 SourceRef。
- 来源复用现有块 target/sourceId/contentVersion、材料 UUID/version/reference，DSH sessionId 单独保留；不存在来源可留空，禁止伪造 Graph 块身份。

### 需要实现的行为

1. 捕获首帧直接聚焦正文；保存前不要求标题、项目、标签或 AI 分类。默认成功后收起并返回原焦点；显式钉住后清空已保存正文并继续输入。DSH 内钉住与系统跨应用置顶分开。
2. 关闭、中断、保存失败、连接改变时保护输入。只有可靠保存回执才显示成功；pending/partial/unknown 与 saved 分开。同一次重试用原 requestKey，用户故意写相同正文的新记录使用新 key。
3. Inbox 紧凑列表按时间浏览、全文搜索、双击编辑，提供今天/全选当前结果/清空选择，支持归档与撤销归档；归档仍可搜索。另须保留编辑历史并可将旧正文恢复为新版本，保留原始正文和旧版本，不覆盖后来编辑；版本冲突不能覆盖未保存输入。这与撤销归档、正式事务回滚是不同动作。
4. 选择一条或多条后，按原文与真实来源生成引用，使用 SharedUiPort.insertDraft；原生 revision-guarded 插入失败时保留引用，不替换全文、不自动发送、不切换 cwd 或静默重绑 session。
5. Inbox 处理状态不代表工作完成。正式化、TODO/Journal 写入和历史结构编辑不在本 Goal 内；不显示假可用出口。后续接入需要独立可信授权与明确的同步语义。
6. 键盘、焦点、窄屏、减少动态效果与低对比阅读式视觉可用。Escape/背景点击等未冻结细节列为可逆默认，不能写成用户最终决定。

### 文件范围与分工

本线可新增/维护 `apps/dsh-plugin/src/capture-inbox/`、`apps/logseq-plugin/src/features/capture-inbox/`，以及 DSH/Logseq tests 下的 `capture-inbox.*test.*`。只读消费 copilot-ui-port 与现有协议。所有入口注册、service/RPC、全局样式、Logseq 安装入口、共享存储/API 改动由主代理串行接线。

禁止修改 B 的 structure-history 目录、Kernel/domain/sqlite、Stage 协议/数据、公共来源协议、根配置/依赖/锁文件、DSH profile；不读取真实敏感资料，不扩大正式权限，不自动同步 Journal。不够用时提交具体接口变更请求，不在本线复制公共类型。

**适合 DSH 的前端子任务**：在上述目录内实现捕获窗、钉住交互、紧凑 Inbox、搜索/多选/双击编辑 UI，接固定 mock Store 和共享类型，交付键盘、窄屏、保存失败/输入忙状态。Codex 保留持久化、版本/幂等、宿主草稿与焦点、来源验证和最终审查责任。

DSH 通道不可用或尚无外发授权时，交付下方独立子任务提示词，不假称已委派；Codex 可继续本线工作。若使用外部 Flash，先说明发送的任务与文件会进入 DeepSeek 官方 API，取得该最小目录的授权，检查秘密并仅使用已批准的脱敏副本；不要默认真实仓库已获外发许可。任务必须自包含，附 cwd、明确文件清单、固定 fixture、禁止范围、验收和唯一 idempotency_key；同键查询，成功后 Codex 独立看 diff、重跑测试。另一台电脑没有本机 DSH Worker 目录时，使用提示词，不依赖绝对路径存在。

委派前阅读系统 `/Users/wangrundong/work/codex-dsh-system/README.md` 与当时适用的 AGENTS.md，核对 `config/projects.json` 精确目录许可。默认 hub、read_only=true；写入任务须有对应最小目录写入授权。Flash 固定单 Worker、180 秒内、最多 16 次请求，不自动升级/重试/递归，不额外套 Codex 调度子代理；终端降级须按 README 明确 backend。不要改变全局 provider、主模型或登录。

### 验收与完成门槛

- 测试真实持久化读回、重启后记录、同 key 重试无重复、同 key 不同正文拒绝、新 key 相同正文允许；部分成功/回执丢失/断连不丢输入，存储失败不播成功动画。
- 验证搜索、归档/撤销归档、多选今天与搜索结果全选、编辑版本冲突、旧正文恢复产生新版本且原始/后来版本可查；数据跨 Graph/会话不串线，无项目保存不创建占位正式对象。
- 真实 DSH 中验证草稿已有内容、异步期间继续输入、切换 session、提交锁定、关闭返回；均不覆盖草稿或自动发送。来源正文中的指令不改变权限。
- 运行新增 `capture-inbox` 行为测试；重跑基线所列 DSH service、workspace-context、workspace-reading 及 agent-workspace-entry；受影响 workspace typecheck/build。主代理整合后执行根 check，并检查其生成差异。
- 真实 DSH/Logseq 验收用独立合成 Graph/profile，记录版本、步骤、结果和未验项；替身 IME 不能算物理中文输入验收。
- 只有真实存储 + 真实宿主入口 + 草稿保护都得到证据才报告闭环完成。只有 mock UI 时报告“前端子任务完成，集成未完成”；保持整体 Goal 未完成并记录 G1/G2/G4 阻塞。

交付实际 commit/diff、远端分支或 PR、文件清单、共同基线 SHA、测试命令与退出结果、宿主证据、可逆默认、未决事项和失败恢复方式；不得以 Worker 自述代替检查。共享接线由共同基线主代理先发布再获取；等待接线可交回模块成果，但整体 Goal 不算完成。完成后停下，不自行进入 Journal、正式化或下一模块开发。

## 独立前端子任务提示词（通道不可用时直接交付）

> 你负责 Task Copilot Capture / Inbox 的纯前端。cwd 为本次提交任务指定的、经用户批准的脱敏 `capture-inbox` 目录。Codex 先在目录内提供只读 `ui-input.md`，包含固定 props、共享类型的引用说明和醒目标注“合成数据”的 fixture；若缺少该输入，报告缺项，不猜造公共接口。
>
> 只允许新增或编辑当前目录 `view.jsx`、`styles.mjs`，导出 React `CaptureInboxView`。通过输入 props/callbacks 渲染捕获浮窗、钉住连续输入、紧凑 Inbox、搜索/今天/当前结果全选、双击编辑、编辑历史选择与恢复请求、归档/撤销归档和带去 DSH 请求。pending/unknown/conflict/failed 均保留输入；没有可靠 saved 回执不播放成功效果。关闭/返回仅回调，保存和恢复仅发意图，不直接执行 I/O。
>
> 不改共享类型、Store、RPC、入口、全局样式、Kernel、依赖、配置或其他目录；不读真实 Graph/用户资料，不用 localStorage 冒充可靠保存，不实现 AI 分类/Journal/正式任务写入，不自动发送 DSH 草稿。支持键盘、窄屏、减少动效，变化不能只靠颜色。
>
> 交回允许文件的实际变更、props 使用说明、失败态与未验证清单。你没有终端测试权限，不声称跑过检查；由 Codex 独立检查 diff、运行 UI 测试并做真实宿主验收。Worker 执行限制和幂等键由提交方按本文及 AGENTS.md 填写，不递归委派。
