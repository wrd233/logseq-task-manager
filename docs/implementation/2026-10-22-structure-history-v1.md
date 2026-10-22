# 结构历史：正确开发线上的可信只读切片

## 分支与输入

目标 `codex/work-structure-history-v1`，工作树 `/Users/mac/.codex/worktrees/work-structure-history-v1/logseq-task-manager`。开始时 fetch 并检查了全部现有 worktree：目标分支无 checkout；原主工作区有阅读/DSH 未提交改动，未改动或提交那些文件；Capture 工作树及其他工作树未修改。

- 目标原始 SHA：`f992619025f5b4d086a2e8ee1729936d488ecc89`。
- 已发布 main / 公共适配基线：`2cb0ced7688b7af19ac5814b1f556ecae255f3c9`，通过普通 fast-forward 获取。
- 复用实现 SHA：`f84631604eba47e0311f927897da626ede4afb00`。仅选取历史相关内容，移入独立模块目录；不合并旁支的一键 DSH 功能。
- 共享接线按原契约和本任务用户的明确串行接线授权执行；详见模块内 `INTEGRATION-REQUEST.md`。

## 数据、因果与差异

生产入口始终读取既有 StageStore.history，经原 Store 校验的 StageStart.source / StageRevision.source 驱动播放器。没有生产 fixture 入口，没有从今天的 Graph 补造过去。

同一阶段严格保留 Store 已校验的 parent 链顺序；不按 at/capturedAt/UUID 重排修订。阶段分组按显式 previousStageId 安排（无关系的阶段只确定性分组，不声称时间先后），不跨阶段比较增删；时间仅展示，不用相邻时间冒充祖先。默认首次显示当前阶段的最后可证明修订，用户选定旧帧后刷新保留其选择。

复用 composeDiff 处理正文及 parent/order/depth，保留位置差异、归因与写回问题。来源第一行变化另加“重命名”说明；任务标记和 depends-on:: 块引用仅为来源声明，不能冒充 Kernel 生命周期或正式依赖。祖先移动但后代 parent 不变、depth 改变时，后代明确标出深度变化。不可用正文不会抹去仍可证明的位置差异。

起点前、帧之间、缺失父修订与不可用正文均明确标为未知。损坏/冲突沿用 Store.problems；候选条数单独说明，未选入正式链的候选不回放。任一侧来源不完整时保守禁止确认增删；缺失节点以“未知”幽灵标示，但该帧正文显示未知，上一修订文本单独显示，绝不冒充该帧内容。删除幽灵明确使用删除前文本。

Kernel 正式对象树与代码历史没有相应 provider，未覆盖。DSH 无历史枚举入口，本次 DSH 历史不可用。恢复、编辑、认可、checkpoint 都没有进入播放器能力；外层原阶段审阅的既有操作保持原有归属。

## 来源与交互

renderer 不接 Graph/SDK，只有只读导航与返回回调。Player 只接受 StageHistoryPort / SharedUiPort。Stage review 适配在读取前后复核 Graph/context；旧任务不回写新视图。

共享 opener 对比历史 contentVersion 与刚读取的今天正文哈希。版本一致、已变化、历史版本未知和今天来源已删除分别提示；历史正文始终保持保存的字节。每次 getCurrentGraph、getBlock、哈希计算后都核验 context/交互代次，并在导航前再次检查 Graph；切 scope、session、binding、generation 或换一次导航即丢弃旧操作。

图/目录共享 sourceId 选择，完整正文与差异不截断。纵向槽位固定，横向反映实际深度；删除/未知有文字与形状，非仅颜色。窄屏、减少动态效果、超过 250 个节点、槽位过稀以及 SVG 异常均转为完整目录。返回通过共享 port 聚焦可见审阅入口，不触碰原生草稿/目录绑定/cwd。

## 验收：三类证据分开

