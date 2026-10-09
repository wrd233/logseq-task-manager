# 材料目录、稳定引用与只读预览交接

2026-10-09。所有者 A，分支 `codex/materials-and-preview`。本文件记录实际实现与已取得的证据；B 的跨模块装配、Agent CLI 运输和最终集成验收尚未发生。

## 提交与环境

| 项目 | 实际值 |
| --- | --- |
| origin | `https://github.com/wrd233/logseq-task-manager.git` |
| 固定 BASE_SHA | `5b05d156cc03b37956d6f77de2d10213a6cb58e3` |
| BASE 内已有视觉刷新 | `eb07013d119584dbd3c68012541f1355118d2b0b` |
| 最终实现与验收安装包 SHA | `98c0d4e6d5122ff8a763683e96e25dd511928e36` |
| 工具链 | Node 20.20.2、npm 10.8.2；仓库要求 Node `>=20.19 <21` |
| 已实测宿主 | macOS 15.1 arm64、未经修改的 Logseq Desktop 0.10.15、SDK 0.3.4、Electron 38.4 / Chromium 140 |
| 安装方式 | 安装包解压到仓库外，正常“手动载入插件”，更新通过正常“重载” |
| 独立现场 | 自有 Graph、材料根 A/B、HOME、profile、端口 19447、单独 stock 应用副本 |
| 连接状态 | `tasksEnabled:false`，无 Kernel/companion/开发服务器，两个 descriptor 均为空 |

实现提交依次为：

- `72cff0e77228f5987f717dcaffa5577dad42dfcb`：宿主原始字节与能力验证基础。
- `676817249122130d44c3ee7f8241289e2243d2cc`：目录、解析、各格式预览、窗口及必要接线。
- `61480c9f5d3bfcecf58a63e6155ce340b5234318`：格式读取边界、主题、范围失效与资源保护。
- `d2d1872bcde90e53c726a0cb00eb5401e71cf3a1`：原生链接 pointer/mousedown 保护。单独使用此修复时，真实宿主选区仍失败。
- `9d7cf615739de9bc8fd3c2da371934d76bfe895a`：保护原生编辑块的 hover 生命周期；实际草稿与选区验收通过。
- `3955f51017c00046121f6eee17bdcbba5316ee8d`：刚解析的材料无需先列表即可保留失联历史。
- `98c0d4e6d5122ff8a763683e96e25dd511928e36`：公共材料列表返回部分成功及只读失联记录，不被单根失联整体拒绝。

交接文档与证据的本地提交在上述实现之后；用 `git log -1 --format=%H -- docs/implementation/materials-and-preview-handoff.md` 核验文档提交，用 `git rev-parse codex/materials-and-preview` 核验完整交付提交。没有推送、PR、main 合并或发布；没有改动用户主工作树、生产 Graph 或另一实施现场。

## 真实接口与 B 适配

### 公开组合

`apps/logseq-plugin/src/index.ts` 在插件 iframe 的 `window` 上发布 `taskCopilotWorkbench.materials`。它不是 native parent window 的全局变量。B 应在既有受信本地通道中适配此服务，不复制元数据扫描/UUID 算法，不向外部 payload 开放任意 actor 或权限。

```ts
materials.resolveFile({path: absoluteFilePath, sourceUuid: workRootUuid})
// Promise<DirectoryFileResolution>

materials.list({sourceUuid: workRootUuid, query: ""})
// Promise<{status: "success" | "partial";
//          materials: MaterialView[]; problems: string[]}>

materials.read(materialId)
// Promise<MaterialView>；现有文字读取，不是通用二进制预览 API

materials.openLink(referenceHref, workRootUuid)
// Promise<void>；UI 动作，必须从真实用户交互调用

materials.delegateFileClick(mouseEvent, workRootUuid, sourceFilePath?)
// boolean；同步消费文件点击，B 的正文高亮处理先调用它
```

示例：Agent 已在获准工作目录生成文件后，B 校验当前 Graph/工作和绝对路径，调用 `resolveFile`。将返回的 `materialId`、`fileName`、`reference` 原样纳入产物回执；获准笔记写回时才通过 B 原有 executor 插入完整 reference。解析本身只创建/复用材料关联，不插入 Graph 文本，不复制原件，不授予写权限。

真实返回示例（隔离现场）：

