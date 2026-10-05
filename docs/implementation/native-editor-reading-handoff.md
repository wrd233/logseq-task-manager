# 原生编辑与长篇阅读实施交接

2026-10-05。本地实施交付，原生写作与完整阅读的主要往返闭环已在隔离 Logseq Desktop 中完成。源码、实际 UUID、运行数据和截图位于本分支；中文输入法的完整物理人工流程及系统文件拖放仍是未验范围。没有 push、PR、合入 main、部署或修改生产 Graph。

## 基线、环境与隔离

| 项目 | 实际值 |
| --- | --- |
| origin | `https://github.com/wrd233/logseq-task-manager.git` |
| 固定 BASE | `8529212296f0b65fb78ef7ccd2a2102474d9310a`；启动 fetch 后确认可取得且在 origin/main 历史中 |
| 分支 | `codex/native-editor-reading` |
| 验收代码 HEAD | `34473ae56d46cbbc8da1e3a80790b6407e9d5353`；最终文档提交的 HEAD 以交付回复／`git rev-parse HEAD` 为准 |
| 独立工作树 | `/Users/wangrundong/.codex/worktrees/native-editor-reading/任务管理中心-logseq插件` |
| 系统 | macOS 15.1，build 24B2083；Darwin 24.1，arm64 |
| 工具链 | `/opt/homebrew/opt/node@20/bin/node` 20.20.2；npm 10.8.2；package 要求 `>=20.19 <21` |
| 真正宿主／SDK | 隔离克隆 Logseq 0.10.15；安装依赖和连接中的 SDK 0.3.4 |
| CDP | `127.0.0.1:19333`，仅本轮自有 Desktop 进程；系统输入使用 Computer Use 的 macOS 键盘／pasteboard |

原 checkout 启动 HEAD 为 `df307efee3572c312b1cbd9c04a4b93a81ac69f1`；交付前只读核对时为 `f0bfe2edff50ca6657bcf491209afa4b715df6b9`，status 干净。本轮未在其中安装、构建、暂存或改写功能，也没有把运行期间前进的 main 合入固定基线工作树。没有发现适用 AGENTS.md，也没有创建或联系其他 chat／agent，未读取其他实施分支的未提交代码。

依赖和 dist 都在本工作树。Lab App、home、profile、Graph、材料、Kernel state 和日志都是私有测试路径：`tmp/logseq-sandbox/` 和 `tmp/native-editor-reading/`。`tasksEnabled:false`，agent descriptor 为空，Kernel 未启动。测试用了两个新建 Graph，未打开用户生产 Graph。

生成的 Lab preferences 初始 `theme:"light"` 会导致该宿主的主题协议异常、SDK 无法连接；仅把本轮私有配置改为 `theme:null` 后恢复。Graph 添加对话框也只在本轮克隆 bootstrap 中返回准备的隔离路径；原 `/Applications/Logseq.app` 没有改动。这些 harness 修正没有混入生产插件。

## 本地提交

| 内容 | 提交 |
| --- | --- |
| 最小公共宿主接线：FeaturePanel／布局／owner 释放 | `1bf91ee12eab2dfc69baa61a39b9e942806588ec` |
| 原生输入、对照、来源保护、阅读恢复与回归 | `af47c80c6f3fc17393def5604ffc5b34f1b93597` |
| 既有正文恢复测试等待持久重试真正结束 | `34473ae56d46cbbc8da1e3a80790b6407e9d5353` |
| 设计、架构、交接及截图／结构化证据 | 文档交付提交；最终 HEAD 见交付回复 |

共享接线的精确消费方式见 [架构](../architecture/native-editor-reading-architecture.md)。本轮没有整体改公共 navigation/style、composer、MaterialTransfers、stage recorder 或 writeback executor，也没有添加依赖／修改 lockfile。

## 长文样本与身份

预置 97 个真实 UUID block，根到第四层；关联材料后共 98 个来源片段。最终实际树测得 4,456 个中文字符、65 个以“第…”开头的普通段落，包含两个事务、子 MiniProject、普通 TODO、代码和材料链接。原生实验保留了追加的合成句，阶段实验修改了第 52 段；没有把这些实验写入生产资料。

