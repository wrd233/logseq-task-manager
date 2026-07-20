# V2 设计到代码追踪矩阵

> 初版日期：2026-07-19。状态只表示 V2；V1 自动测试只能登记为 `REUSE_EVIDENCE`，不能把 V2 条目标成完成。

## 状态

- `NOT_STARTED`：V2 尚无实现；
- `REUSE_EVIDENCE`：V1 有可复用代码/测试，但 V2 契约或架构尚未满足；
- `RUNTIME_BLOCKED_BY_CONFIG`：自动骨架可继续，最终 Gate 依赖用户提供真实配置；
- `DONE`：代码、失败路径、文档和对应 Gate 证据全部通过。

## 横切要求

| requirement_id | 文档章节 / 决定 | 用户场景 | Domain 规则 / 不变量 | Application 用例 | Adapter / UI | 测试 | Slice | 状态 | 当前证据 / 缺口 |
|---|---|---|---|---|---|---|---|---|---|
| V2-ARCH-001 | D-180..191；V2 §5.4-5.5 | Plugin、CLI、Agent 看到同一事实 | 正文/状态/历史/投影单一权威 | 所有 command/query 共享一层 | Service client；SQLite adapter | boundary + integration | A | REUSE_EVIDENCE | V2 Application/Repository 原子 command seam 与只读 CLI 已通过；Plugin 尚未切换，HTTP write route 未开放 |
| V2-ARCH-002 | D-216；V2 §30-32 | Service 不可用仍可写正文 | Domain 无 transport 语义 | health/status/restricted | 单个 loopback Service | unavailable/protocol | A | REUSE_EVIDENCE | descriptor 0600、auth、timeout/unavailable/protocol restricted 自动测试通过；Plugin 已实现 Electron 安全读取、probe、脱敏受限态与无 Store 首次启用分支，待 Desktop 验收 |
| V2-DATA-001 | D-190..192；V2 §33-34 | 每 Graph 独立运行和恢复 | SQLite 唯一当前状态；schema 独立版本 | initialize/migrate/backup | SQLite + `.task-copilot/` | idempotency/locked/corrupt | A | REUSE_EVIDENCE | Graph-bound schema v3、显式快照后 v1/v2→v3 ledger 升级、受约束 SemanticCommit step 表、失败全量回滚/重试、事务幂等、corrupt/unknown、写锁零写入、Doctor、Backup 和离线 Restore 原语已自动测试；完整业务表/Service 切换待完成 |
| V2-DOM-001 | D-214、D-220；V2 §13-22 | 六类对象、三层状态可理解 | 六类封顶；Lifecycle/Condition/Focus 封顶 | create/change/focus | UI 弱提示 | domain matrix | A | REUSE_EVIDENCE | V2 pure Domain contracts 与 Application create/lifecycle tests 通过；对象特定完整语义/UI 待后续 Slice |
| V2-ID-001 | D-030..041；V2 §21 | 移动/改名不丢身份 | object_id 独立；最多一 Primary Anchor | bind/observe/rebind | Graph UUID adapter | uniqueness/move/delete | A-B | REUSE_EVIDENCE | V2 Domain+Application+SQLite 初始 Primary Anchor 原子/唯一/回滚通过；observe/rebind/Graph event 属 Slice B |
| V2-OWN-001 | D-035..047；V2 §21 | 位置变化不改归属 | 最多一个 Primary Owner；Association 不冒充归属 | change ownership/add association | 语义 Diff 独立控制 | matrix/cycle/scope | A-C | REUSE_EVIDENCE | V2 owner matrix、Application version 与 SQLite 单一 Primary 事务通过；显式 change/Association 待后续 |
| V2-PROP-001 | D-094..122；V2 §23-28 | 可读、可拆分、可过期的建议 | Proposal 非事实；read/modify scope；group dependency | validate/revise/review | 两文件、文本/语义 Diff | schema/stale/partial | C | REUSE_EVIDENCE | V1 operation DAG/partial accept；两文件/scope 缺失 |
| V2-COMMIT-001 | D-185..188；V2 §29 | 提交失败不假成功，可 Undo | version/hash；Partial Failure；Undo 不覆盖新编辑 | commit/undo/recover | Graph + SQLite step ledger | fault injection/restart | C | REUSE_EVIDENCE | V1 pending-first Saga/compensation/Undo 可复用 |
| V2-LLM-001 | D-125..144；V2 §40-46 | 局部语义产生 Proposal | Provider/Model 不进 Domain；非法输出零写入 | analyze/scan/revise | Provider/Prompt/Profile runtime | mock/live/golden/security | D | RUNTIME_BLOCKED_BY_CONFIG | 无真实 Provider；测试计划已建立 |
| V2-VIEW-001 | D-145..171；V2 §9-10、§57-59 | Now Work 与审阅中心低噪可扫读 | Projection 可重建；无 AI 分数 | query now/review | 三区域；两视图；键盘/主题 | VM/UI/Desktop | E | REUSE_EVIDENCE | V1 renderer/Now Work 可复用；状态与布局需 V2 化 |
| V2-CLI-001 | D-128..135；V2 §36-39 | Agent 确定性获取有限上下文 | CLI 无领域逻辑、无 force apply | object/graph/context/proposal/skill/doctor | Service API + CLI | help/json/exit/integration | A,F | REUSE_EVIDENCE | 可执行 status/doctor/object、JSON schema、退出码和真实进程冒烟通过；graph/context/proposal/skill 属 Slice F |
| V2-MIG-001 | D-193..202；V2 §51 | 用户小批次迁移且可撤销 | 手动、幂等、部分采用合法 | scan/preview/commit/undo batch | Settings/CLI | interruption/repeat/rollback | F | REUSE_EVIDENCE | 迁移/Legacy mapping 设计 READY；Pilot 前后 bundle 已校验；实现未开始 |
| V2-OPS-001 | D-192、D-203..204；V2 §53-56 | 故障可诊断、备份可恢复、Key 安全 | 高影响修复走 Proposal；secret 永不记录 | backup/restore/doctor/diagnostics | Settings/CLI | restore/redaction | A,F | REUSE_EVIDENCE | 受控 Service Backup API、0700/0600、防覆盖、Graph/schema/integrity/foreign-key 只读校验、路径隔离和错误脱敏已自动证明；实际 Restore/CLI/Desktop 待完成 |
| V2-FIRST-001 | D-197..198；V2 §32.1、§33 | 首次启用时空系统可理解、可选择下一步 | 首次启动不扫描、不迁移、不调用模型 | initialize/check graph/status | 非敏感配置模板；欢迎页仅含开始使用、迁移现有内容、检查系统状态；失败进入受限模式 | first-run/reload/Desktop | A | REUSE_EVIDENCE | 欢迎页三入口、可见反馈、空 descriptor 在 Adapter/FileStorage 前停止及无写入入口已自动测试；真实 reload、零请求与 Desktop 正文编辑证据待集中验收 |

