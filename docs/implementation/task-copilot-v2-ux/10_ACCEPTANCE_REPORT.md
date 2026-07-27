# 交互优化验收报告

> 当前状态：`IN_PROGRESS`
> 本文件只登记已经有对应代码、自动化和适用运行证据的结果。设计或计划不会标成完成。
> `base_v2_status=IMPLEMENTATION_COMPLETE` 与 `ux_productization_goal=IN_PROGRESS` 是不同层级；
> `overall_goal=IN_PROGRESS`。

## 1. 阶段结论

| 阶段 | 状态 | 自动化 | Desktop | 结论 |
|---|---|---|---|---|
| Baseline | DONE | 根级 PASS | 复用 3 张当前 UX 基线截图，不代表新实现 | 可开始 P0 |
| P0 | IN_PROGRESS_DESKTOP_GATES | P0-A/P0-B/P0-C/P0-D/P0-E/P0-F/P0-G/P0-H/P0-I + P0-J/P0-K/普通 Block route automated PASS | Focus/Condition/LOW apply/Page route/four-nav/toolbar/recent changes/system status；P0-H hidden reload/quit/no-arg reinstall/Graph switch fail-closed/return PASS；P0-J palette/Slash 代表链/custom binding PASS；中文 IME/受限视觉与 P0-K host Gate OPEN | 不得宣布 P0 完成 |
| P1 | IN_PROGRESS_P1G_DONE_OTHER_P1_PARTIAL | P1-A/B runtime shadow + P1-C dynamic Now count-only runtime + P1-D status consumers + P1-E default-off Block marker prototype + P1-F Project reentry/Page Head + P1-G unified UX/真实 Provider + P1-H session disposition/噪声汇总 | P1-G Project workspace Context Recovery 的内容/error/rejection/stale/feedback/reload/Dark/Light/窄栏代表链 DONE；File Graph Page Head bounded、DB Graph OPEN；Block marker 与 Attention 前台仍 OPEN；跨会话 dashboard 未决 | P1-G 完成不等于 P1 完成；不得提前开放 Signal 或 marker 默认值 |
| P2 | IN_PROGRESS_P2_AB_DONE_P2C_ALL_SOURCES_DONE_P2D_LIGHT_CONDITION_MEDIUM_HEAVY_CORE_DONE_P2E_MAIN_CHAIN_COMMIT_RESUME_PROVIDER_ERROR_AND_STALE_DESKTOP_DONE_RECOVERY_GATE_OPEN_P2F_SHADOW_PROVIDER_REPEAT_PASS_P2G_MIGRATION_RESPONSE_LOSS_RECOVERY_DESKTOP_DONE_RESTORE_DOUBLE_FAILURE_MANUAL_RECOVERY_DESKTOP_DONE | P2-A/B、P2-C/D/E 核心链、P2-F shadow/provider、P2-G Rebind + Restore normal/failure rollback/real double-failure manual recovery + Migration normal/response-loss PASS | P2-C/D/E 正常主链有 Desktop；P2-E receipt-backed Commit 中断续跑/Undo、Provider error 与 generation stale 零 Closure 写入 DONE；P2-G Restore 真实双失败人工恢复、Migration Activation 正常链及写后响应丢失→ledger reload→Verify→Undo DONE | P2-D/E remaining；P2-E 真正 RECOVERY_REQUIRED；P2-F frontstage；P2-G Rebind guidance、Migration Verify/Activate failure 与视觉 Gate OPEN |
| Final Release | NOT_STARTED | — | — | — |

## 2. P0 验收

- [x] 主导航只有现在、待我确认、项目、更多；Project/Objects 与维护能力均有二级可达证据
- [ ] Block/Page 就近入口；Block Focus/Condition、普通 Block 精确 UUID 内容路由与 Page
  普通/Project/Journal 路由已完成自动 Gate，普通 Block、Query/引用现场仍待 Desktop 验证
