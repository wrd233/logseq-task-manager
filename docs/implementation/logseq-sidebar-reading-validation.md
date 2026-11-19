# Logseq 工作台侧栏阅读改进与实机验收

2026-11-19 · macOS 15.2（x86_64） · Logseq Desktop 0.10.9

四项改进均已实现，并在独立 Desktop 中用实际导入的预览包验收。320 px 侧栏的首块从距 iframe 顶部 213 px 提前到 107 px。第三层长单号在扣除原调查的 15 px 滚动槽预算后仍有 200 px 正文宽度、5 行换行，原调查是 192 px、7 行。工作搜索往返和原生编辑往返都保留了阅读位置，键盘可以从中段继续操作。

## 1. 版本、交付和隔离环境

| 项目 | 实际使用的版本 |
| --- | --- |
| 改动前 | `codex/logseq-workbench-preview` 的 `0.2.0 · 预览 2026-11-18T14:22:53.879Z · WCyVro`。原 ZIP 的 SHA-256 为 `b7861b198816220270a7ba0d08b5f07e294af2950b2e09bbe14010cae7ad62c7`。 |
| 基线源码 | 原 HEAD `968ab0e0a5a649a5b53b643516ff6b206220529e` 及构建所用未提交改动的完整快照，独立分支中的提交为 `9b94f5db114557c4359cec011634b9c27d4972a3`。以 WCyVro 标识重建后，`dist/index.js`、`dist/workspace.mjs` 与原包字节一致。 |
| 本次改动 | 独立分支 `codex/logseq-sidebar-reading`，预览构建源码提交 `5f23a3895d855663e0afb6bb6fa3045b93e6605e`。 |
| 实际加载的交付包 | `0.2.0 · 预览 2026-11-19T01:51:52.308Z · PIiln4`。ZIP SHA-256 为 `a856e034c5c3c2f0fa0e922b77f0ca375ff427eefca8d2dab98b2f193e3291cf`。解包校验通过，616 个文件的内容哈希与包内清单一致。 |
| DSH 设计依据 | 沿用[上一轮调查的宽窗截图](assets/logseq-sidebar-reading-validation/audit-dsh-wide.png)及结论。调查时 DSH Web 为 0.2.1-rc.2，阅读插件包为 0.1.0。本轮 Logseq 实现和验证使用独立环境。 |

[下载本地可加载预览 ZIP](../../tmp/deliverables/task-copilot-workbench-sidebar-reading.zip) · [SHA-256 校验文件](../../tmp/deliverables/task-copilot-workbench-sidebar-reading.zip.sha256)

独立工作树位于 `~/.codex/worktrees/logseq-sidebar-reading/logseq-task-manager/`。交付包已经通过真实 Desktop 的解压插件注册与重载，版本从 Logseq 插件设置读回。使用时解压 ZIP，在 Logseq 的开发者插件管理中选择解压出的 `task-copilot-workbench` 目录即可加载。

### 后台验收方法

两端使用独立的 Markdown Graph、配置、插件目录和 Logseq 应用副本，分别经本机端口 19451 和 19452 操作。应用副本的 Electron 主进程设置离屏 BrowserWindow、禁止激活和获取窗口焦点，拦截显示窗口的调用，并记录意外显示或聚焦事件。页面、插件 SDK、编辑器和 Graph 渲染通过实际 Logseq Desktop 运行。Electron 27.1.3、Chromium 118.0.5993.159，设备像素比 2。截图来自该实例的 `webContents.capturePage()`，鼠标、键盘和组合态事件通过该实例的调试接口送入所拥有的渲染页面。

验收期间每次尺寸调整、截图均读回 `offscreen=true`、`visible=false`、`focused=false`。应用启动时的一次显示请求被测试副本拦截。全程未调用系统窗口激活、系统鼠标或键盘接口，未与日常 Logseq、日常 DSH、日常 Graph 或端口 3080 交互。

测试样本和上次调查相同。复制了三份合成笔记到本目录，长记仍为 64 个来源块。

- [交接随记](assets/logseq-sidebar-reading-validation/samples/交接随记.md)（5 块普通旧笔记）
- [交接工作长记](assets/logseq-sidebar-reading-validation/samples/交接工作长记.md)（64 块，含三层子块、长单号、任务、标题、外链和折叠）
- [审计联络页](assets/logseq-sidebar-reading-validation/samples/审计联络页.md)（本地页引用目标）