1. **生产 Recorder/Store + 合成 Graph 单元环境**：时间回拨/相同时间、阶段分组；增删、正文、parent/order/depth 与祖先移动；候选/损坏/缺失/未知；版本变化、源删除、每个读取边界切 scope/generation、session 切换、并发点击、旧错误丢弃；图目录共享选择、大数据/窄屏/SVG 失败降级。写 API hooks/spy 为零，Graph 和私有存储前后相等。
2. **归档回放**：`assets/structure-history/legacy-host-result.json` 是 f846316 原实际宿主归档，包含原始 envelope。测试用生产 StageStore 重新核验哈希/链并回放。它不是本次现场验收，也未输入生产 UI。
3. **本次独占现场宿主**：Logseq 0.10.9，独占 profile/Graph，端口 19421，tasksEnabled=false。新建合成页面和 5 个累计块身份，通过真实 Editor SDK 与正式记录器得到起点及两次修订；现场覆盖 3 帧、祖先/后代深度、归属、顺序、正文、声明状态/依赖、新增与删除。录制后又改变今天正文，未记录成旧帧，用于版本不一致定位。

macOS 拒绝自动控制文件夹选择框（辅助访问 -1728）。用户授权自行创建测试 Graph 后，启动时仅使用 Logseq 内置 `__MOCKED_OPEN_DIR_PATH__` 目录选择入口指向独占路径，随后删除该变量。实际文件由 Logseq 自身 getFiles/import/watch 处理；没有替换 SDK、来源读取、Store、权限或历史 provider。现场验收不声称验证了原生系统文件夹选择框。

用最新独立构建重启后，通过正常历史入口直接读取，content.scope 仍为 null，证明没有为回放触发正文授权/checkpoint。宽屏 1100px 逐帧图形、目录保留选择、400px 目录降级、今天来源一致/变化/删除、返回可见审阅入口均有现场断言。浏览前后逐文件 Graph 哈希及整个 FileStorage 内容相等。证据 `live-host-result.json` 包含实际 DOM 文本/布局、来源提示、焦点、保存历史与前后字节比较。它不替代竞态的可控合成测试。像素截图采集未成功，本次现场图形证据是实际 DOM/布局与交互断言。

可复跑：先构建，使用 Node 20 执行 `scripts/structure-history-desktop.mjs prepare /Applications/Logseq\ 2.app`、`start`；`node scripts/structure-history-host-proof.mjs bootstrap`、`seed`、`record`。后续重启可只执行 `reopen`、`replay`；这些回放命令不调用写入或记录 API。seed/record 是明确的合成数据准备阶段，不算零写入浏览阶段。prepare 从现有隔离实例脚本派生，修改仅限测试副本的 home/profile/更新与外链隔离，未修改 SDK 或生产 profile。

## 构建与测试

最初借用整棵 node_modules 会让 workspace 包解析回原工作区；已改成仅复用第三方包、workspace 链接指向本分支。`build-input-audit.json` 由 esbuild metafile 核实没有原工作区 packages 源码输入，并记录实际 index.js 哈希。没有安装新依赖或改锁文件。

- 独立解析环境插件完整回归：564/564，涵盖结构历史、Stage、上下文、阅读、入口及其余插件测试。
- 同一环境 DSH service 等全部测试：23/23。
- 最终历史与阶段专项：36/36；类型检查、相关 lint、Logseq 与 DSH 构建通过。
- 曾出现两项环境失败：默认并发测试遇到 ENOSPC 和随后的材料提交等待超时；仅清理本任务上一轮临时导出副本并降低到 test-concurrency=2 后完整通过。没有删减检查或修改材料实现。
- 确切命令、计数与最终宿主哈希见同目录 `verification.json`。

## 交回与未覆盖

只读 Logseq 来源树切片交回 main 整合；不宣称产品模块 06 全部完成。无 Stage 快照的过去不能回放，Store 不暴露的缺失记录无法推断。正式对象/代码历史、DSH 历史 transport、历史恢复、物理 IME/剪贴板及长时压力均未实现或未验证。停止功能扩展，等待 main 整合。
