# 工作台体验优化实施交接

日期：2026-10-04；验证日期 2026-10-03–04（Asia/Shanghai）。本轮为独立分支上的本地交付，没有推送、PR、合并或部署。

## 起点与交付

仓库 `https://github.com/wrd233/logseq-task-manager.git`；启动时成功获取最新远端 main，锁定 `REMOTE_BASE_SHA=200249bc5a775a8d273a2ac3b7041fc29dbd1f58`，之后未反复追逐 main。独立 worktree 分支为 `codex/workbench-ux-polish`，没有占用他人 checkout、移动他人分支或处理其未提交文件；未发现适用 AGENTS.md。

环境为 macOS 15.2 / x86_64，独立 Node 20.20.0、npm 10.8.2。本轮 node_modules、dist、应用副本、profile/home、Graph、材料目录、私有 FileStorage、companion 状态、端口和进程均隔离。Logseq 0.10.9 来自本机已安装应用的自有副本；原生产应用未参与装载、点击或截图。自然工作测试保持 `tasksEnabled=false`，未启动 Kernel。

| 本地提交 | 交付内容 |
| --- | --- |
| `2f55678c07ceb154818a747eecd90e47c608f978` | 紧凑阅读控件、来源标题/统计、阶段顶栏与变化、显式目录预览、相关回归 |
| `6192924a77f9586facd04d324143547b572e43a5` | 将局部操作放到阅读 viewport 下方，修复内容跳动与覆盖 |
| `d64060a01a21b27710391652508b12d4ded26230` | 材料动作换行时保留中文标题宽度 |
| `15ed5ab4b721ce4be48fc1b925d223fdb0d5b547` | background insert-child 使用 `focus:false`，保持原生编辑保护 |
| `10f0a664ec136902e839e2503127e249da8ce81a` | 离线目录识别收纳材料的既有身份和关联，增加有意义回归 |
| 后续文档提交 | 本手册、21 张原始实机图片及校验清单、设计、架构、交接与两个索引；产品源码未再修改 |

产品源码提交为 `10f0a664ec136902e839e2503127e249da8ce81a`。最终装载插件 `dist/index.js` SHA-256 为 `562e984af5b2ff24ceb1d1da83954ec55d1d0941235aecb3b6de4e7fa5451ffb`。文档提交不会改变构建；最终本地提交可由本分支 `git rev-parse HEAD` 核对。

## 责任与共享整合

启动时核对了 origin、HEAD、工作树、远端分支与 main 模块整合记录。公开开放 PR API 返回 `[]`，本机 gh 未认证。`codex/feature-work-view-presentation` / `feature/longdoc` 对应已移植原型；其名称或没有普通合并祖先不能证明新功能尚未进 main。`feature/task-copilot-mvp`、`vnext` 为可见历史引用。没有证据证明其他电脑所有未发布工作已排除，核心行为归属未知处未重构；详细责任表见[设计](../design/workbench-ux-polish-design.md)。

共同源码路径均在 `apps/logseq-plugin/src/`：

- `host/panel-host.ts`
- `features/work-view/controller.ts`、`renderer.ts`
- `features/materials/controller.ts`
- `features/stage-workbench/review.ts`、`diff.ts`
- `features/content-writeback/logseq-adapter.ts`

对应回归路径在 `apps/logseq-plugin/tests/`：`content-writeback.test.ts`、`stage-review.test.ts`、`stage-workbench.test.ts`、`integration/work-view-updates.test.mjs`、`integration/material-editor.test.mjs`。

整合时比较这 12 个路径及新增 docs/索引，保留已有回调、epoch、scope、install/dispose 和能力端口。没有直接合入旧原型，没有新增依赖、协议、数据库、全局事件总线或第二套状态管理。`focus:false` 只是禁止 background insert 主动切进原生编辑，不得连带移除 `checkEditing`、版本与身份核验。

## 基线问题与实际修复

基线真实截图 `ui-1791024170996-001.png` 留在忽略证据目录：每个短块有完整按钮行、叶子折叠、顶部缺工作名、常驻阶段目标；目录新文件入口藏在管理区。初次菜单在正文内展开仍造成位移，后续两个局部提交将操作区放到 viewport 外并稳定标题换行。

初次 external stage submit 的两处正文修改完成，新增结论后 Logseq 默认打开原生编辑器，使后续身份核验返回未知。没有把部分结果包装成成功；从真实本地“工作台：查看正文写回冲突与恢复”打开原记录，重新核验并保存身份，原请求完成且未重放。针对安装版行为添加 `focus:false` 后，后续同阶段新增块真实验证成功。

停止连接后的目录列表曾把 capture 当作未关联文件；最终小修复只去掉 reference-only 匹配条件，实际复验五份既有材料均显示已关联、新文件仍未关联。回归核对原材料 id、user/agent 权限和引用次数，没有建立第二次关联。

## 连续演练结果