- [ ] 高频动作 1—2 个明确决定；
- [x] 暂时做不了统一入口；三种意图、最小字段和版本保护 Undo 已通过
- [x] 低风险一次接受并应用；LOW 单组单 Block CREATE/REWRITE 自动覆盖，真实 Desktop REWRITE 通过
- [ ] accepted-not-applied 不静默；
- [ ] 成功/失败/PENDING/Recovery 清楚；
- [x] 即时 Undo 与最近修改可发现；同一 Commit identity、跨 reload 长期入口与真实逆向
  Commit/Graph 恢复已验证
- [x] 工具栏只表示需要介入；安静态、连接风险数字与诊断路由已 Desktop 验证，
  `RECOVERY_REQUIRED ↻` 仅自动验证
- [x] Service 日常无需终端；真实 LaunchAgent 安装、READY、更新、租约启动/结束与 crash recovery 通过
- [x] 隐藏 Plugin reload 不要求先打开面板；non-blocking bootstrap 与宿主 ready 事件自动取得
  精确 Graph identity，新 lease 在 25 秒观察窗内保持，首次打开直接 READY
- [x] Logseq 退出安全结束 owned Service；自动 unload/TTL/owner-PID 与真实 Desktop quit 后
  租约窗口内 owned Service 结束、Launcher 保留均通过
- [ ] 中文命令与快捷动作；真实 Desktop 已完成冷启动 palette 单组、四条 Slash 可发现、
  `[任务] ` 代表插入和 custom binding 配置/触发/清理；原生中文 IME、受限态、Light/窄栏开放
- [x] 用户层系统状态；READY/协议/Graph/Pending/Recovery/Anchor/正文核对自动覆盖，
  真实 Desktop 注意状态与 Service unavailable 受限状态通过，技术诊断默认折叠；
- [ ] 完成后回业务现场；session-only Block/Page origin route 自动 Gate PASS，真实
  main Page 入口与返回同一 Page 已 PASS；right-sidebar 无 Plugin Page item 按宿主限制安全隐藏；
  Query/reference、来源变化与成功/失败/Undo 返回仍开放；
- [ ] Light/Dark/窄栏/Query/引用；
- [ ] 自动与 Desktop 证据齐全。

## 3. P1 验收

- [ ] attention signal 派生且可失效；
- [ ] 影子模式通过；
- [ ] 规则决定强显现；
- [ ] 一对象一主问题；
- [ ] “现在”不显示所有 OPEN；
- [ ] 状态叙述先结论；
- [ ] 信息不足时承认不知道；
- [ ] 下一动作资格有效；
- [ ] Block 标记不干扰阅读/编辑；
- [ ] Project/Task 重入有效；
- [ ] LLM 输出事实/推断/未知分离；机器 fact/action/provenance/risk/review 契约、
  server-owned Project recovery、Plugin 分区显示/只读动作重验自动 PASS；真实
  LaunchAgent→Context Package→DeepSeek→Validator 已 PASS 且零正式写入，Desktop OPEN；
- [x] 默认日志不含完整正文；P1-H 专用事件、Plugin StructuredLogger/Runtime Diagnostics
  与 Service daemon output 已用 strict allowlist 排除正文、Prompt、原始响应、路径与异常
  message/stack/cause；CLI 为主动前台反馈，live/golden 为默认关闭研究 Gate；
- [x] session disposition 可撤回且不扩大权限；五种反馈、版本汇总、opaque handle 脱敏、
  `DO_NOT_REPEAT` Provider 前抑制与零正式写入已通过自动及真实 DeepSeek/Service Gate；
- [ ] 噪声指标可接受。

## 4. P2 验收

- [x] MiniProject Grill Me 当前纵向 Slice 非模板化；真实 DeepSeek 四轮按 boundary/outcome/
  completion/material disposition 自适应收敛，Validator rejection 可安全重试，5/5 canonical
  材料进入最终阅读预览并完成正式链；跨场景质量继续纳入后续验收；
- [x] Project 所有创建入口经过自适应 Grill Me；Blank/Page/MiniProject creation subject、
  source evidence 边界及 internal closure/current interface readiness、Preview 与
  server-owned 单组 HIGH Proposal/Review 自动合同 PASS；Blank 真实 Provider turn/preview
  和完整正式 Desktop 链 PASS；Page preserve/dedicated 真实 Provider 与正式 Desktop 链
  bounded PASS；Page reuse 也完成真实 Provider 与正式 Desktop 链；MiniProject 真实
  Provider、来源关系、HIGH Review/Commit/reload/Undo/来源返回均已闭环；