源文件在基线、交付包验收前后 SHA-256 一致。原始数值、截图哈希、样本哈希和包身份见[完整性记录](assets/logseq-sidebar-reading-validation/acceptance-integrity.json)。

## 2. 前后截图

所有成对截图来自同一份笔记、相同 CSS 视口和真实 Logseq 渲染。宿主内容高度 700 px，阅读 iframe 高 652 px。主题通过 Logseq 自身设置切换。

### 普通旧笔记 · 1080 px 宿主 / 384 px 停靠栏

打开旧笔记后，新版保留正文、材料及读法，并将次要命令收入更多。五条普通正文紧接标题区显示。

| WCyVro | PIiln4 |
| --- | --- |
| ![旧版普通笔记](assets/logseq-sidebar-reading-validation/baseline-ordinary.png) | ![新版普通笔记](assets/logseq-sidebar-reading-validation/candidate-ordinary.png) |

### 同一长记 · 1080 px 宿主 / 384 px 停靠栏

| WCyVro | PIiln4 |
| --- | --- |
| ![旧版宽窗长记](assets/logseq-sidebar-reading-validation/baseline-wide.png) | ![新版宽窗长记](assets/logseq-sidebar-reading-validation/candidate-wide.png) |

### 同一长记 · 760 px 宿主 / 320 px 停靠栏

旧版首屏只能读到第二层附近。新版同时看见第三层、行内任务和折叠组，并开始进入链接段。

![改动前 320 px 停靠栏](assets/logseq-sidebar-reading-validation/baseline-narrow.png)

![改动后 320 px 停靠栏](assets/logseq-sidebar-reading-validation/candidate-narrow.png)

### 同一长记 · 540 px 宿主 / 530 px 覆盖态

| WCyVro | PIiln4 |
| --- | --- |
| ![旧版覆盖态](assets/logseq-sidebar-reading-validation/baseline-compact.png) | ![新版覆盖态](assets/logseq-sidebar-reading-validation/candidate-compact.png) |

### 深色主题 · 760 px 宿主

| WCyVro | PIiln4 |
| --- | --- |
| ![旧版深色](assets/logseq-sidebar-reading-validation/baseline-narrow-dark.png) | ![新版深色](assets/logseq-sidebar-reading-validation/candidate-narrow-dark.png) |

## 3. 把首屏与行宽还给正文

上一轮 DSH 的同一长记，参考其紧凑正文和按需操作设计。

![DSH 宽窗阅读框，上一轮调查实机截图](assets/logseq-sidebar-reading-validation/audit-dsh-wide.png)

取同一长记，从正文开头、鼠标移出阅读行后测量。首块坐标从 iframe 顶部计，正文宽度取 `.wb-body` 的实际边界盒，行数取文字 Range 的实际换行。所有下表宽度、高度为 CSS px。

| 实测 | 384 px 停靠栏，前 → 后 | 320 px 停靠栏，前 → 后 | 530 px 覆盖态，前 → 后 |
| --- | ---: | ---: | ---: |
| 首块纵坐标 | 213 → 107 | 213 → 107 | 184 → 107 |
| 顶层正文宽 | 298 → 300 | 234 → 236 | 436 → 446 |
| 第三层正文宽 | 271 → 279 | 207 → 215 | 400 → 425 |
| 第三层长单号行数 | 5 → 5 | 5 → 5 | 3 → 3 |
| 第三层所在行高 | 143 → 112 | 143 → 112 | 89 → 69 |
| 正文 / 行高 | 15 / 27 → 14 / 21.7 | 15 / 27 → 14 / 21.7 | 15 / 27 → 14 / 21.7 |

原调查可见窗口在 320 px 下测得 192 px、7 行。本次 macOS 离屏运行的滚动条为覆盖式，`scrollbar-gutter: stable` 的容器 `offsetWidth` 与 `clientWidth` 都是 320，实际未预留 15 px。故另在已加载 PIiln4 的离屏页面内，临时增加 15 px 右侧内边距模拟这一宽度预算，测完移除。第三层正文仍为 **200 px、5 行**，正文横向滚动宽度也为 200 px。该截图为有意扣除宽度的对照，发布包样式和系统滚动条偏好均未调整。

| 原调查（实际可见窗口） | PIiln4（离屏扣除 15 px 滚动槽等效宽度） |
| --- | --- |
| ![原调查窄栏长单号](assets/logseq-sidebar-reading-validation/audit-logseq-narrow-detail.png) | ![新版滚动槽宽度对照](assets/logseq-sidebar-reading-validation/candidate-narrow-classic-gutter-equivalent.png) |

