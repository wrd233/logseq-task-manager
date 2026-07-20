# V2 设计到代码追踪矩阵

> 初版日期：2026-07-19。状态只表示 V2；V1 自动测试只能登记为 `REUSE_EVIDENCE`，不能把 V2 条目标成完成。

## 状态

- `NOT_STARTED`：V2 尚无实现；
- `REUSE_EVIDENCE`：V1 有可复用代码/测试，但 V2 契约或架构尚未满足；
- `AUTOMATED_FOUNDATION`：V2 代码、自动成功/失败路径和文档已建立，但 Desktop 或真实进程 Gate 尚未完成；
- `RUNTIME_BLOCKED_BY_CONFIG`：自动骨架可继续，最终 Gate 依赖用户提供真实配置；
- `DONE`：代码、失败路径、文档和对应 Gate 证据全部通过。

## 横切要求

| requirement_id | 文档章节 / 决定 | 用户场景 | Domain 规则 / 不变量 | Application 用例 | Adapter / UI | 测试 | Slice | 状态 | 当前证据 / 缺口 |
|---|---|---|---|---|---|---|---|---|---|
| V2-ARCH-001 | D-180..191；V2 §5.4-5.5 | Plugin、CLI、Agent 看到同一事实 | 正文/状态/历史/投影单一权威 | 所有 command/query 共享一层 | Service client；SQLite adapter | boundary + integration | A | REUSE_EVIDENCE | V2 Application/Repository 原子 command seam 与 CLI 已通过；显式 Block 的 Plugin 事件统一经 Local Service 写 SQLite，断线队列仅在会话内保存意图且不构成第二权威；V2 descriptor 路径不初始化 V1 FileStorage/Application 写入，其他 V2 write routes 仍关闭 |
| V2-ARCH-002 | D-216；V2 §30-32 | Service 不可用仍可写正文 | Domain 无 transport 语义 | health/status/restricted | 单个 loopback Service | unavailable/protocol | A | REUSE_EVIDENCE | descriptor 0600、auth、timeout/unavailable/protocol restricted 自动测试通过；Plugin 已实现 Electron 安全读取、probe、脱敏受限态与无 Store 首次启用分支，待 Desktop 验收 |
| V2-DATA-001 | D-190..192；V2 §33-34 | 每 Graph 独立运行和恢复 | SQLite 唯一当前状态；schema 独立版本 | initialize/migrate/backup | SQLite + `.task-copilot/` | idempotency/locked/corrupt | A | AUTOMATED_FOUNDATION | Graph-bound schema v5；显式快照后 v1..v4→v5 受控升级，v3 Commit ledger、v4 Proposal 表与 v5 Audit/current projection 解耦均有迁移记录；失败全量回滚/重试、事务幂等、corrupt/unknown、写锁零写入、Doctor、Backup 和 Restore 原语已自动测试 |
| V2-DOM-001 | D-214、D-220；V2 §13-22 | 六类对象、三层状态可理解 | 六类封顶；Lifecycle/Condition/Focus 封顶 | create/change/focus | UI 弱提示 | domain matrix | A | REUSE_EVIDENCE | V2 pure Domain contracts 与 Application create/lifecycle tests 通过；对象特定完整语义/UI 待后续 Slice |
| V2-ID-001 | D-030..041；V2 §21 | 移动/改名不丢身份 | object_id 独立；最多一 Primary Anchor | bind/observe/rebind | Graph UUID adapter | uniqueness/move/delete | A-B | REUSE_EVIDENCE | 初始绑定、观察、move/copy 与 rebind 合同已通过；rebind 强制确认、同类型与版本前置，旧 Anchor 保留 replaced，新 active Anchor/Object/Audit/Receipt 单事务且不改 object_id/Ownership；Plugin Diagnostics 有界审阅面板、明示影响、独立确认、提交前重读防 stale 的自动证据已通过，Desktop 仍待 Slice B |
| V2-OWN-001 | D-035..047；V2 §21 | 位置变化不改归属 | 最多一个 Primary Owner；Association 不冒充归属 | change ownership/add association | 语义 Diff 独立控制 | matrix/cycle/scope | A-C | REUSE_EVIDENCE | V2 owner matrix、Application version 与 SQLite 单一 Primary 事务通过；显式 change/Association 待后续 |
| V2-PROP-001 | D-094..122；V2 §23-28 | 可读、可拆分、可过期的建议 | Proposal 非事实；read/modify scope；group dependency | validate/revise/review/revalidate | 两文件、文本/语义 Diff | schema/stale/partial | C | AUTOMATED_FOUNDATION | V2 runtime Schema、两文件、scope/hash/risk/dependency、schema v4 持久化、submit/list/get/review 和 Review UI 已通过。C3 重读 read scope 与 accepted modify target；最终确认仍在同一卡片，接受、检查通过和正式生效有明确区分。C4/C5 自动闭环已接入，缺 Desktop Gate |
| V2-COMMIT-001 | D-185..188；V2 §29 | 提交失败不假成功，可 Undo | version/hash；Partial Failure；Undo 不覆盖新编辑 | commit/undo/recover | Graph + SQLite step ledger | fault injection/restart | C | AUTOMATED_FOUNDATION | C4/C5 已形成 PENDING-first Commit、Graph before/after 重读、Application Object/Anchor/Audit/Receipt 物化、inverse Commit、精确当前投影删除、正向 `UNDONE`、幂等重试和 PENDING/RECOVERY_REQUIRED 重启续跑。Review UI 显示最终确认、已生效与 Undo；Graph/Object/Anchor/Ownership/Focus/额外 Anchor 任一后续变化均停写。缺真实 Desktop 连续闭环和进程中断 Gate |
| V2-LLM-001 | D-125..144；V2 §40-46 | 局部语义产生 Proposal | Provider/Model 不进 Domain；非法输出零写入 | analyze/scan/revise | Provider/Prompt/Profile runtime | mock/live/golden/security | D | RUNTIME_BLOCKED_BY_CONFIG | 无真实 Provider；测试计划已建立 |
| V2-VIEW-001 | D-145..171；V2 §9-10、§57-59 | Now Work 与审阅中心低噪可扫读 | Projection 可重建；无 AI 分数 | query now/review | 三区域；两视图；键盘/主题 | VM/UI/Desktop | E | AUTOMATED_FOUNDATION | V2 Now Work 已由 SQLite 当前对象/Focus 生成三个可空区域，经 Service 在正式 Plugin 页面显示；近期 actionable 上限 12、普通 Waiting 安静、到期复查可见且每项有自然语言原因，无分数。Focus 已贯通 Application/SQLite/Service/UI 的加入、移出、并发保护和手动上下排序，active Primary Anchor 可从卡片安全打开；它不改变对象状态或制造完整 Audit。筛选/分组、Candidate 待整理、键盘/主题和 Desktop Gate 未完成 |
| V2-CLI-001 | D-128..135；V2 §36-39 | Agent 确定性获取有限上下文 | CLI 无领域逻辑、无 force apply | object/graph/context/proposal/skill/doctor | Service API + CLI | help/json/exit/integration | A,F | REUSE_EVIDENCE | 可执行 status/doctor/object、JSON schema、退出码和真实进程冒烟通过；graph/context/proposal/skill 属 Slice F |
| V2-MIG-001 | D-193..202；V2 §51 | 用户小批次迁移且可撤销 | 手动、幂等、部分采用合法 | scan/preview/commit/undo batch | Settings/CLI | interruption/repeat/rollback | F | REUSE_EVIDENCE | 迁移/Legacy mapping 设计 READY；Pilot 前后 bundle 已校验；实现未开始 |
| V2-OPS-001 | D-192、D-203..204；V2 §53-56 | 故障可诊断、备份可恢复、Key 安全 | 高影响修复走 Proposal；secret 永不记录 | backup/restore/doctor/diagnostics | Settings/CLI | restore/redaction | A,F | REUSE_EVIDENCE | 受控 Service Backup API、0700/0600、防覆盖、Graph/schema/integrity/foreign-key 只读校验、路径隔离和错误脱敏已自动证明；实际 Restore/CLI/Desktop 待完成 |
| V2-FIRST-001 | D-197..198；V2 §32.1、§33 | 首次启用时空系统可理解、可选择下一步 | 首次启动不扫描、不迁移、不调用模型 | initialize/check graph/status | 非敏感配置模板；欢迎页仅含开始使用、迁移现有内容、检查系统状态；失败进入受限模式 | first-run/reload/Desktop | A | REUSE_EVIDENCE | 自动测试与 2026-07-20 Desktop 均证明三入口、空 descriptor 在 Adapter/V1 领域 FileStorage 前停止、Store NOT_STARTED、formal writes false、普通正文可编辑；零 Provider/迁移成立。仍需协议错误等 A-RT-03 剩余项后才能 DONE |