- [x] 原位重构当前纵向 Slice 零丢失；原 UUID/正文守恒、0 delete、Undo 后父级与顺序恢复；
- [x] 原位结构宿主能力有界通过；同一会话内 custom UUID、语义正文与 A/B/C 顺序经过
  move-first-child/restore-after-sibling 保持，Page runtime UUID 跨 reload 限制已明确转入 Rebind；
- [x] 预览为最终阅读效果；identity property 已从 canonical 用户材料剥离；
- [x] 当前纵向 Slice 一次 Commit + Undo；8-step forward/inverse、真实 divergence Recovery、
  reload、recent-changes 折叠和返回根 Block Desktop PASS；
- [ ] Closure 从证据起草；只读 evidence model、Service route、Plugin preview 及真实
  Desktop reload/recompute 已覆盖正式 Project interface、直接 Ownership、unknown 和用户
  判断边界，并证明零 Proposal/Commit；Provider preflight/exact scope/one HIGH group 已自动
  PASS，脱敏 real Flash model-contract 也通过 machine grounding；公共 route 已支持版本
  绑定的 session-only 用户判断并自动生成 PENDING/HIGH Proposal，同时保持零 Commit/正式写入；
  更新后的真实 Flash Gate 不再伪造 Decision Ownership，用户确认内容逐字守恒。Plugin 用户
  判断入口、busy/error/stale 保留输入和进入既有 HIGH Review 已自动覆盖；正常主链已用
  真实 DeepSeek 完成用户判断、loading、HIGH Review、正式 Commit、专用 Undo、reload 与
  Project 重入，回读 `OPEN v13`、Closure absent、forward UNDONE、inverse COMPLETED。
  `6f7f9a857be9` 又完成 receipt-backed post-domain 中断：HTTP 500 后同一 Commit
  `PENDING`，reload 后只继续原 Commit，完成后 Project 仍为 v20；专用 Undo 与再次 reload
  回到 `OPEN v21`、Closure absent、forward UNDONE、inverse COMPLETED、异常 Commit
  `0/0/0`。`7727770` 又完成 Provider error 保留判断/零写入/单一重试 Desktop Gate；
  `662246a` 随后完成真实 DeepSeek 延迟 generation stale、Condition Undo 与 reload 健康
  Gate。真正 `RECOVERY_REQUIRED` 仍未闭环，因此本项暂不勾选；
- [ ] 跨对象候选有证据和数量上限；结构化 2–16 evidence、2–8 subject、每轮 8 条上限与
  exact scope/provenance 已自动 PASS；首批真实 DeepSeek 3 observation + 2 abstention 质量门
  三轮累计 `15/15` case-runs PASS；semantic Context fingerprint 已证明时间刷新稳定、
  语义/evidence 变化 stale，但尚无真实业务 Context、Candidate、反馈或 Desktop 证据；
- [ ] LLM 不改变 Ownership/Focus；P2-F shadow 合同已拒绝 operation/自由文本并强制
  `INFERENCE/SHADOW/NONE`；Provider 不能生成 confidence，Association/Ownership 由机器
  固定 LOW，其他当前 kind 固定 MEDIUM，但用户确认链尚未建立；
- [x] Recovery 继续原 Commit；Project Closure receipt-backed 中断在 Desktop 上保持同一
  `PENDING` Commit，reload 后从原 Review 续跑，不重复 Domain 写入、不创建平行 Commit；
- [x] Rebind 常规主链不展示 UUID 列表；ready preview/success HTML 与 select value 已
  identity-free，5 分钟有界捕获窗口解决自动 materialization 竞态；既有正式 Rebind 安全链
  保持。当前 commit `344c705ec446` 已真实 Desktop 完成 capture→Preview→Submit→reload，
  Service 回读旧 Anchor replaced、新 Anchor active，正式对象没有重复创建；
