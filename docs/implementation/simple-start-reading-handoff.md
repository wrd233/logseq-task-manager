# 装好即可用与一键阅读交接

2026-10-05 本地交付。基础闭环已在真正隔离的 Logseq Desktop 中通过：安装启用、标题旁一次阅读、原生编辑仍保留、宿主保存后更新、回到同一来源位置。必填阅读配置为 **0 项**，已显示工作标题进入为 **1 次点击**，为了读取而改原文或补属性为 **0 次**。物理中文 IME、Undo、系统拖放和剪贴板仍未完成验收，不能据此宣称所有原生系统操作已通过。

## 身份与交付

- origin：`https://github.com/wrd233/logseq-task-manager.git`。
- REMOTE_BASE_SHA：`dd081c9cc63fc91b4d62743141842c303128c4a2`，本轮成功 fetch 后再次核验远端 main。从该提交新建独立工作树与 `codex/simple-start-reading`，没有采用旧共同 BASE。
- 实现与最终包构建 HEAD：`e5eca0588aaa2d3a418049ff716505b3528a8da1`。
- 全仓门禁 HEAD：同上；随后只有文档、需求地图和证据交付更新，最终文档提交见此分支 HEAD。
- 工作树：`/Users/mac/.codex/worktrees/simple-start-reading/logseq-task-manager`。原 checkout 的未跟踪 `docs/implementation/prompts/` 保留。没有推送、PR、合并、发布、生产 Graph 操作、其他 chat 或 agent 委派。
- 工具链：独立 Node 20.20.2／npm 10.8.2，符合当前 package.json；macOS 15.2、Intel x86_64，Logseq Desktop 0.10.9，Logseq SDK 0.3.4。无适用 AGENTS.md。
- [最终安装 ZIP](assets/simple-start-reading/task-copilot-workbench.zip)：6,228,518 字节，428 个文件；[SHA-256](assets/simple-start-reading/task-copilot-workbench.zip.sha256) 为 `5fcc62f3772709839429e849e5c0d5fdb5bad0c733dc62b31a1efc47df1ebab2`。
- [用户说明](../user-guide/simple-start-reading.md)、[设计](../design/simple-start-reading-design.md)、[架构](../architecture/simple-start-reading-architecture.md)、[证据索引](assets/simple-start-reading/README.md)。

复现打包时检出上述构建 HEAD，使用 Node 20.20.2／npm 10.8.2 和 Python 3 标准库，执行 `npm ci`、`npm run package:plugin`。ZIP 排序、时间戳及权限固定，产物身份记录实际提交；在其他文档提交上重建会正确记录新的构建身份。

## 实际改动与共享接线

`0c6cdd1` 单独提交共享宿主／来源接线：`host/reading-entry.ts`、`panel-host.ts`、`native-editor.ts`，以及 `workspace/source-protocol.ts`、`source-reader.ts`、`context-service.ts`、`context.ts` 与 lens/target 适配。页面是独立真实身份及正文森林，不伪造可写 block root；page scope 的材料绑定、审阅和未支持写入被拒绝。

`07cffa9` 接入现有全文 composer、保存后刷新、原生输入保护和阅读现场；`d726532` 调整默认启动、缺省材料准备、连接发现与安装包。正式任务默认按需进入，已有显式设置和配置优先；顶部统一为工作台，正式任务从菜单进入。阅读标题识别可兼容事务／任务和省略重复标签的 MiniProject，正式解析与写回许可未放宽。

后续 `c0cb1c6`、`35cf9f8`、`4063812`、`63bbcc3`、`6b669b9`、`b80eb95` 修复实测揭示的当前焦点、具名继续、页面恢复、宿主分隔线捕获、保存生命周期与隐藏书签问题。`050f4d4` 把既有材料测试的固定 30ms 等待改成等待实际关联文档出现，仍保留内容断言。`e5eca05` 仅从安装包过滤类型声明和源码映射，不改变运行代码。

核心路径为 `features/work-view/{controller,report-controller,report-model,shell}.ts`、`features/materials/{controller,service,default-directory}.ts`、`features/agent-workspace/installer.ts`、`index.ts`、`plugin-runtime.ts`、插件 build/package 脚本及生产 `workspace-launcher.ts`。没有第二份正文、通用状态库、新框架、调试 relay 或并行写回执行器；复用 ReportFragment、BodyTarget、ReadingBookmark、材料核心、ReviewPort、正式身份和 Journal。

## 目标逐项审核

