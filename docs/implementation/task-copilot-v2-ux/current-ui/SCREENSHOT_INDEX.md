# Screenshot Index

## CURRENT

共同环境：`feature/task-copilot-mvp`，Logseq Desktop `0.10.15`，测试 Graph `logseq`，
主题与 viewport 以各场景记录为准，真实 Plugin/Launcher/Service；无 API Key、token 或私人正文。

最新 P1 Context Recovery Desktop 精确提交为 `653875a`；`p1-g-07`～`13` 对应该精确构建，
证明 `recover-context@1.3.0` 的内容、error/rejection/stale、Dark/Light/窄栏和 corrected
Interaction Evidence。`p1-g-08-...before-fix` 是本轮发现主题缺陷的 `HISTORICAL`，不代表
当前界面。P0 命令宿主最近精确提交为 `a835f59bf1c4`。`p0-j-06`～`08` 对应该精确构建，证明三项快捷动作
可配置、临时 binding 可触发且清理后冷启动全部未设置；`p0-j-02`～`05` 对应
`e8db32f1af6d`，证明冷启动 palette 和 Slash 当前行为。`p0-h-09`～`12` 对应
`e8db32f1af6d`，证明安全结束、
无错误闪烁、重新启动和健康读回；`p0-h-16`～`18` 对应 `ca50304e9aa2`，证明未配置
Graph 首次显示即受限、6 秒稳定 fail-closed 和切回原 authority；`p0-h-13` 是促成修复的
真实旧投影泄漏历史证据，`p0-h-14`/`15` 已由当前精确构建替代。`p0-e-05`、`p0-h-08`、
`p0-i-03` 对应 `4dfe014902a3`，
是公共“现在”“更多”和健康系统状态的当前权威；更早截图只在其专用纵向场景范围内提供
历史运行证据。`p2-g-47`～`50` 对应 `16bde9ad88a5`，证明受控
`RECOVERY_REQUIRED` 的 HIGH Review、人工恢复、重连和完整 restart；它们不冒充生产 Restore
连续双重故障注入。`p2-g-44`～`46` 继续只证明 `0c4526d` 的自动回滚交互。

### Project 失联正文用户语言 — exact build `971c6db268f7`

Plugin build：`2026-07-28 13:08:20 +0800`；Logseq `0.10.15`；File Graph
`/Users/wangrundong/work/任务管理中心-logseq插件/logseq`；Plugin Dark / host Light；
1001×720；真实 Plugin/Launcher/Service；专用测试 Project。点击只尝试只读定位正文，
没有 Proposal、Commit、Graph 或 SQLite 正式写入。

| 文件 | 状态 | 主题 / 窗口 | 用户动作 | 主结论与下一步 |
|---|---|---|---|---|
| `screenshots/ui-project-missing-source-user-language-current-971c6db.jpg` | CURRENT | Plugin Dark / host Light / 1001×720 | reload exact build，打开“现在”，筛选“项目”，点击“打开项目” | 原正文连接不可用；正式事项未修改；去系统状态重新连接。普通路径不显示 Anchor、对象或运行时 |

该图只替代旧实现对“Project 原正文失联时如何表达”的解释权；Rebind 与 Project 正常打开
仍分别由各自证据负责。完整操作记录见
`../logs/ui-project-missing-source-language-desktop-live-20260728.md`。

### Now 中文标签与单一结论 — exact build `f1d0e1f1cee9`

Plugin build：`2026-07-28 13:03:00 +0800`；Logseq `0.10.15`；File Graph
`/Users/wangrundong/work/任务管理中心-logseq插件/logseq`；Plugin 显式 Dark、宿主可见
表面 Light；真实 Plugin/Launcher/Service。为避免把测试 Graph 中其他 Task 标题写入仓库，
Desktop 先使用纯会话“项目”筛选，只保留专用测试 Project；筛选没有改变 Focus、对象版本、
正文或正式状态。

| 文件 | 状态 | 主题 / 窗口 | 用户动作 | 主结论与下一步 |
|---|---|---|---|---|
| `screenshots/ui-now-chinese-single-conclusion-current-f1d0e1f.png` | CURRENT | Plugin Dark / host Light / 1000×720 | reload exact build，打开“现在”，筛选“项目” | 类型筛选和卡片类型均为中文；筛选说明使用“当前关注”；卡片首屏只有一项状态结论，完整事实留在“查看依据” |
| `screenshots/ui-now-chinese-single-conclusion-current-narrow-f1d0e1f.png` | CURRENT | Plugin Dark / host Light / 724×720 | 同一会话缩到 724 px | 主结论、筛选、主动作和折叠入口均可达，无横向溢出 |

这两张图替代 `ui-compression-01` 与 `ui-compression-07` 对“现在”当前信息架构的解释权；
旧图仍保留历史真实运行事实。完整操作记录见
`../logs/ui-now-language-compression-desktop-live-20260728.md`。

### UI compression — exact build `f4acf77346b19aa2f096ff2c169bfa7323546062`

Plugin build：`2026-07-27 19:42:41 +0800`；Logseq `0.10.15`；File Graph
`/Users/wangrundong/work/任务管理中心-logseq插件/logseq`；真实 Plugin/Launcher/Service；
所有操作只读或取消，未进入正式 Closure 写入。

| 文件 | 状态 | 主题 / 窗口 | 用户动作 | 主结论与下一步 |
|---|---|---|---|---|
| `screenshots/ui-compression-01-now-light-f4acf77.jpg` | SUPERSEDED | Light / 1000×720 | 打开“现在” | 卡片只保留一个主动作，依据和次要操作折叠；类型仍为旧英文标签 |
| `screenshots/ui-compression-02-candidate-language-light-f4acf77.jpg` | CURRENT | Light / 751×720 | 打开“待我确认→待整理” | 普通路径使用“理解当前选中内容/检查当前页”，不显示 Provider/SQLite |
| `screenshots/ui-compression-03-review-history-light-f4acf77.jpg` | CURRENT | Light / 751×720 | 切到“待审阅” | 当前无待审方案；13 条历史默认折叠，不淹没当前问题 |
| `screenshots/ui-compression-04-project-intent-light-f4acf77.jpg` | CURRENT | Light / 751×720 | Project 重入→调整项目 | 用户按目的选择，后台影响分级不进入首屏 |
| `screenshots/ui-compression-05-closure-light-f4acf77.jpg` | CURRENT | Light / 1000×720 | 选择“结束这个项目” | 先显示待判断数、未正式应用和退出安全；下一步为“审阅关闭方案” |
| `screenshots/ui-compression-06-closure-narrow-light-f4acf77.jpg` | CURRENT | Light / 751×720 | 同一 Closure 首屏 | 主动作仍可见，无横向溢出；逐目标依据默认折叠 |
| `screenshots/ui-compression-07-now-dark-f4acf77.jpg` | SUPERSEDED | Dark / 1000×720 | 切换宿主主题后打开“现在” | Dark 与 Light 保持相同层级和操作语义；由 `f1d0e1f` 当前 Now 证据替代 |
| `screenshots/ui-compression-08-closure-dark-f4acf77.jpg` | CURRENT | Dark / 1000×720 | Dark 下进入 Closure | 安全结论、折叠依据和主操作与 Light 一致 |

这些图片替代 `p0-e-05` 对“现在”布局、旧审阅卡片对当前/历史混排、`p2-d-01`
对 Project 入口语言，以及 `p2-e-01`～`08` 对 Closure 当前首屏信息架构的解释权；
旧图仍保留其 commit 上正式链历史证据，不删除。

### P2-E Closure failure and Review — exact builds `77277704d901` / `662246a298ac` / `cda4f95`

Logseq `0.10.15`；File Graph
`/Users/wangrundong/work/任务管理中心-logseq插件/logseq`；真实 Plugin/Launcher/Service；
1000×720。error Gate 使用受控无效模型且未保存/显示凭据，随后已恢复
`deepseek-v4-flash`；Review 来自恢复后的真实 Provider Proposal。两步均未接受或应用
Proposal，Project 保持 `OPEN v21`。