## E2E-01..24

| requirement_id | 文档章节 | 用户场景 | Domain 规则 / 不变量 | Application 用例 | Adapter / UI | 自动 / 运行测试 | Slice | 状态 | 当前证据 / 缺口 |
|---|---|---|---|---|---|---|---|---|---|
| E2E-01 | V2 §68 | 写 `[任务]`，重启、改标题、Now Work 可见 | Task OPEN；ID/Anchor 稳定 | materialize/sync/query | block event/parser/Now | fixture + Desktop | B,E | REUSE_EVIDENCE | 自动合同全部保留；2026-07-20 Desktop 已证明专用页 `[任务]` 真实物化、同 object_id/anchor_id 标题更新、已知 Anchor 不重复列候选，以及断线重连只交付最新正文。Plugin 退出期间发现、reload 一致性与 Now Work 仍未完成 |
| E2E-02 | V2 §68 | `[任务] 标题` 无 Marker | Marker 不决定身份 | materialize | parser | unit + Desktop | B | REUSE_EVIDENCE | 有/无 Marker Parser、Plugin 事件交付与无 Marker 首次物化路径已自动证明；Marker 自动合同证明 TODO/NOW/DOING/WAITING 不决定身份、Condition 或 Focus，DONE 对简单 Task 请求完成，CANCELED 在记录原因前零写入。Desktop Marker 未完成 |
| E2E-03 | V2 §68 | Task 下裸 TODO 保持内部步骤 | 内部 TODO 无 object_id | synchronize block | subtree parser | fixture + Desktop | B | REUSE_EVIDENCE | B0 Parser 与 B1 有限子树 fixture 已证明：事件根 UUID 经 300ms 防抖、32 项覆盖队列与 256 Blocks frontier 预算后重读权威正文；Task 下裸 TODO 为 `NONE` 且零 Service 写入，嵌套显式 Decision 独立同步；队列溢出/截断/异常只提交已验证前缀并对其余项要求 reconciliation，根不可读零写入，注销停止后续读取和交付。真实 Desktop 事件 shape、粘贴与快速编辑未完成 |
| E2E-04 | V2 §68 | 跨页移动 | ID/Ownership 不变，Anchor 更新 | observe/sync | UUID event | integration + Desktop | B | REUSE_EVIDENCE | 同 UUID 经统一 Service 同步保持 object_id/anchor_id，Application fixture 证明 Primary Ownership 不变；Plugin `DB.onChanged` fixture 已覆盖同事务内原 UUID 移动；真实跨页 move/Desktop 待验证 |
| E2E-05 | V2 §68 | 复制正式 Block | 新 UUID 不继承 ID | detect copy/candidate | Graph adapter | fixture + Desktop | B | REUSE_EVIDENCE | Service integration fixture 证明同文本新 UUID 走首次物化，获得不同 object_id/anchor_id；Plugin fixture 已覆盖移动与复制同批到达及重复复制事件只交付最新版本；真实 Logseq copy/Desktop 待验证 |
| E2E-06 | V2 §68 | 删除 Primary Anchor | 对象保留、Anchor Conflict | consistency check/rebind | Graph adapter/review | fake + Desktop | B,E | REUSE_EVIDENCE | 已知 UUID 缺失/冲突观察保留 Object；同 UUID 可恢复 active；显式 rebind 可在确认后原子保留旧 replaced Anchor 并绑定新 UUID，类型/占用/stale/重试路径已测。Plugin 已提供只读选中 Block、同类型候选、明示影响、勾选确认与提交前重读的有界审阅交互，Desktop 待完成 |
| E2E-07 | V2 §68 | 分析普通 Block | 模型只建议 | analyze block | LLM/Review | mock + live + Desktop | D | RUNTIME_BLOCKED_BY_CONFIG | 无真实 LLM |
| E2E-08 | V2 §68 | 接受表达、拒绝升级 | group dependency 合法 | review/commit/revalidate | Review Center | property + Desktop | C | AUTOMATED_FOUNDATION | V2 group dependency、部分接受、高影响确认、文本/语义 Diff 与 accepted-only Commit 已自动通过；Desktop 连续审阅待验收 |
| E2E-09 | V2 §68 | 原文变化后提交旧 Proposal | UUID/hash/version 不匹配停写 | validate/commit | Graph + SQLite | conflict integration | C | AUTOMATED_FOUNDATION | V2 C3/C4 在 prepare 与 Graph 写前后重读 UUID/hash/version；旧 Proposal 持久化 `STALE` 且零正式写入，已存在 PENDING intent 只接受自身 before/after 证据续跑；Desktop 待验收 |
| E2E-10 | V2 §68 | Undo 正文和 Store，不覆盖后续编辑 | Undo 新 Commit | undo/recover | Graph + SQLite | fault + Desktop | C | AUTOMATED_FOUNDATION | V2 inverse Commit 已自动证明正文反向 Patch、Object/Anchor 当前投影删除、Audit 保留、正向 Commit `UNDONE`、重启续跑和后续编辑零覆盖；Desktop/fault 进程 Gate 待完成 |
| E2E-11 | V2 §68 | Focus/期限/阻碍/Waiting 可解释排序 | Focus 非状态；Waiting 安静；无分数 | query now work | Now Work UI | VM + Desktop | E | AUTOMATED_FOUNDATION | V2 纯投影与正式 UI 已证明 Focus 读取/加入/移出/手动排序、对象版本与完整顺序并发保护、Primary Anchor 打开入口、近期 actionable、到期 Waiting、普通 Waiting 静默、三区域空隐藏和无分数；期限输入、复杂阻碍排序、reload/真实点击与 Desktop 待完成 |
| E2E-12 | V2 §68 | 审阅中心原文优先、四处置 | Candidate/Proposal 分离 | disposition/review | two-tab Review | UI + Desktop | E | AUTOMATED_FOUNDATION | 待审阅 Proposal 卡片已实现上下文、最终预览、文本/语义 Diff、接受/拒绝/暂缓、最终 Commit 与 Undo；待整理 Candidate 单一列表和 Desktop Gate 尚未完成 |
| E2E-13 | V2 §68 | 外部 Agent 导出、验证、提交、插件审阅 | submit != commit；scope 封闭 | export/validate/submit | CLI/Review | CLI integration + Desktop | F | NOT_STARTED | 无 CLI/Context Package |
| E2E-14 | V2 §68 | 手动小范围迁移、预览、幂等、Undo | migration batch 可恢复 | scan/commit/undo | Settings/CLI | fixture + Desktop | F | NOT_STARTED | 无 migration |
| E2E-15 | V2 §68 | Service 故障时正文可编辑 | 无 Service 不允许正式写入 | health/recover/check | Plugin restricted | process fault + Desktop | A | REUSE_EVIDENCE | 自动合同保留；2026-07-20 Desktop 已停止真实 Service、连续保存两次正文、观察 deferred issue，并在不 reload Plugin 的情况下更新 descriptor key 重连；SQLite 同一对象只收到 latest 值，version 3→4。Diagnostics 已显示显式队列状态；reload 受限态、协议错误及溢出仍待验收 |
| E2E-16 | V2 §68 | Graph 成功、Store 失败 | 明确 Partial Failure | commit/recover | Graph + SQLite | injected failure | C | REUSE_EVIDENCE | V1 Domain save failure/compensation 已测 |
| E2E-17 | V2 §68 | 恢复快照后 Doctor PASS | 恢复后必须一致性检查 | backup/restore/doctor | SQLite/CLI | temp restore + Desktop | A,F | REUSE_EVIDENCE | Backup 校验、离线 Restore 恢复点/原子激活/Doctor/失败回滚已通过；Service Apply 固定确认、关闭 live Store、descriptor 删除已通过。真实 CLI create→restore→stop→restart→Doctor 进程冒烟 PASS；Desktop 待完成 |
| E2E-18 | V2 §68 | Key 不出现在任何默认资产 | secret 非领域数据、永不记录 | config/log/export | Provider/diagnostics | secret canary scan | D,F | NOT_STARTED | V1 正文日志脱敏可复用 |
| E2E-19 | V2 §68 | Project 对象和页面原子创建 | Project 必须页面；不半成功 | prepare/finalize project | Projects UI + exact Page Adapter + SQLite ledger | integration/fault injection + Desktop | B | AUTOMATED_FOUNDATION | 最终 Projects 工作区已接入插件内表单；Service prepare 稳定发行 commit/object ID 且零领域对象，受控页面验证后 finalize 原子写 Project+Anchor+Audit+Receipt，未知同名/意图不匹配零写入，重试幂等，完成后按 Page UUID 保持改名身份。复用现有 SemanticCommit step ledger，无专用表/双写/扫描。响应不确定时不盲删可能已提交页面，而保留所有权标记供同意图续跑。仍缺 Desktop 新建/冲突/改名/reload 与进程边界 fault injection，不能 DONE |
| E2E-20 | V2 §68 | Closure 可说明未完成目标 | Completion 不要求全部 Objective | close project Proposal | Agent/Review | fixture + Desktop | F | NOT_STARTED | V1 Project phase 不符合 V2 |
| E2E-21 | V2 §68 | DeepSeek 认证、模型、中文、Schema | 模型输出非权威 | llm smoke | Provider | explicit live | D | RUNTIME_BLOCKED_BY_CONFIG | Key 仅存在受保护附件；等完整 Provider/Base URL/Model 配置与显式 live gate |
| E2E-22 | V2 §68 | Journal -> 真实 Proposal -> Diff | Validator 成功前零写入 | analyze/validate | Provider/Review | live + Desktop | D | RUNTIME_BLOCKED_BY_CONFIG | 等完整配置、Slice C 和显式 live gate |
| E2E-23 | V2 §68 | timeout/cancel/rate/invalid JSON 隔离 | 失败零 Candidate/Proposal/正式写入 | cancel/error map | async Provider | mock + bounded live | D | NOT_STARTED | 测试计划已有 |
| E2E-24 | V2 §68 | 凭据安全 | secret 永不持久化或导出 | diagnostics/report | logs/Git/Graph scan | canary + live artifact scan | D,F | RUNTIME_BLOCKED_BY_CONFIG | 等 Provider 实现与真实报告 |

## 完成更新规则

每项升级为 `DONE` 前必须同时补：代码路径、自动测试名、失败路径、Desktop/真实 API 证据（适用时）、文档和已知限制。Slice Gate 与 Release Gate 只从本矩阵聚合，不从文件存在或单次成功推断。