| 目标文件章节 | 结论与可核验事实 |
| --- | --- |
| 1 起点与范围 | 已完成。远端基线、独立分支／依赖／进程、真实环境和原 checkout 保留记录见环境证据；仅本地提交。 |
| 2 产品目标 | 核心已实机通过。原生事务 2 块一次打开；长文 97 块，保存材料引用后 98 块，逐 UUID 核对原句哈希、父级、深度。0 必填设置、0 阅读写入。 |
| 3 默认状态 | 已实机通过新 profile 的空连接设置、单工具栏、无自动跳页；开／关、宽度、位置与折叠跨重启通过。旧显式设置／正式配置兼容由现有完整回归覆盖，没有重新启用用户关闭项。 |
| 4 对象与范围 | 已实机通过 MiniProject／内嵌事务切换、返回上层、普通点击保持范围、顶部具名继续；Project／Area 实际森林分别 99／2 块，原文不变、block root 为 null。宽容识别、示例排除、普通块、页面越权拒绝有回归。 |
| 5 阅读与输入 | 已实机通过同一 textarea、草稿、焦点及选区保留，宿主保存后片段哈希更新；长文中间／材料往返、宽窄与宿主两侧栏、384→444 拖动、折叠和重启通过。物理 IME 待复验；组合输入和写入／导航保护、历史与生命周期覆盖见完整门禁。 |
| 6 材料与协作 | 已实机通过首次保存才创建 Graph 外目录、普通文件读回、无工作绑定、只读权限、实际目录不可用时就地选择并记住、旧文件与引用保留。生产随包启动器、自动 descriptor 发现、真实外部 CLI 98 块逐身份读取及断连本地阅读通过。宿主按钮直接启动任意进程未达成；见平台缺口。旧路径、改名、授权和 Journal 由原有回归覆盖；系统拖放／剪贴板未验。 |
| 7 安装包 | 已完成最终 ZIP 两次逐字节一致、无开发依赖／Graph／凭据；仓库外解压、第二个全新 profile 实际加载，执行 bundle 哈希与 ZIP 一致。基础阅读无 Node／源码／服务器要求。 |
| 8 实现边界 | 已按当前源码与整合职责实现，共享宿主／来源改动独立提交，复用既有服务与协议。页面只读扩展没有获得写回能力。 |
| 9 验证 | 当前 `npm run check` 完整通过：681 个测试（插件 430），0 失败、0 跳过，包含类型／lint／需求地图／构建／边界／Taste；`git diff --check` 通过。实际停用、启用、重载后无重复按钮；Graph 切换、快速范围切换、来源缺失、历史只读、修订认可、聚焦与未知写入恢复由全量回归覆盖，未把这些都写成新一轮物理 UI 实测。 |
| 10 文档交接 | 本文、设计、架构、简明指南、ZIP、实际截图、门禁日志、逐 UUID 证据及索引均已交付；README、手册入口和现有需求地图同步，旧整合事实保留其时点。 |

## 真实证据如何对应最终包

完整核心旅程最初使用干净 `b80eb956aa7af9c0e0fe3a18434885d9ea4728dd` 包完成。其后只改测试等待与包装文件过滤；最终 e5eca05 的 `dist/index.js` 和 `dist/workspace.mjs` 哈希与 b80 完全相同。证据索引分别标注旧包完整旅程与最终包重新装载，不能把二者的 Git 身份混写。

最终包在仓库外 `/Users/mac/.codex/simple-start-reading-install-01a10a9e/task-copilot-workbench` 解压，校验全部文件；重新准备空 home/profile，仍使用隔离合成 Graph。实际执行脚本由 Debugger 读取后 SHA-256 匹配 `be837238674a7e9db6f0a93fcfbe14dd9fc21f7f5660a49044cf2e578a8ced71`。最终读取 98 块、4,090 汉字、最大深度 4，SDK、阅读片段和先前生产 CLI 每个 UUID 的正文版本／父级／深度均相符，打开前后来源树相等。

实机是独立复制的 Electron Desktop，不是浏览器替身；只连接自己的 localhost 调试端口。截图来自实际窗口，点击与输入使用该实例的 Input 通道；部分导航和来源检索用真实 Logseq SDK。操作中 Kernel 未启动；companion 只在协作验收阶段启动，连接许可由工作选项显式给出。它没有自动开始 agent、授权 TODO 或结构整理。

隔离 home、profile、材料及协作状态在完成验收后保留为本地测试资料，旧实例的资料目录归档以准备最终空 profile；均不进入 ZIP 或证据包。最终收尾只停止身份核验后的自有 Desktop／companion，不接触其他 Logseq 进程。

## 尚未验收与最小复验

以下不是已通过项。宿主不提供本轮所需的原生系统操作控制能力，因此保留最小人工步骤：

| 未验项 | 在最终包的真实 Desktop 上最短复验 |
| --- | --- |
| 物理中文 IME／候选窗 | 使用系统中文输入法在已保存事务子块中开始拼音组合；未确认候选时点工作标题「阅读」。核对候选窗、同一 textarea、草稿和选区；确认候选并让宿主保存，阅读自动显示原句。 |
| 原生 Undo | 原生块输入一段文字，打开阅读并返回后按 Cmd/Ctrl+Z；核对宿主撤销栈、UUID、原文与报告更新，再测试重做。 |
| 系统拖放 | 从 Finder 向材料列表拖入一个已有文件，核对仍在原路径；向报告实际段落拖入并确认块级引用目标；换到别的 Graph 后旧拖放不能写入。 |
| 系统剪贴板 | 材料「复制引用」后在系统原生编辑器粘贴，核对完整 longdoc URI；再在中文输入状态使用原生粘贴，核对输入与撤销。 |
| Windows／Linux、其他 Logseq 版本 | 基础装载与上述核心旅程未实机验证；协作生产通道目前为 POSIX，不能宣称 Windows 随包启动器已支持。 |
| Finder 双击／系统启动策略 | `.command` 确实以普通 shell 独立运行并启动生产服务，Finder 双击与系统 Gatekeeper 的完整交互未验。 |

平台连接目标仍有缺口：Logseq 0.10.9 的插件桥只有受限的系统打开能力，没有可用的任意进程启动接口。已交付随包 `.command` 与生产 CLI，用户在 macOS 运行它后，插件自动发现私有连接文件；最短剩余路径是一次独立启动器操作。没有使用猜测接口或测试调试桥来宣称插件直接启动 companion。

目录核验使用真实 Graph 路径、宿主路径、stat、可用文件身份、Graph 标记和写入读回。宿主缺少可靠 realpath，深层符号链接别名的完整识别未达成。真实不可用目录实测采用「普通文件占用候选目录」；EACCES 通过回归故障注入覆盖，未谎称改变 OS 权限后的实测。页 UUID 变化恢复通过明确换 UUID 的回归；本轮重启的实际页 UUID 没变化，证据中 `pageUuidChanged=false`。