| 文件 | 状态 | 主题 / 窗口 | 用户动作 | 主结论与下一步 |
|---|---|---|---|---|
| `screenshots/p2-e-closure-provider-error-current-light-7727770.png` | CURRENT | Light / 1000×720 | 保存 Closure 判断并请求整理；Provider 受控失败 | 本次没有完成，项目和正文未变化；输入保留；唯一动作“重新整理关闭方案” |
| `screenshots/p2-e-closure-review-current-dark-cda4f95.png` | CURRENT | Dark / 1000×720 | 在 `cda4f95` 最新构建重新调用真实 DeepSeek，生成并打开待审阅 | 标题为“结束项目”，首屏只显示一句结构化结果、2 项影响、2 项不改变；完整模型说明折叠；下一步“审阅方案” |
| `screenshots/p2-e-closure-review-current-dark-662246a.png` | SUPERSEDED | Dark / 1000×720 | 恢复真实 DeepSeek 后生成 Proposal，reload exact build 并打开待审阅 | 首屏结构已经压缩，但标题仍含 `Closure Proposal`；由 `cda4f95` 当前证据替代 |
| `screenshots/p2-e-closure-stale-current-dark-662246a.png` | CURRENT | Dark / 1000×720 | 真实 DeepSeek 经无日志 8 秒延迟转发，期间 Project Condition `v21→v22` | 旧草稿没有进入 Review；只说明材料不再适用、本次未修改项目或正文；唯一动作“重新检查关闭条件” |
| `screenshots/p2-e-closure-stale-reload-restored-dark-662246a.png` | CURRENT | Dark / 1000×720 | 正式 Condition Undo 到 `ACTIONABLE v23`，恢复原 Provider 与 authority，Plugin reload | “现在”重新显示可推进 Project；Service READY；Proposal/Commit 无异常增量 |
| `screenshots/p2-e-closure-provider-error-superseded-f4acf77.png` | SUPERSEDED | Light / 1000×720 | 同一故障的旧构建 | 曾暴露 Provider/Proposal 工程语义；由 `7727770` 用户语言替代 |

### Review empty state — exact build `cd59228`

Logseq `0.10.15`；File Graph；Dark；1000×720；Task Copilot reload 后打开
“待我确认 → 待审阅”。无当前 Proposal，15 条历史默认折叠。

| 文件 | 状态 | 主题 / 窗口 | 用户动作 | 主结论与下一步 |
|---|---|---|---|---|
| `screenshots/review-empty-current-dark-cd59228.png` | CURRENT | Dark / 1000×720 | 拒绝测试 Proposal、reload 最新构建并打开待审阅 | 不再错误显示“Agent 已关闭”；当前无待审阅方案，可整理当前页或回待整理 |

