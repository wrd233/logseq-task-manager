# 当前 Logseq Desktop 交互证据

本目录只把“当前代码的最新构建在真实 Logseq Desktop 中运行”登记为 `CURRENT`。
设计稿、静态 HTML、自动测试截图和历史 Commit 的 Desktop 截图都不能证明当前体验。

最新 P0-K Block Condition 精确构建为 `73dc1e26f610`（Plugin build
`2026-07-28 15:33:54 +0800`）。真实 Logseq 0.10.15 File Graph 在 999×720、host Light /
Plugin Dark 下完成两条链，并补 727×720 窄栏：Query 投影没有可靠正式身份时只显示“尚未由 Task Copilot
管理、原状态未改变、原内容保持原位”；正式测试任务从原文右键进入三意图，空原因失败不
保存，成功后返回同一 Block，Undo 后恢复“可以行动”，reload 读回仍可推进。CURRENT
`p0-k-query-safe-degrade-current-73dc1e2.jpg` 与
`p0-k-condition-*-current-73dc1e2.jpg` 共六张。首次运行暴露的
`Block / active Primary Anchor` 提示已由同一构建替代。完整记录见
`../logs/p0-k-block-condition-worksite-desktop-live-20260728.md`。

最新 Page / Project Page 操作精确构建为 `869127f`。真实 Logseq 0.10.15 File Graph
证明普通 Page 首屏只保留“整理当前页”主操作与两个次级意图；Project Page 首屏以“打开项目
工作区”为唯一突出主操作，状态更新和结构讨论保持次级。普通路径不再显示 Page/Anchor/
SQLite/HIGH Proposal/对象版本等工程语言。真实运行还暴露并修复 File Graph reload 后 Page
UUID 漂移导致受控 Project Page 被降级为普通 Page：当前复用创建页既有 owner/object
metadata，但仍要求正式 Project 与唯一 active Primary Anchor 一致，冲突继续 fail closed。
CURRENT 为 `ui-page-context-user-language-current-869127f.jpg` 与
`ui-project-page-context-user-language-current-869127f.jpg`。完整记录见
`../logs/ui-page-context-language-desktop-live-20260728.md`。

最新 Project 创建后落地页精确构建为 `bfabf4025f60`。真实 Logseq 0.10.15 File Graph
从“项目 → 打开项目”进入同一正式 Project 后，首屏只显示当前状态、一个当前推进、预期
成果、来源背景和一个“开始当前推进”主操作；完整结构默认折叠。点击主操作会再次重验
Project 与受控 Page identity，成功后关闭 Task Copilot 并留在同一 Logseq Project Page。
普通同名 Page 不会被猜测为正式工作现场。CURRENT
`ui-project-landing-dark-current-bfabf40.jpg`、
`ui-project-landing-light-current-bfabf40.jpg` 与
`ui-project-landing-light-narrow-current-bfabf40.jpg` 覆盖 Plugin Dark/Light 的
1000×720 和 Light 723×720；旧 `p2-c-33` 仅保留正式创建事实，已降为
`SUPERSEDED_UI`。这关闭“新 Project Page 价值落地”的代表性视觉 Gate，不替代最新构建
再次执行 create/Undo 的纵向证据，也不关闭 P2-C 的全部集中宿主矩阵。完整记录见
`../logs/ui-project-landing-worksite-desktop-live-20260728.md`。

最新 Project Preview / HIGH Review 证据分别基于 `2adfc354041b` 与
`efb3864c53af`（最终 Plugin build `2026-07-28 14:03:53 +0800`）。真实 Logseq 0.10.15
Page 来源链证明 Preview 已收敛为系统理解、应用影响、安全边界、下一步和折叠完整依据；
进入待我确认仍只创建 Proposal。HIGH Review 首屏先显示“会改变 / 不会改变”，标准宽度为
两列影响 + 全宽理解；系统理解只保留两句，完整方案进入“查看完整依据”；约 762px 真实
窄窗改为单列。CURRENT 覆盖 Dark 1000×720、Dark 762×720、Light 1000×720；
`ui-high-review-three-column-defect-historical-2adfc35.jpg` 只保留为促成修复的
`HISTORICAL`，`e33a398` 截图已由最终构建替代。完整记录见
`../logs/ui-project-preview-high-review-compression-desktop-live-20260728.md`。

最新“现在”精确构建为 `f1d0e1f1cee9`（Plugin build
`2026-07-28 13:03:00 +0800`）。真实 Logseq 0.10.15 reload 后，对象类型筛选、分组标题和
卡片 eyebrow 已统一为“项目 / 小项目 / 任务”等中文产品语言；通用可推进状态不再把
“正式状态允许继续推进”作为第二条首屏依据重复结论，完整正式事实仍在“查看依据”中。
筛选说明也从 `Focus / Now Work` 收敛为“当前关注 / 现在”。CURRENT
`ui-now-chinese-single-conclusion-current-f1d0e1f.png` 与
`ui-now-chinese-single-conclusion-current-narrow-f1d0e1f.png` 分别覆盖 1000×720 和
724×720；筛选只改变 session view，未改正文或正式状态。`ui-compression-01/07` 因仍显示
旧英文类型而降为 `SUPERSEDED`。