- [ ] Rebind 纠错/Undo 指引不复活 missing/conflict 旧 Anchor：自动 Gate 已把选错正文路由
  到新一轮受控 Rebind，把整库回退路由到 Backup/Restore，并明确不删除事项或旧历史；
  focused `10/10` PASS，最新成功态 Desktop 仍 OPEN；
- [ ] Restore/Migration 复用唯一安全链；Restore 已自动证明服务端有界目录、session token、
  再校验、单独确认、PENDING/reconciliation preflight、既有原子 Restore/Service 自停/
  Launcher 重连接线，Plugin `288/288` PASS；`6ae8f2fcebd0` 已真实 Desktop 证明未确认
  零请求、恢复点、owned Service 重启、reload 目录 `2→3`、READY/`0/0/0` 和无陈旧错误；
  同一 Task 又完成 `ACTIONABLE v5↔PAUSED v6` 的旧快照/自动恢复点正反往返并最终恢复
  原基线。Migration ledger 已把内部状态翻译为用户阶段并隐藏 run/hash/backup identity；
  受控文件选择与 session-only `/migration/scan` 也已自动 PASS，前台只见五类计数。
  `15b976d28ec3` 已真实 Desktop 证明文件选择、2 项分类、放弃、reload 清空、非法 JSON
  重试及最终 READY/`0/0/0`；其后 `c660f2d` 又完成逐项有界阅读、两项决定、
  正式 Validator、PREVIEWED 计划创建与 reload。其后 `593d14a` 又完成同材料/计划/scope
  只读重验、1～50 项范围、恢复点 PASS、独立 HIGH Import、Verify、完整 Logseq restart、
  受保护 HIGH Undo 与第二次 restart。SQLite formal objects `4→5→4`、run
  `PREVIEWED→IMPORTING→VERIFIED→PREVIEWED`、batch
  `IMPORTED→VERIFIED→UNDONE`、Pending 始终 0；完整正文与 run/batch/object/backup
  identity/hash/key 未进入 UI/DOM/日志。恢复点/Import/Verify/Undo 正常主链 DONE。
  `f42b62d` 又真实完成计划原恢复基线复用、Import、Verify、独立 HIGH Activation、缺确认
  零写入与完整 Logseq restart；run=`ACTIVATED`、objects=5、Pending 0，旧 UNDONE 和新
  VERIFIED batch 保留，reload 后 V1 只读且无 Import/Undo/Activate。Activation 正常主链
  DONE；`2beb1b5` 又在完整 restart 后证明 ACTIVATED 页面只保留只读交接台账和
  Backup/Restore 路由，新 scan/Review/Import/Undo/Activate 全部退出。Restore 方面，
  `94038e6`/`0c4526d` 又完成激活失败后的原库自动回滚、恢复点保留、单一用户层结论与
  reload：真实文件级写入拒绝后 objects 仍为 5、版本 `[1,5,6,13,14]`，新增恢复点
  schema 12 / integrity ok / foreign-key 0，Service PID `99248→99711`，Doctor PASS，
  CURRENT `p2-g-44`～`46`。受控人工恢复 Desktop 已由后述 `p2-g-47`～`50` 补齐；
  真实连续双重故障又由 `fe0b590034ac` 的 `p2-g-55`～`59` 完成候选激活失败→自动回滚
  失败→无需 reload 出现人工恢复→HIGH 确认→Doctor/清锁→正常 Launcher/reload。活动库
  `7→6→7`，最终 Anchor conflict/Pending/Recovery `0/0/0`，database authority 未替换。
  Migration Import 写后响应丢失已由后述 `f17f46a` Gate 关闭；Verify/Activate failure
  和 Light/窄栏仍 OPEN。
  `2eb6df1` 已以自动测试补齐
  Restore admission drain、Launcher single-spawn、`ARMED→RECOVERY_REQUIRED`、
  mutation lock/no-clobber/compare-and-clear、损坏与权限异常独立 fail-closed 叙述，以及
  “先恢复匹配恢复点并 Doctor PASS、后清锁”的双重失败合同；该项当时仍缺执行链与真实
  Desktop。`e418c87` 又关闭同目录多数据库互锁串扰与 Launcher
  last-release/ensure 双 Service 竞态；`cb87d86` 关闭 interlock read TOCTOU 与过期
  lease 排队期间 heartbeat 误删，不据此升级 P2-G；`23ae7bd` 将现有互锁以
  无路径/Backup identity 的严格响应投影到用户系统状态。`4c71af1` 又复用同一
  per-Graph lifecycle gate、离线 Restore、Doctor 和互锁，把独立 HIGH 确认接成受控 one-shot
  手工恢复；任何失败都保留锁，只有恢复点与 Graph 重验、恢复和 Doctor 全部通过才清锁。
  Launcher `29/29`、Local Service `160/160`、Service Client `13/13`、Plugin `328/328`、
  Shared `9/9` 和根级检查 PASS。`16bde9ad88a5` 又以受控 `RECOVERY_REQUIRED` 前置条件完成
  用户状态、独立 HIGH Review、恢复、Doctor、清锁、Service 重连与完整 Logseq restart；
  正式基线、安全快照和 `READY/0/0/0` 均有结构化读回。该项当时为
  `MANUAL_RECOVERY_CONTROLLED_DESKTOP_DONE_REAL_DOUBLE_FAILURE_OPEN`。`fe0b590034ac`
  随后用专用故障 Launcher 真实触发两段异常并关闭 no-reload 人工恢复入口缺口，最终
  `RESTORE_DOUBLE_FAILURE_MANUAL_RECOVERY_DESKTOP_DONE`；没有新增恢复状态、入口或写入权威；