唯一合成工作为“整理一份本地资料协作方案”，初始自然段树和两个文件由测试夹具准备。随后声称用户动作的步骤都走可见 Logseq UI，agent 的内容提交、材料保存、阶段读取与聚焦应用都走独立构建 CLI 和生产本机 transport。

| 流程 | 实际入口与结果 | 忽略目录中的事实 / 手册图 |
| --- | --- | --- |
| 准备、关联与进入 | 从插件页配置自有 workspace descriptor；根块右键关联 Graph 外目录，平铺、不搬文件；真实快捷入口打开工作 | `baseline-cli-status.json`、`setup.png`、`entry.png` |
| 外部接入 | 本地允许当前工作，独立进程从 cwd status/capabilities/refresh；无手抄 UUID bootstrap，Kernel 非必需 | `final-status.json`、`reentry-status.json` |
| 阅读与布局 | 长短正文、折叠、Logseq 原块与 Markdown 原文；菜单 Enter/Tab/Escape 与焦点返回；视图缩进恢复 | `menu-*-final-ui.json`、`layout-source.json`、`row-actions.png` |
| 新文件与材料 | 先目录发现和只读预览，关联前后列表不变；明确关联 MD 与 TXT，原文件不搬动 | `materials-before/after-preview.json`、`reference-associated.json`、`directory.png`、`preview.png` |
| 长文收纳 | 实际“收纳文本”保存完整 927 字符/26 换行内容和短引用，走原材料模块；input 权限不扩大 | `longtext-final.json`、`captured-text.png` |
| 本地阶段 | 一句话目标“比较两种目录协作方案，形成可实际使用的说明”，本地开始 | `stage-begin.json` |
| 首次外部成果 | 修改 A/B、新增结论，经材料 capture/save 保存输出说明；实际选择输出作为阶段成果 | `first-submitted.json`、`first-request-recovered.json`、`stage-with-artifact.json` |
| 审阅变化 | 新增、修改与删除文本可读；删除线旧文按需展开，作者事实诚实 | `changes.png`、`old-text.png` |
| 纠正与建议 | 点击 B 实际变化编辑并提交；添加原文建议，输出 source 确认原文已变 | `user-corrected-source.json`、`feedback-source.json`、`direct-edit.png` |
| 同阶段修订 | 外部读取反馈，补结论与恢复约定，输出文件更新；两个 patch item 均 durable/APPLIED_VERIFIED、身份核验完成 | `correction-submitted.json`、`output-corrected.json` |
| 精确认可 | 真实本地 UI 认可；revisionId/hash 精确等于所见，origin 为本地 stage-accept，修订未变 | `exact-acceptance.json`、`accepted.png` |
| 认可后人工写作 | 原生 Logseq 编辑 B 追加一句，真实 source 已保存，原 revisions/acceptances 不变，没有重新认可 | `postaccept-proof.json`、`after-accept.png` |
| 按问题聚焦 | 正式 focus request/source/apply：6 个完整块及祖先显示 9/26，保留条件、反例、来源版本与原结构 | `focus-applied-final.json`、`focus-active.json`、`focus-before.png`、`focus.png` |
| 材料往返与退出 | 问题/plan 未变、basisChanged=false；材料前后同段 y=454.3671875，退出后完整 26 块顺序与原阅读锚点相同 | `focus-roundtrip-proof.json`、`focus-exit-proof.json` |
| 历史与当前 | 本地开始第二目标，回看上一已认可版本只读；返回当前包含后来人工句子。未宣称跨阶段顶栏换行后像素位置完全相同 | `history-proof.json`、`second-stage.json`、`history.png` |
| 停止与重入 | 停止自己的连接，CLI WORKSPACE_OFFLINE；本地目录/长文/历史可读。真实重载插件后再重启自有 Desktop，本地重新允许，独立 CLI 状态/刷新/来源/两阶段查询成功 | `stopped-status.json`、`offline-*-ui.json`、`reentry-*.json`、`offline.png`、`reentry.png` |

最终 `final-proof.json` 核验：同一 scope，26 条块的内容、结构与版本在布局调整、文件临时缺失恢复和重启后未变；当前第二阶段、上一阶段 start/revisions/acceptances 逐项未变；五份材料中 output 可写、input/reference 都不可写。原 **[注]**、**[想法]**、普通文字和 TODO 保留。聚焦没有新增回答摘要或主动行动建议。

## 恢复与测试方法界限

实际恢复场景包括未连接、参考材料 agent 写入拒绝且文件不变、参考文件改名后“暂不可用”再恢复原路径重读、编辑中聚焦保护，以及未知身份结果的原请求恢复。没有通过手改 Graph 文件伪造 agent 交付。

本机 native CUA 不提供应用 surface，因此使用薄、独立的 localhost 实时画面适配：CUA 点击/键盘/文本输入经它送到**归属已核验的真实 Desktop Chromium**，PNG 为该 Desktop 的原始 Page.captureScreenshot。适配没有仿制产品 DOM、调用 controller/API 或通过调试端口提交 agent 结果。只读 DOM/磁盘事实用来核验坐标、版本与保存结果。