最新 Project 失联正文用户语言精确构建为 `971c6db268f7`（Plugin build
`2026-07-28 13:08:20 +0800`）。真实 Logseq 0.10.15 reload 后，专用测试 Project 点击
“打开项目”继续安全失败且没有正式写入；首屏只说明原正文连接不可用、正式事项未修改，
并指向系统状态中的重新连接入口，不再暴露 `Anchor / 对象 / 运行时`。CURRENT
`ui-project-missing-source-user-language-current-971c6db.jpg`。该截图只接管 Project
“打开正文失败”表面的当前解释权，不替代 Rebind 正常链证据，也不表示 Project 重入整体完成。

最新 Project 继续工作首屏精确构建为 `b605e18c21ce`（Plugin build
`2026-07-28 13:18:06 +0800`）。真实 Logseq 0.10.15 reload 后，入口和标题统一为“继续
项目”；首屏只保留“打开当前项目”主操作与“帮我恢复上下文”次操作，其余入口折叠。
Context Recovery 使用蓝色信息语义，与绿色主操作/完成语义分离。CURRENT
`ui-project-continuation-compressed-current-b605e18.jpg` 和
`ui-project-continuation-compressed-current-narrow-b605e18.jpg` 覆盖 1001×720 与
726×720。它们接管此前 Project 重入默认首屏的当前解释权；P1-G 生成态/error/stale 仍由
各自 CURRENT 证据负责。

最新 UI 压缩精确构建为 `f4acf77346b19aa2f096ff2c169bfa7323546062`
（Plugin build `2026-07-27 19:42:41 +0800`）。`ui-compression-01`～`08` 使用真实
Logseq 0.10.15 File Graph，覆盖 Light/Dark、1000×720 与 751×720：Now 卡片单一主动作、
候选区用户语言、当前待审阅与 13 条历史记录折叠分离、Project 意图路由、Closure
“尚未正式应用/退出安全”以及逐目标依据默认折叠。它们是这些表面的最新 `CURRENT`
解释权；更早同表面截图继续作为其原纵向链的历史运行证据，不再代表当前信息架构。

`cd59228` 又修复真实 Closure 流程结束后的审阅空态：旧实现把固定为 false 的 legacy
demo-agent flag 翻译成“Agent 已关闭”，与刚刚成功的 V2 Provider 相矛盾。当前
`review-empty-current-dark-cd59228.png` 证明 reload 后只显示“当前没有需要审阅的方案”，
并给出“整理当前页 / 待整理”两个既有入口；15 条历史仍默认折叠。该截图只替代空态用户
结论，不替代 Closure Review 或正式链证据。

最新 P1 Context Recovery Desktop 精确构建为 `653875a`；`p1-g-07`～`13` 是
`recover-context@1.3.0` 的真实 DeepSeek 内容、Provider error、Validator rejection、
generation stale、Dark/Light、窄栏和 corrected STALE telemetry 证据。`p1-g-08-...before-fix`
保留为真实主题缺陷的 `HISTORICAL`；`p1-g-06` 与更早 1.2.0 结果均由当前链替代。完整记录见
`../logs/p1-g-context-recovery-1-3-desktop-live-20260726.md`。

