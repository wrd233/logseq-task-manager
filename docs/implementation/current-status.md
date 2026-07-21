# V2 当前实施状态

## 当前 Slice

V1 frozen / Slice A0 complete / Slice A1-A4 foundation in progress / Slice B0-B3 automated foundation / Slice B4 Anchor recovery in progress / Slice B5 Project creation Desktop pass / Slice C0-C5 Desktop partial pass / Slice E Now Work interactive foundation

## 当前阶段结论

```text
V1_RUNTIME_KERNEL_PASS
V1_MVP_PILOT_PARTIAL
V1_FROZEN_FOR_MIGRATION
V2_MIGRATION_DESIGN_READY
```

`V1_MVP_PILOT_SUCCESS` 未达到：Capture 与 Task 通过；MiniProject/Project 的主归属、推进、聚合以及 Decision/Output/Closure 没有形成低摩擦闭环。V1 不再扩建长期能力，这些差距转入 V2。

## 本轮完成

- 复核分支、remote、恢复包、Agent、FileStorage、测试 Graph 和 root checks；
- 正式接受 OD-001..003，并冻结三份 ADR；
- 在 Logseq Desktop 0.10.15 使用专用 copied-data 页面完成 Capture、Task、MiniProject、Project Pilot；
- 建立 Pilot 前后 0600 恢复包，回放 differences 为 `[]`，Pending/Recovery Required Commit 均为 0；
- 明确 V1 可复用内核、冻结边界和淘汰语义；
- 完成 FileStorage → SQLite 主权交接设计及 Legacy 状态映射；
- 完成 DeepSeek 实际在线探测：`/models` HTTP 200，发现 `deepseek-v4-flash` 与 `deepseek-v4-pro`；另做 1 次有界中文请求，HTTP 200 但 `finish_reason=length` 且非 JSON。Key 只在内存使用，未进入命令、环境、Graph、Git、日志或报告；该旧结果仍不是 Slice D 通过。
- Slice D L1 自动基础已贯通：Provider 非硬编码 Base URL/Model、env/Keychain secret reference、Structured Output 元数据、timeout/cancel、有限 retry、认证/限流/5xx/network/空/非法/截断错误；五层 Prompt 后由 Service 覆盖模型 ID/source/status/time 与机器计算 patch hash，再经现有 Domain Validator。合法结果只进入 Proposal Review，普通记录可返回 `NO_PROPOSAL` 理由且零持久化，非法结果零 Proposal/Graph/正式 Store。Plugin Review Center 已提供 capability-gated 当前块分析与 loading/success/error；真实 API 与 Desktop 尚未验收。
- L2 smoke harness 与 DS-01..12 固定脱敏黄金案例 manifest 已落地；harness 默认在解析凭据前以退出码 2 拒绝，显式 live 开关后最多执行当前 smoke 的一个请求且只输出脱敏元数据。当前配置变量均未设置，因此本轮没有新在线费用或真实 API 证据。
- 建立 V2 六类对象、Lifecycle/Condition/Focus 纯 Domain seam；不含 Phase/Signal；
- 通过 Node 20/macOS arm64 SQLite Spike：Graph-bound 初始化、schema/损坏保护、版本/幂等写入、Doctor 和独立备份；
- 建立仅绑定 `127.0.0.1`、session-token 认证的只读 Local Service health/status/doctor/object 骨架。
- 建立 V2 Application Command envelope、版本前置、原子 Object+Audit receipt 和幂等重放；
- Primary Anchor 与 Primary Ownership 同时经过 Domain 与 SQLite 约束，失败事务不会推进对象版本；
- 建立 0600 runtime descriptor、版本化 Service Client、超时/断连/未授权/协议不兼容错误及受限状态；
- 建立可执行 `task-copilot-service` 与只读 `tc status/doctor/object`，完成独立进程冒烟。
- SQLite 写锁冲突已收敛为结构化零写入失败；Backup 增加不覆盖、只读 schema/Graph/完整性/外键校验。
- Local Service 开放受控 Backup Create/Restore Validate；只接受服务端 ID，拒绝客户端路径、遍历和超大请求，当前不执行 Restore 切换。
- SQLite schema 升至 v3；`initialize` 不静默升级，v1/v2→v3 需显式恢复点，在单一事务写 DDL/ledger/metadata/user_version，注入失败后零半写且可重试。
- Plugin 已接入版本化 Service Client。Desktop 0.10.15 实测 iframe 不暴露 Electron Node reader，现由 Service 将 0600 descriptor 写入 Task Copilot 私有 FileStorage，Plugin 设置只保存受限文件名 key 并通过 Logseq bridge 临时读取；该文件不含领域状态、不恢复 V1 写入、不构成 SQLite 双写。兼容 Node reader 保留；任何发现失败均进入脱敏 RESTRICTED 状态。
- descriptor 未配置时，Plugin 在创建 Logseq Adapter/FileStorage 前停止，欢迎页只提供“开始使用 / 迁移现有内容 / 检查系统状态”；无扫描、迁移或模型调用的自动分支证据已建立。
- SQLite 离线 Restore 原语已通过：候选 Backup 与当前库恢复点均先做只读校验，同目录原子激活后再 Doctor；注入失败会回滚原库并保留恢复点。该原语尚未开放 HTTP/CLI/Plugin 入口。
- SQLite schema 升至 v5：v3 建立受约束 `semantic_commits` / `semantic_commit_steps`，v4 新增 `proposals` / `proposal_groups`，v5 只解除 immutable Audit 对当前 Object 投影的外键依赖，使严格 Undo 可删除当前 Object/Anchor 而保留历史 object_id；所有旧版本必须经显式快照迁移，无静默升级。
- step ledger 最小状态机已通过：PENDING + PREPARED 原子准备、幂等重放、非法跳步拒绝、全 VERIFIED 后才能 COMPLETED、未补偿 step 不得标记 FAILED，RECOVERY_REQUIRED 可重启查询并补偿收口。
- Service Restore Apply 已通过：固定确认短语、服务端 Backup ID、恢复点、关闭 live Store、原子切换、Doctor、descriptor 删除和 Service 停止；无确认不产生变化。
- CLI 已提供 `backup create/validate/restore`；Restore 缺少精确 `--confirm RESTORE_AND_STOP_SERVICE` 时在加载 Service 前退出。独立进程冒烟已证明 CLI create → restore → Service exit/descriptor cleanup → restart → Doctor PASS。
- CLI Proposal 纵向入口已复用同一 Local Service：`proposal list/show/validate/submit` 支持固定 JSON envelope 与退出码，外部文件限制为 1 MiB UTF-8 JSON；validate 零持久化，submit 只进入 Plugin 共用审阅队列并显式返回 `formalWritesExecuted: false`，不存在 `proposal apply/commit`。真实 Service 集成已证明提交后 Proposal=1、Object=0、SemanticCommit=0；Context Package/export 与 Desktop 外部 Agent Gate 尚未完成。
- Slice B0 显式语法 Parser 已建立：只接受 `[任务]`、`[MiniProject]`/`#MiniProject`、`[决策]`、`[成果]`；Marker 不决定身份，裸 TODO 不物化，空标题/多类型冲突确定性拒绝，Area/Project 不使用未定义前缀猜测。
- Slice B3 Marker 自动合同已贯通 Parser → Plugin 有界队列 → Service → Application → Domain → SQLite：简单 Task DONE 改为 `COMPLETED`；CANCELED/CANCELLED 在记录取消原因前零写入；TODO/NOW/DOING/WAITING 不改 Condition/Focus；MiniProject/Project 关闭要求审阅；Decision/Output 不用 Marker 改 Lifecycle；语义冲突不断开健康 transport。Desktop Marker 形态与 Undo/复杂关闭审阅待验收。
- Slice B 防抖与首次物化基础已建立：UUID 级事件合并只交付最新 Parser 结果，失败显式回调；Application/SQLite 将 Object、Primary Anchor、Audit、Receipt 单事务写入并幂等重放，重复外部 Block 整笔回滚。
- Local Service 已开放受约束的 `POST /objects/materialize` 与统一 `POST /objects/synchronize`，并报告 `formalWrites=true`；请求不能携带 Graph/DB 路径/object_id/anchor_id/actor，只允许四类 Parser 对象、8 位 Anchor hash 和有界命令字段。
- 同类型显式同步后端已完成：Domain/Application/SQLite 更新标题缓存、对象版本和 Anchor 观察证据；`/objects/synchronize` 自动区分首次物化与已绑定更新，Service 用 Graph ID + Block UUID + Logseq 输入版本形成 SHA-256 幂等边界。类型变化明确零写入并作为 terminal Proposal-required 冲突保留，不再误当断线永久重试；正式 Proposal 创建仍属于 Slice C。
- Plugin 已将 `DB.onChanged` 接入显式 Parser/防抖/Service Client。Service READY 且声明 `formalWrites=true` 时统一经 Local Service 写 SQLite；断线时正文仍可编辑，最近事件只保存在按 UUID 覆盖、上限 256 的会话内队列，恢复连接后按幂等请求重试。该队列不写 FileStorage、不复制正文、不是第二状态源；交付失败、结构冲突或溢出都会进入脱敏诊断和 `reconciliationRequired`。
- Slice B1 有限子树合同已接入事件主链：`DB.onChanged` payload 只提供待重读根 UUID，不直接作为 Parser 正文；经 300ms 防抖后，以按 UUID 覆盖、最多 32 个待处理根的单消费者队列读取权威当前值，再在 256 个 Block 的总预算内 BFS 子树。相同根快速事件只保留最新一次，队列溢出显式置 `reconciliationRequired`；单次读取固定 `includeChildren: false`，不读取整页或全 Graph。引用/实体 UUID、children shape、循环去重与 frontier 都由防御性 Adapter 控制；截断或后代异常时只同步此前已权威读取并验证形态的前缀，失败点及未遍历部分不写入并要求 reconciliation；根自身不可读则零写入。注销会清空待处理根，cancellation token 在每次 bridge 读取前停止，既不迟到读取也不迟到交付。裸 TODO 进入 Parser `NONE` 且不产生 object_id/正式写入，嵌套显式 Decision/Output 等仍独立走统一同步命令。自动 fixture 已通过；真实 Desktop `DB.onChanged` shape 与粘贴/快速编辑仍待集中验收。
- 配置 V2 descriptor 后，Plugin 进入 V2 sync-only 运行路径：不初始化 V1 `VersionedStateRepository`，旧 Capture/Proposal/Commit 写命令保持关闭；V1 实现代码仅作为迁移与历史兼容资产保留，避免 V1 FileStorage 与 V2 SQLite 双写或双语义运行。
- Service 已开放当前 Graph 未被替换的 Primary Anchor 分页；Plugin 在每次恢复 READY 及其后每 5 分钟最多读取一页 256 个已知 Anchor 的对应 UUID，以不透明游标逐轮收敛且不扫描全 Graph。正文 hash 变化会走同一同步命令，并发检查会合并为同一轮，单个 Graph 读取失败不会断开健康 Service，dispose 后不会继续迟到工作。
- Slice B4 Anchor 观察持久化已贯通：Block 缺失记为 `missing`，Marker 移除/形态异常记为 `conflict`，Object 不删除；同 UUID 合法正文可恢复 `active`，`replaced` 不可复活。观察经 Local Service/Application，由 Service 注入 Graph/actor/version/幂等边界，Object version + Anchor + Audit + Receipt 单事务；重复同状态零写入，失败显式报告并可下轮重试。
- Slice B4 move/copy 自动合同已补：同 UUID 修改/移动经同步保持 object_id、anchor_id 和 Primary Ownership；相同正文的新 UUID 经 Service 首次物化为独立 object_id/anchor_id；Plugin `DB.onChanged` 夹具覆盖原 UUID 移动与新 UUID 复制同批到达，并把重复复制事件收敛为最新版本。真实 Logseq 跨页移动/复制仍待 Desktop 验收。
- Slice B4 rebind 安全闭环已补：精确 `REBIND_PRIMARY_ANCHOR` 确认由 Application 强制；Service 只接受旧 Anchor 引用、预览并发前置与新 Block 证据，注入 Graph/actor/幂等边界；SQLite 单事务把旧 Anchor 保留为 `replaced`、建立唯一新 active Anchor、更新同一 object_id 的正文缓存/版本及 Audit/Receipt。未确认、类型变化、目标 UUID 已有当前或历史绑定、Object/Anchor 预览 stale、重复请求及新 Anchor 插入中途故障均有零写入/幂等证据。Plugin Diagnostics 已提供有界审阅面板：只读当前选中的显式 Block、一页已知 Anchor 和 Service 对象投影，只显示同类型候选，展示旧/新影响并要求勾选确认；提交前重读 Block，Service/Application/SQLite 再校验 Object version 和旧 Anchor status/hash；预览绑定 Service discovery generation，discovery 期间先撤销旧 client 并暂停正式写入，提交期间不提供假取消。全程有 loading/success/error 与重复提交保护。Desktop 仍待验收。
- Slice B4 已增加用户手动启动的当前页显式对象候选发现：范围严格限制为当前页，不做启动扫描或全 Graph 扫描；Logseq API 一次提供整页 Block tree，Plugin 只处理快照前 256 项并如实提示截断，不再把处理预算表述成底层读取上限。`BlockUUIDTuple` 子节点在同一预算内以 `includeChildren: true` 按 UUID 防御性读取，并校验返回实体 UUID；不可读、形态异常或身份不匹配时整轮拒绝而非静默漏报。候选去重使用包含历史 `replaced` tombstone 的 Anchor 身份分页；覆盖未完成时整轮拒绝、零预览零写入，避免把当前或历史已占用 UUID 误称新候选。普通正文忽略，非法显式块只计数。候选逐项审阅、每次只同步一项，提交前按 UUID 重读并逐字段校验 version/hash/type/title；Service 重连使旧预览失效，正式请求发出后不提供假取消。写入仍只经 `/objects/synchronize` → Application → SQLite。该闭环已有自动证据，Plugin 退出期间新建 Block 的真实发现、stale 停写和 reload 仍待 Desktop，因此不能冒充 E2E-01/E2E-15 完成。
- Slice B5 Project 原子创建已通过自动与 Desktop Gate：最终 `Projects / 对象` 工作区 → Logseq Page Adapter → Local Service → Application → SQLite；prepare 发行稳定 semanticCommit/object ID 但不创建领域对象，插件只精确检查/创建带三项所有权证据的 `Project/<名称>` 页面，finalize 校验页面 UUID/hash 后将 Project、Primary Anchor、Audit、Receipt 单事务写入。真实 Desktop 已验证成功创建、V2 Lifecycle/Condition 对象列表、未知同名零覆盖、页面改名后同 UUID/同 object_id、冷 reload，以及 finalize 请求到达时停止 Service 后 SQLite 目标对象为 0、受控页面保留、重启同意图只收口一个对象。没有新增表、扫描器、双写或平行恢复账本。E2E-19 `DONE`；详见 `docs/implementation/V2_PROJECT_PAGE_CREATION_CONTRACT.md` 与 Desktop 报告。
- Slice C0-C5 Proposal 安全闭环已有自动基础与 Desktop 部分通过：runtime schema、确定性两文件、scope/hash/risk/dependency Validator、语义组部分接受、Proposal/Group 持久化、submit/list/get/review/revalidate 均通过。Review UI 在同一卡片展示理解、最终预览、文本/语义 Diff、分组处置、提交前检查和独立最终确认；Desktop 已真实证明接受不等于生效、版本重验、最终确认、Graph+SQLite Commit、卡片 Undo 和 cold reload。
- 单 Block 正式化 Commit 只支持一个 accepted group 中耦合的一个 Patch + `CREATE_OBJECT`；prepare 先持久化 PENDING Graph/Domain steps，Plugin 逐次重读 before/after hash，finalize 才经 Application 原子物化 Object/Anchor/Audit/Receipt，全部 VERIFIED 后标记 Proposal `APPLIED` 并在原卡片显示生效与 Undo。Domain 冲突只在无后续编辑时补偿；未知响应最多幂等重试一次。重启时已存在的 PENDING intent 接受精确 before 或 after Graph 证据继续，不会把自己写入的 after 状态误判 STALE；RECOVERY_REQUIRED 可从同一入口补偿。
- C5 inverse Commit/Undo 自动基础已完成：Undo 先建立独立 PENDING 逆向 Commit，将 Graph Patch 反向应用并验证，再通过 Application 删除精确未变化的当前 Object/Primary Anchor 投影；immutable Audit、正向 receipt 和 inverse receipt 均保留，正向 Commit 收口 `UNDONE`。Object version、完整 Object/Anchor、Ownership、Focus、额外 Anchor 或 Graph hash 任一后续变化都会零写入拒绝。中断后可按持久化 Commit 列表在同一 Review 卡片续跑；领域 Undo 失败只在正文未被二次编辑时恢复正向正文，否则保留 `RECOVERY_REQUIRED`。Desktop 连续审阅、真实中断和 Logseq Undo 对照仍待集中验收。
- Slice E Now Work 纵向闭环已接入 SQLite → Application projection/Command → Local Service → Plugin 正式 Now Work 页面：严格三个可空区域，不显示分数；Focus 可在同一页面加入、移出和手动上下排序，写入以对象版本和当前完整顺序作并发前置，但不伪装成 Lifecycle/Condition 或完整 Audit；插入 rank 会事务性让位，stale 批次整笔回滚。每张有 active Primary Anchor 的卡片可安全解析当前 Logseq 页面并打开正文。近期可推进项限制 12 项，普通 Waiting 保持安静，仅复查到期或影响 Focus 才出现。类型筛选和按类型分组是纯会话视图状态；筛选/分组时不暴露基于局部列表的顺序按钮，必须回到“全部 · 混排”调整完整 Focus 顺序。Desktop 已完成 Focus 加入、两项上移排序与 reload 恢复、Anchor 打开、WAITING/BLOCKED、本地时间期限、阻碍唤醒和 Task 筛选/分组，E2E-11 核心场景已通过；Project/Area 筛选、键盘与主题 Gate 仍未完成。
- V2 Condition 手工闭环已贯通 Now Work 同页表单 → Local Service → Application `change_condition` → SQLite 现有 `condition_json`：ACTIONABLE / WAITING / BLOCKED / PAUSED 字段集合封闭，WAITING 强制等待对象、期待结果和合法复查时间，PAUSED 可带合法复查时间；BLOCKED 可从 OPEN 对象可读列表选择阻碍来源，不存在、关闭和自引用均零写入。Focus A 指向阻碍 B 时，旧的可行动 B 会提前进入“接下来值得处理”，安静 Waiting B 也会被唤醒进入“等待与复查”，并显示自然语言原因。对象版本、确定性幂等回执和 Audit 同事务；Condition 更新不改变 Lifecycle 或 Focus。没有新增表、Schema 版本或关系状态源。Desktop 已验证 WAITING、BLOCKED 与阻碍唤醒，并新增验证 PAUSED 含原因保存/读回、对话框关闭且 Focus/Lifecycle 不变；失败表单仍待集中验收。
- V2 Task 明确期限已贯通 Now Work 表单 → Local Service → Application `change_due_at` → SQLite schema v6 nullable `objects.due_at`：只允许 OPEN Task，合法时间/清除、对象版本、幂等 Receipt 与 Audit 同事务；七天内或已到期限可突破近期更新时间边界进入“接下来值得处理”，按实际时间先后排序并显示自然语言理由，绝不生成分数。v1..v5→v6 均需先创建并只读校验快照，DDL/ledger/metadata 单事务，失败回滚。没有新表、平行状态或第二恢复路径。真实运行库 v3→v6 迁移与独立 Service/CLI 已通过，Desktop 已验证写入、显示、CLI 读回、reload 保持和已有期限清除；失败输入 Desktop Gate 尚未完成。
- 当前页显式 Candidate 已从 Diagnostics 移入正式 Review Center，并与 Proposal 形成明确的“待整理 / 待审阅”双视图及队列计数：用户在待整理视图手动启动当前页扫描、查看范围/截断/非法项说明、每次选择一个候选；提交前仍按 UUID 重读并经统一 Service/Application/SQLite 同步。切换只是会话级 UI 状态，没有新增领域状态或持久化。Diagnostics 不再承载该日常正式化入口，Anchor 修复与运行诊断仍保留。Candidate 拒绝/暂缓语义、跨来源统一列表和 Desktop Gate 尚未完成。
- 2026-07-20 Desktop 阶段 Gate：A-RT-01 与 A-RT-02 通过；专用页显式 Task 首次物化、同 object_id 标题更新、已知 Anchor 候选去重通过；Service 停止时正文连续两次可保存，重连同一 SQLite 后仅交付最新正文，object version 3→4。移除原 UUID Marker 后 Anchor 变为 `conflict`且原 Object 保持上一可信正文；恢复 Marker 后同 object_id/anchor_id 回到 `active`，version 5→6。Diagnostics 已真实显示完整 commit/listener snapshot 与显式同步 pending/transport/reconciliation 状态。同一测试库已在迁移前 0600 快照后从 schema v3 单事务升级至 v6，独立 Service + CLI status/Doctor/object list PASS，停止后 descriptor 清理且对象/完整性/Pending 计数不变；这不是期限 UI Desktop Gate。其余 Anchor missing/rebind、移动复制和有限子树仍待真实验收，详见 `docs/runtime/V2_SLICE_A_B_DESKTOP_REPORT.md`。
- 2026-07-20 Desktop 后续 Gate：冷启动已加载 commit `572ea5dd5e47`，修复无界 bridge 探测、Electron 旧 bundle 缓存、V2-only 工作区被误锁和 V2 对话框漏传。专用测试库已真实完成 Focus 加入、WAITING 证据、Task 期限、reload 保持、第二显式 Task 经 `DB.onChanged` 物化、BLOCKED 可读选择器和阻碍唤醒、Task 筛选/分组、Primary Anchor 打开。CLI 读回对象 version 9 与期限/Condition/blockerObjectId 一致；未修改正式 Graph，证据保留在本地 ignored 专用页面与 `tmp/runtime/v2-desktop/`。
- 2026-07-20 Project Desktop Gate：修复 V2 actions 被 V1-only guard 拦截和 V2 对象页固定空列表后，成功创建并显示 Project；未知同名页零覆盖，页面改名与冷 reload 保持 UUID/所有权/object_id。真实 finalize 进程中断时 descriptor 清理、SQLite 零半对象，重启同意图复用受控页面并只收口一个 Project；临时未知冲突页已清理，两个受控 Project 留在专用测试 Graph 供后续 Review/Closure Gate。
- 2026-07-21 Proposal Desktop Gate：在上述连续审阅闭环后，真实 Desktop 验证审阅期改文导致 Proposal `STALE` 且 Graph/SQLite 零写入；Commit 后用户再编辑时 Undo 明确拒绝并关闭确认框，显示结构化后续变化原因，正文/Object 保留且无逆向 Commit。为保证 cold restart 后 Anchor 身份，正式同步、候选提交和 Proposal Commit 前确保 Logseq `id:: <Block UUID>` 持久属性；语义 Parser/evidence/hash 忽略匹配身份行，未知身份行不静默处理。构建产物的入口缓存键现按 JS/CSS 内容摘要变化，Desktop 不再命中旧 bundle。高影响/拒绝/暂缓与 Commit/Undo 进程故障 Gate 仍待完成。

