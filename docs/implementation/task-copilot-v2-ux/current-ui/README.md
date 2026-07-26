# 当前 Logseq Desktop 交互证据

本目录只把“当前代码的最新构建在真实 Logseq Desktop 中运行”登记为 `CURRENT`。
设计稿、静态 HTML、自动测试截图和历史 Commit 的 Desktop 截图都不能证明当前体验。

当前源码安全提交为 `23ae7bd`。最新只读 Restore 恢复状态投影只有自动证据，
尚无 Desktop 截图；因此 `p2-g-44`～`46` 仍只证明 `0c4526d` 的自动回滚交互，
不得用来宣称双重回滚失败手工恢复已 Desktop 验证。

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

`2eb6df1` 在上述截图之后增加自动安全互锁：同 Graph Launcher 单实例启动、Restore
admission drain、`ARMED→RECOVERY_REQUIRED`、跨进程 mutation lock、no-clobber 和匹配
清锁。它不改变 `p2-g-44`～`46` 所示自动回滚 UI，但尚未用 Desktop 注入“双重回滚失败”，
因此这些截图继续只代表 `0c4526d` 的自动回滚主链，不能作为新手工恢复向导的证据。
`e418c87` 再把互锁按数据库隔离、核对 Graph identity，并将 Launcher 的启动与最终停止
纳入同一 per-Graph lifecycle gate；`cb87d86` 又关闭互锁读取 TOCTOU 与过期租约在
gate 等待期间被 heartbeat 刷新后仍误删的竞态。这些仍是自动安全升级，不是新的 UI 证据。

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
