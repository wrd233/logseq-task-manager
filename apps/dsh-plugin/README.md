# DSH × Logseq 工作台

可安装的 DSH 插件。**Unified Work Experience UX v1**、**Personal Inbox v1** 与 **DSH ↔ Companion 双向闭环（D-47 / D-48）** 把工作入口、当前结构、Reader、原生引用、共享简报、个人收集箱、历史回看、变更回顾与时间规划放进同一个 DSH 工作界面；前期最终收尾记录见 [Final UX Polish & Acceptance Closure v1](../../docs/implementation/final-work-experience-polish-v1/README.md) 与 [Personal Inbox v1](../../docs/implementation/personal-inbox-v1/README.md)。

- 原生 DSH 对话、输入框、模型选择和轨迹继续使用宿主实现。
- 会话头部保留 **工作**、**规划** 与 **收集箱**。阅读、结构、简报、引用、收集箱、历史回看与变更回顾都使用 DSH 原生右侧栏，可拖动、全屏和分栏。
- 每个 DSH 会话独立保存工作身份。换会话同步右侧栏；连接恢复由 Logseq/companion 已有的只读授权恢复，不需要重新关联。
- Work tab、Planner tab 与 Inbox tab 保持挂载；在历史、规划、收集箱之间切换再回来，当前工作对象、阅读/结构模式和滚动位置保留。
- **D-41 / D-47 隐私与敏感文件边界**：敏感凭据文件（`.env*`、`*.key`、`*.pem` 等）默认禁止发往模型并在文件页标注「敏感」；当工作在 Logseq 设为「仅本地模型 / 禁止上云」时，DSH 模型上下文与读取工具严格 Fail Closed，右侧栏本地阅读不受影响。
- **D-48 双向回流闭环**：DSH 原生 Agent 工具新增 `logseq_writeback_propose`（仅限待审提案，自动生成锚点计划回流 Logseq 左侧 FLIP 预览）与 `logseq_reading_candidate_submit`（暂存阅读候选进 Companion `ReadingJobHub`）；Work tab 在有待审提案或候选修订时安静显示回流状态条（支持一键跳转 Logseq 审阅或撤回），简报 tab 可直接经 Companion 发起阅读简报整理，所有「采用到工作」动作统一在 Logseq 确认。

## 使用入口

1. 保持 workspace companion 与 DSH 运行。新版 Logseq 工作台直接点当前工作「在 DSH 继续」，自动复用已有工作目录或按需准备目录与只读连接；目录关联、连接修复和独立写入许可仅在必要时从工作选项操作。首次连接和日常路径见 [新版工作台使用说明](../../docs/user-guide/logseq-workbench.md)。
2. 打开 DSH 会话，点会话头部 **工作**，或右侧栏 guide 的 **当前工作**。未关联时 Work tab 会给出「选择一件工作 / 关联当前目录 / 在 Logseq 允许只读连接」的简短引导。
3. 已有可响应的 DSH 页面时，在 Logseq 点 **在 DSH 继续** 会在当前页面恢复目标工作的最近有效 Session；同一件工作重复进入不会重复打开页面或 Session。只有 Logseq 的「在新标签页打开 DSH」才交给系统新开页面。Work 菜单还提供切换工作、新建此工作对话、工作文件和解除关联；解除关联保留原对话和草稿。
4. 从 Work tab 顶部的 **历史回看**、**变更回顾** 进入次级能力；从 **规划** 或 guide 的 **个人时间规划** 进入时间安排。

在项目安装依赖后，要向目标 profile 安装当前工作树的版本，用 Node **22.19+**（DSH 所需）执行：

```sh
node apps/dsh-plugin/scripts/install.mjs web
```