## E2E-01..24

| requirement_id | 文档章节 | 用户场景 | Domain 规则 / 不变量 | Application 用例 | Adapter / UI | 自动 / 运行测试 | Slice | 状态 | 当前证据 / 缺口 |
|---|---|---|---|---|---|---|---|---|---|
| E2E-01 | V2 §68 | 写 `[任务]`，重启、改标题、Now Work 可见 | Task OPEN；ID/Anchor 稳定 | materialize/sync/query | block event/parser/Now | fixture + Desktop | B,E | REUSE_EVIDENCE | V1 手工正式化，不是显式事件物化 |
| E2E-02 | V2 §68 | `[任务] 标题` 无 Marker | Marker 不决定身份 | materialize | parser | unit + Desktop | B | NOT_STARTED | Parser/事件缺失 |
| E2E-03 | V2 §68 | Task 下裸 TODO 保持内部步骤 | 内部 TODO 无 object_id | synchronize block | subtree parser | fixture | B | NOT_STARTED | 缺显式同步 |
| E2E-04 | V2 §68 | 跨页移动 | ID/Ownership 不变，Anchor 更新 | observe/sync | UUID event | integration + Desktop | B | REUSE_EVIDENCE | V1 UUID 定位；真实 move 未验证 |
| E2E-05 | V2 §68 | 复制正式 Block | 新 UUID 不继承 ID | detect copy/candidate | Graph adapter | fixture + Desktop | B | NOT_STARTED | 缺 copy flow |
| E2E-06 | V2 §68 | 删除 Primary Anchor | 对象保留、Anchor Conflict | consistency check | Graph adapter/review | fake + Desktop | B,E | REUSE_EVIDENCE | V1 missing/conflict/rebind 已测 |
| E2E-07 | V2 §68 | 分析普通 Block | 模型只建议 | analyze block | LLM/Review | mock + live + Desktop | D | RUNTIME_BLOCKED_BY_CONFIG | 无真实 LLM |
| E2E-08 | V2 §68 | 接受表达、拒绝升级 | group dependency 合法 | review/commit/revalidate | Review Center | property + Desktop | C | REUSE_EVIDENCE | V1 128 组合已过；V2 groups/schema 缺失 |
| E2E-09 | V2 §68 | 原文变化后提交旧 Proposal | UUID/hash/version 不匹配停写 | validate/commit | Graph + SQLite | conflict integration | C | REUSE_EVIDENCE | V1 stale 停写已测 |
| E2E-10 | V2 §68 | Undo 正文和 Store，不覆盖后续编辑 | Undo 新 Commit | undo/recover | Graph + SQLite | fault + Desktop | C | REUSE_EVIDENCE | V1 inverse pending Commit 已测 |
| E2E-11 | V2 §68 | Focus/期限/阻碍/Waiting 可解释排序 | Focus 非状态；Waiting 安静；无分数 | query now work | Now Work UI | VM + Desktop | E | REUSE_EVIDENCE | V1 Signals-based view 与 V2 冲突 |
| E2E-12 | V2 §68 | 审阅中心原文优先、四处置 | Candidate/Proposal 分离 | disposition/review | two-tab Review | UI + Desktop | E | REUSE_EVIDENCE | V1 Inbox 动作可复用，语义需调整 |
| E2E-13 | V2 §68 | 外部 Agent 导出、验证、提交、插件审阅 | submit != commit；scope 封闭 | export/validate/submit | CLI/Review | CLI integration + Desktop | F | NOT_STARTED | 无 CLI/Context Package |
| E2E-14 | V2 §68 | 手动小范围迁移、预览、幂等、Undo | migration batch 可恢复 | scan/commit/undo | Settings/CLI | fixture + Desktop | F | NOT_STARTED | 无 migration |
| E2E-15 | V2 §68 | Service 故障时正文可编辑 | 无 Service 不允许正式写入 | health/recover/check | Plugin restricted | process fault + Desktop | A | REUSE_EVIDENCE | Client 与 Plugin 诊断均自动证明 graphEditing=true/formalWrites=false，Plugin 受限态不初始化空 FileStorage；真实 Service stop/recover 与 Desktop 正文编辑待验证 |
| E2E-16 | V2 §68 | Graph 成功、Store 失败 | 明确 Partial Failure | commit/recover | Graph + SQLite | injected failure | C | REUSE_EVIDENCE | V1 Domain save failure/compensation 已测 |
| E2E-17 | V2 §68 | 恢复快照后 Doctor PASS | 恢复后必须一致性检查 | backup/restore/doctor | SQLite/CLI | temp restore + Desktop | A,F | REUSE_EVIDENCE | Backup 只读校验、防覆盖和损坏拒绝已通过；离线 Restore 已证明恢复点、原子激活、重开 Doctor 和注入失败回滚。Service 停机/显式确认、CLI 与 Desktop 待完成 |
| E2E-18 | V2 §68 | Key 不出现在任何默认资产 | secret 非领域数据、永不记录 | config/log/export | Provider/diagnostics | secret canary scan | D,F | NOT_STARTED | V1 正文日志脱敏可复用 |
| E2E-19 | V2 §68 | Project 对象和页面原子创建 | Project 必须页面；不半成功 | create project | Graph + SQLite | fault injection + Desktop | B | NOT_STARTED | 无 Project page adapter |
| E2E-20 | V2 §68 | Closure 可说明未完成目标 | Completion 不要求全部 Objective | close project Proposal | Agent/Review | fixture + Desktop | F | NOT_STARTED | V1 Project phase 不符合 V2 |
| E2E-21 | V2 §68 | DeepSeek 认证、模型、中文、Schema | 模型输出非权威 | llm smoke | Provider | explicit live | D | RUNTIME_BLOCKED_BY_CONFIG | Key 仅存在受保护附件；等完整 Provider/Base URL/Model 配置与显式 live gate |
| E2E-22 | V2 §68 | Journal -> 真实 Proposal -> Diff | Validator 成功前零写入 | analyze/validate | Provider/Review | live + Desktop | D | RUNTIME_BLOCKED_BY_CONFIG | 等完整配置、Slice C 和显式 live gate |
| E2E-23 | V2 §68 | timeout/cancel/rate/invalid JSON 隔离 | 失败零 Candidate/Proposal/正式写入 | cancel/error map | async Provider | mock + bounded live | D | NOT_STARTED | 测试计划已有 |
| E2E-24 | V2 §68 | 凭据安全 | secret 永不持久化或导出 | diagnostics/report | logs/Git/Graph scan | canary + live artifact scan | D,F | RUNTIME_BLOCKED_BY_CONFIG | 等 Provider 实现与真实报告 |

## 完成更新规则

每项升级为 `DONE` 前必须同时补：代码路径、自动测试名、失败路径、Desktop/真实 API 证据（适用时）、文档和已知限制。Slice Gate 与 Release Gate 只从本矩阵聚合，不从文件存在或单次成功推断。
