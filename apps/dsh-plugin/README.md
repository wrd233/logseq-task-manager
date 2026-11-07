# DSH × Logseq 工作台

可安装的 DSH 插件。**Unified Work Experience UX v1** 把工作入口、当前结构、Reader、引用、历史与时间规划放进同一个 DSH 工作界面；最新的真实界面、接口接入和验收记录见 [Unified Work Experience UX v1](../../docs/implementation/unified-work-experience-ux-v1/README.md)。

- 原生 DSH 对话、输入框、模型选择和轨迹继续使用宿主实现。
- 会话头部只保留 **工作** 与 **规划**。工作入口不再依赖旧的左侧浮层；阅读、结构和引用都使用 DSH 原生右侧栏，可拖动、全屏和分栏。
- 每个 DSH 会话独立保存工作身份。换会话同步右侧栏；连接恢复由 Logseq/companion 已有的只读授权恢复，不需要重新关联。
- Work tab 与 Planner tab 保持挂载；在历史、规划之间切换再回来，当前工作对象、阅读/结构模式和滚动位置保留。

## 使用入口

1. 保持 workspace companion 运行。Logseq 工作先关联目录，再在 Logseq 对工作入口块允许 **agent 只读连接**。DSH 复用这份连接，不新增读写许可。首次连接配置见 [工作台使用说明](../../docs/user-guide/workbench-usage.md#agent-接入附录)。
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
- 已选引用进入底部 tray，可逐条移除或清空。加入对话前通过 `reader-references` 校验真实 sourceId、版本和范围；成功后用原生 inputActions 插入草稿，保留已有输入，不自动发送。
- 引用文本包含人类可读引文和紧凑来源身份行（sourceId、contentVersion、WorkRef、range）；不伪造来源，不使用自定义 chip。

## 连接恢复

正常连接不显示连接控件。连接断开时只显示一句具体状态和最简单的下一步：等 Logseq 自动恢复、在 Logseq 允许只读连接、重新关联移动后的目录，或切回原 Graph。每 8 秒静默重试；不会向用户显示 descriptor、lease、binding、scope 等内部术语。恢复成功后自动重新读取当前结构、原文和文件列表，不需要重新关联。

## 时间规划

- 会话头部 **规划** 或右侧栏 **个人时间规划** 进入；默认 **现在** 使用 `planner-current` 的当前语义时段。
- 当前时段内显示灵活安排；正在进行和即将到来的固定安排用紧凑区段保留；没有匹配语义时段时回退到全天安排，不显示空白。
- 仍保留今天、明天、本周视图和语义时间段编辑。
- 固定安排有明确开始/结束和固定 badge，不进入语义时间段；没有拖动把手，后端普通 move/reorder 也会拒绝；只能通过显式编辑修改时间。灵活安排仍可拖动、排序、编辑。
- 计划投入、实际投入、截止时间、固定时间分别保存和展示。
- 有工作引用的安排可从菜单 **在工作结构中查看** 或 **在 Logseq 打开原文**。前者在当前 DSH 会话的 Work tab 中定位对应工作对象，不创建新 Session；后者使用 `planner-navigate` 生成可核验的原文入口。
- 带入安排会保留已有草稿（包括选中文字），只插入文字，不自动发送。

## 历史回看与变更回顾

**历史回看** 是 Work tab 的次级入口，不再占据会话头部：顶部保留离散时间轴、结构树/图和真实父修订差异；快照与当前结构的实时状态在文字和颜色上明确区分。点击节点查看历史标题、路径、声明状态、历史正文、字段差异和来源核对；「解释本阶段」只带解释请求入草稿，不自动调用模型。顶部 **当前工作** 返回 Work tab，并保留当前工作对象和滚动位置。

**变更回顾** 打开原有 Work Evidence tab：按文件查看真实 Git 提交和未提交变化、Diff、Agent 解释与交接。它和 Logseq 来源结构是不同观察维度，不共享树或时间轴。所有历史与证据浏览只读，不修改正式任务状态或 Graph。

## 构建和验证

仓库依赖安装、根检查仍用 Node **>=20.19 <21**；DSH 宿主验证用独立 Node 22.19+。

```sh
node apps/dsh-plugin/scripts/build.mjs
node --import tsx --test apps/dsh-plugin/tests/*.test.mjs
node --import tsx apps/dsh-plugin/tests/host-proof.mjs
```

本轮实际运行：

- `node --import tsx --test apps/dsh-plugin/tests/*.test.mjs`：**73/73 pass**
- `node apps/dsh-plugin/scripts/build.mjs`：通过
- `node apps/logseq-plugin/scripts/build.mjs`：通过（隔离 Logseq + companion 实机验收）
- `eslint apps/dsh-plugin/src apps/dsh-plugin/tests`：通过
- `git diff --check`：通过

没有运行全仓 `npm run check`；本轮为前端与只读呈现改动，优先真实 DSH + Logseq 走查。

## 当前边界

- 浏览器后台标签页的定时器会被节流；核心 handoff offer 的 2.5 秒认领窗口过后，Logseq 仍可能走系统打开票据 URL。本轮没有改核心票据协议，也没有跨标签页 leader election。
- 无法强制 macOS 浏览器窗口置顶；只能请求 focus。
- 当前结构只提供树，历史仍提供树/图；这是有意的，避免维护第二套结构过滤投影。
- 命名读法仍由 Logseq 原有阅读菜单和 Agent 工具维护；统一工作面的默认阅读是当前来源 Reader，不再在 DSH 左侧浮层重复旧读法选择器。需要在 DSH 内切换命名读法的旧流程不在本轮入口中。
- 引用在草稿中是「引文 + 紧凑身份行」，没有自定义引用 chip；表格选区偏移为近似映射。
- 变更回顾的模型理解需要用户明确点击并配置模型；验收环境没有调用外部模型。
- 文件页仍显示当前工作目录和显式关联材料；没有增加上传、内嵌预览或全 Graph 对象目录。
- 只提供读取与阅读方案工具，没有正文、文件或 TODO 写入工具。DSH 自身通用终端工具的权限仍由 DSH 管理。
- 本轮实机验收使用隔离 Logseq 副本、测试 Graph 和测试工作区，没有使用真实用户 Graph；具体截图、测试数据和未完成项见 [Unified Work Experience UX v1](../../docs/implementation/unified-work-experience-ux-v1/README.md)。

`src/` 是正式宿主和 React 客户端，`cordis.patch.yml` 是 bundle，`scripts/` 是构建/安装器，`tests/` 是验证程序。`prototype/` 保留交互样例，`research/` 保留前期宿主实验，见 [设计记录](design.md)。