| 文件 | commit | 场景与用户动作 | 系统结果 | 下一步 / 已知问题 |
|---|---|---|---|---|
| `screenshots/p0-i-01-anchor-drift-user-status-current-dark.png` | runtime `1375f1b`（后续仅 Service 语言合同变化） | 在真实 Project Page UUID 与正式 active Page Anchor UUID 漂移时打开系统状态 | 首屏只显示“有 1 项正文变化需要核对”，不把 stale properties 猜成 Project；reconciliation 后日常能力恢复 | 精确 Rebind 仍属 P2-G；这是当前宿主边界证据，不代表 Anchor 已重新绑定 |
| `screenshots/p1-g-07-context-recovery-skill-1-3-provider-current-dark.png` | `653875a` | 从 Project workspace 用 1.3.0 调用真实 DeepSeek | 4 条机器事实接地；上一轮反身 unknown 不再出现；用户标记 `HELPFUL` | 持续扩大真实质量样本，但不阻断 P1-G |
| `screenshots/p1-g-08-context-recovery-skill-1-3-current-light.png` | `653875a` | 切换 Logseq Light 后再次真实生成 | Plugin 跟随宿主主题，事实和判断在浅色表面可读 | before-fix 同名变体只保留历史 |
| `screenshots/p1-g-09-context-recovery-skill-1-3-current-light-narrow.png` | `653875a` | 将真实 Logseq 窗口缩到约 720 px | 主结论、分区和主动作仍可读，无横向溢出 | 非完全宿主笛卡尔积 |
| `screenshots/p1-g-10-context-recovery-provider-error-current-light.png` | `653875a` | 受控 Provider error | 用户知道没有写入，确定性重入卡仍可用，可显式重试 | `ERROR=1`，无自动重试 |
| `screenshots/p1-g-11-context-recovery-validator-rejection-current-light.png` | `653875a` | 受控兼容 Provider 输出违反前台合同 | Unified UX Validator 拒绝，可靠基线不被覆盖 | `REJECTED=1`，无自动重试 |
| `screenshots/p1-g-12-context-recovery-generation-stale-current-light.png` | `653875a` | Provider 期间正式 Project 版本变化 | 旧草稿不显示、不执行，用户可基于当前版本重试 | 用户层 stale 证据 |
| `screenshots/p1-g-13-context-recovery-stale-telemetry-current-light.png` | `653875a` | 真实 DeepSeek 经本地无日志延迟转发，期间 Condition 正向+Undo | 同一 stale 用户结论；Service 摘要 `STALE=1 / GENERATED=0`，Project 最终 ACTIONABLE v19 | 当前 stale 遥测权威 |
| `screenshots/p0-k-01-main-page-origin-current-dark.png` | runtime `a835f59bf1c4` / docs `47df2aa` | 普通主 Page 从宿主菜单进入 Task Copilot 页面操作 | 前台显示精确 Page 标题、执行前重验说明和“返回原 Page”主动作 | Query/reference 与来源变化 OPEN |
| `screenshots/p0-k-02-main-page-return-current-dark.png` | runtime `a835f59bf1c4` / docs `47df2aa` | 点击“返回原 Page” | overlay 关闭，回到同一 Page URL 与正文现场 | 成功/失败/Undo 返回 OPEN |
| `screenshots/p0-k-03-sidebar-menu-bounded-current-dark.png` | runtime `a835f59bf1c4` / docs `47df2aa` | 在 right-sidebar 页面打开专用 More | 宿主只提供 Close/Collapse/Open as page，无 Plugin Page item；插件不猜 identity | 这是宿主限制，不代表 sidebar 精确入口 DONE |
| `screenshots/p0-k-04-query-reference-synthetic-current-dark-73fea9a.png` | runtime `d7526f4` / docs `73fea9a` | 脱敏专用页同时显示 live query 与 block reference | 两种投影均真实解析，未包含个人正文 | 原地精确入口按宿主能力有界 |
| `screenshots/p0-k-05-reference-native-menu-bounded-current-dark-73fea9a.png` | runtime `d7526f4` / docs `73fea9a` | Block reference 投影打开宿主菜单 | 仅有打开/复制/删除/替换引用，没有 Plugin Block item | 安全隐藏；先打开来源 Block |
| `screenshots/p0-k-06-query-preview-bounded-current-dark-73fea9a.png` | runtime `d7526f4` / docs `73fea9a` | Query 结果使用宿主投影交互 | 宿主打开来源页面预览，不提供可靠 Plugin Block item | 不用 DOM hack 猜 UUID |
| `screenshots/p0-k-07-moved-source-return-current-dark-66850e6.png` | runtime `d7526f4` / docs `66850e6` | Task Copilot 打开期间把来源 Block 移到页面底部并修改可见文字，再点击“返回原 Block” | 按稳定 UUID 返回移动后的新位置，Query/reference 投影同步更新 | `CURRENT`；Dark / 1000×720；未依赖旧位置 |
| `screenshots/p0-k-08-deleted-source-safe-return-current-dark-66850e6.png` | runtime `d7526f4` / docs `66850e6` | Task Copilot 打开期间删除来源 UUID，再点击“返回原 Block” | 面板关闭并提示“原 Block 已不可用；未执行其他导航”，没有猜测 Query/reference 或同名内容 | `CURRENT`；Dark / 1000×720；fixture 截图后恢复 |
| `screenshots/p0-k-09-analysis-no-proposal-user-language-current-dark-06b8762.png` | `06b8762933f8` | 完整 Force Reload 后从脱敏普通来源 Block 发起真实智能整理 | 一次 Provider abstain 已使用用户语言，但仍含重复的正常连接成功横幅 | `SUPERSEDED`；由 `p0-k-10` 接管当前画面 |
| `screenshots/p0-k-10-analysis-single-status-current-dark-eba1c54.png` | `eba1c541d3af` | 完整 Force Reload 后从脱敏普通来源 Block 发起真实智能整理 | 只保留“Copilot 可用 · 建议需审阅”和一条无需整理结论；正常连接成功横幅已删除 | `CURRENT`；Plugin explicit Dark / host Light / 1000×720；0 retry、0 formal write |
| `screenshots/p0-j-02-command-palette-single-current-dark.png` | `e8db32f1af6d` | 完整冷启动后打开命令面板并检索 Task Copilot | 六条中文命令单组可见，无持久重复 | 连续 reload residue 见 HISTORICAL；受限态 OPEN |
| `screenshots/p0-j-03-command-palette-open-now-current-dark.png` | `e8db32f1af6d` | 从命令面板执行“打开‘现在’” | 当前 Now 工作面打开，无静默或错误 | Light/窄栏 OPEN |
| `screenshots/p0-j-04-command-palette-system-status-current-dark.png` | `e8db32f1af6d` | 从命令面板执行“系统状态与技术诊断” | 用户层健康结论可读，技术详情保持折叠 | 受限态代表链 OPEN |
| `screenshots/p0-j-05-slash-command-current-dark.png` | `e8db32f1af6d` | 空白 Block 打开 Slash，选择创建任务并继续输入 ASCII 测试标题 | 四条中文 Slash 可发现；精确插入 `[任务] ` 并保留同一 Block | Computer Use 不能替代原生中文 IME Gate |
| `screenshots/p0-j-06-custom-binding-current-dark.png` | `a835f59bf1c4` | 设置页为“打开‘现在’”配置临时两段 chord | 仅三项高频动作可配置；没有默认键 | 测试后已清理本机配置 |
| `screenshots/p0-j-07-custom-binding-open-now-current-dark.png` | `a835f59bf1c4` | 关闭设置后触发临时 chord | Now 正确打开 | 不保留测试 binding |
| `screenshots/p0-j-08-cold-start-configurable-shortcuts-current-dark.png` | `a835f59bf1c4` | 清理配置并完整退出/重启 Logseq，重新检索 Task Copilot | 恰好 3 条可配置命令，全部未设置 | 中文 IME、受限态、Light/窄栏 OPEN |
| `screenshots/p0-e-05-daily-shell-clean-current-dark.png` | `4dfe014902a3` | exact build 后台 reload 后打开“现在” | 启动结论使用“当前知识库”；无 Runtime/Store/Graph 状态条，保留四项主导航与真实任务动作 | Light/窄栏和高级卡片信息密度仍 OPEN |
| `screenshots/p0-h-08-more-productized-current-dark.png` | `4dfe014902a3` | 从日常工作面进入“更多” | 维护能力收敛为最近修改、系统状态、备份恢复、迁移和结束本次使用；无 Launcher/Service/Commit/SQLite 工程词 | 结束/重启最新语言链仍可在集中 P0 Gate 复验 |
| `screenshots/p0-i-03-system-status-translated-current-dark.png` | `4dfe014902a3` | 从“更多”检查健康系统状态，保持技术诊断折叠 | 首屏只回答发生、影响、可用、安全和操作；内部状态、精确 commit 与 `0/0/0` 仅在主动展开后可见 | 失败/恢复各类别仍需代表性当前复验 |
| `screenshots/p0-h-09-end-session-confirm-current-dark.png` | `e8db32f1af6d` | 从“更多”请求结束本次使用 | 独立确认再次检查未完成修改与正文核对，并说明正文、历史和其他进程不受影响 | 未确认时不释放 lease |
| `screenshots/p0-h-10-end-session-safe-current-dark.png` | `e8db32f1af6d` | 确认安全结束；100—2500 ms 多点采样 | 立即暂停正式动作，只保留“更多”、关闭和重新启动；无知识库不匹配或“未配置”假结论 | Graph switch 后由 `p0-h-16`～`18` 关闭 |
| `screenshots/p0-h-11-restart-session-ready-current-dark.png` | `e8db32f1af6d` | 点击“重新启动 Task Copilot” | 当前知识库重新启动；主导航和正式维护能力恢复 | 继续进入系统状态核验 |
| `screenshots/p0-h-12-restart-session-health-current-dark.png` | `e8db32f1af6d` | 重启后检查系统状态 | 用户层正常；技术详情 exact commit、formal writes true、`0/0/0` | Graph switch 后由 `p0-h-16`～`18` 关闭 |
| `screenshots/p0-h-16-graph-switch-immediate-restricted-current-dark.png` | `ca50304e9aa2` | 从已配置测试 Graph 切到未加入 Launcher mapping 的隔离 Graph；捕获宿主首次显示新 Graph | 首帧已为“知识库不匹配 / 正式修改暂停”，旧 Project 卡不可见，正文仍可编辑 | 未配置 Graph 不提供连接或猜测数据库动作 |
| `screenshots/p0-h-17-graph-switch-settled-restricted-current-dark.png` | `ca50304e9aa2` | 在隔离 Graph 再等待 6 秒 | 保持同一受限结论；旧正式投影仍不可见，没有自动创建或替换 authority | 配置到配置的隔离由 Launcher 自动合同覆盖 |
| `screenshots/p0-h-18-graph-switch-return-ready-current-dark.png` | `ca50304e9aa2` | 切回原 Graph 并等待自动恢复 | 约 3.75 秒恢复 Copilot 可用、原 Project 和“没有复用上一知识库的数据”；mapping/path/inode 不变 | P0-H 代表性 Desktop Gate 关闭 |
| `screenshots/p2-c-18-page-undo-confirm-current-dark.png` | `913bbda4528f` | Page 来源 Project 经完整 restart 后，从最近修改进入专用 Undo | 原账本 UUID 已漂移，但界面只要求撤销正式 Project/Anchor；明确复用来源 Page 保留、专用 Page 仅在仍属本事务且为空时删除 | Review 历史卡片仍偏长 |
| `screenshots/p2-c-19-page-undo-complete-current-dark.png` | `913bbda4528f` | 显式勾选并确认 Project Creation inverse Commit | Project、Anchor 与本事务拥有的空 Page 已安全撤销；Audit 与 inverse Commit 保留 | 删除事件会短暂触发一次正文核对，需冷启动收敛 |
| `screenshots/p2-c-20-page-post-undo-restart-healthy-current-dark.png` | `913bbda4528f` | Undo 后完整退出并重开 Logseq，再进入系统状态 | Runtime/Store/Service READY；Pending/Recovery/Source Conflict `0/0/0`；`reconciliationRequired:false`；来源正文仍在、专用 Page/Project 不在 | MiniProject、Light/窄栏仍开放 |
| `screenshots/p2-c-21-page-reuse-preview-current-dark.png` | `913bbda4528f` | 同一 Page 来源明确覆盖原“另建”材料，选择升级当前 Page；七项答案就绪并生成最终阅读 Preview | 关系为复用当前 Page；Project Object 仅以 Anchor 关联，不写 Page 属性/正文；仍为零正式写入 | readiness 事实区偏长，Preview 有重复“完成证据”标签 |
| `screenshots/p2-c-22-page-reuse-created-current-dark.png` | `913bbda4528f` | HIGH Review/Commit 完成后自动回到原 Page | 当前 Page 三段正文可见且无 ownership metadata；Graph 逐字段读回与创建前完全一致；Project/Anchor 已在正式投影 | 截图本身只显示返回现场，正式创建由 Audit/Graph 读回证明 |
| `screenshots/p2-c-23-page-reuse-undo-current-dark.png` | `913bbda4528f` | restart 后从最近修改执行 Page-aware inverse Commit | 用户结果明确“Project 与 Anchor 已撤销；复用的来源 Page 保持原样” | 仍需 MiniProject 来源 |
| `screenshots/p2-c-24-page-reuse-post-undo-restart-healthy-current-dark.png` | `913bbda4528f` | Page reuse Undo 后再次完整 restart | Runtime/Store/Service READY；`0/0/0`；reconciliation false；Project 不在投影，Page 逐字段等于创建前 | Light/窄栏与 MiniProject OPEN |
| `screenshots/p2-c-29-mini-evolution-grill-ready-current-dark.png` | `7d4f5e4721f5` | 从 OPEN MiniProject 发起演化；七项自适应 Grill 已解决 | 前台只保留用户事实、少量判断和一个主动作；不含 object/root ID、fact key 或错误的来源关闭建议 | 已确认事实区仍偏长 |
| `screenshots/p2-c-30-mini-evolution-preview-current-dark.png` | `7d4f5e4721f5` | 用户生成最终阅读 Preview | 专用 Project Page、持续成果/证据/内部闭环/当前接口完整；五个来源 Block 均为 `LINK_AS_SOURCE`，仍零正式写入 | 模型曾建议嵌入，但用户 link-only 决定与机器合同最终获胜 |
| `screenshots/p2-c-31-mini-evolution-high-review-current-dark.png` | `7d4f5e4721f5` | 从 Preview 进入待我确认 | 单一 `create-project` HIGH 组为 PENDING；Project/Page/Object/Commit 尚未创建 | Review 长正文仍需压缩 |
| `screenshots/p2-c-32-mini-evolution-accepted-high-current-dark.png` | `7d4f5e4721f5` | 勾选 HIGH 影响确认后只接受语义组 | 状态为 ACCEPTED；界面明确仍需提交前检查与最终创建 | “尚不能确认安全撤销条件”与可撤销动作的表达仍不一致 |
| `screenshots/p2-c-33-mini-evolution-created-project-current-dark.png` | `7d4f5e4721f5` | 最终确认后原子创建并自动打开新 Project Page | 专用 Page、Project v2 与 active Primary Anchor 已读回；来源 MiniProject 子树逐字段不变 | 新 Page 首屏直接显示 ownership/object/commit properties，工程味过重 |
| `screenshots/p2-c-34-mini-evolution-reload-reentry-current-dark.png` | `7d4f5e4721f5` | Logseq 页面 reload 后重新打开 Task Copilot 项目区 | 新 Project 的版本化当前接口可从正式投影重入；来源仍为 v14/OPEN | reload 初始核对提示会在同步后收敛 |
| `screenshots/p2-c-35-mini-evolution-undo-confirm-current-dark.png` | `7d4f5e4721f5` | 从最近修改对最新 Project Creation 发起专用 Undo | 明确撤销 Project/Anchor；来源 Page 永不删除，专用空 Page 仅在仍属本事务时删除 | 历史卡片密度偏高 |
| `screenshots/p2-c-38-mini-evolution-undo-source-return-current-dark.png` | `7a7492a407ed` | 最新构建重跑真实 DeepSeek→Preview→HIGH Review→Commit→reload 后执行专用 inverse Commit | Project、Anchor 与本事务拥有的空 Page 已撤销；路由精确返回原 MiniProject 根 Block并显示成功结果；来源四个子 Block 可见 | 右侧栏仍保留测试 Graph 旧页面，不属于本次正式变化 |
| `screenshots/p2-c-39-mini-evolution-undo-reload-healthy-current-dark.png` | `7a7492a407ed` | Undo 返回来源后再次 reload，打开用户系统状态并展开诊断 | Runtime/Store/Service READY；commit 与 Logseq 版本可见；Pending/Recovery/Source Conflict `0/0/0`；reconciliation false | Light/窄栏仍 OPEN |
| `screenshots/p2-d-05-project-narration-undo-reload-current-dark.png` | `ae2395523798` | MEDIUM 当前摘要完成真实 Provider、Review、Commit、reload、最近修改专用 Undo，再次 reload 后查看最近修改 | 原修改显示“已撤销”，inverse Commit 与 Audit 保留；顶部正确显示“Copilot 可用 · 建议需审阅”；Project 原摘要和全部结构字段已读回 | Review 正文仍偏长；Light/窄栏 OPEN |
| `screenshots/p2-d-06-project-impact-router-current-dark.png` | `ae2395523798` | 从正式 Project 点击“调整 Project” | 最新界面按低摩擦、审阅后应用、深度结构三层说明影响；MEDIUM 真实入口可用；Ownership/正文移动/Closure 不会降级 | LIGHT 可发现 Undo 与多类 HEAVY 纵向链仍 OPEN |
| `screenshots/p2-d-07-heavy-interface-accepted-current-dark.png` | `ae2395523798` | 用户填写完整 Project interface，独立接受单组 HIGH Proposal | Objectives、Deliverables、Work Stages、摘要与三项 Focus 已在最终预览；仍未正式应用，需提交前重验和最终确认 | 语义组名与 operation code 仍偏工程化 |
| `screenshots/p2-d-08-heavy-interface-reload-current-dark.png` | `ae2395523798` | 最终 Commit 后 reload，再打开“现在” | 新摘要和前两项 Focus 从 SQLite 正式投影可读；Provider 状态与 Runtime/Store READY | Now 卡只显示前两项 Focus，完整结构需下钻 |
| `screenshots/p2-d-09-heavy-interface-undo-current-dark.png` | `ae2395523798` | 从最近修改执行 Project interface 专用 inverse Commit | HEAVY 修改显示“已撤销”，历史证据保留；Project 重入回到原“进入点不明确” | 最终健康需 reload 证据 |
| `screenshots/p2-d-10-heavy-interface-undo-reload-healthy-current-dark.png` | `ae2395523798` | HEAVY Undo 后再次 reload，打开用户系统状态 | 系统首屏明确正常、能力可用、数据安全、无需操作；展开技术诊断可读 exact commit 与 `0/0/0` | Light/窄栏仍 OPEN |
| `screenshots/p2-d-11-light-condition-router-current-dark.png` | `58bf6306d04d` | 从 Project 重入进入影响路由 | Condition 与正式 Undo 可操作；无 inverse 的普通 Association 明确禁用，不计入最终 Gate | 路由较高；英文领域术语与 Light/窄栏仍需收口 |
| `screenshots/p2-d-12-light-condition-undo-after-reload-current-dark.png` | `58bf6306d04d` | Project PAUSED 后 reload，再从影响路由进入“撤销最近状态” | 明确“我先暂停”恢复为“可以行动”；确认时重验版本/Condition，不改变其他正式边界 | Condition 表单应更明确显示目标标题 |
| `screenshots/p2-d-13-light-condition-undo-reload-current-dark.png` | `58bf6306d04d` | 正式 inverse 完成后再次 reload，打开 Project 重入 | Project 回到 ACTIONABLE 的确定性基线；最终 v10，原摘要/Focus/空结构逐字段守恒 | 进入点本身仍不足，Context Recovery 属 P1 后续 |
| `screenshots/p2-e-01-closure-evidence-entry-current-dark.png` | `ec1a70d848d6` | 从 Project 重入进入影响路由 | Closure 只提供“整理证据”，明确不会生成 Proposal 或完成 Project | 路由仍有较多英文领域词；Light/窄栏 OPEN |
| `screenshots/p2-e-02-closure-evidence-empty-current-dark.png` | `ec1a70d848d6` | 用户打开空材料 Project 的 Closure 证据预览 | 原目标、交付、Decision、已完成工作均保持 unknown；不把模型、关联或孙级对象当成果 | 单屏高度不足以同时显示全部用户判断 |
| `screenshots/p2-e-03-closure-evidence-reload-recompute-current-dark.png` | `ec1a70d848d6` | 预览打开时 reload Plugin，再次进入同一路径 | session preview 未持久化；Runtime/Store READY，并从同一正式 Project v10 重算；前后零 Proposal/Commit | 真实 Provider 与正式 Closure 链仍 OPEN |
| `screenshots/p2-e-04-closure-evidence-judgments-current-dark.png` | `ec1a70d848d6` | 滚动到证据预览底部核对用户判断与操作 | 前台收敛为五项真正需要判断的内容；唯一按钮为“取消”，明确下一阶段才进入 HIGH Review/Commit | “Proposal/Primary Ownership/Commit”等工程词仍需状态翻译 |
| `screenshots/p2-e-10-closure-undo-available-dark-994x701.jpg` | `06907f34b8d2` | 在最新构建中 reload 已完成的 Closure，进入待我确认 | 完成卡只提供一个专用“撤销 Project Closure”；说明恢复 OPEN、移除本次 Closure且不改 Logseq Page | 前向 Provider/Review 截图来自 `1ec63ac`，见 HISTORICAL |
| `screenshots/p2-e-11-closure-undo-completed-dark-994x701.jpg` | `06907f34b8d2` | 勾选精确影响确认并执行 Closure inverse Commit | 即时结果明确“已撤销”，历史证据保留；自动返回 Project 重入，Project 再次可推进 | Review 历史列表信息密度仍高 |
| `screenshots/p2-e-12-closure-undo-reload-active-project-dark-994x701.jpg` | `06907f34b8d2` | 从 Logseq Plugin Manager reload Task Copilot 后重新打开 | Runtime/Store READY；Now Work 重新显示同一 Project；CLI 回读 OPEN v13、Closure absent，异常 Commit 0/0/0 | 当前构建的 failure/Recovery Desktop Gate OPEN |
| `screenshots/p2-e-13-closure-commit-interrupted-current-dark.jpeg` | `6f7f9a857be9` | 隔离测试库对精确 Closure Commit 注入 post-domain step 中断 | 用户层只显示“未完成”、原内容安全和不得重复提交；Project Domain receipt 已存在，同 Commit 保持 PENDING | 受控测试 fault；触发器已立即删除 |
| `screenshots/p2-e-14-closure-pending-after-reload-current-dark.jpeg` | `6f7f9a857be9` | 中断后从 Plugin Manager reload Task Copilot | 自动进入最近修改与恢复；同一变化显示“尚未完成，可以继续”，唯一主动作是“查看” | 真正不可安全续跑的 Recovery Required 仍 OPEN |
| `screenshots/p2-e-15-closure-resumed-completed-current-dark.jpeg` | `6f7f9a857be9` | 从原 Review 再次确认，Service 复用 command receipt 收口同一 Commit | 正式 Commit 完整完成、Proposal APPLIED、Project 保持 v20，没有重复 Domain 变化；专用 Undo 可用 | Proposal 历史列表仍偏密 |
| `screenshots/p2-e-16-closure-completed-after-reload-current-dark.jpeg` | `6f7f9a857be9` | recovered Commit 完成后再次 reload，打开最近修改 | 完成态跨 reload 可读，提供同一个 Closure Undo；异常 Commit 0/0/0 | Provider error/stale Desktop 仍 OPEN |
| `screenshots/p2-e-17-closure-undo-restored-project-current-dark.jpeg` | `6f7f9a857be9` | 对 recovered Commit 执行专用 Closure inverse | 即时结果为“已撤销”，自动返回 Project 重入；Project OPEN v21、Closure absent | 不修改 Logseq Page/正文 |
| `screenshots/p2-e-18-closure-undo-after-reload-current-dark.jpeg` | `6f7f9a857be9` | recovered Commit Undo 后再次 reload | Now Work 重新显示同一 Project；Runtime/Store READY，原 Commit UNDONE、inverse COMPLETED、异常 Commit 0/0/0 | 当前只代表 Dark 标准宽度 |
| `screenshots/p2-g-07-rebind-capture-entry-dark-994x700.jpg` | `344c705ec446` | reload 发现一个合成正式事项的旧正文不可用，用户进入系统状态 | 前台只说明正式事项仍保留、受影响能力和数据安全；唯一主动作是“开始重新连接” | Rebind 专用 Undo 引导仍 OPEN |
| `screenshots/p2-g-08-rebind-capture-window-dark-994x700.jpg` | `344c705ec446` | 用户启动受控选择并回到 Logseq 新建替换 Block，再打开 Task Copilot | 明确 5 分钟上限、暂缓自动物化、取消/提交后恢复；Service 此时匹配正式对象数为 0 | 窗口期间其他显式编辑也会排队，故必须保持短时且用户主动 |
| `screenshots/p2-g-09-rebind-capture-preview-dark-994x700.jpg` | `344c705ec446` | 用户预览新正文并选择原连接不可用的事项 | 只显示标题、类型和翻译状态；无 UUID/Anchor ID/hash，正式事项与主归属保持说明可读 | 当前截图在勾选最终影响确认前 |
| `screenshots/p2-g-10-rebind-capture-success-dark-994x700.jpg` | `344c705ec446` | 用户勾选单独确认并提交正式 Rebind | 新正文连接成功、旧连接保留历史；恢复自动同步后匹配正式对象仍为 1 | 页面标题在即时窗口仍短暂显示正文核对，reload 后收敛 |
| `screenshots/p2-g-11-rebind-capture-reload-clean-dark-994x700.jpg` | `344c705ec446` | Plugin Manager reload 后打开用户系统状态 | Task Copilot 可以正常使用、数据安全、无需操作；Anchor issue 已消失 | Restore/Migration 与 Rebind Undo 引导仍 OPEN |
| `screenshots/p2-g-12-rebind-capture-build-identity-dark-994x700.jpg` | `344c705ec446` | reload 健康后展开技术诊断 | Plugin commit、Logseq 0.10.15、Runtime/Store/Service READY、`0/0/0` 与 explicit sync healthy 同屏 | 诊断属于证据层，不是日常必读 UI |
| `screenshots/p2-g-13-backup-catalog-current-6ae8f2f.jpeg` | `6ae8f2fcebd0` | reload 最新构建后进入“更多 → 备份与恢复” | 两个 Service 管理快照只显示时间、四项正式事项与完整性 PASS；无 ID/路径 | 当前产品 UI 的状态差异读回仍 OPEN |
| `screenshots/p2-g-14-restore-impact-review-current-6ae8f2f.jpeg` | `6ae8f2fcebd0` | 选择快照并由 Service 再校验 | 最终影响明确 SQLite 替换、Logseq 正文不改写、当前状态先保留恢复点；单独确认未勾选 | failure 注入仍 OPEN |
| `screenshots/p2-g-15-restore-success-current-6ae8f2f.jpeg` | `6ae8f2fcebd0` | 先验证未确认零请求，再勾选并正式 Restore | Service 自停并由 Launcher 重建；Plugin 自动回到 READY；成功态不再残留旧错误 | 即时重连过程很短，截图捕获最终稳定态 |
| `screenshots/p2-g-16-restore-reload-catalog-current-6ae8f2f.jpeg` | `6ae8f2fcebd0` | Plugin Manager reload 后再次打开快照目录 | 两个快照增至三个，恢复前恢复点跨 reload 可见且完整性 PASS | 反向 Restore 仍 OPEN |
| `screenshots/p2-g-17-restore-build-diagnostics-current-6ae8f2f.jpeg` | `6ae8f2fcebd0` | reload 后打开系统状态并展开技术诊断 | Commit、Logseq 0.10.15、Runtime/Store/Service READY、`0/0/0` 同屏 | 诊断只作为证据层 |
| `screenshots/p2-g-18-restore-state-delta-actionable-current-6ae8f2f.jpeg` | `6ae8f2fcebd0` | 测试 Task 已正式变为 PAUSED 后，从旧快照 Restore 并回到“现在” | Local Service 逐字段从 `PAUSED v6` 回到 `ACTIONABLE v5`；同一 Task 再次显示“当前可以继续推进” | 反向 Restore 的 PAUSED 读回由结构化 Service 证据承担 |
| `screenshots/p2-g-19-restore-state-delta-roundtrip-health-current-6ae8f2f.jpeg` | `6ae8f2fcebd0` | 再从自动恢复点反向恢复 PAUSED，最后恢复原 ACTIONABLE 基线并 reload | 正反往返均逐字段读回；最终 Runtime/Store/Service READY、`0/0/0`、reconciliation false | Restore failure 已由 `p2-g-44`～`46` 补齐；Light/窄栏仍 OPEN |
| `screenshots/p2-g-20-migration-readonly-scan-entry-current-15b976d.jpeg` | `15b976d28ec3` | reload exact build 后进入“更多 → 迁移” | 入口只允许明确选择 Recovery Bundle 和只读检查；当前没有迁移计划 | Dark 宿主上的 Plugin 仍为浅色表面；主题 Gate OPEN |
| `screenshots/p2-g-21-migration-readonly-scan-result-current-15b976d.jpeg` | `15b976d28ec3` | 原生文件选择器选取 2 KB 脱敏 Bundle 并点击只读检查 | 显示 2 项分类、正式变化 0、尚未创建计划；无 identity/hash/正文 | 逐项审阅入口尚未开放 |
| `screenshots/p2-g-22-migration-readonly-scan-abandoned-current-15b976d.jpeg` | `15b976d28ec3` | 用户点击“放弃这份材料” | 文件选择与摘要清空，顶部明确当前会话不再保留内容 | 不代表正式 Migration Undo |
| `screenshots/p2-g-23-migration-readonly-scan-reload-cleared-current-15b976d.jpeg` | `15b976d28ec3` | 再次扫描后直接 reload，重新进入迁移 | 回到未选择文件/没有计划，session 材料没有跨生命周期残留 | Graph switch 仍由自动 Gate 覆盖 |
| `screenshots/p2-g-24-migration-readonly-scan-invalid-current-15b976d.jpeg` | `15b976d28ec3` | 选择非法 JSON 并只读检查 | 未发起 Service scan；用户层错误可重试且旧摘要不残留 | Service failure 注入仍 OPEN |
| `screenshots/p2-g-25-migration-readonly-scan-build-health-current-15b976d.jpeg` | `15b976d28ec3` | 只读成功、放弃、reload 与非法输入后展开系统诊断 | exact commit、Logseq 0.10.15、Runtime/Store/Service READY、`0/0/0` | 诊断只作为证据层 |
| `screenshots/p2-g-26-migration-item-review-current-dark.png` | `c660f2d00be5` | 选择脱敏 2 项 Bundle 并完成只读 scan | 逐项显示 session-only 单行摘录、来源类型、旧状态、机器建议与决定；完整正文/identity/hash 不入账本或日志 | Dark 宿主内插件卡片仍偏亮 |
| `screenshots/p2-g-27-migration-decisions-complete-current-dark.png` | `c660f2d00be5` | 普通内容项填写依据，直接迁移项保持机器建议，两项分别保存 | 全部决定完成后才出现唯一计划创建动作 | 恢复点尚未选择 |
| `screenshots/p2-g-28-migration-plan-created-current-dark.png` | `c660f2d00be5` | 点击“保存审阅并创建迁移计划” | PREVIEWED 计划：2 项审阅、1 项准备迁移、1 项保持普通内容；无正式对象导入 | Import/Verify/Activate/Undo OPEN |
| `screenshots/p2-g-29-migration-plan-reload-current-dark.png` | `c660f2d00be5` | 创建后 Plugin reload 并重新进入迁移 | Bundle/session 摘录和决定已释放；迁移计划 1 持久显示 | 失败/重启续跑仍需 Desktop Gate |
| `screenshots/p2-g-30-migration-batch-scope-current-dark.png` | `593d14ac2c7` | PREVIEWED 计划重新选择同一脱敏 Bundle 并只读核对 | 只显示一项已审阅待导入范围；正式变化 0，无内部 identity/hash | Dark 宿主内插件表面仍偏亮 |
| `screenshots/p2-g-31-migration-recovery-review-current-dark.png` | `593d14ac2c7` | 选择一项并创建恢复点 | 恢复点完整性 PASS 后才出现独立 HIGH 导入确认；batch 仍为 0 | Backup identity 不进入 UI |
| `screenshots/p2-g-32-migration-imported-current-dark.png` | `593d14ac2c7` | 勾选最终确认并导入一项 | 明确“1 项等待验证、尚未启用”；SQLite objects `4→5`、batch IMPORTED | Verify 是唯一下一动作 |
| `screenshots/p2-g-33-migration-verified-current-dark.png` | `593d14ac2c7` | 点击验证本批 | 一项正式投影验证 PASS，仍未启用 V2，可准备安全撤销 | Activate 未开放 |
| `screenshots/p2-g-34-migration-verified-reload-current-dark.png` | `593d14ac2c7` | 完整退出并重启 Logseq 后重新进入迁移 | Bundle/session 恢复点引用释放；VERIFIED batch 与 Undo 从正式 ledger 重建 | 需滚动查看完整 batch 卡 |
| `screenshots/p2-g-35-migration-undo-confirm-current-dark.png` | `593d14ac2c7` | 点击准备安全撤销 | HIGH Review 明确后续修改/引用保护，并保留 Review/Validation/Audit | 未确认时零请求 |
| `screenshots/p2-g-36-migration-undone-current-dark.png` | `593d14ac2c7` | 勾选并确认撤销本批 | 正式对象 `5→4`，run 回 PREVIEWED，batch UNDONE，Pending 0 | 计划与证据保留 |
| `screenshots/p2-g-37-migration-undone-reload-current-dark.png` | `593d14ac2c7` | 第二次完整退出并重启 Logseq | PREVIEWED 计划、UNDONE batch 和“准备下一批”跨 restart 可读；Runtime/Store/Graph READY | Activate、失败/中断恢复仍 OPEN |
| `screenshots/p2-g-38-migration-baseline-reuse-current-dark.png` | `f42b62d` | Undo 后重做，重新选择同一脱敏 Bundle 与一项待导入范围 | 主动作明确为“校验本计划恢复基线”；复用原快照而不是创建第二恢复点，正式变化 0 | Dark 宿主内插件表面仍偏亮 |
| `screenshots/p2-g-39-migration-activation-review-current-dark.png` | `f42b62d` | 导入并验证后点击“准备启用 V2” | 独立 HIGH 交接明确 V1 只读、不建立双写；尚未改变 run | failure/interruption Gate OPEN |
| `screenshots/p2-g-40-migration-activation-confirmation-required-current-dark.png` | `f42b62d` | 未勾选 V1 只读交接确认直接提交 | 用户层明确零变化；SQLite run 仍为 VERIFIED | 不保存内部 run/snapshot identity |
| `screenshots/p2-g-41-migration-activated-current-dark.png` | `f42b62d` | 勾选并确认启用 | V2 已启用，V1 只作为只读历史与恢复证据；run ACTIVATED、objects 5、Pending 0 | 旧 UNDONE 与新 VERIFIED batch 保留 |
| `screenshots/p2-g-43-migration-readonly-archive-current-dark.png` | `2beb1b5` | 完整退出并重启 Logseq，打开已完成迁移 | 一次性迁移只保留只读交接台账与 Backup/Restore 路由；无新 scan/Review/Import/Undo/Activate | Migration failure/interruption 与 Light/窄栏仍 OPEN |
| `screenshots/p2-g-44-restore-failure-review-current-dark.png` | `0c4526d` | 选择校验通过的旧快照并勾选独立 Restore 确认 | 前台明确 SQLite 会替换、正文不改写、当前正式状态保存为恢复点并自动重启 | 随后仅对隔离活动数据库注入文件级写入拒绝 |
| `screenshots/p2-g-45-restore-rollback-recovery-current-dark.png` | `0c4526d` | 真实 atomic activation 失败后回到 Task Copilot | 只显示一次“恢复未完成”；原正式状态已回滚并重新可用，Restore 前恢复点保留 | 该 commit 的手工 Recovery 仍 OPEN；现由 `p2-g-55`～`59` 替代 |
| `screenshots/p2-g-46-restore-rollback-reload-health-current-dark.png` | `0c4526d` | Plugin Manager reload 后打开系统状态 | 正式状态与 Graph 已连接，日常能力可用，数据安全，无需操作 | 后续互锁/手工恢复自动链无新 UI 证据；双重失败 Desktop、Light/窄栏仍 OPEN |
| `screenshots/p2-g-55-restore-no-reload-manual-recovery-current-fe0b590.jpeg` | `fe0b590034ac` | 专用故障 Launcher 真实触发候选激活失败且自动回滚也失败；未 reload Plugin | 用户状态直接显示“需要人工恢复”和唯一“准备恢复”；切换前恢复点保留，正文仍可编辑 | 关闭旧实现依赖 reload 才出现恢复控件的缺口 |
| `screenshots/p2-g-56-restore-final-confirmation-current-fe0b590.jpeg` | `fe0b590034ac` | 点击准备恢复，进入独立 HIGH 最终确认 | 明确正文不改写、执行时重新核验、只有完整性检查通过才恢复；未勾选时不执行 | 复用既有确认合同，没有新增恢复状态 |
| `screenshots/p2-g-57-restore-manual-recovery-success-current-fe0b590.jpeg` | `fe0b590034ac` | 勾选并执行人工恢复 | 活动库 `6→7`，Doctor PASS、互锁清除，界面立即回到“可以正常使用” | 两个 `.previous-*` 测试安全副本保留，不是活动 authority |
| `screenshots/p2-g-58-restore-normal-runtime-final-health-current-fe0b590.jpeg` | `fe0b590034ac` | 停止故障 Launcher、恢复原 descriptor、bootstrap 正常 LaunchAgent 并 reload Plugin | 系统状态 READY，正式状态与当前 Graph 已连接，无需用户操作 | 正常 Launcher 为 loopback `19673`；token 未进入截图 |
| `screenshots/p2-g-59-restore-final-diagnostics-current-fe0b590.jpeg` | `fe0b590034ac` | 在最终健康状态主动展开技术诊断 | exact build `fe0b590034ac`、Local Service formal writes true、`0/0/0`、explicit sync clean | 技术信息默认折叠；Migration failure/interruption 和 Light/窄栏仍 OPEN |
| `screenshots/p2-g-60-migration-high-confirmation-current-f17f46a.jpeg` | repo `f17f46a` / Plugin `757fac87d511` | 专用 4 对象数据库克隆、同一脱敏 Bundle 与原恢复基线校验后进入 HIGH Import | 只显示本批 1 项、恢复点通过和一次最终确认；未勾选不导入 | 下一步注入 Import 写后响应丢失 |
| `screenshots/p2-g-61-migration-response-lost-ledger-authority-current-f17f46a.jpeg` | repo `f17f46a` / Plugin `757fac87d511` | SQLite 原子 Import 完成后、HTTP 响应前故障 | 主结论“先以台账为准”；同屏 ledger 已显示已导入待验证和唯一 Verify，不静默重试 | objects=5，run/batch=`IMPORTING/IMPORTED`，Pending/Recovery=0/0 |
| `screenshots/p2-g-62-migration-reload-ledger-rebuilt-current-f17f46a.jpeg` | repo `f17f46a` / Plugin `757fac87d511` | Plugin Manager reload 后重新进入迁移 | session-only 不确定态已清除；正式 ledger 重建同一 IMPORTED batch 和 Verify | 证明 reload 不依赖内存恢复状态 |
| `screenshots/p2-g-63-migration-verified-current-f17f46a.jpeg` | repo `f17f46a` / Plugin `757fac87d511` | 点击 Verify | 显示本批验证通过、尚未启用，并只给出安全撤销/启用动作 | run/batch 均 VERIFIED，objects=5 |
| `screenshots/p2-g-64-migration-safe-undo-current-f17f46a.jpeg` | repo `f17f46a` / Plugin `757fac87d511` | 既有 HIGH Undo 最终确认后撤销测试批次 | 明确正式对象回到导入前范围，审阅和审计证据保留 | objects=4，run/batch=`PREVIEWED/UNDONE`，Pending/Recovery=0/0 |
| `screenshots/p2-g-65-migration-normal-runtime-restored-current-f17f46a.jpeg` | repo `f17f46a` / Plugin `757fac87d511` | 停止故障 Launcher、恢复原 descriptor/LaunchAgent 并 reload Plugin | 用户系统状态 READY、当前无受影响能力、无需操作 | 原 authority 7 对象，loopback `19673`；故障 `19674` 已停止 |
| `screenshots/p2-g-migration-verify-activate-retry-current-dark-e236159.png` | `e2361599fbc9` | 隔离库完成 Verify failure→同 ledger retry→Activate failure→同 ledger retry；重新构建并 reload 当前 Plugin | “一次性迁移已完成 · 只读历史”“V2 已启用”；旧 UNDONE 与新 VERIFIED 批次可读，无 scan/Review/Import/Undo/Activate | Logseq 0.10.15、File Graph、Dark、1000×720；中间故障动作使用 migration 路径未变化的 `2148f42b00cb` artifact，CURRENT 只记录精确当前构建 reload；Light host Gate 仍 OPEN |
| `screenshots/p2-g-migration-final-current-narrow-720-7fcdcf5.png` | repo `7fcdcf5` / Plugin `e2361599fbc9` | 同一 ACTIVATED ledger 在当前构建完整 Reload 后把 Logseq 窗口缩至 722×720 | 主结论、计划摘要、旧 UNDONE 与新 VERIFIED batch、折叠安全边界和关闭动作均可读，无横向溢出 | `CURRENT`；窄栏子 Gate DONE，Light host Gate OPEN |
| `screenshots/p2-g-light-mode-selected-host-remains-dark-bounded-7fcdcf5.png` | repo `7fcdcf5` / Logseq `0.10.15` | File Graph 设置页选择“浅色模式”，随后完整 View→Reload | 设置页显示浅色模式已选中；加载页短暂为浅色，但 Graph 就绪后仍恢复深色宿主 | `CURRENT_BOUNDED_HOST_ISSUE`；不是 Plugin Light PASS，不用加载页冒充当前 UI |
| `screenshots/p2-g-light-mode-full-restart-remains-dark-bounded-1364235.png` | repo `1364235` / Logseq `0.10.15` | 浅色模式已选中后完整 quit；旧 Service 按 lease 停止，再由 Computer Use 重新打开 Logseq | File Graph 就绪后仍为深色宿主；同一 Launcher 启动新 Service，Task Copilot 自动重连 | `CURRENT_BOUNDED_HOST_ISSUE`；完整生命周期仍不能证明 Light，Light Gate 保持 OPEN |
| `screenshots/ui-theme-dark-current-d7526f4.png` | `d7526f43e798` | File Graph custom.css 强制深色、官方信号仍为浅色；在 Task Copilot 配置中明确选择深色，完整 reload 后再次打开 | 插件壳层、导航、提示、卡片、按钮和滚动区与深色宿主一致；主结论和每卡主动作清晰 | `CURRENT`；1001×720；只改变插件显示，不写正式状态 |
| `screenshots/ui-theme-dark-current-narrow-d7526f4.png` | `d7526f43e798` | 同一 reload 后会话把 Logseq 收窄到 723×720 | 主导航、筛选、主结论、卡片和唯一主动作仍可见；无横向溢出 | `CURRENT`；接管旧白底截图的主题表达权，Logseq 自身 Light bounded host issue 仍 OPEN |

