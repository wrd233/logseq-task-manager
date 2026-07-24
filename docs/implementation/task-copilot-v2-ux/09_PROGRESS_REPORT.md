# 交互优化实施进度

> 更新时间：2026-07-24
> 当前结论：`PARTIAL` — P0-A Focus、P0-B“暂时做不了”、P0-C 低风险“接受并应用”、
> P0-D Page 现场路由、P0-E 四项主导航、P0-F 工具栏介入摘要、P0-G 最近修改和 P0-H
> descriptor 私有 handshake 已完成自动与适用 Desktop 验收；P0-H 独立 Launcher、
> LaunchAgent、owned shutdown 与 crash/orphan recovery 已完成自动和真实进程 Gate，剩余
> Desktop reload/退出/Graph switch 视觉 Gate；P0-J 中文命令自动 Gate 已完成，剩余
> slash/palette/custom binding Desktop Gate；P0-K session origin route 自动 Gate 已完成，
> 剩余 main/sidebar/Query/reference Desktop Gate 及其余 P0 仍未完成。

## 总体状态

| 阶段 | 状态 | 证据 |
|---|---|---|
| 设计文档完整阅读 | DONE | README、00–13 全部读取 |
| 仓库权威状态/ADR 阅读 | DONE | current-status、traceability、open decisions、Pilot、MVP_STATUS、全部 ADR |
| 当前真实基线 | DONE | branch/commit/worktree/Node/package/paths/process/UI/API |
| 根级自动检查 | DONE | Node 20.20.2；`./scripts/check.sh` PASS |
| 设计到代码映射 | DONE | `01_DESIGN_TO_CODE_MAP.md` |
| P0/P1/P2 路线图 | DONE | `02`–`05` |
| 测试/风险/缺口计划 | DONE | `06`–`08` |
| P0 代码实现 | IN_PROGRESS | P0-A/P0-B/P0-C/P0-D/P0-E/P0-F/P0-G/P0-I bounded scope DONE；P0-H code/process DONE；P0-J/P0-K automated DONE；H/J/K Desktop Gate OPEN |
| P1 | NOT_STARTED | 依赖 P0 |
| P2 | NOT_STARTED | 依赖 P1 |
| 最终验收 | NOT_STARTED | `10_ACCEPTANCE_REPORT.md` |

## 已完成

- 明确当前仓库不是 V2 底座缺失，而是用户交互仍工程化；
- 证明 Focus、Condition、due、Proposal、Commit、Undo、Audit、Anchor、Project aggregate、Doctor、Backup/Restore、迁移和 Provider 都可复用；
- 证明当前未注册 Block/Page 就近入口，主导航仍为六个工程工作区；
- 证明 Plugin 当前不自动管理 Local Service 生命周期；
- 证明本轮根级检查通过且未覆盖用户已有改动；
- 建立 Goal 要求的实施目录和首轮文档。
- 完成 P0-A 的 `BlockFocusController`、Block context menu 注册、原地反馈与会话内 Undo；
- 完成重复提交互斥、active Primary Anchor 唯一解析、stale/closed/missing fail-closed；
- Plugin typecheck 与首轮 132/132 测试通过；
- 修改后根级 `./scripts/check.sh` 再次 PASS；
- 在真实 Logseq Desktop 复现 filesystem descriptor → `SERVICE_DESCRIPTOR_PATH_INVALID`；
- 新增只接受本地 JSON 文件的私有 descriptor 导入入口：校验后只写固定 FileStorage key，
  设置中不保存 token 或 filesystem path；
- 导入期间有 loading、禁用与脱敏错误，首次真实运行发现并修复 settings change 与直接
  refresh 的 generation race；
