# 工作级 UI Shell 实施交接

状态：已实施、构建、回归并在隔离的真实 Logseq Desktop 验证。分支 `codex/workbench-ui-shell`，没有 push、PR 或合入 main。

## 基线、提交与运行位置

- BASE：`8529212296f0b65fb78ef7ccd2a2102474d9310a`。
- 代码 HEAD：`8b98bfcee9a423323a5b2605e1ec79f52c77aaeb`。后续交接与证据提交在同分支；包含交接的最终 HEAD 用 `git rev-parse HEAD` 获取，并在交付回复中列出。
- 独立工作树：`/Users/mac/.codex/worktrees/workbench-ui-shell/logseq-task-manager`。
- origin：`https://github.com/wrd233/logseq-task-manager.git`。fetch 后核验 BASE 已发布且属于 origin/main 历史；本任务不追逐后来 main。
- `f6ba21a`：公共 shell、限定样式／导航、初始报告模式配置与可选 ReviewPort。
- `d8aab09`：工作级组合、材料生命周期、审阅薄适配及导航回归。
- `8b98bfc`：index 的真实模块接线、可信 local 适配器、原生返回语义与隐藏审阅的快捷键保护。

原始工作树 `/Users/mac/Downloads/work/logseq-task-manager` 起始 HEAD 为 BASE；最后观测 HEAD 已为 `6f20815c8a07d530366a660a457abfb3d9957e3d`，本任务未在该工作树提交或切分支。本分支继续固定于约定 BASE，没有追逐该推进或重置别人分支。原有未跟踪 `docs/implementation/prompts/` 保留。没有委派 agent、创建或联系其他 session。已读任务包 00、2026-10-04 四份整合记录和此前 ux-polish 设计／架构／交接。没有修改共同索引或正式使用手册。

## 环境与隔离

执行环境 Darwin 24.2.0、x86_64。仓库及上级未发现 AGENTS.md。重新核验 package.json 要求 Node `>=20.19 <21`、npm `10.8.2`；使用本工作树的 Node 20.20.2 与 npm 10.8.2，独立 npm ci、node_modules 和 dist。

真实宿主为本机已安装 Logseq 0.10.9，从 `/Applications/Logseq 2.app` 创建本任务隔离副本。副本、Graph、home、profile、FileStorage 在本工作树 `tmp/logseq-sandbox/`。合成材料、companion descriptor／状态在 `tmp/ui-shell/`。tasksEnabled=false、自动收纳关闭；不启动 Kernel。生产 Graph、其他 Logseq 进程及用户 profile 未用于验收。

Desktop 调试端口 61341、临时画面／输入转发端口 61343 和 companion 状态均属于本任务。native CUA app surfaces 不可用，因此 CUA 操作本地转发页上的实际 Desktop 控件；画面来自真实 Electron 截图，控件坐标从真实 DOM 读取，鼠标／按键再转发到该 Desktop。没有用 mock UI 或浏览器复刻冒充 Desktop。最终截图只保存原始 Desktop 画面，未包含转发页。

验收结束已清除临时视口覆盖，关闭转发页、停止本任务 bridge／companion，并核验 app/profile 后停止自己的 Desktop。为释放磁盘，随后删除了已停止的本任务应用副本；保留工作树、合成 Graph、profile 和材料供复现。没有停止其他 Logseq。若再次使用该隔离应用，可运行 `npm run sandbox:prepare -- "/Applications/Logseq 2.app"` 重建副本。

## 已落地体验

默认完整报告，普通正文、交错标签、父段例子／条件／TODO 与原有材料引用都交给现有报告模块显示。标题清理仅用于展示；源 block 与 sourceId/contentVersion 对应，单行对象根标题不重复出现。多行根正文、原结构及历史仍保留。

常规内容入口为「正文／材料」，「在 Logseq 写作」使用已有 native/report 端口。进行中的输入显示「继续原生输入」与短状态。窄窗原生区域的「返回正文」沿用既有宿主恢复实现。本分支没有重排 FeaturePanel 的布局、exposeNative 或输入恢复方法，没有新增正文编辑副本。

