# 交互式工作还原实施进度

状态：进行中，尚未达到完整 Goal 验收标准。日期：2026-10-22 至 2026-10-23（Asia/Shanghai）。

## 本轮基线与现场

- 开发 Worktree：`/Users/wangrundong/work/logseq-task-manager-work-evidence-ux`，分支 `codex/work-evidence-ux-v1`，起点 `2dbf12fa3c130915ce40fab699126c9d2d4e86a5`，开工工作区干净。
- 直接 ls-remote / fetch：main `77200e6642cbb990bfd5fc3409c9101b0d7d3f8f`；结构历史 `b1c7c44d767d98454a641a97020df95b44623752`。不合并 main 或结构历史。
- 本轮合成仓库：`tmp/work-evidence-reconstruction/tests`，独立构建：`tmp/work-evidence-reconstruction-build`。没有重启前轮体验服务，没有改其 profile、测试仓库或运行 bundle。

## 已落地的增量来源层

`sync.ts` 扩展既有不可变观察，保存上次有效检查点至本次 HEAD 的提交元数据及按文件聚合的来源提交。保留所有区间内提交文件，包括净差异为零的修改/撤销；重命名保留前后路径。当前工作区原观察仍独立保留，引用附带 sync 来源。

首次无检查点明确为初始观察；无 HEAD 到首次提交可增量观察；历史被改写/不可用明确未知，不猜测区间。不完整结果不推进有效检查点。单轮提交元数据整理有 5 秒总预算、100 提交/500 文件上限和既有进程输出上限，截断可见。默认不读取提交正文或未跟踪全文，敏感路径仅保留元数据。采集后再核对来源版本，不声明原子快照。

`items.ts` 现已提供统一文件条目（提交/工作区来源合并、重命名别名保留）及按记录内提交引用读取的历史 diff。历史 blob 模式、大小与敏感路径先检查，符号链接/gitlink/大文件拒绝，正文不存档。引用选择已支持只有提交变化的文件。

`reconstruction.ts` 提供事实条目与解释/澄清/交接的独立语义。Store 的 work 记录复用已有私有路径、哈希、不可变发布与幂等回执，不另建正式 Evidence 系统。记录引用必须在同一观察中存在，分析结果必须指向对应条目的分析起点；同一 Store 的追加按观察串行。派生视图保留未分析、失败、等待澄清与跳过状态，可提前整理交接草稿。重启后待完成分析目前标为 interrupted-or-running，尚需运行时区分当前活跃请求与已中断请求。

`analysis.mjs` 已按实际 DSH stream 请求/finish 协议编写宿主模型适配器；无 tools、无 sessionId、无原生消息提交。它只接受明确存在的 evidence ref，拒绝工具调用、伪造来源、错误或截断输出。**尚未接服务端工作流 RPC 或前端调用，因此还没有发生真实模型请求。** 测试里的解释来自显式替身，不能当作模型验收。

UI 目前仍仅有提交范围摘要；统一条目、解释、澄清、交接编辑与历史 diff 的界面尚待接通。这些基础能力不是完整产品交付。

## 本次验证

- CLI 全部 33/33（新增真实 Git/存储测试 5 项：多提交+未跟踪、改后改回、重复观察/重启、无 HEAD、重命名、历史改写后连续观察仍为未知、历史 diff 边界、独立解释/澄清/交接与幂等重启）。
- Work Evidence 专属 17/17；CLI 类型检查、改动源码 lint、独立构建通过。
- 本轮还未进行新功能的真实 DSH 宿主/模型验收；前轮报告不替代本轮。

## 已调查的接入点与剩余工作

已读取结构历史分支 `features/structure-history/view.ts`：其 renderer 直接依赖 StageHistory/structureFrame/SourceSelection，不能把完整业务视图搬入 Work Evidence。下一步需提取仅含节点、关系、布局与选择的最小通用工具，业务来源适配留在各自模块。

已检查本机 DSH 0.2.1-rc.2 的实际类型：`@deepseek-ai/dsh-llm/lib/types/index.d.ts` / `types.d.ts` 提供 `ctx.llm.stream(GenerateOptions)`，请求含 provider/model/messages/system/maxTokens/signal；`agentDefaultModel.currentSelection()` 可读取宿主模型选择。已核查 RequestUserInput 和 FinishReason，已实现模型调用适配器；下一步接通服务端辅助分析工作流，不需要发送原生对话或使用工具权限。未读取任何认证文件或密钥。

后续必须继续完成：

1. 统一文件条目与提交/工作区 diff，保留范围与版本；处理从未提交到提交的同源聚合，不能伪称能证明旧正文一致。
2. 接通真实 Agent 分析、获准且关联的 DSH/Logseq 上下文和局部条目状态。缺模型/来源时显示真实失败，不能用固定模板冒充分析。
3. 工作目的归组、关键澄清、回答/编辑/跳过后局部更新，保护未保存输入。
4. 可提前生成、保存、修订、重开交接；事实/解释/澄清/交接分层，保留未知并引用原生草稿。
5. 默认列表与共享结构工具切换、完整错误/恢复体验。
6. 完整自动化与真实隔离 DSH 九项验收、更新启动指南与最终交付，检查分支/生产范围后提交推送。

这份进度不改变权威产品需求和交互架构，不把已完成的来源层当作 Goal 完成。