```json
{
  "status": "needs-verification",
  "materialId": "04337349-158a-4d44-af28-2516759d0d76",
  "fileName": "生命周期 验收.md",
  "reference": "[📄 生命周期 验收\\.md](longdoc://04337349-158a-4d44-af28-2516759d0d76)",
  "availability": "available",
  "identity": "unverified"
}
```

完整类型在 `features/materials/service.ts`。`DirectoryFileResolution` 还返回实际 `path`、`associations`、可选 `problem`；`identity` 为 `verified | unverified | changed`。`needs-verification` 不是可靠物理身份已确认；B 必须保留问题说明，不能包装为完整成功。

同一合法路径重试、已有目录内导入和再解析复用同一个 UUID。不同根同名文件具有不同 UUID。可信 dev/ino/birthtime 可用时，外部改名沿既有身份发现更新；手写标题/别名保留，自动文件名引用更新。当前 stock Desktop 的 stat 不提供这些字段，因此只返回明确的路径关联，不会根据内容 hash、名称、大小或 mtime 推测身份，不自动添加新工作关联。

公共 `list` 的单根失联结果为 `partial`：已观察的真实 ID/reference/关联仍可发现，失联材料 `content:null`、`version:null`、`availability:"unavailable"`、两种编辑权限均为 false。缓存仅属于当前 service/Graph 生命周期；不保证重启后还能补回此前未读取或未观察的记录。另一个根的已登记文件仍可读取/重试；如未知文件可能与失联历史目录内记录重复，服务拒绝创建替代 UUID，不能声称所有新身份分配均不受影响。

既有 `capture/import/associate/save` 仍存在。`associate` 会经过原引用插入边界；B 获取文件 ID/reference 应使用 `resolveFile`，不要为查询身份调用正文写入入口。原 Markdown 编辑与原权限/草稿/冲突保存路径保持独立。

### 目录与预览内部导出

| 位置 | 实际职责 |
| --- | --- |
| `features/materials/directory.ts` | `MaterialDirectoryBrowser.roots/read`；Graph/owner/root/relative、一级条目、完整性/部分/不可用、游标；`MaterialDirectorySync` 有界观察与取消 |
| `features/materials/service.ts` | `resolveDirectoryFile(path, context, signal?)`、`listViews`、`unavailableMaterialView`；统一真实身份/reference |
| `features/materials/preview/reader.ts` | `MaterialPreviewReader.material/asset/read`；原始 bytes、读取前后范围/路径/身份校验 |
| `features/materials/preview/types.ts` | target、scope、SHA-256 bytes version、格式、origin、可靠身份、错误类型 |
| `features/materials/preview/session.ts` | 主面板/真实窗口、同材料同版本复用、视图资源与关闭 |
| `features/materials/preview/paths.ts` | material/local-file/graph-asset/other/unresolved 分类；网页/wiki 保留原语义 |
| `host/file-io.ts` | 可选 `readBytes(path,{signal,maxBytes})`、真正一级 `listDirectory(path,{signal,limit,cursor})`；原文本 API 不变 |
| `host/directory-handles.ts` | 原生复制目录后的可信只读授权；FSA 恢复与 legacy entry 完整性区分 |

目录浏览默认当前层，每次最多 512 项；活跃界面 1 秒有界刷新，焦点/进入目录核对，有新请求时去抖，不递归把子树摊平。当前 Desktop 没有受信 watcher 和通用一级目录 API，因此使用原生目录读取授权。FSA 会过滤部分特殊文件名，恢复授权的结果必须标记 `partial`；再次从 Finder 原生复制目录并粘贴可使用 legacy entry 完整读取。部分/分页/失败保留 last-known 条目并标记 current=false，不能当成删除。

B 的 Agent 目录命令可以调用 `MaterialDirectoryBrowser` 核心并提供它自己已有的 FileIO，不能拿前端浏览器缓存冒充 Agent 当前目录事实。真实 Agent 协议/CLI 装配归 B，本分支未添加或验收这个运输闭环。

## 格式、边界与依赖