正常阅读收起阶段工具条与变更叠层。入口「有改动 · 进入审阅」来自原 review owner；进入审阅和历史后仍使用原模块、只读历史与所见修订认可。未打开审阅时认可快捷键只展开审阅，不认可未显示版本。审阅输入存在时，owner 可以拒绝收起。

入口迁移表在 [设计](../design/workbench-ui-shell-design.md)。原来的全局模块按钮合成顶部「工作台」菜单；原结构／范围／刷新／跟随放入工作选项；目录与外部连接分别有分组和后果说明；阶段提交／认可／历史在审阅区。材料同工作页面的重复返回／关闭由公共 shell 承接，独立材料库保留自身返回。材料连接技术状态置于「目录与查找」，明确连接就绪不表示 agent 正在工作。

普通子块点击默认保持当前工作，明确选择工作才切换。保留已有自动跟随能力为可发现的显式选项。首次无工作提供原生选块动作，材料空态提供收纳／关联动作。原有导入部分成功、引用未插入、材料草稿、写回冲突和未知结果继续使用原模块的事实与恢复流程，没有把部分成功改写为全部完成。

## 最小接线与并行边界

完整接口与示例在 [架构](../architecture/workbench-ui-shell-architecture.md)。实际 index 使用真实安装后的实例：

```ts
materials.setWorkChrome(
  (surface, scope) => work.mountMaterialChrome(surface, scope),
  scope => work.rememberMaterials(scope)
);
// 构造材料时的真实返回：uuid => work.returnToBody(uuid)
work.setContextActions(() => scopedActionsForCurrentWork());
// ReviewPort.navigation / leave 是原 review owner 的可选适配。
```

`scopedActionsForCurrentWork` 是上面示例的描述名称；实际 index 内联读取当前 root 和 Graph，调用 workspace／agentWorkspace／content 的 `.local` 适配器。该示例不要求新建 helper。local 没有暴露给公共 agent namespace，也没有改变许可边界。

复用 SourceScope、ReadingBookmark、MaterialWorkContext、ReviewPort。材料切换前捕获真实几何书签；关闭后 mount 不覆盖，返回时 Graph/root 全匹配才恢复。renderer.ts 没有本分支的领域逻辑重写。host 不反向导入 feature。

- 02：报告正文继续归报告模块；保留 shell 初始 report、根标题来源对应。
- 03：保留本分支公共 style/navigation 和「返回正文」语义，后续宿主布局／输入恢复改动归该分支。
- 04：保留材料 before/mount 顺序、真实 scope 和实际返回回调；区域内容仍归材料。
- 05：保留 ReviewPort 可选 navigation/leave、bridge.openReview 和认可前先显示修订；阶段内容仍归 review owner。

未取得这些并行分支的交付提交，所以当前全部接入 BASE 的真实能力，所有入口实际挂载。最终整合任务仍需在其最终组合 HEAD 重跑检查与 Desktop 验收。

## 行为验证与证据

复用任务包长 MiniProject fixture，替换为真实 UUID 和四个真实合成材料 ID。92 条正文加根块，正文 4867 字符，其中 3821 个汉字，最大缩进 depth=4；另有「校对短工作」及一段普通正文。包含交错标签、事务、子 MiniProject、局部 TODO、重复句和材料引用。可重用材料与原生页面在 [fixtures](assets/workbench-ui-shell/fixtures/)。四份材料实际文件格式均为 Markdown；样例保留 PDF/xlsx 显示名称，不据此声称验证了那些格式。

真实 Desktop 连续完成：