- UI 自动化证明可见入口、连续导航、实际文本框输入与按钮保存；Browser Input 命令证明 Desktop Chromium 键盘路径，不能证明 macOS 原生中文 IME、剪贴板或 Undo。
- 独立 CLI 证明真正跨进程、私有 companion 和原 plugin router/provider；没有用 CDP 替代生产连接。
- DOM/协议回归证明状态、草稿、组合事件保护和过期结果处理；模拟 composition 不是中文输入法实机测试。
- 初始 Graph 和普通内容由夹具准备，文件选择器在测试 bootstrap 中只返回自有目录；未覆盖原生系统文件选择对话框。

测试适配曾吞掉多行输入，产生一份标题过长的额外收纳文件；适配改为 textarea 后重新通过真实 UI 收纳完整多行长文。错误夹具结果保留在同一工作和日志中，未冒充产品修复。窄视口的 Desktop DOM/几何核验为 650×700、实际工作面板宽 404px，操作区在正文 viewport 外；但截图采集停滞，误取的旧图已从共享 assets 移除。原始 manifest 的该失败记录仍保留于忽略目录，发布的校验清单不含它。

reduced-motion 的测试 override 未在真实 iframe 生效，不标为实机通过；原有 CSS 媒体查询保留。暗色宿主实际切换与恢复已完成，阅读/控件基本可读，但 iframe 仍用既有亮色 fallback（`dark.png`），主题色传递尚待单独处理。Windows/Linux、真实并发文件冲突、系统剪贴板、原生 Undo、中文 IME、二进制外部打开以及手动重新定位文件未实机覆盖；当前 CLI 的 Windows `workspace serve` 明确不支持 POSIX 私有 descriptor，不能将“未验”理解为已经支持。

## 工程检查

在最终产品源码上运行 `npm run check`，真实退出码 **0**。包含需求地图、全仓类型检查、lint、所有 workspace 测试、sandbox、build、built-binaries、依赖边界与 Taste；共 **550 tests passed / 0 failed / 0 skipped**（workspace 533、sandbox 5、boundary 12）。Taste 的 6 个 pairwise 与 4 个 regression case PASS，保持 0.1.0 active，没有激活新候选。日志为 `tmp/workbench-ux/evidence/check-offline-fix.log`。

另有 `npm run build` 真实退出 0，最终 check 再构建。修改后从真实插件页重载对应 bundle；最终材料修复后的受影响截图重采，product/bundle hash 已记录。文档加入后的同一全仓门禁再次真实退出 **0**，仍为 **550 / 0 / 0**，最终 bundle hash 不变，日志为 `tmp/workbench-ux/evidence/check-with-docs.log`。8 份文档的 116 个相对链接/锚点、21 张图片及 checksum 均通过，失败窄图不在交付中；`git diff --check` 退出 0，生成需求文档没有意外差异。

这次文档后检查的首次尝试遇到 ENOSPC，保留日志；清理本轮自行下载的运行时压缩包和 npm 缓存后，另一次遇到 SQLite 磁盘 I/O 压力。实机流程已结束，停止并移除自有可再生成的 Lab.app 二进制，Graph/profile/home/材料/证据全部保留。随后将测试临时目录隔离到自有短路径（过长 TMPDIR 曾导致 tsx Unix socket EADDRINUSE），完整检查通过。没有改测试断言、跳过测试或削弱门禁。

## 文档与证据交付

[最短导航](../user-guide/README.md)、[连续使用手册与 agent 附录](../user-guide/workbench-usage.md)、[体验设计](../design/workbench-ux-polish-design.md)、[实际架构](../architecture/workbench-ux-polish-architecture.md)、[共享截图与校验清单](../user-guide/assets/workbench/evidence.md)。README 与整合索引只补新入口，旧 handoff 的历史事实没有改写。

原始日志、合成 Graph、profile/private storage、测试脚本、输入记录、CLI 事实与全尺寸截图保存在自有忽略目录 `tmp/workbench-ux/`、`tmp/logseq-sandbox/` 及本轮临时工作目录，保留以便复现；凭据与完整 descriptor 不进入 docs。适合共享的 PNG 为无改绘原图，manifest 只含原图文件名、UTC 采集时间、源码和 hash，不含生产资料或用户路径。

## 后续与收尾

本轮连续主路径已完成。少量后续目标为宿主主题向 iframe 传递，以及在用户真实写作中补验原生 IME/剪贴板/Undo；跨电脑阶段历史迁移和外部阶段创建须作为独立协议工作，不能根据目录镜像宣称支持。其余限制沿原模块设计，不借本轮扩展文件适配器、语义引擎、句子聚焦或自动 Git。

收尾只释放本轮启动且身份可核验的实时画面服务、独立应用副本与 companion，保留工作树、合成资料和证据；不关闭生产 Logseq，不删除他人进程、资料或分支。