- [x] Migration Import 写后响应丢失可从正式 ledger 续作：`f17f46a` 的 test-only
  `afterMigrationImport` 自动证明原子写入、幂等 replay 和后续 Verify；真实 Desktop 又证明
  UI 不猜测结果、要求“先以台账为准”，reload 后从同一 `IMPORTED` batch 重建 Verify，
  Verify 后复用既有 HIGH Undo。隔离库 objects `4→5→4`，run/batch 最终
  `PREVIEWED/UNDONE`，SemanticCommit `PENDING/RECOVERY_REQUIRED=0/0`；正常 7 对象
  authority 与 LaunchAgent 已恢复。该勾选仅关闭 post-write response-loss / interruption
  代表子 Gate，不代表 Migration Verify/Activate failure 或 P2-G 整体完成；
- [ ] Migration Verify/Activate 失败链完成 Desktop Gate：`df5d2ea` 已自动证明事务前失败
  不产生半状态，并在同一正式 ledger 上完成 Verify/Activate 重试，Pending/Recovery
  `0/0`；根级检查 PASS。真实 Logseq 已到隔离 Launcher 的最终安全连接边界，但该持久
  token 配对动作尚未获得发生时确认，因此状态严格保持
  `AUTOMATED_DONE_DESKTOP_CONFIRMATION_REQUIRED`。正常 Launcher、Service 和原 authority
  已恢复；不得据此勾选 Desktop Gate；
- [ ] 高影响流程全部可恢复。
- [ ] Project 结构操作按影响给摩擦；16 类 router、LIGHT Condition durable Undo、
  MEDIUM 当前摘要完整 Desktop 纵向链与一条 HEAVY 完整当前接口 Desktop 链已 PASS，
  Ownership/Closure 不降级已有自动证据；Association 因无 inverse 已安全禁用，但其他
  LIGHT/HEAVY 类型尚未全部闭环；