P0 命令宿主最近精确构建为 `a835f59bf1c4`。`p0-j-06`～`08` 是该精确构建的可配置快捷键、触发和
清理后冷启动证据；`p0-j-02`～`05` 是 `e8db32f1af6d` 的命令面板和 Slash 当前行为证据，
`p0-j-01` 明确降为连续 reload residue 的 `HISTORICAL`。最新 `p0-h-09`～`12` 是
`e8db32f1af6d` 的真实 Logseq
Desktop 安全结束/重启证据；`p0-e-05`、`p0-h-08`、`p0-i-03` 是 `4dfe014902a3` 的高频
壳层证据。它们共同替代旧截图对公共“现在”“更多”、结束/重启和健康
系统状态界面的解释权。P2-G Restore 当前精确构建已更新为 `fe0b590034ac`：
`p2-g-55`～`59` 真实证明候选激活失败、自动回滚也失败、无需 Plugin reload 出现人工恢复、
HIGH Review、Doctor/清锁、正常 Launcher 回切和 reload 健康。`p2-g-47`～`50` 降为
`HISTORICAL` 受控前置条件证据，`p2-g-44`～`46` 仍只证明历史自动回滚阶段。
P2-G Migration 写后响应丢失当前仓库证据为 `f17f46a`，Plugin artifact 为
`757fac87d511`：`p2-g-60`～`65` 覆盖 HIGH Import、响应丢失后 ledger authority、
Plugin reload 重建、Verify、安全 Undo 与正常 authority/Launcher 恢复。
P2-G Migration Verify/Activate 失败重试又在当前 `e2361599fbc9` 完成真实 Desktop
收口：隔离库复用既有私有配对凭据，先后触发 Verify 与 Activate 的事务前失败并在同一
正式 ledger 上重试；最终当前构建 reload 只显示“V2 已启用”和只读历史。CURRENT
截图 `p2-g-migration-verify-activate-retry-current-dark-e236159.png` 取代“该失败链
只有自动证据”的旧结论。
当前 `7fcdcf5` 又补充 `p2-g-migration-final-current-narrow-720-7fcdcf5.png`：在
`722×720` 下主结论、两批历史和折叠安全边界均可读，窄栏子 Gate 已关闭。Logseq
0.10.15 File Graph 的浅色模式设置、完整 Reload 和完整 quit/reopen 均未能改变 Graph
就绪后的深色宿主，
`p2-g-light-mode-selected-host-remains-dark-bounded-7fcdcf5.png` 只记录宿主边界，
`p2-g-light-mode-full-restart-remains-dark-bounded-1364235.png` 又补充完整生命周期结果；
两者都不代表 Light PASS。

P0-H Graph switch 最新精确构建为 `ca50304e9aa2`。`p0-h-16`～`18` 分别证明未配置隔离
Graph 首次显示时已安全受限、6 秒后仍不显示旧 Project，以及切回原 Graph 后约 3.75 秒
恢复同一正式投影；Launcher mapping、graphKey/path digest 和 database inode 未变。
`p0-h-13` 保留为真实旧 authority 短暂泄漏的 `HISTORICAL`，`p0-h-14`/`15` 已
`SUPERSEDED`。P0-H 已关闭为代表性 Desktop DONE，不代表 P0-J/P0-K 或整体 P0 完成。
完整记录见 `../logs/p0-h-graph-switch-desktop-live-20260727.md`。

P0-J 当前结论是 `HOST_COMMANDS_DESKTOP_PARTIAL_CHINESE_IME_OPEN`：
冷启动 palette、Now/系统状态路由、四条 Slash 可发现、任务语法代表插入和 custom binding
配置/触发/清理已在 Logseq 0.10.15 通过。`bc79ffd` 又证明显式结束后切换路由不重启、
正式动作 fail closed、Slash 只插入本地正文、显式重启恢复且受限期间零写入。Computer Use
不能证明真实中文输入法候选/组词/光标，因此原生中文 IME 继续开放。完整记录见
`../logs/p0-j-host-commands-desktop-live-20260726.md` 与
`../logs/p0-j-ended-formal-boundary-desktop-live-20260728.md`。

连续使用 Pilot `PILOT-2026W31-A` 当前在 `pilot-2026w31/`：Logseq 0.10.15 File Graph，
已完成 Day 1—2、Day 3 Waiting、Day 4 MiniProject/Project、Day 5 Project/Context
Recovery、Day 6 Waiting 恢复、Day 7 稳定移动、Day 8 disposition/cooldown 和 Day 9
Closure 正常链/reload/Undo，以及 Day 10 四页回顾/reload/Graph switch 代表链。十日
代表 Pilot 已关闭；明确变体继续留在对应 P1/P2 Gate。
Day 6 精确构建 `1c18e9b0ff63` 证明同一 Waiting
Task 可在原 Block 恢复为行动、返回现场、成为 Now 第一项并在真实 plugin reload 后保持；
系统健康。Day 7 继续用同一精确 Plugin 构建把真实 MiniProject 移动到新 Page 并改名；
explicit sync 后同一 UUID/identity 与 active Primary Anchor 保持，reload 后 Now 能准确
打开新位置，系统无正文连接冲突，故没有误触发 Rebind。Day 8 的三项真实 Candidate
分别暂缓、保持普通内容和不再提示；`318baab` 已让 reload/recompute 后的 Preview 直接
显示无新增，不泄漏 UUID/type/Candidate/Proposal，不提供误导提交。Day 8 结束时累计
32 次真实 DeepSeek；Day 9 又调用一次，累计 `33`，并以 `f18cc72` / `7fe762d`
记录 Closure 应用/reload/Undo 与最终健康。Day 7 duplicate/missing/Rebind 变体与真正
Closure `RECOVERY_REQUIRED` 仍 OPEN。Day 10 证明 Review 无积压、Project/More 克制，
但 Now 的 `Focus 1 + Next 10` 偏长，现有 Dynamic Now Shadow 又会遗漏刚恢复事项。
该目录中的截图按 exact Plugin/docs commit 登记为 CURRENT，不替代其他宿主/主题证据，
也不把十日代表 Pilot 写成 P0/P1/P2 或完整 Goal 完成。