| 来源 | UUID／身份 |
| --- | --- |
| 工作根 | `0d760073-e855-4391-8e53-6f96d0e0aae6` |
| 中间输入，第 48 段 | `e431ddf0-5422-4a48-b0d9-ab5075ba4880` |
| 相邻锚点，第 47 段 | `c911846e-567a-4645-af7f-78058dfafc24` |
| 对照原文，第 49 段 | `c20b355b-0a44-4b63-bc68-74b2f0f9d740` |
| 两个事务 | `829b280d-397f-4032-a410-8028f9fe2b54`、`08e34ecc-7644-46aa-86aa-1c810ada84cf` |
| 子 MiniProject | `a8cd51a4-3805-4a86-aeb3-e2b3941e5868` |
| 第二页工作／原块 | `280d8fa6-101c-498c-a4ea-d5dd1a09fa52`／`46a1563f-49ce-40d6-8148-c25f089d39eb` |
| 第二 Graph 原块 | `202a2007-cff9-4fb5-9dee-ef2d4348cbed` |
| reference 材料 ID | `e606a37c-1a1e-4fa7-89ed-f80d80d72049`；实际 `longdoc://` 引用与来源根相连 |

完整 UUID 列表、Graph 路径和大小度量见 [fixture.json](assets/native-editor-reading/fixture.json)。材料是只读 reference，user／agent 编辑能力均 false；往返前后文件 SHA-256 都是 `22a99b28fbd568e0db32f0d7933e8373205ee1c6b87c2d839825d76accd54327`。

## 实机闭环与证据

截图来自这个真实 Electron 宿主，不是 iframe mock 编辑器。CDP 用于已安装插件 API、真实 DOM 断言、可信鼠标输入和 Electron 截图；系统选择、文字输入、Undo、返回快捷键、Graph 菜单和剪贴板用 Computer Use。结构化结果见 [desktop-proof.json](assets/native-editor-reading/desktop-proof.json) 和 [native-input-proof.json](assets/native-editor-reading/native-input-proof.json)。最终加载字节、环境与检查记录见 [verification.json](assets/native-editor-reading/verification.json)。

| 验证 | 实际事实 |
| --- | --- |
| 中间原生输入与继续 | SDK 当前编辑 UUID 和实际 textarea 均为第 48 段；自动保存后点击“继续原生输入”，同一 DOM、原 value、88–90 选区和焦点均保留 |
| 输入中对照另一段 | 正写第 48 段时打开第 49 段条目菜单／对照，原输入仍为同一节点和选区；对照 raw／sourceId／contentVersion 对应同一快照，不路由 |
| 真并排 | 1440px 下原生 920px + 阅读 520px；左右宿主区域真实存在 |
| 窄窗与返回 | 1440px／左侧栏 → 980px／左侧栏时，原输入／选区／焦点不变；只有一个返回按钮；输入中返回保留输入，Escape 后 Cmd+Alt+R 恢复来源 UUID 与相对偏移 |
| 右侧栏 | 静止后右栏 576px、阅读 304px、原生 560px，无重叠；不依赖 window resize |
| 跨页目标 | 宿主先显示第二页，再按第 48 段真实目标回第一页面；真实挂载、textarea、SDK 编辑 UUID 一致；工作根仍是原工作 |
| 材料往返 | 通过材料端口和正文 longdoc 链接进入 reference，再由“返回工作”恢复同一 UUID／偏移；没有原生导航，材料 hash 不变 |
| 历史／当前 | 阶段一已提交、已认可；阶段二后来文本不进入阶段一快照，旧记录深比较不变；历史拒绝当前目标的导航／API 对照，返回恢复同一锚点 |
| 聚焦退出 | 子范围聚焦 → exit 后返回原 UUID／偏移，工作身份不变 |
| 原生新增输入 | SDK 实际新增段落同时启动原生编辑；输入中报告仍是旧 98 条并拒绝 refresh，结束输入后才发布第 99 条 |
| 修改／移动／删除 | 新 block 真实修改、移到子 MiniProject 后删除；另一段暂移到第二工作，旧结构目标被拒绝；恢复后 98 条、没有孤立 DOM、未变正文节点保留，中间 UUID 偏移在最终重复场景保持一致 |
| 删除可见锚点 | 最终构建中删除第 48 段下的新合成子块 `e95cbd6d-836c-41dc-9937-b24ce1519463`，定位到真实父块第 48 段，其相对顶部偏移 0.09375px；相邻第 47 段仅余 0.09375px 边缘，不能据此误判为按旧像素恢复 |
| 历史 raw 身份 | 最终构建的第 52 段 raw 等于阶段一提交快照，DOM 没有当前 sourceId／contentVersion；历史 API 拒绝当前目标，返回后恢复当前 raw 和原锚点 |
| 工作失效 | 删除单独创建的合成工作后仍显示其两条最后已知内容，状态 unavailable；导航拒绝，明确打开原工作后恢复原身份／锚点 |
| Graph 切换 | 宿主真实“添加图谱”进入第二隔离 Graph；scope／fragment／返回控件清空；打开第二 Graph 后旧 Graph 目标拒绝；切回第一 Graph 并明确打开原工作后恢复该工作的锚点 |
| 系统 Undo | OS type_text 的原生修改与系统剪贴板粘贴都通过 Cmd+Z 恢复精确原 value |
| 系统剪贴板 | 普通窗口中 `CLIPBOARD_NATIVE_PROBE` 实际进入第 48 段原生输入，Undo 完整恢复；工具按契约还原先前剪贴板，未读取用户剪贴板内容 |