## 当前证据

- Git：`feature/task-copilot-mvp`；当前阶段包含 Service/CLI 基础与 SQLite 恢复加固；
- 自动检查：2026-07-21 `./scripts/check.sh` PASS，282 tests、145 rules、0 skipped；typecheck、lint、build、package/bootstrap/dist、边界与恢复演练全过；npm audit 既有 2 high / 1 critical 未用破坏性 `audit fix --force`；
- Process smoke：独立 Service 进程、0600 descriptor、`tc --json status`、`tc doctor`、Backup create/validate、CLI Restore 停服、descriptor 清理、重启后 Doctor PASS、0700/0600 权限均 PASS；2026-07-20 又对 Desktop 测试库完成 schema v3→v6 迁移前快照、独立进程重启、CLI status/Doctor/object list 与停服清理，schema v6 / integrity / 对象数 / Pending 均符合预期；
- Runtime：`docs/runtime/V1_MVP_PILOT_REPORT.md`；
- V2 Desktop：`docs/runtime/V2_SLICE_A_B_DESKTOP_REPORT.md`，当前 `PARTIAL_PASS`；
- Recovery：Pilot 前后 bundle 均已做 checksum/readback；Pilot 后 8 objects、14 captures、23 proposals、20 commits、1 relation、66 events；
- Pilot 后恢复包 SHA-256：`4e9dd666697b94ca0d6b81e7dc7bd0c12c82d0f432b2363eddfbc95a1a602612`；
- DeepSeek：`docs/testing/deepseek-v4-live-test-report.md`，状态 `L1_AUTOMATED_PASS_L2_CONFIG_INCOMPLETE`。