P0-K 当前使用 `p0-k-01`～`08`、`p0-k-10` 与 `p0-k-condition-*`：
主 Page 入口与“返回原 Page”已通过；right-sidebar、
Query 页面预览和 Block reference 专用菜单均不提供可靠 Plugin identity，按 bounded
conclusion 安全隐藏并要求先打开来源。同一 UUID 移动后可返回新位置，来源删除后安全关闭、
明确说明未导航；普通来源的真实 Provider abstain 也已改为“暂时不需要整理”的用户语言，
不显示 Proposal/Provider/Commit/Store；正常连接首屏只保留一个持久 Copilot 状态。
`p0-k-09` 因仍含重复成功横幅已标为 `SUPERSEDED`。`73dc1e2` 又关闭正式 Block 的失败、
成功、Undo 和 reload 返回代表链，Query 无正式身份时使用用户语言安全停止；P0-K 已为
`DONE_DESKTOP_REPRESENTATIVE`。完整记录见
`../logs/p0-k-host-origin-desktop-live-20260726.md` 与
`../logs/p0-k-query-reference-host-bounded-desktop-live-20260727.md`、
`../logs/p0-k-source-move-delete-return-desktop-live-20260727.md`、
`../logs/p0-k-block-analysis-frontstage-language-desktop-live-20260727.md`、
`../logs/ui-routine-connection-dedup-desktop-live-20260728.md` 与
`../logs/p0-k-block-condition-worksite-desktop-live-20260728.md`。

P1-F/G 当前使用 `p0-i-01` 与 `p1-g-07`～`13`。真实 File Graph 暴露 active Page Anchor
UUID 漂移，系统安全显示“正文变化需要核对”且不猜 Project；Logseq 0.10.15 的 File Graph
不挂载 Page Head slot，因此该入口为 `BOUNDED_HOST_LIMIT`，DB Graph 仍 OPEN。Project
workspace 的确定性基线、真实 Provider 内容、真实业务 unknown、error/rejection/stale、
feedback/reload 与 Dark/Light/窄栏已有代表性 Desktop 证据；P1-G 已关闭，P1-F 的 DB Graph
Page Head 宿主 Gate 仍 OPEN。

## 状态

- `CURRENT`：截图所记 commit 与待验收构建一致，场景和前置条件可复现；
- `HISTORICAL`：曾经是真实运行证据，但没有用当前构建复验；
- `SUPERSEDED`：同一场景已有更新且更完整的证据；
- `PROTOTYPE`：只证明视觉或宿主能力，不代表正式产品链。

当前已有 P2-C Page 来源链在 `913bbda` 构建上的 CURRENT Undo 确认、Undo 完成态和完整
Logseq restart 后健康态；Page reuse 另有 CURRENT readiness/Preview、返回原 Page、Undo
与 restart 健康态。MiniProject 演化链又在 `7d4f5e4` 最新构建上补齐 CURRENT Grill
ready、最终阅读、HIGH Review、接受未应用、正式创建、reload 重入、Undo 与再次 reload
健康态。`7a7492a` 又以最新构建重跑真实 DeepSeek→Preview→Review→Commit→reload→Undo，
证明专用 Undo 会返回原 MiniProject 根 Block；旧的 Journal 返回截图已降为 `SUPERSEDED`。
此前暴露 identity、fact key 和错误 closure 对象的截图只登记为真实 `HISTORICAL`
失败样本；同场景旧安全截图登记为 `SUPERSEDED`。

P2-C 当前结论是 `ALL_SOURCES_DONE_VISUAL_GATES_OPEN`：Blank、Page“保留来源另建”、
Page“升级当前 Page”和 MiniProject“保留来源演化”均完成真实 DeepSeek、Preview、Review、
创建、reload/restart、专用 Undo 与最终健康验证。Preview / HIGH Review 的代表性
Light/窄栏已由 `2adfc35` / `efb3864` 关闭；新 Project 落地页与返回 Logseq 工作现场的
Dark/Light/窄栏代表 Gate 又由 `bfabf40` 关闭。最新构建 create→reload→Undo 的重复取证和
其他宿主视觉组合仍需集中 Desktop Gate 完成，P2-D～G 继续开放。完整记录见
`../logs/p2-c-project-creation-desktop-live-20260726.md`。

