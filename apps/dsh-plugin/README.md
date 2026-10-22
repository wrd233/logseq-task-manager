# DSH × Logseq 工作台

可安装的 DSH 插件。本轮工作结构历史已在 DSH **0.2.1-rc.2** 的独立 `web` profile 中验收，未更改日常 profile。

- 原生 DSH 对话、输入框、模型选择和轨迹继续使用宿主实现。
- 点会话头部 **↗ Logseq** 关联已授权的 Logseq 工作目录。
- 宽屏原文栏预留 **360px**，文件栏 **280px**，中间留给对话；原文滚动阅读，随时收起。文件按目录密集排列，点击交给系统打开，菜单可在访达显示或引用。
- 每个 DSH 会话独立保存工作身份。换会话同步面板；连接失效清掉原文；模型每次组装上下文重新核验已保存来源。
- 段落和文件引用插入原生草稿，不自动发送。首版使用带版本的文本引用，不使用自定义引用 chip。
- 两端共用命名读法：DSH 左侧选择器和 Logseq 原有阅读菜单同步，DSH 约两秒内跟随本地选择。对照在窄栏上下排列，Logseq 继续使用已有阅读器。
- Agent 可列出、新增、调整和选择读法。更新复用 planId，保留上一版；生成期间切换读法不会被新结果切回。正文行首标记和 Markdown 渲染由两端共用，本插件不改写正文。
- 读法及选择保存在 Logseq 当前插件的本机存储中，按 Graph 与工作区分；不缓存正文副本。原句更新沿用编排，新段落出现在“新增 · 尚未归类”。

## 开始使用

1. 保持本项目的 workspace companion 运行。Logseq 工作先关联目录，再通过 **带当前工作去协作** 准备现场，或 **允许 agent 只读连接**。DSH 复用这份连接，不新增读写许可。首次连接配置见 [工作台使用说明](../../docs/user-guide/workbench-usage.md#agent-接入附录)。
2. 打开 DSH 会话，点 **↗ Logseq**，填入上述工作目录。若 DSH 会话工作目录正是该目录，直接点 **关联当前会话**。
3. 用左侧选择器切换“连续阅读”“原结构”或命名读法。Logseq 仍使用已有阅读菜单，无需更换界面。
4. 在对话中说“新增一个讨论对照读法”或“把当前读法的问题放前面”。Agent 使用 reading.request 后提交完整布局；调整已有读法复用 planId，新增读法用新的 planId。更多操作中可恢复当前读法上一版。切到其他工作需先在 Logseq 建立对应连接，再关联该会话。

在项目安装依赖后，要向目标 profile 安装当前工作树的版本，用 Node **22.19+**（DSH 所需）执行：

```sh
node apps/dsh-plugin/scripts/install.mjs web
```

安装器构建插件、备份 profile manifest、调用官方 `dsh plugin --profile web add link:...`，然后选中 bundle。若正在运行的 DSH 没有重新加载，重启该 profile。默认 companion 状态目录是 `~/.task-copilot-workspace`；自定义目录可通过 DSH 进程的 `TASK_COPILOT_WORKSPACE_STATE` 或 bundle 配置 `workspaceStateDirectory` 指定。私有会话绑定保存在 `~/.dsh/logseq-workbench/bindings.json`，不保存正文或连接凭据。历史快照另存在同目录的 `history/`，包含选定工作结构及来源证据。

## 工作结构历史

会话头部的 **工作历史** 打开原生侧栏：浏览时间线与结构图，比较任意同投影时点，查看正文和关系变化，核对今天来源，并把选中内容追加到原生草稿。Git 和已有 Logseq 阶段修订自动记录检查点；Agent 可保存自己的工作结构并追加解释。三种归属分别显示：工具观察、Agent 整理、历史重建。所有历史功能默认只读，不修改正式任务状态。

Logseq 可右键工作入口块选择 **工作台：只读连接此工作**，然后在 DSH 关联该工作目录。完整使用、五个 Agent 工具、存储边界和本轮真实联合验收见 [历史工作台](../../docs/implementation/2026-10-22-dsh-history-workbench.md)。

## 构建和验证

仓库依赖安装、根检查仍用 Node **>=20.19 <21**；DSH 宿主验证用独立 Node 22.19+。

```sh
node apps/dsh-plugin/scripts/build.mjs
node --import tsx --test apps/dsh-plugin/tests/service.test.mjs
node --import tsx apps/dsh-plugin/tests/host-proof.mjs
```

服务测试覆盖会话隔离、私有绑定、解绑竞态、越界和符号链接拒绝、失联以及上下文预算。宿主验证使用生产插件、真实 HTTP companion、原生 Cordis / Tools / SystemPrompt / AgentLoop、合成 Logseq SDK 和本地脚本模型，覆盖来源刷新、文件读取、阅读方案归属、Graph 失效和卸载，不调用远端模型。

原有 DSH 浏览器验收覆盖关联、原文/文件列表、原生草稿引用、系统访达定位、收起和会话切换。共享读法原有验收见 [共享读法记录](shared-reading.md)。本轮历史工作台另完成真实 DSH 与 Logseq Desktop 的隔离测试图谱联合验收，详见上面的历史工作台记录；没有使用真实用户 Graph 或远端模型。

## 当前边界

- 左栏用官方 `shell.overlay` 增量挂载。rc.2 没有左栏宽度设置接口；宽屏采用局部、可撤销的 CSS 几何适配，收起/卸载恢复原生布局。原文打开时暂时覆盖左栏会话列表下半部；收起可继续导航。窄屏保留浮层；DSH 升级需复验这一适配。
- 文件显示当前工作目录扫描结果及显式关联的材料。外部关联目录的未登记文件不自动扫描；扫描截断会提示。没有增加上传、文件内嵌预览或全 Graph 对象目录。
- 文件外部打开不表示模型已读取。二进制 PDF/图片/Word 的内容理解取决于既有 companion 能力；本插件不会自行上传文件或伪装成已完成二进制解析。
- 只提供读取与阅读方案工具，没有正文、文件或 TODO 写入工具。DSH 自身通用终端工具的权限仍由 DSH 管理。

`src/` 是正式宿主和 React 客户端，`cordis.patch.yml` 是 bundle，`scripts/` 是构建/安装器，`tests/` 是验证程序。`prototype/` 保留交互样例，`research/` 保留前期宿主实验，见 [设计记录](design.md)。