## 冻结与复用

- 复用：Domain/Application 分层、object_id、Anchor observation/rebind、Proposal DAG、SemanticCommit/inverse Commit、Pending/Recovery、A/B 恢复、Diagnostics、Logseq Adapter 和 runtime 测试纪律。
- 冻结只读：V1 FileStorage、恢复包、旧 Phase/Signal、Proposal/Commit/Event 历史。
- 淘汰：V1 长期写入模型、Phase/Signal 当前轴、Plugin 直写 Store、长期 V1/V2 双模式和双写。

## 下一步

1. 继续完成 `docs/runtime/V2_SLICE_A_DESKTOP_TEST_PLAN.md` 剩余 Anchor、移动复制、当前页离线候选和有限子树真实 Gate；
2. 在下一轮 Desktop 完成 B3 Marker 形态与 Task DONE/CANCELED Gate，复杂关闭接入 Slice C 审阅；
3. 将 Backup/Restore/Service restart/Doctor 纳入后续 Desktop 集中验收；
4. 在集中 Desktop Gate 验收 C1-C5 连续闭环：接受→最终确认→Commit→已生效→Undo，并注入 Service 中断与后续正文编辑；
5. 在同轮 Desktop 验收 Review Center 当前页 Candidate 扫描/逐项同步、Proposal 四处置与最终视觉；自动证据不替代该 Gate；
6. 在 Desktop 证据通过后再将 V2-FIRST-001 / E2E-15 标记为 DONE；Provider 自动基础已接入，取得安全运行配置后按显式开关执行 bounded DeepSeek L2/L3 live gate 与 Review Center Desktop 验收。

## 仍需用户决定

当前没有新的产品语义决定。真实 DeepSeek Gate 需要用户以环境变量或 Keychain reference 提供当前可用的 Base URL、Model ID 与 Key 引用；这不阻塞其他自动化和集中 Desktop 准备。