| 格式 | 实际内置能力 | 读取边界/限制 |
| --- | --- | --- |
| MD / Markdown | 段落、标题、表格、列表、代码、本地图片、材料相对链接；DOMPurify 清洗后呈现 | 文本 2 MiB；远程图片禁用；原件不改写 |
| DOCX | Mammoth 浏览器转换，标题/段落/列表/表格/内嵌图片 | 阅读转换不保证分页/页眉页脚/复杂版式完整还原；主要不支持内容有提示 |
| 旧 DOC | 识别扩展名并报告未支持内置解析 | 未列为 Word 阅读通过；BIFF8 改名 .doc 只证明扩展名路由，不能证明真实旧 Word |
| PNG/JPEG/WebP/GIF | 原图解码、原比例、像素尺寸、适配/缩放；浏览器 GIF 动画 | 最大 32M 像素；动画是否可见使用实际帧证据 |
| PDF | 原始二进制、本地 worker/CMaps/fonts、多页/页码/翻页/缩放/适配；中文与扫描页 | 最多 500 页、单页 16M 像素、加载 20 秒；关闭 worker 有 2 秒终止后备 |
| XLSX/XLS/CSV | 工作表、行列标签、保存值、合并单元格、100 行 ×40 列分页 | 最多解析 10000 行；不编辑、不重算公式；缺缓存明确提示，0 与无缓存区分 |

通用 bytes 上限 64 MiB；DOCX 主 XML/转换 HTML 各 4 Mi 字符；本地包资源读取 8 MiB。ZIP 解析校验 CRC、压缩/解压大小、异常结构/加密/ZIP64；真实 OLE 加密 Office 先识别，不误报 ZIP 格式成功。损坏、加密、超限均显示具体失败，不回退为“元信息就是阅读”。

新增精确依赖：Mammoth 1.13.0 (BSD-2-Clause)、pdfjs-dist 4.10.38 (Apache-2.0)、fflate 0.8.3 (MIT)、SheetJS 官方 0.20.3 (Apache-2.0)。SheetJS 使用官方固定 tarball，锁文件记录 integrity；运行时不从 CDN 读取格式库。打包交付 PDF worker、168 个 CMaps、16 个字体与 8 份许可证。