安装器构建插件、备份 profile manifest、调用官方 `dsh plugin --profile web add link:...`，然后选中 bundle。若正在运行的 DSH 没有重新加载，重启该 profile。默认 companion 状态目录是 `~/.task-copilot-workspace`；自定义目录可通过 DSH 进程的 `TASK_COPILOT_WORKSPACE_STATE` 或 bundle 配置 `workspaceStateDirectory` 指定。私有会话绑定保存在 `~/.dsh/logseq-workbench/bindings.json`，不保存正文或连接凭据。历史快照另存在同目录的 `history/`，包含选定工作结构及来源证据。Planner 默认保存在同一状态目录的 `semantic-planner.json`，可通过 `plannerStateDirectory` 单独指定。

## 当前工作结构

Work tab 默认读取保存后的当前 Logseq 来源结构：

- 根节点是当前聚焦的事务、TODO 工作对象或 MiniProject；默认只显示直接下级工作对象。
- 点下级进入它自己的内部；顶部面包屑和返回按钮回到上级。
- 只有当前根节点下没有更低级工作对象时才展示普通内容；纯标题工作有简短空状态。
- 结构每 5 秒定向刷新，Logseq 保存后的修改会自动出现；刷新不会创建 Stage 历史记录。
- **原文** 模式始终可切到完整来源 Reader；**结构** 模式保持当前工作对象优先。
- 当前结构只使用 Logseq 来源树，不把 Git 文件变化混进来；历史回看和 Git 变更回顾在独立入口中。

## Reader 与引用

- Reader 保留 Logseq 原始父子层级、顺序和缩进，支持折叠/展开、长文阅读。
- TODO/DOING/DONE 等状态原词显示；`[注]`、`[结论]`、`[待确认]`、`[风险]` 作为语义标签；`[Project]`、`[MiniProject]`、`[任务]` 作为对象类型 chip，正文不显示这些行首标记。
- Markdown、链接、页面引用、代码与表格按服务端 Marked tokens 渲染；用户属性单独展示，`id::` 不进入普通正文，代码块内的 `id::` 原样保留。
- 不再为每个块放常驻引用按钮。悬停/键盘焦点时最近块出现 **＋**（加入引用）和 **↗**（Logseq 打开）；选中文字出现紧凑的「引用选中文字」。
- 已选引用进入底部 tray，可逐条移除或清空。加入对话前通过 `reader-references` 校验真实 sourceId、版本和范围；成功后通过 DSH 原生结构化引用接口插入草稿，保留已有输入，不自动发送。
- 草稿显示 DSH 原生引用标签：原文摘要、Logseq 和所属工作。完整 sourceId、Graph、块 UUID、contentVersion、WorkRef、range 保存在原生引用数据中；复制得到可读引文，模型上下文仍带完整来源快照。

## 连接恢复

正常连接不显示连接控件。连接断开时只显示一句具体状态和最简单的下一步：等 Logseq 自动恢复、在 Logseq 允许只读连接、重新关联移动后的目录，或切回原 Graph。每 8 秒静默重试；不会向用户显示 descriptor、lease、binding、scope 等内部术语。恢复成功后自动重新读取当前结构、原文和文件列表，不需要重新关联。

## 时间规划

- 会话头部 **规划** 或右侧栏 **个人时间规划** 进入；默认 **现在** 使用 `planner-current` 的当前语义时段。
- 当前时段内显示灵活安排；正在进行和即将到来的固定安排用紧凑区段保留；没有匹配语义时段时回退到全天安排，不显示空白。
- 仍保留今天、明天、本周视图和语义时间段编辑。
- 固定安排有明确开始/结束和固定 badge，不进入语义时间段；没有拖动把手，后端普通 move/reorder 也会拒绝；只能通过显式编辑修改时间。灵活安排通过把手的指针拖动跨时段移动或排序，仍可显式编辑；没有新增拖动依赖。
- 计划投入、实际投入、截止时间、固定时间分别保存和展示。
- 有工作引用的安排可从菜单 **在工作结构中查看** 或 **在 Logseq 打开原文**。前者在当前 DSH 会话的 Work tab 中定位对应工作对象，不创建新 Session；后者使用 `planner-navigate` 生成可核验的原文入口。
- 带入安排会保留已有草稿（包括选中文字），只插入文字，不自动发送。