同一 64 块全部展开时，384 px 滚动容器高度从 5,128 px 降至 3,099 px，320 px 从 5,209 px 降至 3,164 px，均约减少 39%。覆盖态全展开时从 4,164 px 降至 2,275 px。默认依据原生折叠只显示 62 块时，新版三种宽度相应高度为 3,024、3,089 和 2,219 px。

**块操作按需出现。** 在 1080 px 宿主的「定位点 02」验证，悬停前后正文宽度保持 300 px、高度保持 65.09 px，行纵坐标、870 px 滚动位置均相同。操作由透明且不可指向变为可见可点，正文右边到操作区左边保留 4 px，未覆盖正文。聚焦时同一行的「编辑」及「条目操作」可见。从 64 块中检测到 42 个叶块的折叠按钮为隐藏状态，第三层叶块按钮宽度为 0。有子项的节点把箭头放在正文左侧，正文按深度 7 px 递增，最多 5 层（35 px）。固定的右侧操作宽度使鼠标经过时换行和书签位置保持稳定。

![在中段悬停才显示该行的编辑与更多](assets/logseq-sidebar-reading-validation/candidate-hover-actions.png)

在 320 px 侧栏模拟无悬停的粗指针设备，操作区从透明变为常显，按钮高由 24 px 变为 28 px，正文宽度仍为 236 px。实际渲染页面收到了 `isTrusted=true`、`pointerType=touch` 的两次事件（pointerdown 与 click），点开该条目菜单，菜单内宽和滚动宽均是 262 px。见[触控菜单截图](assets/logseq-sidebar-reading-validation/candidate-touch-menu.png)。

协作入口可在「更多 → 协作与授权」中找到。实际展开后看到「在 DSH 继续」「新建此工作 DSH 对话」「带当前工作去协作页面」等原有命令。见[更多菜单截图](assets/logseq-sidebar-reading-validation/candidate-more-collaboration.png)。

## 4. 一步回到工作搜索

### 宽窗鼠标

1. 打开「发现已有工作」，启用自动发现。三个样本放入隔离 Graph，把两篇阅读样本手动加入工作搜索，另放入 22 个名为「交接索引01」至「交接索引22」、带 Project 标签的页面。
2. 输入「交接」，实测 24 项。滚轮滚至列表 `470 px`，打开位于该处的「交接索引16」。
3. 点击阅读头部的「返回工作搜索」一次。搜索词仍为「交接」，24 项、470 px 列表位置和「交接索引16」的结果按钮焦点均保留。
4. 改搜「交接工作长记」，打开该笔记，展开原生默认折叠的备用组。滚轮到 `870 px`，首个可见来源为「补充 01」。返回搜索，再次点击同一结果。首个可见来源、偏移（−9.62 px）、870 px 位置、已展开的折叠组均相同，入口焦点回到阅读标题。

![24 项列表，回到 470 px 处且原结果获得焦点](assets/logseq-sidebar-reading-validation/candidate-search-return.png)

### 窄栏与覆盖态键盘

从搜索结果按 Shift+Tab 到搜索框，按 ↓、Enter 打开长记。此时焦点落阅读标题。阅读面板内提供 Alt+←（macOS 的 Option+←）作为「返回工作搜索」的同一入口。从中段按该组合键一次，已验证原查询词、结果项和焦点均返回。再按 Enter 恢复中段锚点及展开状态。从标题按三次 Tab 能到具名返回按钮，按一次 Enter 同样回到搜索。

快捷键只绑定读取面板，输入框、文本编辑器和组合输入保留原生行为。搜索打开的阅读会话才显示该入口。草稿未结束时返回搜索动作会受输入保护。

## 5. 原生编辑、返回与后续 Tab

### 1080 px，鼠标并排编辑

在「定位点 02」所在行悬停，点击「编辑」一次。原生区打开 UUID 对应的实际 textarea，右侧正文继续显示。「编辑页首」是标题区动作，实测进入第一来源块 `#Project`，与「定位点 02」不同。

![鼠标进入定位点 02 的 Logseq 原生编辑，与阅读并排](assets/logseq-sidebar-reading-validation/candidate-wide-native-edit.png)