- Plugin 测试增至 137/137，覆盖合法导入、非法零写入、存储失败脱敏和 First-run UI 状态；
- 真实 Desktop 一次导入进入 `Runtime READY / Store READY`，reload 后自动恢复 READY；
- 真实 Block context menu 完成 Focus 加入、移出、Undo 恢复及 Local Service 状态读回；
- 测试结束后 Focus 清回空集，临时 descriptor 文件和剪贴板已清理。
- 完成 P0-B 的 Block 现场 Condition router、三种最小字段表单、busy 状态和状态 Undo；
- Plugin typecheck、143/143 测试与 build PASS；
- 真实 Desktop 分别写入 WAITING/BLOCKED/PAUSED，Local Service 读回一致；
- 每种状态写入均保持 Lifecycle OPEN、Focus 空，Undo 后恢复 ACTIONABLE；
- 真实 WAITING Undo 发现 JSON key 顺序假 stale，改用 `stableJson` 并补回归后复测通过；
- 最终 force reload 读回 version 10 / ACTIONABLE / Focus 空。
- 完成 P0-C LOW 单组单 Block 白名单，`CREATE_OBJECT`/`REWRITE_BLOCK` 之外及 HIGH 组均拒绝；
- 连续编排复用既有 Review→Graph/版本重验→SemanticCommit→verify，不新增写路径或恢复器；
- busy 禁用同卡片审阅动作；stale 显示未写入；接受请求不确定时零自动重试并要求刷新；
- Plugin typecheck、147/147 测试和 build PASS；
- 真实 Desktop 执行 LOW `REWRITE_BLOCK` 一次接受应用，捕获 applying 禁用态、APPLIED/Undo；
- Undo 后 Graph 与 SQLite 恢复原正文，对象 version 10→11→12，正向 Commit UNDONE、逆向
  Commit COMPLETED、Pending/Recovery 0、integrity `ok`，测试普通 Block 已清除。
- 完成 P0-D 单一 Page menu 入口、执行时 Page UUID/Anchor/target tree 重验和普通/Project
  三项现场路由；
- Page 正式事项按目标 Page tree 与 active Primary Anchor 投影，不把 page string 或 main
  Page 当作 secondary target 身份；
- Plugin 155/155 tests、0 skipped、typecheck 与 build PASS；
- 真实 Desktop 通过普通 Page、Project Page、Journal、受控 Project 创建/进入、HIGH
  current-interface 路由、取消/Back 和 sidebar 保留；
- SQLite 读回新 Project OPEN v2、唯一 active Primary Anchor、Pending/Recovery 0、
  integrity `ok`、foreign-key 无记录；
- Logseq 0.10.15 的 right-sidebar `…` 不提供 Plugin Page menu item；此宿主限制已记录，
  secondary-page payload 只按自动边界声明。
- 完成 P0-E 四项用户层主导航，顶部 Diagnostics 降级到“更多”而不删除；
- “项目”下保留 Project 列表/重入、当前接口、正式对象与受控创建，“更多”下保留最近修改/
  恢复、系统状态/诊断、备份/恢复和迁移；
- delegated `view` value 改为显式白名单校验，Plugin tests 157/157、0 skipped、typecheck
  与 build PASS；
- 真实 Desktop 下钻验证 Project、Objects、Audit、Migration、Diagnostics 均可达；包含完整
  内部 Commit ID 的页面不留截图，四张脱敏主流程截图逐张检查。
- 完成 P0-F 纯派生工具栏介入摘要，不新增领域状态源或写路径；
- 数字只计到期 review、待确认、HIGH 已接受未应用、PENDING Commit 与一次正式连接风险；
  OPEN、Focus、未来/普通 WAITING、Project 与 Candidate 总数被自动测试排除；
- `RECOVERY_REQUIRED` 自动覆盖数字为 `↻`，点击优先进入既有恢复；其他点击按连接诊断、
  Pending Commit、Proposal Review、Now 的顺序路由；
- Plugin tests 161/161、0 skipped、typecheck 与 build PASS；
- 真实 Desktop 证明 READY/Pending=0/Recovery=0 时安静 `TC`，受控停服时为 `TC ①` 且进入
  Diagnostics，同库重启和 descriptor 安全刷新后恢复 `TC`；
- 当前库没有 Recovery 项，因此 `↻` 不虚报 Desktop PASS；P0-H 自动生命周期仍保持 OPEN。
- 完成 P0-G 纯用户层最近修改投影；只组合既有 Proposal/SemanticCommit，不新增 Audit、
  Receipt、Commit 或持久缓存；
- 主卡只显示用户意图、时间、“已应用/尚未完成/需要恢复/未能应用/已撤销”和可用动作；
  Commit/Proposal ID、error code、checksum 进入折叠技术详情；
- inverse Commit 折叠回原用户变化；后续正文、对象、Anchor、Ownership 或 Project interface
  变化时解释不能直接 Undo 的原因；
- generic、Ownership、Lifecycle、Project interface 分别复用既有 Undo handler，Closure
  不伪造通用 Undo；
- 即时结果用实际 semanticCommitId 查同一长期投影，导航/关闭后清除 session 提示；
- Plugin tests 167/167、0 skipped、typecheck 与 build PASS；
- 真实 Desktop 完成 LOW 应用→即时结果→reload→长期 Undo→已撤销；最终 Graph 正文和对象
  恢复，正向 Commit UNDONE、逆向 Commit COMPLETED、Pending/Recovery 0。
