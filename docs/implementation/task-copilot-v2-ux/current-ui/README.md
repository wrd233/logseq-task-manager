# 当前 Logseq Desktop 交互证据

本目录只把“当前代码的最新构建在真实 Logseq Desktop 中运行”登记为 `CURRENT`。
设计稿、静态 HTML、自动测试截图和历史 Commit 的 Desktop 截图都不能证明当前体验。

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
系统状态界面的解释权。`p2-g-47`～`50` 仍是 `16bde9ad88a5` 的受控人工恢复场景证据，
`p2-g-44`～`46` 仍只证明 `0c4526d` 的自动回滚交互。受控
`RECOVERY_REQUIRED` 前置条件证明用户 HIGH Review、恢复、重连和 restart 产品链，但不冒充
生产 Restore 连续双重故障注入，后者仍 OPEN。

P0-H Graph switch 最新精确构建为 `ca50304e9aa2`。`p0-h-16`～`18` 分别证明未配置隔离
Graph 首次显示时已安全受限、6 秒后仍不显示旧 Project，以及切回原 Graph 后约 3.75 秒
恢复同一正式投影；Launcher mapping、graphKey/path digest 和 database inode 未变。
`p0-h-13` 保留为真实旧 authority 短暂泄漏的 `HISTORICAL`，`p0-h-14`/`15` 已
`SUPERSEDED`。P0-H 已关闭为代表性 Desktop DONE，不代表 P0-J/P0-K 或整体 P0 完成。
完整记录见 `../logs/p0-h-graph-switch-desktop-live-20260727.md`。

P0-J 当前结论是 `HOST_COMMANDS_DESKTOP_PARTIAL_CHINESE_IME_RESTRICTED_VISUAL_OPEN`：
冷启动 palette、Now/系统状态路由、四条 Slash 可发现、任务语法代表插入和 custom binding
配置/触发/清理已在 Logseq 0.10.15 通过。Computer Use 不能可靠注入中文字符，因此原生
中文 IME、受限态、Light/窄栏继续开放。完整记录见
`../logs/p0-j-host-commands-desktop-live-20260726.md`。

P0-K 当前新增 `p0-k-01`～`03`：主 Page 入口与“返回原 Page”已通过；right-sidebar 的宿主
菜单不提供 Plugin Page item，按 bounded conclusion 安全隐藏。Query/reference 与来源变化
仍 OPEN；完整记录见 `../logs/p0-k-host-origin-desktop-live-20260726.md`。

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
创建、reload/restart、专用 Undo 与最终健康验证。Light/窄栏和部分宿主视觉 Gate 仍需在
集中 Desktop Gate 完成，P2-D～G 继续开放。完整记录见
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
`UNDONE`、逆向 `COMPLETED`、异常 Commit `0/0/0`。当前构建的 error/stale 与
RECOVERY_REQUIRED → resume Desktop Gate 仍 OPEN，所以 P2-E 仍是 Partial。完整记录见
`../logs/p2-e-project-closure-desktop-live-20260726.md`。

P2-G Rebind 正常主链已在 `344c705ec446` 当前构建完成真实 Desktop Gate。首轮真实运行
发现“新建显式替换 Block 会先被自动物化”的竞态，Service 正确拒绝且零写入；当前实现
加入 5 分钟受控选择窗口，先 flush 再短时暂停显式物化。新替换 Block 在预览前的 Service
回读为 0 个正式对象，确认 Rebind 后只产生一个正式对象、旧 Anchor `replaced`、新 Anchor
唯一 `active`；恢复自动同步与 reload 后系统健康、`0/0/0`。CURRENT `p2-g-07`～`12`；
早先 `p2-g-01`～`06` 只保留为真实历史发现/安全拒绝证据。Rebind 纠错指引已完成自动
Gate：选错正文再次进入受控 Rebind，整库回退才进入 Backup/Restore，不提供会复活
missing/conflict 旧 Anchor 的通用 Undo；新成功态 Desktop 仍 OPEN。Restore 失败链和
Migration 当时也未完成；Restore 失败链现已由后述 CURRENT `p2-g-44`～`46` 替代，
但 Rebind 指引、Migration failure/recovery 与视觉 Gate 仍使 P2-G 和整体 Goal 保持
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

## 每次取证必须记录

1. branch、commit、插件构建时间、Service/Launcher 版本和测试 Graph；
2. Logseq 版本、主题、窗口尺寸、main/sidebar/Query/reference/Zoom 等宿主位置；
3. 发起前现场、入口、关键判断、Preview/Review、结果与返回现场；
4. 适用时的 reload、失败、Recovery 和 Undo；
5. 操作距离、主结论、工程术语、LLM 长度和确定性降级评估。

截图不得包含 API Key、descriptor token、私人正文或未脱敏路径。