## HISTORICAL

以下文件都是真实 Logseq/DeepSeek 运行证据，但不代表当前对应场景的精确构建：

| 文件 | 状态 | 构建状态 | 仍可证明 | 被替代原因 |
|---|---|---|---|---|
| `p1-g-01-context-recovery-loading-current-dark.png` | HISTORICAL | `1375f1b`/`4e02226` 前后运行 build | 显式生成超过 5 秒时 loading 可见，确定性基线保留 | 不是最终 `894d14f` 精确截图；loading 自动合同仍有效 |
| `p1-g-02-context-recovery-provider-result-current-dark.png` | HISTORICAL | `1375f1b` 前的真实 Provider build | 首轮模型曾把已发生的 Closure/Undo 列为未知 | `4e02226` 将最近正式 Commit 纳入 Context Package |
| `p1-g-03-context-recovery-reload-cleared-current-dark.png` | HISTORICAL | `4e02226` 前后运行 build | Plugin reload 清除 session-only 草稿和 disposition，确定性重入卡保留 | 未在最终 `894d14f` 精确构建重复截图 |
| `p1-g-04-context-recovery-grounded-provider-current-dark.png` | HISTORICAL | `4e02226` | 最近正式变化已接地且 forward/inverse 折叠正确 | 模型判断仍为英文，后续中文合同替代 |
| `p1-g-05-context-recovery-language-validated-provider-current-dark.png` | SUPERSEDED | `2cf8bf2` | 真实中文输出与 `HELPFUL` disposition；一次 session `GENERATED=1 / HELPFUL=1` | 自动语言 repair/弱语言检查已由 `894d14f` 删除并收紧；只作为质量对照 |
| `p1-g-06-context-recovery-final-provider-current-dark.png` | SUPERSEDED | `894d14f` | 真实 Provider 结果正确接地，但把当前草稿评价误列为业务未知 | `recover-context@1.3.0` 与 `p1-g-07` 已替代 |
| `p1-g-08-context-recovery-skill-1-3-current-light-before-fix.png` | HISTORICAL | `653875a` 构建前的本轮运行 | 真实 Logseq Light 时 Plugin 仍显示 dark surface | 同一提交中的宿主 theme sync 修复后由 CURRENT `p1-g-08` 替代 |
| `p0-j-01-command-palette-duplicate-historical-dark.png` | HISTORICAL | `e8db32f1af6d` 连续 Plugin reload 会话 | Logseq 0.10.15 reload 会话曾出现重复 palette 行 | 完整退出/重启恢复单组；`p0-j-02` 是冷启动当前权威，不新增持久去重状态 |
| `p0-h-13-graph-switch-old-authority-leak-historical-dark.png` | HISTORICAL | `ca50304` 前的真实 Graph switch build | 新隔离 Graph 已显示，但旧 Graph 的 Project 卡与“Copilot 可用”仍短暂留在前台 | `ca50304` 把旧 key 清除和受限 UI 刷新移到 lease release 之前；`p0-h-16` 替代 |
| `p2-g-47-restore-recovery-controlled-entry-current-dark.png`～`p2-g-50-restore-recovery-restart-health-current-dark.png` | HISTORICAL | `16bde9ad88a5` | 受控 `RECOVERY_REQUIRED` 的用户状态、HIGH Review、恢复、重连与完整 restart | 不是由真实连续双重故障产生；当前恢复实现由 `p2-g-55`～`59` 替代 |
| `p2-g-51-rebind-success-stale-reconciliation-historical-59c2c24.jpeg` | HISTORICAL | `59c2c24` | Rebind 正式成功后旧 reconciliation 风险仍黏住用户状态 | `da080d2` 让已修复 Anchor 风险可清除 |
| `p2-g-52-rebind-reload-ready-current-da080d2.jpeg` | SUPERSEDED | `da080d2` | 修复后 reload 的系统 READY 和 `0/0/0` | 后续当前 exact build 已为 `fe0b590`；Rebind 事实仍由专项日志保留 |
| `p2-g-53-restore-double-failure-manual-recovery-current-da080d2.jpeg` | HISTORICAL | `da080d2` | 真实连续双重故障已进入“需要人工恢复”，但下方没有恢复控件 | `fe0b590` 修复 failure catch 的 Launcher rediscovery；`p2-g-55` 替代 |
| `p2-g-54-restore-recovery-diagnostics-current-da080d2.jpeg` | HISTORICAL | `da080d2` | 折叠诊断中的 `V2_RESTORE_ROLLBACK_FAILED` 与正式写受限 | 当前用户链由 `p2-g-55`～`59` 替代，错误码只留技术诊断 |
| `p0-h-14-graph-switch-restricted-current-dark.png` | SUPERSEDED | `ca50304` 前的真实 Graph switch build | 旧实现最终仍会安全进入 Graph mismatch | 只证明延迟收敛，不能证明首帧无旧 authority；`p0-h-16`/`17` 替代 |
| `p0-h-15-graph-switch-return-ready-current-dark.png` | SUPERSEDED | `ca50304` 前的真实 Graph switch build | 旧实现切回原 Graph 后可恢复 Project | `p0-h-18` 使用精确修复提交并记录恢复时延与 mapping 不变 |
| `p2-g-42-migration-activated-reload-current-dark.png` | SUPERSEDED | `f42b62d` | ACTIVATED ledger 跨完整 restart 保留 | 完成态仍显示新 Bundle scan；`p2-g-43` 已收敛为只读交接 |
| `p2-c-01-project-creation-entry-dark.png` | SUPERSEDED | `c9c29b7` | 三来源入口曾真实可达 | `p2-c-11` 使用当前提交重拍 |
| `p2-c-02-blank-grill-first-question-dark.png` | HISTORICAL | `c9c29b7` + 待提交 Validator 修复 | DeepSeek 中文单问通过 | 拍摄时源码并非可引用 commit |
| `p2-c-03-blank-grill-answer-dark.png` | HISTORICAL | 同上 | 回答进入 session，不写正式状态 | 同上 |
| `p2-c-04-blank-grill-ready-dark.png` | HISTORICAL | 同上 | 多轮后机器 readiness 到达 Preview | 同上 |
| `p2-c-05-final-reading-preview-dark.png` | HISTORICAL | 同上 | Blank Preview 合法、无来源材料、关系待 Review | 同上 |
| `p2-c-06-project-creation-review-dark.png` | HISTORICAL | 同上 | HIGH Proposal Review | 同上 |
| `p2-c-07-accepted-not-applied-dark.png` | HISTORICAL | 同上 | 接受不等于应用 | 同上 |
| `p2-c-08-project-created-after-reload-dark.png` | SUPERSEDED | `0b4ffc622fcc` | 同一恢复事务正式创建并跨 reload 可读 | 后续真实 Undo 又发现并修复 action/deletePage 契约 |
| `p2-c-09-project-creation-undo-complete-dark.png` | SUPERSEDED | `d81b1a84f165` | Blank 专用 Undo 完成 | `p2-c-19` 使用最终 identity 漂移修复重拍 |
| `p2-c-10-post-undo-reload-healthy-dark.png` | SUPERSEDED | `d81b1a84f165` | Blank Undo 后 reload 健康 | `p2-c-20` 使用最终构建与完整 restart 重拍 |
| `p2-c-11-project-creation-entry-current-dark.png` | HISTORICAL | `d81b1a84f165` | Grill-first 入口、旧直建 bypass 不可见 | 当前构建未重拍入口 |
| `p2-c-12-page-readiness-current-dark.png` | HISTORICAL | `8658643` 前后的 Page Gate 运行 build | Page 七维 readiness 由机器控制 | 早于最终 identity/diagnostics 修复 |
| `p2-c-13-page-preview-current-dark.png` | HISTORICAL | 同上 | 真实 Page Preview 逐条保留三段来源 | 同上 |
| `p2-c-14-page-high-review-current-dark.png` | HISTORICAL | 同上 | 单组 HIGH Review 与零正式影响 | 同上 |
| `p2-c-15-page-project-created-current-dark.png` | HISTORICAL | 同上 | Project/Anchor/受控 Page 正式创建 | 同上 |
| `p2-c-16-page-reload-restricted-dark.png` | HISTORICAL | 同上 | raw reload 曾留下受限诊断现场 | 最终构建已修复 mounted diagnostics refresh |
| `p2-c-17-page-restart-recovered-current-dark.png` | HISTORICAL | 同上 | 完整 restart 后 Service 恢复 | 随后发现 runtime UUID 漂移会阻断旧 Undo |
| `p2-c-25-mini-evolution-identity-leak-historical-dark.png` | HISTORICAL | `7d4f5e4` 前的真实 MiniProject Grill build | Validator 曾让 object/root identity 和未授权替代方案进入前台 | identity 现在只能留在机器 Context，不得进入问题或建议 |
| `p2-c-26-mini-evolution-safe-grill-current-dark.png` | SUPERSEDED | `7d4f5e4` 前的真实修复 build | 第一轮 identity 修复后能安全继续 Grill | 后续又发现 fact key 与 closure 对象问题，已由 `p2-c-29` 替代 |
| `p2-c-27-mini-evolution-fact-key-leak-historical-dark.png` | HISTORICAL | `7d4f5e4` 前的真实 MiniProject Grill build | 模型曾复制 `answer-*` / `source-*` 机器键 | frontstage Validator 已拒绝机器 fact key |
| `p2-c-28-mini-evolution-wrong-closure-target-historical-dark.png` | HISTORICAL | `7d4f5e4` 前的真实 MiniProject Grill build | 模型曾把 Project 内部闭环误解为关闭/归档来源 MiniProject | Skill 1.5.0 明确 closure 对象是新 Project 的运行/复盘闭环 |
| `p2-c-36-mini-evolution-undo-complete-current-dark.png` | SUPERSEDED | `7d4f5e4721f5` | Project/Anchor/专用空 Page 的 inverse Commit 当时已安全完成 | 完成后误回 Journal；`p2-c-38` 已证明最新构建返回原 MiniProject 根 Block |
| `p2-c-37-mini-evolution-undo-reload-healthy-current-dark.png` | SUPERSEDED | `7d4f5e4721f5` | 当时 reload 后 `0/0/0` | `p2-c-39` 使用含来源返回修复的 `7a7492a407ed` 重拍 |
| `p2-d-01-project-impact-router-current-dark.png` | SUPERSEDED | `419c9e6de950` | 16 类影响路由曾真实可达 | `p2-d-06` 使用 MEDIUM 链和 Copilot 状态修复后的当前提交重拍 |
| `p2-d-02-project-narration-review-current-dark.png` | HISTORICAL | `eb1ff07424bd` | 真实 DeepSeek 草稿通过 Validator 后进入单组 MEDIUM Review，正式状态仍未改变 | 顶部仍使用误导的旧 V1 `Agent disabled` 文案；`ae23955` 已修正 |
| `p2-d-03-project-narration-applied-current-dark.png` | HISTORICAL | `eb1ff07424bd` | Commit 后摘要可读，current focuses 与结构字段不变 | 当时尚未发现最近修改把 narration 错路由到通用 Block Undo |
| `p2-d-04-project-narration-undo-current-dark.png` | SUPERSEDED | `f6d0429` | 专用 Project interface inverse Commit 已恢复原摘要 | `p2-d-05` 使用 Copilot 状态修复后的提交并包含 reload 后最近修改证据 |
| `p2-e-05-closure-user-confirmation-dark-994x701.jpg` | HISTORICAL | `1ec63ac` | 确定性证据后只收集用户必须判断的 Closure 事实 | 后续 Undo 构建为 `06907f3`，未重拍同一步 |
| `p2-e-06-closure-user-judgments-filled-dark-994x701.jpg` | HISTORICAL | `1ec63ac` | 实际结果、逐 Objective disposition、遗留、Decision 与未来重入已在前台确认 | 同上 |
| `p2-e-07-closure-real-provider-loading-dark-994x701.jpg` | HISTORICAL | `1ec63ac` | 真实 DeepSeek loading 时确定性基线和用户输入仍保留 | 同上 |
| `p2-e-08-closure-real-provider-high-review-dark-994x701.jpg` | HISTORICAL | `1ec63ac` | 真实 Provider 结果通过 Validator 后进入单组 HIGH Review，仍未正式写入 | 同上 |
| `p2-e-09-closure-commit-completed-no-undo-dark-994x701.jpg` | SUPERSEDED | `1ec63ac` | 真实 Commit 已完成，同时暴露完成态没有专用 Undo 的产品缺陷 | `06907f3` 已补齐并由 `p2-e-10`～`p2-e-12` 替代 |
| `p2-g-01-anchor-missing-dark-994x700.jpg` | SUPERSEDED | `46b45c3f11e1` | 真实 missing Anchor 用户状态与阅读卡 | `p2-g-07` 使用受控捕获构建替代 |
| `p2-g-02-rebind-reading-preview-dark-994x700.jpg` | SUPERSEDED | `46b45c3f11e1` | identity-free Preview 与候选翻译真实可达 | `p2-g-09` 使用当前构建与无竞态目标替代 |
| `p2-g-03-rebind-confirmed-dark-994x700.jpg` | HISTORICAL | `46b45c3f11e1` | 单独确认和候选选择未泄露机器身份 | 同一新 Block 已被普通同步先物化，随后安全拒绝 |
| `p2-g-04-rebind-target-already-owned-rejected-dark-994x700.jpg` | HISTORICAL | `46b45c3f11e1` | Service 对已有正式连接目标零写入拒绝 | 当前 `344c705` 已把同类拒绝提前到确认前，并加入捕获窗口 |
| `p2-g-05-rebind-success-dark-994x700.jpg` | SUPERSEDED | `46b45c3f11e1` | 使用既有未物化测试 Block 的正式 Rebind 成功 | `p2-g-10` 证明用户可新建替换 Block 且无竞态 |
| `p2-g-06-rebind-reload-clean-dark-994x700.jpg` | SUPERSEDED | `46b45c3f11e1` | 旧链 reload 后系统健康 | `p2-g-11`/`12` 使用当前构建替代 |

仓库其他目录中的既有截图也继续按历史证据处理，除非索引明确登记为 `CURRENT`。

## 新截图登记模板

| 字段 | 值 |
|---|---|
| 文件 | `screenshots/<scene>-<step>-<timestamp>.png` |
| 状态 | CURRENT / HISTORICAL / SUPERSEDED / PROTOTYPE |
| branch / commit | |
| 插件构建时间 | |
| Service / Launcher 版本 | |
| Logseq / Graph | |
| 主题 / 窗口 / 宿主位置 | |
| 前置条件 | |
| 用户动作 | |
| 系统结果 | |
| 下一步 | |
| 已知问题 | |
| 替代的旧证据 | |