对应截图：

- [并排原生输入](assets/native-editor-reading/wide-native-input.jpeg)、[对照仍保留原生焦点](assets/native-editor-reading/source-comparison-native-focus.jpeg)、[窄窗返回](assets/native-editor-reading/narrow-native-return.jpeg)、[返回原来源锚点](assets/native-editor-reading/long-reading-return.jpeg)。
- [右侧栏静止后布局](assets/native-editor-reading/right-sidebar-reading.jpeg)、[跨页原生目标](assets/native-editor-reading/cross-page-native-target.jpeg)、[材料返回入口](assets/native-editor-reading/material-return-entry.jpeg)。
- [不可变阶段历史](assets/native-editor-reading/immutable-stage-history.jpeg)、[来源刷新](assets/native-editor-reading/source-refresh-reading.jpeg)、[来源失效](assets/native-editor-reading/source-unavailable.jpeg)、[第二 Graph](assets/native-editor-reading/graph-switch-reading.jpeg)、[系统剪贴板输入](assets/native-editor-reading/system-clipboard-native.jpeg)。
- [删除锚点后的真实祖先](assets/native-editor-reading/deleted-anchor-ancestor.jpeg)、[历史来源状态](assets/native-editor-reading/historical-source-status.jpeg)。后者显示历史 UI 上下文；raw 文本和版本标识的证据是 desktop-proof.json 的实际 DOM 断言。

截图保留各场景的采集时序，并排输入、删除锚点和历史来源状态三张来自最后一次完整门禁构建；其他图来自对应修正后的实机步骤。verification.json 给出该最终构建的加载字节 SHA，并没有把每张较早截图宣称为最终代码的全量复验。

## 当前门禁

`npm ci` 与初始 `npm run build` 在本工作树独立完成，冷工作树先生成 Console dist。最终运行均使用 Node 20 的 PATH。

| 检查 | 最终记录 |
| --- | --- |
| 四个定向文件：原生报告 UI／stage review／正文恢复／布局 | 74 / 74，通过；失败、跳过、取消均 0 |
| `npm run check` | exit 0；业务测试 629 / 629（插件 395），sandbox 5 / 5，边界测试 12 / 12，共 646；需求图、全仓类型／lint、构建／二进制、边界扫描、taste 均通过 |
| `git diff --check` | exit 0 |
| 最终加载构建与落盘字节一致 | index.js 938,225 bytes，SHA-256 `0f4fe2b5ce4e4b7410b7b28a235269203922959a171fa4cc8ea0b954ed6d62c2`；SDK 111,127 bytes，两个资源加载／落盘 SHA 均一致 |