P2-C 专项证据：Application `155/155`、Local Service `133/133`、Plugin `271/271` 与根级
`./scripts/check.sh` PASS。Blank 已验证
properties Block、PENDING/Recovery、专用 Undo、Page name 删除与 reload 健康。Page
preserve/dedicated 又验证三段来源正文守恒、完整 restart identity 漂移、Service 账本 +
metadata-only 精确重绑、inverse Undo 与冷启动 reconciliation 收敛。CURRENT 截图
`p2-c-18`～`p2-c-20` 对应 `913bbda4528f`。Page reuse 又验证零 Page write、restart 与
Undo 前后 Page/Block 逐字段相同，CURRENT 截图 `p2-c-21`～`p2-c-24`；`p2-c-01`～
`p2-c-17` 均按 commit 一致性登记为 HISTORICAL/SUPERSEDED，不作为当前 UI 权威。
MiniProject 演化使用 `project-creation-modeling@1.5.0` 验证来源 Object/Anchor/子树边界、
五项 `LINK_AS_SOURCE`、HIGH Review、专用 Page 创建、reload 重入和 inverse Undo。来源
UUID/正文/顺序守恒，目标 Project/Anchor/专用 Page 撤销；`p2-c-38`/`p2-c-39` 对应
`7a7492a407ed`，证明精确返回原根 Block及再次 reload 后 READY、`0/0/0`。旧的 Journal
返回截图已标为 SUPERSEDED。Light/窄栏仍属 P2-C/最终集中视觉 Gate，不能据此宣布 P2 完成。

## 4.1 当前 UI 压缩验收（`f4acf77` / `7727770` / `662246a` / `cda4f95`）

| 页面 | 主结论清晰度 | 主操作清晰度 | 心智负担 | 工程词泄漏 | 当前状态 |
|---|---:|---:|---:|---:|---|
| 现在 | 高 | 高 | 中→低 | 测试 Project 正文仍可含工程词；系统控件已折叠 | DESKTOP_VERIFIED Light/Dark |
| 待整理 | 高 | 高 | 低 | 普通控件 0；完整技术事实未显示 | DESKTOP_VERIFIED 751×720 |
| 待审阅 | 高 | 高 | 高→低 | 当前问题与 13 条历史分离 | DESKTOP_VERIFIED 751×720 |
| Project 意图路由 | 高 | 高 | 高→中 | LIGHT/MEDIUM/HEAVY 不出首屏 | DESKTOP_VERIFIED 751×720 |
| Closure Step 1 | 高 | 高 | 高→中 | 逐目标原始依据与完整依据默认折叠 | DESKTOP_VERIFIED Light/Dark/窄栏 |
| Closure Provider error | 高 | 高 | 高→低 | Provider/Proposal/Commit 不出普通错误态 | DESKTOP_VERIFIED Light 1000×720 |
| Closure HIGH Review | 高 | 高 | 高→中低 | `Closure Proposal` 已移出普通标题；模型长说明折叠；首屏只显示结构化结论、影响和安全边界 | DESKTOP_VERIFIED Dark 1000×720 (`cda4f95`) |

验收边界：本表只关闭当前信息架构和代表性主题/宽度 Gate；generation stale 由独立真实
运行闭环，但真正 `RECOVERY_REQUIRED` 仍 OPEN。代码审计确认当前 Kernel 只允许该状态
补偿收口，不允许 Closure 前向 resume；在用户决定安全语义前不得伪造该 Gate，也不得把
P0/P1/P2 或 Final Release 标为 DONE。

## 5. 操作距离指标

| 场景 | 基线 | 目标 | 实测 |
|---|---:|---:|---:|
| Block 加 Focus | 离开正文→Now Work→找对象→操作 | 1 个现场动作 | 自动 + Desktop PASS；右键一次，原地反馈与读回一致 |
| 暂时做不了 | Now Work→状态表单→选择字段 | 2 个决定 | Desktop PASS：Block 右键→三选一→最小字段；保存后回原 Block |
| 普通 Block 整理 | 当前页 Candidate→Review→接受→Commit | 现场建议 + 1 次接受应用 | 右键“处理这条内容”按精确 UUID 进入既有 Provider→Proposal，自动 Gate PASS；LOW 单击应用/Undo Desktop PASS；普通/Query/引用现场入口仍待 Desktop |
| 打开正文 | Now Work/Project 找卡片 | 1 个动作 | 待测 |
| Project 重入 | 独立重入 workspace | Page 顶部 1 个动作 | Project workspace + Context Recovery Dark 主链 Desktop PASS；Logseq 0.10.15 File Graph 不挂载 Page Head slot，安全隐藏为 bounded；DB Graph Page Head OPEN；current-interface 复用 HIGH Proposal |
| Service 恢复 | 终端 + descriptor + reload | 1 个产品入口 | descriptor 文件一次导入与 reload READY PASS；进程启动/停止待做 |