P2-D 的 MEDIUM 当前摘要链也已在当前真实环境闭环：真实 DeepSeek 草稿先经过
`recover-context@1.2.0` 与 Unified UX Validator，再进入单组 MEDIUM Review；正式 Commit
只替换 Project `currentSummary`，reload 后可读，专用 Project interface inverse Commit
恢复原摘要并再次 reload 健康。最终 CURRENT 为 `ae2395523798` 的 `p2-d-05`/`p2-d-06`；
早期 Review/apply/Undo 截图因旧 Provider 状态文案或 Undo 路由已标为
`HISTORICAL`/`SUPERSEDED`。完整记录见
`../logs/p2-d-project-narration-desktop-live-20260726.md`。

同一 `ae2395523798` 构建又完成 HEAVY 完整当前接口链：一个 Objective、Deliverable、
Work Stage、三项 Focus 与摘要进入单组 HIGH Review；最终 Commit 后 reload 可读，专用
inverse Commit 精确恢复原空结构与单一 Focus，再次 reload 健康。CURRENT
`p2-d-07`～`p2-d-10`。这不代表其他 HEAVY 类型或 P2-D 整体完成。

LIGHT Condition 又在 `58bf6306d04d` 最新构建上完成正式跨 reload Undo：Project
ACTIONABLE v8→PAUSED v9，reload 后由 Service receipt 准备 server-owned inverse，确认后
恢复 ACTIONABLE v10，再次 reload 读回原确定性投影。普通 Association 因尚无 inverse 已在
正式影响路由中禁用。CURRENT `p2-d-11`～`p2-d-13`；完整记录见
`../logs/p2-d-light-condition-undo-desktop-live-20260726.md`。

P2-E 的确定性 Closure 证据入口已在 `ec1a70d848d6` 最新构建上通过当前 Desktop Gate：
Project 影响路由明确先整理证据，不生成 Proposal 或完成 Project；空证据预览把候选、
unknown 和用户判断分开，且只有“取消”。reload 后 session preview 不残留，Runtime/Store
READY，同一 Project v10 可重新计算；正式计数保持 `2 Objects / 10 Proposals /
21 Commits`。CURRENT `p2-e-01`～`p2-e-04`。这只关闭 read-only preview，不代表真实
Provider 或 Closure 正式链完成。

P2-E 正常正式链随后完成：`1ec63ac` 的真实 DeepSeek 前向链覆盖用户判断、loading、
HIGH Review 与 Commit；该真实运行也暴露完成态没有专用 Undo，故 `p2-e-09` 只登记为
`SUPERSEDED` 缺陷证据。`06907f34b8d2` 最新构建补齐版本/checksum/receipt 绑定的 Closure
inverse Commit，CURRENT `p2-e-10`～`p2-e-12` 证明 Undo 可发现、撤销后回到 Project 重入、
reload 后 Project 再次进入 Now Work。正式回读为 `OPEN v13`、Closure absent、正向
`UNDONE`、逆向 `COMPLETED`、异常 Commit `0/0/0`。`6f7f9a857be9` 当前构建进一步用
隔离测试库完成真实 post-domain HTTP 500：同一 receipt-backed Commit 保持 `PENDING`，
reload 后显示“尚未完成，可以继续”，再次确认只收口原 Commit；随后 reload、专用 Undo
与再次 reload 均通过。CURRENT `p2-e-13`～`18`，最终 `OPEN v21`、Closure absent、异常
Commit `0/0/0`。Provider error 随后由 `7727770` 关闭，generation stale 又由
`662246a` 当前构建关闭；真正不能安全续跑的 `RECOVERY_REQUIRED` 代表链仍 OPEN，所以
P2-E 仍是 Partial。完整记录见
`../logs/p2-e-project-closure-desktop-live-20260726.md`。

`77277704d901` 又关闭 Provider error Desktop 子 Gate：真实 Logseq 0.10.15、File Graph、
Light 1000×720 使用受控无效模型完成失败，用户判断保留，普通首屏只说明“没有完成、项目
和正文未变化、稍后重试”，并提供唯一“重新整理关闭方案”。Project 保持 `OPEN v21`，
Proposal/Commit 计数没有变化，异常 Commit 为 `0`。恢复 `deepseek-v4-flash` 后同一材料
真实生成 `design-project@1.3.0` Proposal 并一次通过 Validator；`662246a298ac` 根据这次
真实输出进一步把 Review 的模型长报告移入折叠依据，首屏只显示结构化结果、影响与安全
边界。`cda4f95` 又把 Review 普通标题从 `Closure Proposal` 收敛为“结束项目”，并以新的
真实 Provider Proposal 复验。CURRENT 为
`p2-e-closure-provider-error-current-light-7727770.png` 和
`p2-e-closure-review-current-dark-cda4f95.png`；旧 Review 图
`p2-e-closure-review-current-dark-662246a.png` 与旧错误页
`p2-e-closure-provider-error-superseded-f4acf77.png` 只保留为修复原因。随后同一
`662246a` 构建用真实 DeepSeek 无日志延迟完成 generation stale：旧草稿没有进入 Review，
唯一动作改为“重新检查关闭条件”；Condition Undo 恢复 ACTIONABLE，reload 回到健康 Now。
CURRENT `p2-e-closure-stale-current-dark-662246a.png` 与
`p2-e-closure-stale-reload-restored-dark-662246a.png`。真正 `RECOVERY_REQUIRED` 仍
OPEN；当前 Kernel 只允许该状态补偿收口，不允许 Closure 前向 resume，不能用数据库注入
冒充证据。不能据此关闭整个 P2-E。完整记录见
`../logs/p2-e-project-closure-provider-error-desktop-live-20260727.md`。