完整日志保留在本工作树忽略目录 `tmp/native-editor-reading/`，包括 `targeted-complete.log` 和 `full-check-delivery.log`。结构化计数和 SHA 在 verification.json 中。

交付前直接查询远端 main 得到 `dd081c9cc63fc91b4d62743141842c303128c4a2`，取回该对象并确认固定 BASE 是它的祖先；本分支 HEAD 未变，也没有把这个后续 main 合入。逐项要求与证据对应见 [objective-audit.md](assets/native-editor-reading/objective-audit.md)。

初次类型检查、lint、旧默认模式及 happy-dom mutation 循环问题均已修正；早期宽窄测试暴露宿主 blur，原文对照鼠标测试也暴露焦点丢失，后续实机同一输入复验通过。删除当前可见来源的回归曾停在旧 scrollTop，本轮改为在替换 layout 前捕获 UUID 和祖先 bookmark，最终单元／实机均通过。两次全仓检查曾在既有正文重试测试清理 journal 时出现 ENOTEMPTY：宿主 move 已发生而持久重试尚未结束。本轮只将该测试等待条件改成实际完成 UI，并保留所有原断言／新增完成断言；executor 未改。全屏剪贴板尝试曾超时、marker 未进入输入，后来的普通窗口系统剪贴板验证通过。最终删除锚点 harness 还核实了 SDK batch 返回 null 仍可能实际创建 block 并启动输入，改用 UUID readback 和系统 Escape；首个像素边缘断言也改为检查真实父块相对位置。失败记录保留，不把最初运行算作通过。

## 未验范围与最小后续步骤

完整中文 IME 人工验收未执行。自动化 key／type_text 和模拟 composition 只能验证对应事件／保护。人工在同一隔离 Lab 的第 48 段启用中文输入法，输入拼音并保留候选窗；打开对照、调整窗口／宿主侧栏，再继续选词、提交，确认候选不被取消、字符不重复、输入 UUID 和选区不改变；Escape 后返回正文。原生 Undo 的物理键操作可同时复核。

跨应用系统文件拖放未执行。实际 BASE main 没有注册原生 drop consumer，因此不能把观察端口或 Finder 中可见文件当作插件导入完成。04 接入后：把本轮合成 reference 拖到宽窗中的明确原块 body，验证新子块 UUID、材料 ID、source/version 与 readback；再测试历史、输入／组合态、标题、过期 scope 及窄窗让出时明确拒绝。停止 consumer 后重试，确认只移除自己的监听且不拦截宿主原行为。无法确认落点时使用既有完整材料 reference 文本粘贴，不能宣称精确 caret 支持。

本轮只覆盖 macOS arm64／Logseq 0.10.15。触摸、其他 OS／宿主版本、系统文件拖放和任意原生光标落点没有扩大验收。会话展示缓存不承诺卸载或重启后恢复选区。最终整合不应把旧构建截图当作合并后的重新实机验收。

## 复核入口与保留数据

本轮 Lab 和合成 Graph 保留在工作树 tmp 中，不清理 Graph 或其他用户资产。最终实机验收后，自有 Desktop 日志记录了 13:10 的 WindowServer 断连及 window-all-closed 退出；交付核对显示记录 PID 已不存在、Kernel 为 null，因此没有对旧 PID 执行停止命令。`node scripts/logseq-sandbox.mjs status/stop` 按 PID 和完整 command 检查所有权；没有停止其他 Logseq 或按可能重用的 PID 猜进程。

复跑时先检查本分支、Node 20、私有 profile 和端口；不要在已登记 Graph 上重复执行初次 fixture 生成并覆盖实验。原 helper、原始阶段快照和完整日志保留在 `tmp/native-editor-reading/`，公开 assets 保存身份、断言和截图。用当前构建重新加载本轮 Lab 后，再通过 `taskCopilotWorkbench.open(实际根UUID)`、report 端口及真实宿主交互复核。

共同索引与整套使用手册留给最终整合统一更新。本地提交可供 01／02／04／05／06 按上述责任消费；未授权远端发布。