## 6. 发布否决条件

以下任一出现即不得宣布阶段完成：

- 原文可能静默丢失；
- 失败后用户误以为已应用；
- accepted-not-applied 无持续入口；
- LLM 自动改变 Focus/Ownership；
- context/Block 标记严重干扰正文；
- Service 仍要求日常终端操作；
- Recovery 重复 Commit；
- Graph mismatch 仍可写入；
- 默认日志保存完整正文或 Key；
- Project 创建变固定大问卷；
- “现在”展示所有 OPEN；
- 技术状态机重新进入日常首屏；
- 只有自动测试，没有真实 Desktop 证据。

## 7. 最终交付清单

- [ ] 可运行代码；
- [ ] 自动测试；
- [ ] 真实操作截图；
- [x] 设计到代码映射；
- [x] P0-A 自动测试、真实 Desktop Focus/Undo 与 Local Service 读回证据；
- [x] P0-H descriptor 私有导入、失败边界与 reload READY 证据；`e8db32f` 又完成最新用户语言的
  安全结束、立即只读、重新启动与健康读回，结束期间无知识库不匹配闪烁；`ca50304`
  又关闭未配置 Graph 立即受限、旧 Project 不可见、6 秒保持和切回原 authority Gate；
  同一 Graph 重装现默认保留既有 database authority，真实发现的静默路径替换已修复并由
  Launcher 29/29 回归覆盖；当前构建的真实无参数重装也已证明 graphKey/path/inode 与
  `7/24/12` 正式计数保持；显式数据库迁移仍必须由用户明确给出路径；
- [x] P0-B 三种 Condition、失败零写入、Focus 不变、Undo 和 reload 证据；
- [x] P0-C LOW 白名单、连续 Review/revalidate/Commit、busy/stale/transport 与真实 Desktop Undo 证据；
- [x] P0-D 普通/Project/Journal Page 路由、UUID/Anchor 重验、Project create/reentry 与
  sidebar 共存证据；
- [x] P0-E 四项主导航、Project/Objects 与 More/Audit/Migration/Diagnostics 可达性及四张
  脱敏 Desktop 截图；`4dfe014` 又以最新 Dark Desktop 证明高频壳层不再显示重复运行组件条；
- [x] P0-F 介入计数/噪声排除/Recovery 优先级自动覆盖，以及安静态、正式连接风险 `TC ①`、
  诊断路由和恢复后安静态的两张脱敏 Desktop 截图；
- [x] P0-G 用户层状态翻译、inverse 折叠、专用 Undo 路由、折叠技术详情，以及 LOW 应用→
  即时结果→跨 reload 长期 Undo→Graph/SQLite 恢复的四张脱敏 Desktop 截图；
- [x] P0-I 五个用户问题、Provider 非故障降级、安全优先级、Pending/Recovery 分离和
  默认折叠工程诊断，以及真实 Desktop 注意/停服受限状态的两张脱敏截图；`4dfe014` 的健康
  系统状态又证明用户层工程词扫描为 0、精确版本只在主动展开的技术诊断中；
- [x] P1-G Project Context Recovery：`653875a` 已验证确定性基线、真实 DeepSeek 内容、
  真实业务 unknown、Provider error、Validator rejection、generation stale、分区显示、
  feedback、reload、Dark/Light/窄栏和零越权写入；stale evidence 为
  `STALE=1 / GENERATED=0`。`recover-context@1.3.0` 为
  `CANDIDATE/DESKTOP_VERIFIED`，不等于 Production；DB Graph Page Head 属 P1-F 宿主矩阵；
- [ ] P0/P1/P2 完成报告；
- [ ] 已知限制；
- [ ] 恢复和升级说明；
- [ ] 用户层操作说明；
- [ ] 技术层维护说明；
- [ ] 交互日志与 Skill 版本说明；
- [ ] 未完成项和原因；
- [ ] 后续建议。

最终报告必须分别列出：已真实实现、已自动测试、已 Desktop 验证、仅原型、仅设计、被阻塞、超出范围。