P2-G Rebind 正常主链已在 `344c705ec446` 当前构建完成真实 Desktop Gate。首轮真实运行
发现“新建显式替换 Block 会先被自动物化”的竞态，Service 正确拒绝且零写入；当前实现
加入 5 分钟受控选择窗口，先 flush 再短时暂停显式物化。新替换 Block 在预览前的 Service
回读为 0 个正式对象，确认 Rebind 后只产生一个正式对象、旧 Anchor `replaced`、新 Anchor
唯一 `active`；恢复自动同步与 reload 后系统健康、`0/0/0`。CURRENT `p2-g-07`～`12`；
早先 `p2-g-01`～`06` 只保留为真实历史发现/安全拒绝证据。Rebind 纠错指引已完成自动
Gate：选错正文再次进入受控 Rebind，整库回退才进入 Backup/Restore，不提供会复活
missing/conflict 旧 Anchor 的通用 Undo；新成功态 Desktop 仍 OPEN。Restore 失败链和
Migration 当时也未完成；Restore 失败链现已由后述 CURRENT `p2-g-55`～`59` 替代，
Migration Import 写后响应丢失也由 `p2-g-60`～`65` 关闭；但 Rebind 指引、
Migration Light host Gate 仍使 P2-G 和整体 Goal 保持
`IN_PROGRESS`。完整记录见
`../logs/p2-g-rebind-desktop-live-20260726.md`。

P2-G Restore 产品入口的生命周期链已在 `6ae8f2fcebd0` 当前构建完成真实 Desktop
Gate。Service-owned 目录不显示路径/ID，选择后再次校验并单独确认；未确认保持零请求，
确认后创建恢复点、owned Service 自停，Launcher 自动重建同一 Graph Service。Plugin
reload 后目录从两个变为三个校验 PASS 快照，系统状态为 READY、`0/0/0`。首轮
`6415dd14b568` 暴露成功态残留旧错误，已修复且该旧画面不列 CURRENT。CURRENT
`p2-g-13`～`19`；同一测试 Task 又真实完成 `ACTIONABLE v5→PAUSED v6→ACTIONABLE
v5→PAUSED v6→ACTIONABLE v5` 的旧快照、自动恢复点反向 Restore 和最终 cleanup，
逐步经 Local Service 读回。

Restore 失败主链随后在 `0c4526d4006f` 当前构建完成真实 Desktop Gate。隔离 Graph 对活动
SQLite 注入真实文件级写入拒绝后，atomic activation 失败、原正式状态自动回滚，Restore
前恢复点保留，Launcher 重建 owned Service；界面只显示一次“恢复未完成，原状态已回滚并
重新可用”，Plugin Manager reload 后系统状态恢复正常。CURRENT `p2-g-44`～`46` 取代
首轮成功/失败重复显示的诊断截图。自动回滚也失败时的手工 Recovery 向导和 Light/窄栏
仍 OPEN，因此 Restore/P2-G/整体 Goal 不提前关闭。完整记录见
`../logs/p2-g-backup-restore-frontstage-automated-20260726.md` 与
`../logs/p2-g-restore-failure-recovery-desktop-live-20260726.md`。

`2eb6df1` 在上述自动回滚截图之后增加自动安全互锁：同 Graph Launcher 单实例启动、Restore
admission drain、`ARMED→RECOVERY_REQUIRED`、跨进程 mutation lock、no-clobber 和匹配
清锁。它不改变 `p2-g-44`～`46` 所示自动回滚 UI，但尚未用 Desktop 注入“双重回滚失败”，
因此这些截图继续只代表 `0c4526d` 的自动回滚主链，不能作为新手工恢复向导的证据。
`e418c87` 再把互锁按数据库隔离、核对 Graph identity，并将 Launcher 的启动与最终停止
纳入同一 per-Graph lifecycle gate；`cb87d86` 又关闭互锁读取 TOCTOU 与过期租约在
gate 等待期间被 heartbeat 刷新后仍误删的竞态。`23ae7bd` 只增加严格只读状态投影，
`4c71af1` 则复用同一 Launcher/Local Service/Doctor/互锁打通受控手工恢复自动链；`c70088a`
补齐子进程超时强制终止回归。失败保持锁，恢复和 Doctor 全通过后才清锁。