1. 原生选择工作块，默认报告读取 93 个来源块。标题只出现一次，长篇可以滚动。
2. 在真实 Logseq 原生段落输入「（原生写作验收：保留上下文。）」并结束输入，报告安全刷新读到保存的原文。
3. 滚动到 560 后切材料、打开关联文件、返回正文；前后 root、title、scroll=560、report=93 完全一致，见 before/after-material-final.json。
4. 按需进入阶段，提交检查点、认可所见版本、打开阶段历史；历史 93 行、原生写作按钮禁用且明确只读。收起审阅回到当前正文。
5. 绑定合成工作目录，通过本任务 companion 建立通道，看到「通道已连接；这不表示 agent 正在工作」；停止连接后切材料并返回，正文仍是同一工作和 93 行。companion 随后停止，没有发送 agent 工作消息。
6. 通过宿主设置使用深色主题，真实 1440×950 宽视口原生与报告并排；680×780 窄视口可从正文打开原生段落并「返回正文」，shell 的 clientWidth/scrollWidth 均为 680。尺寸是 Electron 视口覆盖，不是物理 macOS 窗口拖动。
7. 实际打开工作选项，Escape 后两个菜单均关闭，焦点回到「工作选项」。
8. 原生选中短工作子段落，通过 Cmd+Alt+P 明确打开所属 MiniProject，标题与 root 正确、报告 2 行；切材料显示同一短工作、0 篇与可操作空态，没有携带长工作范围。

来源 UUID 对照见 coverage.json。多行编号段落 b70 的 authoredFixtureUuid 在 Logseq 导入时没有成为实际 UUID；fixture-map 已记录现场 UUID 并保留原 authoredFixtureUuid。93 个报告行与实际身份映射无遗漏／额外行，段落及三个编号项完整保留。

图片与逐项说明见 [证据说明](assets/workbench-ui-shell/README.md)。新 shell 的 DOM 集成回归覆盖默认完整报告、工作身份／不写原文、Graph/root 材料书签与模式／lens／选择／焦点、菜单／组合输入、原生子块选择、旧异步结果与键盘入口。既有测试继续核验历史只读、审阅草稿、来源保护、写回冲突与部分成功。

## 检查结果与限制

`npm run check` 完整通过：13 组 TAP、640 tests、0 fail。requirements map、所有 workspace typecheck、lint、构建、内置二进制、依赖边界与 taste 均完成。见 `check-delivery.log`。最后仅为连接入口补充 Graph/root 一起匹配，随后 typecheck、lint、build 再次以退出码 0 完成，见 `final-scope-guard.log`；实际 Desktop 已重载该最终构建。最终 `git diff --check` 通过。

两个较早的完整检查尝试在 test-support 的 SQLite 测试遇到磁盘耗尽（SQLITE_CANTOPEN / SQLITE_IOERR_SHMSIZE），没有删测试或降低断言。清理仅本任务产生的缓存／已完成测试临时目录并设置本任务 TMPDIR 后，完整 gate 通过。现场后段也出现过 Logseq ENOSPC 状态文件通知，已如实记录环境原因，未宣称那些失败写入成功。

系统中文输入法的真实组合候选窗、剪贴板/undo、物理窗口拖动和其他主题插件没有现场验收；中文 composition/Escape 保护由 DOM 回归覆盖。正式任务中心及 Kernel 端到端没有在此隔离 profile 启动，入口接线／相关基线测试通过。PDF/xlsx 内容、跨工作目录搬迁及外部 agent 真实执行由其领域与最终整合验收覆盖。本轮没有人工首次使用者研究，已按「身份、写作、材料、改动」检查入口文字与现场路径。

## 运行与交接动作

本工作树的工具链已可用：

```sh
export PATH="$PWD/tmp/ui-shell/toolchain/node-v20.20.2-darwin-x64/bin:$PWD/tmp/ui-shell/toolchain/npm/node_modules/.bin:$PATH"
export TMPDIR="$PWD/tmp/ui-shell/test-tmp"
npm run check
```

`apps/logseq-plugin/dist` 是本工作树构建；在测试 Logseq 的插件页加载该真实目录即可运行。截图、fixture 和 gate 日志已入本地提交；依赖、应用副本、Graph、私有状态和构建产物保持忽略，不提交 descriptor/token。交接无需先允许 agent 连接，阅读／材料可离线使用。
