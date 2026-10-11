# DSH × Logseq 工作台

可安装的 DSH 插件。分支 `feature/dsh-logseq-workbench`，已在本机 DSH **0.2.0-rc.2** 的 `web` profile 加载。

- 原生 DSH 对话、输入框、模型选择和轨迹继续使用宿主实现。
- 点会话头部 **↗ Logseq** 关联已授权的 Logseq 工作目录。
- 宽屏原文栏预留 **360px**，文件栏 **280px**，中间留给对话；原文滚动阅读，随时收起。文件按目录密集排列，点击交给系统打开，菜单可在访达显示或引用。
- 每个 DSH 会话独立保存工作身份。换会话同步面板；连接失效清掉原文；模型每次组装上下文重新核验已保存来源。
- 段落和文件引用插入原生草稿，不自动发送。首版使用带版本的文本引用，不使用自定义引用 chip。
- Agent 可调用原文、指导、文件和阅读方案工具；阅读方案提交给现有 Logseq 阅读器。正文行首标记仍由原有 Logseq 插件解析，本插件不改写正文。

## 开始使用

1. 保持本项目的 workspace companion 运行。Logseq 工作先关联目录，再通过 **带当前工作去协作** 准备现场，或 **允许 agent 只读连接**。DSH 复用这份连接，不新增读写许可。首次连接配置见 [工作台使用说明](../../docs/user-guide/workbench-usage.md#agent-接入附录)。
2. 打开 DSH 会话，点 **↗ Logseq**，填入上述工作目录。若 DSH 会话工作目录正是该目录，直接点 **关联当前会话**。
3. 在对话中提出问题；侧栏用于核对原文、找到文件和引用。切到其他工作必须先在 Logseq 建立对应连接，再关联该会话。

本机已经安装；其他机器在项目安装依赖后，用 Node **22.19+**（DSH 所需）执行：

```sh
node apps/dsh-plugin/scripts/install.mjs web
```

安装器构建插件、备份 profile manifest、调用官方 `dsh plugin --profile web add link:...`，然后选中 bundle。若正在运行的 DSH 没有重新加载，重启该 profile。默认 companion 状态目录是 `~/.task-copilot-workspace`；自定义目录可通过 DSH 进程的 `TASK_COPILOT_WORKSPACE_STATE` 或 bundle 配置 `workspaceStateDirectory` 指定。私有会话绑定保存在 `~/.dsh/logseq-workbench/bindings.json`，不保存正文或连接凭据。

## 构建和验证

仓库依赖安装、根检查仍用 Node **>=20.19 <21**；DSH 宿主验证用独立 Node 22.19+。

```sh
node apps/dsh-plugin/scripts/build.mjs
node --import tsx --test apps/dsh-plugin/tests/service.test.mjs
node --import tsx apps/dsh-plugin/tests/host-proof.mjs
```

服务测试覆盖会话隔离、私有绑定、解绑竞态、越界和符号链接拒绝、失联以及上下文预算。宿主验证使用生产插件、真实 HTTP companion、原生 Cordis / Tools / SystemPrompt / AgentLoop、合成 Logseq SDK 和本地脚本模型，覆盖来源刷新、文件读取、阅读方案归属、Graph 失效和卸载，不调用远端模型。

本机 DSH 浏览器另已验证关联、原文/文件列表、原生草稿引用、系统访达定位、收起和会话切换。截图使用隔离测试数据，不代表真实 Logseq Desktop Graph 已连接。真实用户 Graph 与远端模型的端到端使用仍需用户在 Logseq 连接当前工作。

## 当前边界

- 左栏用官方 `shell.overlay` 增量挂载。rc.2 没有左栏宽度设置接口；宽屏采用局部、可撤销的 CSS 几何适配，收起/卸载恢复原生布局。原文打开时暂时覆盖左栏会话列表下半部；收起可继续导航。窄屏保留浮层；DSH 升级需复验这一适配。
- 文件显示当前工作目录扫描结果及显式关联的材料。外部关联目录的未登记文件不自动扫描；扫描截断会提示。没有增加上传、文件内嵌预览或全 Graph 对象目录。
- 文件外部打开不表示模型已读取。二进制 PDF/图片/Word 的内容理解取决于既有 companion 能力；本插件不会自行上传文件或伪装成已完成二进制解析。
- 只提供读取与阅读方案工具，没有正文、文件或 TODO 写入工具。DSH 自身通用终端工具的权限仍由 DSH 管理。

`src/` 是正式宿主和 React 客户端，`cordis.patch.yml` 是 bundle，`scripts/` 是构建/安装器，`tests/` 是验证程序。`prototype/` 保留交互样例，`research/` 保留前期宿主实验，见 [设计记录](design.md)。