- 完成 P0-J 的四条中文 slash 与六条中文命令面板注册；
- slash 仅插入 `[任务] / [MiniProject] / [决策] / [成果]` canonical 语法，正式化继续由
  既有 parser、显式同步和 Local Service 单一路径负责；
- “处理当前 Block”复用 Provider → Validator → Proposal，“加入或移出当前关注”复用
  active Primary Anchor 与 `BlockFocusController`，没有新写路径；
- Plugin tests 183/183、0 skipped，typecheck/build/bootstrap/dist integrity 与根级检查
  PASS；Desktop slash/palette/custom binding Gate 未虚报完成。
- 完成 P0-K session-only Block/Page origin route；主 Page 按 UUID 重验和定位，secondary
  Page 只关闭 overlay，来源丢失不猜测替代目标；
- 关闭、取消与 Block Condition 成功复用同一返回 Controller，Project 创建按设计进入新
  Project Page；UI 只显示“返回原 Block/Page”，不暴露身份；
- Plugin tests 187/187、0 skipped，typecheck/build/dist integrity PASS；Query/引用/
  right sidebar 等 Desktop Gate 未虚报完成。

## 当前进行

### Slice P0-H / P0-J / P0-K：产品化与日常现场

状态：`IN_PROGRESS`

P0-I 已完成：用户首屏固定回答发生了什么、影响能力、仍可用能力、数据安全与所需动作；
工程组件、协议、日志、ID 与修复入口默认折叠。真实 Desktop 已验证 READY 连接下的正文核对
注意状态，以及受控停服/reload 后的只读安全状态；没有把连接失败当空数据。

P0-H capability spike 已得出结论：iframe 不支持可靠 child process，采用独立 Launcher。
Launcher/LaunchAgent、ownership、shutdown、Graph binding、descriptor 刷新、TTL 与
crash/orphan recovery 已由自动和真实进程证据闭合；当前等待不绕过桌面安全机制的集中
reload/退出/Graph switch Gate，同时继续其他独立 P0 项。

P0-J 自动 Gate 已完成；当前等待同一集中 Desktop 轮次验证 slash 可发现性、中文输入与
光标、命令面板、自定义 binding、受限态、主题和窄窗口。

P0-K 自动 Gate 已完成；当前等待同一集中 Desktop 轮次验证 main Page、right sidebar、
Query/引用、来源移动/重命名/删除以及成功/失败/Undo 返回。

## 当前阻塞

当前没有阻塞 capability spike 的外部依赖。若 Logseq iframe 不能可靠启动受支持 Node20
子进程，必须以真实证据选择独立 launcher，不得在 UI 假装自动。

## 当前风险

- SDK context menu 的正式 Block payload/排序及 Focus/Condition 动作已真实验证；Page menu
  的普通/Project/Journal 主 Page 已验证；Query/引用与 sidebar Page 扩展入口仍待宿主能力；
- Service 产品化 Desktop lifecycle Gate 与中文命令 Desktop Gate 尚未集中闭合；
- 默认 shell Node v25，不得用于受支持 Gate；
- `@logseq/libs` 依赖告警继续公开保留。

## 证据

- P0-A 本地 commit：`e459939`；
- P0-B 本地 commit：`02e6472`；
- P0-C 本地 commit：`5998490`；
- P0-D 本地 commit：`6f6ef49`；
- P0-E 本地 commit：`72cbbd4`；
- P0-F 本地 commit：`53835b1`；
- P0-G 本地 commit：`ff10b93`；
- P0-K Plugin tests：187/187、0 skipped，typecheck/build/dist integrity PASS；
- P0-I Desktop：正文核对注意状态与 Service unavailable 受限状态 PASS；
- 根级检查：PASS；
- rule coverage：145；
- recovery rehearsal：differences `[]`；
- 本轮已归档 41 张脱敏 Desktop 截图：P0-A/P0-H 7 张，P0-B 8 张，P0-C 5 张，
  P0-D 9 张，P0-E 4 张，P0-F 2 张，P0-G 4 张，P0-I 2 张；
- 历史 V2：39/39 traceability DONE、E2E-01–24 DONE、真实 DeepSeek/Desktop/恢复均完成。

## 下一步

1. 汇总 P0-H/P0-J/P0-K 的 Desktop lifecycle、slash/palette/custom binding 与 origin；
2. 汇总 P0 剩余 Query/引用、Light/窄栏和 Service 生命周期到最少 Desktop Gate，随后进入
   P1 影子模式。