## 历史回看与变更回顾

**历史回看** 是 Work tab 的次级入口，不再占据会话头部：打开列表时先同步已有 StageStore 修订（不会新录制 Stage），顶部保留离散时间轴、结构树/图和真实父修订差异；快照与当前结构的实时状态在文字和颜色上明确区分。点击节点查看历史标题、路径、声明状态、历史正文、字段差异和来源核对；「解释本阶段」只带解释请求入草稿，不自动调用模型。顶部 **当前工作** 返回 Work tab，并保留当前工作对象和滚动位置。

**变更回顾** 打开原有 Work Evidence tab：按文件查看真实 Git 提交和未提交变化、Diff、Agent 解释与交接。它和 Logseq 来源结构是不同观察维度，不共享树或时间轴。所有历史与证据浏览只读，不修改正式任务状态或 Graph。

## 构建和验证

仓库依赖安装、根检查仍用 Node **>=20.19 <21**；DSH 宿主验证用独立 Node 22.19+。

```sh
node apps/dsh-plugin/scripts/build.mjs
node --import tsx --test apps/dsh-plugin/tests/*.test.mjs
node --import tsx apps/dsh-plugin/tests/host-proof.mjs
```

本轮实际运行：

- `node --import tsx --test apps/dsh-plugin/tests/*.test.mjs`：**77/77 pass**
- `node apps/dsh-plugin/scripts/build.mjs`：通过
- `node apps/logseq-plugin/scripts/build.mjs`：通过（隔离 Logseq + companion 实机验收）
- `eslint apps/dsh-plugin/src apps/dsh-plugin/tests`：通过
- `git diff --check`：通过

没有运行全仓 `npm run check`；本轮为前端与只读呈现改动，优先真实 DSH + Logseq 走查。

## 当前边界

- 已打开页面通过认证长等待请求接收 handoff，后台计时节流不再依赖 650ms 轮询；页面被彻底冻结/丢弃或断线时仍保留系统打开票据 URL 的兜底。没有跨标签页 leader election。
- 无法强制 macOS 浏览器窗口置顶；只能请求 focus。
- 当前结构只提供树，历史仍提供树/图；这是有意的，避免维护第二套结构过滤投影。
- 既有命名阅读成果与 Agent 工具接口保留；Logseq 默认文章读面不再列出「连续阅读／原结构」模式，旧成果进入按需版本选项。DSH 原有 Reader、简报、结构及历史能力不因 Logseq 入口收敛改变。
- 引用使用 DSH 原生标签，完整来源数据不直接显示在输入框；表格按实际行/单元格映射；无法精确映射的转义管道单元格提示改用整块引用。
- 变更回顾的模型理解需要用户明确点击并配置模型；验收环境没有调用外部模型。
- 文件页仍显示当前工作目录和显式关联材料；没有增加上传、内嵌预览或全 Graph 对象目录。
- 写回工具仅支持待审提案通道（`logseq_writeback_propose` 的 `content-proposal` / `formatting-preview` 与 `logseq_reading_candidate_submit`），不会静默改写 Logseq 原块、文件、TODO 或正式任务状态；所有采用动作统一在 Logseq 确认。DSH 自身通用终端工具的权限仍由 DSH 管理。
- 本轮实机验收使用隔离 Logseq 副本、测试 Graph 和测试工作区，没有使用真实用户 Graph；具体截图、测试数据和未完成项见 [Unified Work Experience UX v1](../../docs/implementation/unified-work-experience-ux-v1/README.md)。

`src/` 是正式宿主和 React 客户端，`cordis.patch.yml` 是 bundle，`scripts/` 是构建/安装器，`tests/` 是验证程序。`prototype/` 保留交互样例，`research/` 保留前期宿主实验，见 [设计记录](design.md)。

最终整合另完成 97 项关键回归（DSH 77、Logseq 18、读取目标 2）。最终整合与本轮真实宿主验收见 [Final Work Experience v1](../../docs/implementation/final-work-experience-v1/README.md)。