官方依据：[Mammoth](https://github.com/mwilliamson/mammoth.js)、[PDF.js](https://mozilla.github.io/pdf.js/getting_started/)、[SheetJS 安装](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/)、[fflate](https://github.com/101arrowz/fflate)。依赖审计仍有 3 high/4 moderate，不能称为无漏洞。SDK 的已有预打包 lodash 不由本范围移除；Mammoth CLI 的 argparse/sprintf 不在浏览器 metafile 输入内。特定 DOMPurify IN_PLACE 跨 realm 公告不等于当前字符串净化调用已触发漏洞，也不等于整个依赖安全风险已经解决。

## 实际 Desktop 证据

证据归档在 [assets/materials-and-preview/runtime](assets/materials-and-preview/runtime/README.md)。JSON 为真实运行快照/公开数据 API 回执；UI 动作通过 native CUA，CDP 仅用于只读观察和公开语义数据接口。没有宿主代码替换、私有 IPC 注入、伪造剪贴板目录或开发服务。路径占位符只用于证据可移植化，UUID/bytes version/结果未改写。

| 验收项 | 事实与证据 |
| --- | --- |
| 两个真实根、同名与两层 | A/B 根正常选择；`一级/二级/深入.md` 面包屑进入/返回，当前层未摊平；`directory-layer2.json`、`directory-rootB-complete.json` |
| 外部新增五类 | 五个文件通过普通文件 IO 加入 A 根，均在约 955ms 内自动出现，仍为未登记；材料元数据未变；`directory-external-five.json` |
| 真实 ID/reference | A/B 同名 UUID 不同；resolve→retry→已有路径 import→resolve 均同 ID；只读权限；`real-directory-identities.json` |
| 单根失联 | 最终安装包正常重载后，无先前 UI list 的解析记录仍保留；A read 显式失败，公共 list partial，B 已登记文件仍原 ID/原正文；`single-root-offline-pass.json` |
| 最终安装版原生链接 | `final-native-md.json`、`final-native-docx.json`、`final-native-pdf-page1.json`、`final-native-pdf-scan.json`、`final-native-xlsx-plan.json`、`final-native-xlsx-page2.json`、`final-relative-image-125.json` |
| Word 核心 | 最终安装包标题、段落、列表、3 行表格、720×320 图片真实解码 |
| PDF | 最终安装包 2 页，中文正文与实际扫描图片；native 翻页和适配到 55%，扫描图实际滚入视口 |
| Excel | 最终安装包计划表 A4:C4 合并、B6 缺公式保存值提示；切到 351 行表，第二页 101–200 行 |
| 其他格式 | JPEG/WebP、GIF 真实交替可见帧、XLS BIFF8/CSV UTF-8 BOM、加密/损坏等较早实现验证记录分别归档；本轮 final 核心矩阵没有逐项重跑这些扩展格式 |
| 原生草稿与选区 | 原 textarea ID/value/selection 18–22/connected 保持；native Markdown 点击 active 仍 true；iframe 控件可移动焦点而不替换草稿；`final-draft-before.json`、`final-draft-after-md.json`。物理 IME 尚未实测 |
| 真实独立窗口 | 原生窗口 about:blank、标题真实文件名、同 UUID/bytes version；系统“移动与调整大小→左侧”使 900×720@(270,90) 变为 709×797@(8,33)；`final-window-before-move.json`、`final-window-system-left.json` |
| 窗口与继续写作 | 窗口保持 Word 快照，Logseq 主窗口进入原生编辑；`final-window-during-writing.json`、`final-draft-before.json` |
| 明暗主题 | 最终安装包深色模式传入窗口，Word 表格文字和背景实际变化、图片仍显示；`final-window-dark.json/png`、`final-window-dark-colors.json`、`final-sheet-dark-colors.json` |
| 外部变化/失联 | 合成 MD 外部更新后旧 version 不变、显示“原文件已变化”；移走原路径显示 ENOENT 并保留旧快照；重新打开为新 version；`lifecycle-before-change.json`、`lifecycle-after-change.json`、`lifecycle-original-missing.json`、`lifecycle-current-window.json` |
| 工作切换清理 | 真实 UI 切到另一工作，旧 child target 消失；已知图片 blob 从 live/17207 bytes 变成 Failed to fetch；`lifecycle-targets-after-work-switch.json`、`lifecycle-resource-live.json`、`lifecycle-resource-after-work-switch.json` |
| Graph 切换清理 | 原生菜单添加并切到另一个自有 Graph，主/子 PDF worker 从 3 个总 worker 回到同一个宿主基线 worker；child 消失、preview 为空；`final-before-graph-switch.json`、`final-after-graph-switch.json`、`final-after-graph-switch-view.json` |
| 正常停用/卸载 | 正常插件管理页开关从 1 到 0；主/子 PDF worker 与 child 消失，材料 click/pointer/mouse/hover/composition 共 7 类监听从每类 1 个变为 0，插件 iframe 移除；`final-before-unload-resources.json`、`final-after-unload-resources.json`、`final-listeners-before/after-unload.json` |
| Graph assets | 原生 `graph/assets/只读扫描.pdf` 以 asset target 阅读，SHA 等于原 PDF；不创建替代材料正文；`final-graph-asset.json`、`final-graph-asset-window.json` |
| 目录失联与草稿 | 实际移走 A 根后 29 项全部保留为 current=false，显示失联原因；恢复原目录。外部新增文件引发刷新后改名草稿 value/selection/active/connected 不变；`final-observer-before/during-offline.json`、`final-rename-draft-before/after.json` |
| 最终包从列表打开 | 同一真实当前层列表分别打开 MD/Word/PDF/Excel/图片；Word/PDF/Excel/PNG 的 UUID 和 SHA 与原生引用进入一致；`final-list-md/docx/pdf/xlsx/image.json` |
| 不可信内容 | 实际安全 MD 的 script=0、事件属性为空、javascript href 移除、合法材料 href 保留，XSS flag 未设置；先开启只读网络观察再由 native UI 打开，16 秒内无 preview.invalid 请求；`final-malicious-preview.json`、`final-malicious-network.json` |
| 原件保持 | 24 份原合成材料 SHA-256 无变化；`original-bytes-final.json`。生命周期可变文件为另建合成 fixture，不属于这些原件 |

窗口最多 4 个，同材料同版本再次放大聚焦既有窗口。主面板在同工作内切材料不会给独立窗口换目标。文件改变/消失时显示已打开旧快照与问题；窗口仍在阅读时其资源有明确所有者，关闭/范围失效后释放。window.open 由同步可信点击调用。

原生自由拖动尝试未产生可证明的位置变化，因此不记为拖动通过；系统窗口操作已实际改变尺寸和位置。物理 IME、跨平台/其他宿主版本、长时间浸泡和崩溃/断电仍未实测。合成输入与 DOM 回归不能替代这些事实。

## 检查与安装包

`98c0d4e` 源码执行完整 `npm run check`，退出 0：requirements map、全 workspace typecheck、lint、716 项业务测试、5 项 sandbox、构建/内置二进制检查、12 项架构边界、taste 均通过；插件 482 项。总计 733 tests，无失败/跳过。不要重复把各阶段测试和总数相加。

安装包 SHA-256 `f8485786f3bec910d00efa2d21cdcbfed73969341498f21499bb96a6d5efbfd2`，618 entries、615 build 文件哈希核对、dirty=false。`package-install-public-offline.json` 记录该版本从前版的正常更新；仓库外目录名称含 `9d7cf61`，其实际 build identity 为完整 `98c0d4e`，不能用目录名字判断版本。

失败记录也保留：pointer 保护单独时真实草稿选区失败；早期 Word 图片 offset 错误；未 priming 的历史回归先失败；3955 公共 list 在真实失联时仍拒绝。这些都不是当前通过证据；后续对应实现/公共 API 的回归及实际运行通过才支持上表。

## 修改面与兼容性

实际源码/测试变更列表见 [changed-files.txt](assets/materials-and-preview/runtime/changed-files.txt)，由固定 BASE 到最终实现的 Git diff 导出。A 改动 materials、FileIO/desktop-files/local-bytes/directory-handles、插件构建依赖和 lockfile、最小 index 组合及对应测试。没有重排 B 的 work-view/Agent 协议/写回核心，也没有改造 CLI 的协议命令。

FileIO 新能力可选，缺能力显式失败，原 text 调用兼容。已有 longdoc UUID 与 JSON 格式延续；自动文件名 reference 不为展示改原文件。新增 directory 列表默认 current layer；已关联与历史入口保留。关联根/default/unbind 不搬移旧文件，不迁移 Workspace 身份。

这是 A 的材料功能验收，不能推出整插件已成熟或可放心写入生产。此前生产审计发现的 Kernel/CLI schema/backup、自动状态写入、路径与外部写入竞态等基线风险不由本分支修复。stock Desktop 不提供物理身份，路径边界为现有词法校验；不能宣称获得 realpath/symlink 级隔离。

## 可移植复验与 B 联调

A 的上述材料实施与隔离运行验收已经完成。完整矩阵还区分了实际 Desktop、真实文件 IO 回归和未实测项，见 [completion-audit.md](assets/materials-and-preview/runtime/completion-audit.md)。不能把 A 的完成扩大为整个插件生产成熟度或 B 联调完成。

24 份合成原样本随仓库交付在 [desktop-acceptance](../../apps/logseq-plugin/tests/fixtures/material-preview/desktop-acceptance/README.md)，以可跨平台 checkout 的数字文件名存储，manifest 保留真实验收名和 SHA。`materialize.mjs` 只接受新建目的目录，按原始字节还原 A/B 根。已经实际物化并核对 24 份 SHA，脚本 lint 通过；它不是实际 Desktop 验收的替代品。新电脑应从本机 `resolveFile` 获取 UUID，不复用此处 A 的运行 UUID；无需原电脑的绝对路径、Lab 或聊天。

B 合入完整 A 提交后必须：

1. 正文点击先调用 `delegateFileClick`，文件点击消费后不再触发行来源高亮；页面/wiki/web 路由保持。
2. 用真实受信 Agent 命令调用解析接口，产物文件→同一 ID/reference→授权笔记写回闭环验收；不能用前端 fixture API 调用冒充 CLI 运输。
3. 在其 work-view/来源集合高亮实现上重新核对原生草稿、选区、物理中文组合输入、工作/Graph 撤销、阅读与材料返回位置。
4. 合入/冲突解决后跑完整 check、package:plugin，用最终安装包仓库外正常安装重新联合验收；本 A 包的通过不能替代合并后包。
5. 保留平台/身份/格式限制、部分成功及历史恢复语义；按用户后续授权决定推送/PR/main/发布。