按 Esc 结束原生输入，点击侧栏「返回正文」。870 px 及首个可见来源保持，焦点恢复为「定位点 02」该块的 `aria-label="编辑此块"` 按钮，仍在视口内。见[宽窗返回截图](assets/logseq-sidebar-reading-validation/candidate-wide-edit-return.png)。

### 760 / 540 px，键盘原生往返

两个宽度均从实际工作搜索中用键盘打开同一长记。起始位置为 0 px 并已显式展开备用组。由标题按七次 Tab 到第一正文块，然后 PageDown，焦点此时仍指向已经滚出视口的第一块。下一次 Tab 重新落在当前视口中首个控制按钮也可见的来源块。随即再按 Tab 到「编辑此块」，按 Enter 打开原生编辑，结束输入后用 ⌘⌥R 返回正文。

| 验收点 | 760 px / 320 px 停靠 | 540 px / 530 px 覆盖 |
| --- | --- | --- |
| PageDown 后的正文位置 | 533 px | 533 px |
| 下一次 Tab 落点 | 备用流程的子级说明 | 现场确认 |
| 再 Tab 到该块编辑按钮 | 533 px，按钮可见 | 533 px，按钮可见 |
| 原生态 | 并排，实际 textarea 获焦 | 阅读让出主区，实际 textarea 获焦，宿主顶栏出现「返回正文」 |
| Esc、⌘⌥R 后的焦点 | 同块「编辑此块」 | 同块「编辑此块」 |
| 再按一次 Tab | 同块「条目操作」 | 同块「条目操作」 |
| 返回前 / 后 / 再 Tab 的 scrollTop | 533 / 533 / 533 px | 533 / 533 / 533 px |
| Alt+← 回搜索、Enter 重开 | 查询与结果保留，533 px 及原锚点、展开状态保留 | 查询与结果保留，533 px 及原锚点、展开状态保留 |

这次走查还覆盖了一个真实边界。阅读中展开原生默认收起的组，选到 Logseq 主区因为祖先折叠而尚未挂载的子块。原页定位若不能挂载对应 UUID，则转到 Logseq 原生的块聚焦页，再编辑同一来源。原生折叠属性保持。

| 760 px 键盘返回后 | 540 px 键盘返回后 |
| --- | --- |
| ![窄栏保留原生编辑来源的焦点](assets/logseq-sidebar-reading-validation/candidate-narrow-edit-return.png) | ![覆盖态保留来源位置，继续 Tab 到条目操作](assets/logseq-sidebar-reading-validation/candidate-compact-edit-return.png) |

![覆盖态编辑时原生主区可见，顶栏返回正文](assets/logseq-sidebar-reading-validation/candidate-compact-native-edit.png)

两张 [窄栏 PageDown 后首次 Tab](assets/logseq-sidebar-reading-validation/candidate-narrow-paged-tab.png) 和 [覆盖态 PageDown 后首次 Tab](assets/logseq-sidebar-reading-validation/candidate-compact-paged-tab.png) 记录了跳过旧焦点的实际落点。

### 草稿及中文组合输入

另建合成页「审计草稿验证」，测试在原生 textarea 仍持有输入时的动作，避免改动对照笔记。

- 插入「（临时未提交）」后的首次读回，textarea 有新文字，Graph 中块内容仍为原句。点击「返回工作搜索」、另一块的编辑按钮及页引用均保持当前页和同一个输入对象，焦点及选择位置 20/20 未变。Logseq 自身的后续自动保存仍正常，阅读按已保存的内容更新。
- 点击「继续原生输入」后，同一 textarea、文字和选择位置均保留。
- 用 Chromium 的 `Input.imeSetComposition` 启动真正送达渲染器的「中文组合态」输入。记录到受信任的 compositionstart、compositionupdate 和 `isComposing=true` 的 input 事件。选择范围 22–23。
- 由 1080 px 并排态调整为 540 px 覆盖编辑态，保持原 textarea、组合文字、选择范围和焦点。点击宿主「返回正文」后，阅读展开，原生区视觉上让出但同一输入仍获焦，组合未被结束。
- 测试主动取消组合、继续原生输入，恢复合成页的原始内容后再退出。三份对照样本文件哈希全部一致。

![草稿期间同屏原生输入与只读正文](assets/logseq-sidebar-reading-validation/candidate-draft-beside.png)

![缩到覆盖态时仍保留中文组合高亮、输入和返回正文](assets/logseq-sidebar-reading-validation/candidate-composition-native.png)