`16bde9ad88a5` 随后用隔离测试库的受控 `RECOVERY_REQUIRED` 前置条件完成真实 Desktop
用户状态→HIGH Review→保存歧义状态→恢复保留基线→清锁→Service 重连→完整 Logseq
quit/restart。活动库恢复为 5 个基线对象，合成歧义对象只保留于新安全快照，最终系统状态、
Store 与 Service 均 READY，`0/0/0`。真实操作发现并修复三类通用问题：恢复页泄漏数据库/
诊断术语、恢复成功后陈旧只读状态、健康页内部枚举泄漏。CURRENT `p2-g-47`～`50`；随后
`25ddac9` / `4dfe014` 删除主面板重复运行条，把“更多”、启动、知识库切换与系统状态翻译为
用户语言，并要求重连时正式修改也可用才报告成功。CURRENT `p0-e-05`、`p0-h-08`、
`p0-i-03`；高级 Review/Grill/Project/Migration/Restore 表面的压缩仍开放。完整记录见
`../logs/p2-g-restore-manual-recovery-desktop-live-20260726.md`。
壳层记录见 `../logs/p0-shell-system-language-desktop-live-20260726.md`。
结束/重启记录见 `../logs/p0-h-runtime-end-restart-desktop-live-20260726.md`。

`fe0b590034ac` 又把 Restore 手工恢复从“受控前置条件”推进为真实连续双重故障。
专用测试 Launcher 在候选激活后与自动回滚前分别失败；活动库暂时 `7→6`，切换前
7 对象正式库和 `RECOVERY_REQUIRED` 互锁保留。首轮 `da080d2` 真实暴露恢复控件依赖
Plugin reload，`p2-g-53` / `54` 只作为 `HISTORICAL` 缺陷证据。修复后同一故障无需 reload
即出现唯一“准备恢复”，用户完成 HIGH 确认后恢复 `6→7`，Doctor PASS、互锁清除，
Anchor conflict/Pending/Recovery `0/0/0`。停止故障 Launcher、恢复原 descriptor 与正常
LaunchAgent、Plugin reload 后 exact build、formal writes 与 explicit sync 均 READY，
原 database authority 未被替换。CURRENT `p2-g-55`～`59` 取代旧手工恢复图的当前解释权。
完整记录见 `../logs/p2-g-restore-double-failure-desktop-live-20260727.md`。

P2-G Migration 的现有只读 ledger 已完成自动状态翻译：日常卡片不再显示 run ID、
Bundle hash、Backup ID、原始枚举或 CLI 命令，只保留用户阶段、完整审阅计数和下一步。
新材料可由用户明确选择并做 session-only 只读 scan；前台只见五类计数，放弃、reload 或
Graph switch 清空，不进入 Preview 或正式写入。`15b976d28ec3` 已在真实 Logseq 0.10.15
完成文件选择、2 项分类、放弃、reload 清空、非法 JSON 重试和最终系统健康；CURRENT
`p2-g-20`～`25` 取代“Migration 新入口无当前截图”的旧结论。逐项 Review、正式
import/verify/activate、失败/重启/Undo 继续 OPEN。记录见
`../logs/p2-g-migration-ledger-translation-automated-20260726.md` 与
`../logs/p2-g-migration-readonly-scan-automated-20260726.md`、
`../logs/p2-g-migration-readonly-scan-desktop-live-20260726.md`。

Migration 逐项 Review/Preview 又在 `c660f2d00be5` 当前构建形成下一条完整纵向链。
前台不再只有计数，而是显示用户主动选择材料的 session-only、规范化 160 字符单行摘录；
完整正文、内部 identity、evidence/hash 仍不进入 snapshot、账本或日志。两项决定全部
保存后才可创建 PREVIEWED 计划，reload 后材料释放而计划保留。CURRENT `p2-g-26`～`29`
取代“逐项 Review 未开放”的旧结论。正式恢复点、Import/Verify/Activate、失败续跑与 Undo
仍 OPEN；完整记录见
`../logs/p2-g-migration-item-review-automated-20260726.md` 与
`../logs/p2-g-migration-item-review-desktop-live-20260726.md`。