本轮验收覆盖真实 Electron/Chromium 内容编辑及组合事件。macOS 系统输入法的候选窗口和物理触屏经过窗口系统的路径需在允许前台操作时另验。

## 6. 侧栏排版、折叠和链接语义

**段落和标题。** 真实 computed style 中 H1、H2、H3 分别为 18.06、15.96、14.56 px，标题行高为 1.32 倍。WCyVro 的 17.55 / 22.5 / 17.55 px 层级倒挂已消除。长内容贴近标准阅读行距 21.7 px，任务标签随第一行文字呈现。320 px 下 TODO 和 DONE 示例行均为 28 px（旧版约 71 px），标签与首个文字 Range 处在同一文本行。

**折叠。** 64 块的来源全部保留，打开长记时 `collapsed:: true` 的两条后代默认隐藏，实际显示 62 块，属性行从阅读正文去除。展开后显示 64 块，再折叠回 62 块，搜索和编辑往返保持显式的展开选择。普通折叠时 `.wb-status` 内容为空，真正的聚焦范围仍由现有范围逻辑显示提示。属性解析直接来自读取的来源块内容，源文件哈希保持一致。

**链接。** 320 px 下长链接段正文盒内宽与滚动宽均为 229 px，长 URL 形成 5 个文本矩形，正文所有可见来源均未横向溢出。长链接菜单在 384 px 浅色和 320 px 深色两种场景的 `clientWidth / scrollWidth` 都为 262 / 262 px，修复了原调查的 262 / 278 px 横向滚动。实际点击「审计联络页」页引用进入正确的 Logseq 原页，工作台仍保持「交接工作长记」阅读会话，「返回正文」后位置 505.5 px 与原锚点一致。外部 Markdown 链接的目标地址保留。

![320 px 窄栏详情，长单号、任务、折叠与完整回绕的链接](assets/logseq-sidebar-reading-validation/candidate-narrow-light-detail.png)

| 正文中手动展开备用组 | 320 px 深色主题下的长链接条目菜单 |
| --- | --- |
| ![显式展开保留原生折叠语义](assets/logseq-sidebar-reading-validation/candidate-narrow-expanded.png) | ![深色窄栏菜单无横向溢出](assets/logseq-sidebar-reading-validation/candidate-narrow-dark-detail.png) |

![页引用跳到原生审计联络页，右侧仍在读交接工作长记](assets/logseq-sidebar-reading-validation/candidate-local-page-reference.png)

## 7. 代码位置与取舍