Migration 恢复点/Import/Verify/Undo 正常主链又在 `593d14ac2c7` 当前构建完成。用户重新
选择同一 Bundle 后，系统只读核对计划和待导入范围；恢复点 PASS 后才开放独立 HIGH Import。
正式对象真实 `4→5`，batch 验证 PASS；完整 Logseq restart 后台账恢复同一 Undo 入口，
安全撤销后对象 `5→4`，第二次 restart 后计划、UNDONE batch 与下一批入口仍可读。CURRENT
`p2-g-30`～`37` 取代“恢复点/Import/Verify/Undo 未开放”的旧结论。Activate、正式失败注入、
Service 中断恢复和视觉 Gate 仍 OPEN；完整记录见
`../logs/p2-g-migration-execution-automated-20260726.md` 与
`../logs/p2-g-migration-execution-desktop-live-20260726.md`。

Migration Activation 正常主链随后在 `f42b62d` 当前构建完成。真实运行先暴露 Undo 后重做
错误新建恢复点，Service 以 `MIGRATION_SNAPSHOT_CHANGED` 安全拒绝且零写；修复后 Plugin
复用并重新校验同一计划的原始恢复基线。CURRENT `p2-g-38`～`42` 覆盖恢复基线复用、独立
HIGH 交接、缺确认零写、ACTIVATED 结果和完整 Logseq restart。V1 只读、不双写，旧 UNDONE
与新 VERIFIED batch 都保留；reload 后无 Import/Undo/Activate。失败/中断恢复、完成后全局
入口收敛与视觉 Gate 仍 OPEN；完整记录见
`../logs/p2-g-migration-activation-automated-20260726.md` 与
`../logs/p2-g-migration-activation-desktop-live-20260726.md`。

`2beb1b5` 继续关闭完成后退出日常操作的缺口：ACTIVATED 页面不再显示新 Bundle scan、
Review、Import、Undo 或 Activate，只保留一次性交接的只读台账与 Backup/Restore 路由。
完整 restart 的 CURRENT `p2-g-43` 取代 `p2-g-42` 中仍可见扫描入口的完成态布局；迁移
失败/中断恢复与视觉 Gate 继续 OPEN。

`f17f46a` 又关闭 Import 写后响应丢失 / Service interruption 的代表子 Gate。专用测试
Launcher 让 SQLite 原子 Import 完成后、HTTP 响应返回前失败；界面没有猜测成成功或失败，
而是显示“先以台账为准”，同屏正式 ledger 已给出“已导入，等待验证”和唯一 Verify。
Plugin reload 后 session-only 不确定态消失，仍从同一 `IMPORTED` batch 重建 Verify；
Verify 后复用既有 HIGH Undo，正式对象真实 `4→5→4`，run/batch 最终回到
`PREVIEWED/UNDONE`，SemanticCommit Pending/Recovery 始终 `0/0`。故障 Launcher、
descriptor 和隔离 Service 退出后，正常 LaunchAgent、原 7 对象 authority 与 READY
用户系统状态均恢复。CURRENT `p2-g-60`～`65` 取代“Migration interruption 无当前
Desktop 证据”的旧结论。Verify/Activate failure 随后也由
`p2-g-migration-verify-activate-retry-current-dark-e236159.png` 关闭：失败继续由既有
run/batch ledger 表达，同一计划重试，最终当前精确构建 reload 进入只读完成态；正常
Launcher 和原 authority 已恢复。窄栏现已由后述 `7fcdcf5` CURRENT 关闭，Light host
Gate 仍 OPEN。完整记录见
`../logs/p2-g-migration-response-loss-desktop-live-20260727.md` 与
`../logs/p2-g-migration-verify-activate-failure-desktop-live-20260727.md`。

`d7526f43e798` 关闭“深色 Logseq 宿主中 Task Copilot 保持刺眼白底”的 UI Partial。
真实复验先证明 `59dcf93` 的可见宿主优先规则在 iframe 隔离 + File Graph `custom.css`
强制深色 + 官方浅色信号的组合中仍不足，因此没有把自动测试冒充 Desktop PASS。
当前设置新增默认 `auto` 的“界面外观”；只有 custom.css 与官方信号分离时才需明确选一次
浅色或深色。选择深色后 1001×720、完整 reload 和 723×720 窄栏均保持同一信息层级，
CURRENT `ui-theme-dark-*` 接管此前白底截图的主题表达权；旧截图的业务流程事实不因此失效。
Logseq File Graph 自身不能稳定切到真实浅色仍是 bounded host issue。完整记录见
`../logs/ui-theme-dark-override-desktop-live-20260727.md`。

## 每次取证必须记录

1. branch、commit、插件构建时间、Service/Launcher 版本和测试 Graph；
2. Logseq 版本、主题、窗口尺寸、main/sidebar/Query/reference/Zoom 等宿主位置；
3. 发起前现场、入口、关键判断、Preview/Review、结果与返回现场；
4. 适用时的 reload、失败、Recovery 和 Undo；
5. 操作距离、主结论、工程术语、LLM 长度和确定性降级评估。

截图不得包含 API Key、descriptor token、私人正文或未脱敏路径。