| 体验改进 | 对应实现及可复验位置 |
| --- | --- |
| 首屏、操作栏、分组 | [shell.ts:33](../../apps/logseq-plugin/src/features/work-view/shell.ts#L33) 合并标题与导航，并在约 95 行将协作命令分入更多的「协作与授权」。[visual-style.ts:46](../../apps/logseq-plugin/src/host/visual-style.ts#L46) 紧凑的工作头、导航与读法菜单，66 行处理菜单盒尺寸。 |
| 行宽和操作显示 | [renderer.ts:115](../../apps/logseq-plugin/src/features/work-view/renderer.ts#L115) 为正文、标签、条目操作保留稳定 DOM 位置，128、232、243 行处理来源编辑与叶块折叠。[report-style.ts:9](../../apps/logseq-plugin/src/features/work-view/report-style.ts#L9) 两列阅读网格、受限缩进、按悬停/聚焦/粗指针显示操作。[visual-style.ts:100](../../apps/logseq-plugin/src/host/visual-style.ts#L100) 为折叠箭头提供统一区域。 |
| 搜索往返 | [catalog-view.ts:51](../../apps/logseq-plugin/src/features/agent-workspace/catalog-view.ts#L51) 恢复结果焦点，100–115 行保留滚动和操作，124–131 行传递搜索来源。[controller.ts:157](../../apps/logseq-plugin/src/features/work-view/controller.ts#L157) 面板键盘返回，408 行保护活动原生输入后复用 catalog 的打开路径。[report-controller.ts:112](../../apps/logseq-plugin/src/features/work-view/report-controller.ts#L112) 继续使用 Graph/工作范围书签。 |
| 原生编辑与焦点 | [shell.ts:74](../../apps/logseq-plugin/src/features/work-view/shell.ts#L74) 标题动作、返回正文与活动草稿文案。[report-controller.ts:337](../../apps/logseq-plugin/src/features/work-view/report-controller.ts#L337) 按来源 UUID、内容版本及实际作用域解析打开，440 行在恢复正文前核验输入状态。[native-editor.ts:94](../../apps/logseq-plugin/src/host/native-editor.ts#L94) 实际原生编辑及折叠祖先下的块聚焦路径。[renderer.ts:314](../../apps/logseq-plugin/src/features/work-view/renderer.ts#L314) 记录来源与控件焦点，342–389 行恢复锚点并处理翻页后的 Tab。 |
| 排版、任务、折叠和链接 | [report-body.ts:1](../../apps/logseq-plugin/src/features/work-view/report-body.ts#L1) 解析 native collapsed 属性，保留代码围栏内字面示例。[report-controller.ts:240](../../apps/logseq-plugin/src/features/work-view/report-controller.ts#L240) 合成原生折叠默认值及用户显式展开/收起，289 行兼容保存两个方向的覆盖值。[controller.ts:474](../../apps/logseq-plugin/src/features/work-view/controller.ts#L474) 会话折叠记录，600 行只给实际聚焦范围提示。[report-style.ts:14](../../apps/logseq-plugin/src/features/work-view/report-style.ts#L14) 标题、任务、正文的侧栏排版。[markdown.ts:7](../../apps/logseq-plugin/src/features/work-view/markdown.ts#L7) Markdown 页引用解析，[report-controller.ts:302](../../apps/logseq-plugin/src/features/work-view/report-controller.ts#L302) 核对当前 Graph 和原生编辑状态后路由真实页面。 |

采用 DSH 中块操作随聚焦或悬停出现、任务行内呈现和紧凑标题区的做法。Logseq 侧栏用有限的真实缩进呈现原有层级，以现有原生编辑 API 写作，以来源标识和会话书签保持上下文。读法与材料导航、块内 Markdown 对照、范围聚焦、原生写入校验沿用既有实现。

## 8. 构建和检查

| 命令或验证 | 结果 |
| --- | --- |
| Node 20.20.2 · `npm run typecheck` | 通过 |
| `npm run lint` | 通过 |
| `npm test --workspace @task-copilot/logseq-plugin` | 572 / 572 通过。调整原有阅读 UI 检查，并在其已有集成测试中覆盖折叠祖先下的原生编辑。 |
| `npm run build` | 通过 |
| `npm run check:boundaries` | 12 / 12 通过，依赖边界通过 |
| `npm run test:sandbox` | 5 / 5 通过 |
| `npm run taste:eval` | PASS |
| `npm run preview:logseq -- update` | 通过。交付 ZIP 的完整性校验、解压、Desktop 载入及版本读回均已实际完成。 |

仓库组合命令 `npm run check` 首次执行遇到两个工作台之外的检查失败。Kernel Console 测试依赖其静态构建产物，先行构建后单项复跑通过。DSH 的 `tests/reader-markdown.test.mjs` 在独立环境报缺少 `react/jsx-runtime`，将基线快照中的 DSH 测试和相关源码另行解出复跑，得到相同错误。因此上表的本轮 Logseq 检查均为实际通过，仓库跨应用组合检查仍有原有的 DSH 测试环境缺口。

### 数值与复现材料

- [WCyVro 实测数据](assets/logseq-sidebar-reading-validation/baseline-measurements.json) · [基线滚动槽和深色数据](assets/logseq-sidebar-reading-validation/baseline-details.json)
- [PIiln4 实测数据](assets/logseq-sidebar-reading-validation/candidate-measurements.json) · [全展开、任务和链接尺寸](assets/logseq-sidebar-reading-validation/details-release.json)
- [搜索、原生、键盘往返的逐步读回](assets/logseq-sidebar-reading-validation/journeys.json)
- [草稿、组合态和触控事件](assets/logseq-sidebar-reading-validation/draft-touch.json)
- [包、样本、截图完整性](assets/logseq-sidebar-reading-validation/acceptance-integrity.json)

复验时使用相同样本，解压相应 ZIP 到独立安装目录，打开普通页和长记，先关闭 Logseq 主区左右栏，再分别调整测试宿主内容宽度为 1080、760、540 px。按第 4 至 6 节路径操作即可重现各项结果。若继续做离屏自动复验，本工作树的 `tmp/sidebar-reading/` 保留了本轮准备独立 Desktop、调试驱动、操作与采集的临时记录。上述物理输入法和触屏的窗口系统路径是后续人工验收的范围。
