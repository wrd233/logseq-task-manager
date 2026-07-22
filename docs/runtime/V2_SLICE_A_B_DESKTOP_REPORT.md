# V2 Slice A/B Desktop 阶段验收报告

> 日期：2026-07-20
> 环境：Logseq Desktop 0.10.15 / macOS arm64 / Node 20.20.2
> 状态：`PARTIAL_PASS`。A-RT-01、A-RT-02、A-RT-03 的断线最新值恢复，以及 Marker conflict → active 恢复已通过；其余 Anchor missing/rebind、移动复制和有限子树项目仍按集中清单继续。

## 范围与恢复边界

- 只使用 `Task Copilot/V2 Runtime/2026-07-20` 专用页面；没有修改正式事项。
- SQLite、Backup 和截图位于被忽略的 `tmp/runtime/v2-desktop/`；不进入 Git。
- 测试前 Graph 聚合 SHA-256：`bbfe2e776ccc243f38132d2bc3e3c684eb7e4a8f69eddcd1e1bb474bceaee4d9`。
- 测试前 V1 FileStorage 聚合 SHA-256：`2ee68e641f3be5c93c192127d6b3d6e15450bcdb9e6f5ecbd6caff475e92e438`。
- 未启动 Migration、Restore 或 Provider；没有模型调用。

## A-RT-01：未配置首次启用 — PASS

预期：受限欢迎页只有三个入口，Store 不启动，正式写入关闭，原生正文可编辑。

实际：

- Desktop 最初仍加载旧提交 `f1c61da006ca`；重新构建并 reload 后确认当前提交为 `690466ef876a`，避免把旧 V1 UI 当作 V2 证据。
- 欢迎页只显示“开始使用 / 迁移现有内容 / 检查系统状态”。
- Diagnostics：`SERVICE_DESCRIPTOR_PATH_REQUIRED`、formal writes false、Store `NOT_STARTED`、`V1 FileStorage inactive`、Pending/Conflict `0/0`。
- 专用页面成功新建并保存普通 Block，证明受限态不阻断正文编辑。

证据：

- `tmp/runtime/v2-desktop/a-rt-01-restricted-diagnostics.png`
- `tmp/runtime/v2-desktop/a-rt-01-graph-editing.png`

## A-RT-02：Service READY — PASS（含真实阻塞修复）

首次实际结果：Service health 为 READY、descriptor 为普通 0600 文件，但 Logseq 0.10.15 plugin iframe 不暴露 `globalThis.require/window.require`，Plugin 进入 `SERVICE_DESCRIPTOR_READER_UNAVAILABLE`。

修复：

- 保留 Electron Node reader 作为兼容入口；Desktop 无该能力时，使用 Logseq 自带的插件私有 FileStorage bridge 读取一个受限文件名 key。
- descriptor 仍由 Local Service 原子创建并强制 0600；设置只保存非敏感 key，不保存 token。
- 私有 FileStorage 在此只承担会话发现，不保存领域状态，不恢复 V1 写入，也不构成 SQLite 双写。
- 补充 key traversal、读取失败脱敏和 UI 状态自动测试。

修复后实际：

- Diagnostics：Service READY、formal writes true、SQLite 单一状态源、V1 FileStorage inactive。
- 显示 Plugin `690466ef876a`、Logseq 0.10.15、事件监听齐全。
- descriptor 权限实测 `0600`；health protocol v1 与 capabilities 匹配；输出和截图无 token。

证据：`tmp/runtime/v2-desktop/a-rt-02-service-ready.png`。

## Slice B：显式 Task、Anchor 与断线恢复 — PARTIAL PASS

在专用页创建 `[任务] V2 Desktop Gate Task — verify explicit synchronization`：

- Service 产生一个 `TASK`、一个 active primary Anchor；object version 从 2 开始。
- 修改标题后，同一 object_id/anchor_id 保持，version 变为 3，SQLite 标题与正文一致。
- 手动“扫描当前页候选”返回“没有新的合法显式对象候选”，与 Service 已知 Anchor 去重一致，没有重复物化。

随后停止 Service，连续保存 `offline draft one` 和 `offline latest`：

- Logseq 正文两次均成功保存；结构化日志出现 `explicit_sync_issue` / deferred，没有正式写入成功提示。
- 重启同一 SQLite Service，并仅更新 descriptor key 触发连接；不 reload Plugin。
- 队列只交付最新正文：同一 object_id version 从 3 变为 4，SQLite 最终仅为 `offline latest`。
- Diagnostics 恢复 READY；V1 FileStorage 领域写入仍未启用。

证据：`tmp/runtime/v2-desktop/b-rt-offline-recovered.png`；SQLite/Service 只读查询记录在本轮执行日志，未保存 token 或原始 descriptor。

## Slice B：Marker conflict 与原身份恢复 — PASS

在同一 Block 和同一运行 Service 上移除 `[任务]` 显式 Marker：

- Plugin reload 后的已知 Anchor reconciliation 将 Anchor 从 `active` 置为 `conflict`；
- 原 object_id/anchor_id 保持，Object 没有删除、复制或被非法正文覆盖；标题仍为上一次可信值 `offline latest`；
- Diagnostics 实际显示 `pending: 0`、`transportReady: true`、`reconciliationRequired: true`，不再只能从底部日志推断。

随后在原 UUID 恢复 `[任务] V2 Desktop Gate Task — marker restored`：

- 同一 object_id/anchor_id 恢复为 `active`；
- Object version 5→6，标题与正文一致；
- 没有重新绑定、新建对象或人工修补数据。

证据：

- `tmp/runtime/v2-desktop/b-rt-marker-conflict-diagnostics.png`
- `tmp/runtime/v2-desktop/b-rt-marker-restored.png`
- Service 只读查询中的 object/anchor 身份和 version 记录，未保存 descriptor/token。

## SQLite schema v3 → v6 受控升级与进程复核 — PASS（非 Desktop UI Gate）

在 Service 已停止后，对同一专用测试库执行升级前只读检查：Graph identity 为 `logseq-v2-desktop-20260720`、schema v3、integrity `ok`、1 个对象、0 个 `PENDING / RECOVERY_REQUIRED` Commit。

- 使用正式 `V2SqliteStore.migrateSchema()` 在受控 Backup 目录先创建 0600、不覆盖的 schema v3 快照；
- 快照只读校验通过后，v4 Proposal 表、v5 Audit 解耦和 v6 nullable Task `due_at` 在一个迁移事务中落地；
- 升级后 Doctor：schema v6、integrity `ok`、foreign-key violations 0、对象数仍为 1；migration ledger 为连续 v1..v6；
- 迁移前快照再次只读确认仍是 schema v3、integrity `ok`、对象数 1；
- 当前 DB 权限收紧为 0600；随后以独立 Service 进程启动，CLI `status` / `doctor` / `object list` 分别确认 READY、schema v6、Doctor PASS 和原 object_id/version/text 未变；
- SIGINT 正常停止后 descriptor 自动删除；最终只读检查仍为 schema v6、integrity `ok`、1 个对象、0 个 Pending/Recovery Required。

本项证明真实运行库和独立进程可安全升级/重启，但没有在 Logseq Desktop 点击期限表单或验证 reload，因此不冒充 E2E-11 Desktop PASS。快照与 DB 位于忽略的 `tmp/runtime/v2-desktop/`，未记录 token。

## Slice E：Now Work 真实交互与 reload — PARTIAL PASS

使用同一专用页面、schema v6 SQLite 和真实 Local Service，从 Logseq Desktop 正式插件执行：

- 冷启动后确认 Plugin commit `572ea5dd5e47`、Runtime/Store/Service `READY`、`formalWrites=true`；
- Now Work 真实显示原 Task，点击“加入关注”后立即进入“当前关注”；reload 后 Focus 仍在；
- 在同页表单将 Condition 设为 `WAITING`，写入等待对象、期待结果和本地复查时间；CLI 读回 object version 7 及 ISO 时间；
- 通过 Task 期限表单写入明确本地时间，CLI 读回 object version 8 及 `dueAt`；reload 后页面仍按本地时间显示；
- 在专用页面新建第二个显式 Task，真实 `DB.onChanged` 管道自动物化新 object_id/Anchor，未执行全 Graph 扫描；
- `BLOCKED` 表单显示可读的第二 Task 选项；选择后原 Task version 9，Condition 持久化 blockerObjectId，阻碍对象提前进入“接下来值得处理”并显示自然语言原因；
- 点击类型筛选与按类型分组后，页面显示“筛选不会改变正式状态”，局部视图不提供 Focus 排序按钮；
- 切回“全部 · 混排”后将第二 Task 加入 Focus，点击上移将它排在原 Task 前；冷重启 Logseq 后该完整顺序仍从 SQLite 恢复；
- 从阻碍对象卡片点击“打开正文”，Logseq 保持专用页面并确认目标 Block 存在，正文与领域状态未改变。

本轮由真实 Desktop 发现并修复了四个不能由原自动测试证明的问题：

1. 冷启动过早的 Logseq Graph/版本 bridge 调用可能不返回，现已有界等待，不再卡住后续 Service 初始化；
2. 插件内部 JS/CSS 的固定 URL 被 Electron 缓存旧 bundle，现由构建提交号作资产 cache key；
3. V2 sync-only 路径在 Service READY 后仍将通用 `featureReady` 置 false，导致用户只能看 Diagnostics；现在不启用 V1 Store 的前提下解锁 V2-only 工作区；
4. V2-only 模型漏传 `actionDialog`，导致“更新状态/设置期限”看似无响应；现已显示、提交和读回。

另外，对已在 Focus 中的 future-review Waiting 对象，不再误报“复查已到”或重复提供“加入关注”。Service 启动 stdout 也与 health 共用同一 capabilities 常量，不再把真实 `formalWrites=true` 误报为 false。

证据（本地 ignored）：

- `tmp/runtime/v2-desktop/now-work-5b85da8-ready.png`
- `tmp/runtime/v2-desktop/now-work-waiting-8c349e5.png`
- `tmp/runtime/v2-desktop/now-work-reload-8c349e5.png`
- `tmp/runtime/v2-desktop/now-work-waiting-corrected-572ea5d.png`
- `tmp/runtime/v2-desktop/now-work-blocker-572ea5d.png`
- `tmp/runtime/v2-desktop/now-work-focus-order-reload-572ea5d.png`

E2E-11 的 Focus/期限/阻碍/Waiting 可解释排序场景已有自动成功/失败路径和真实 Desktop + reload + CLI 证据，可标记 `DONE`。整个 V2-VIEW-001 仍缺 Project/Area 筛选、键盘、深浅主题和 Review Center 完整视觉 Gate，仍为部分通过。

## Slice B5：Project 页面与对象原子创建 — PASS

使用真实 `Projects / 对象` 工作区、专用测试 Graph 与同一 schema v6 SQLite 完成：

- Desktop 首次提交 `V2 Desktop Project Gate 20260720` 时发现 V2 action 被 V1-only runtime guard 提前拦截；修复后 `create-v2-project` 以及 Review/Commit/Undo 路由均先于 V1 guard，并由启动完整性检查锁定；
- 创建成功后，Logseq 页面 UUID `6a5e3e63-0f91-4210-8c98-6b63adcae895` 同时带 owner、object_id 与 semantic commit 三项证据；CLI 读回同一 Project、Primary Anchor 来源与 SQLite object_id；
- V2-only `Projects / 对象` 原先固定显示空列表；现从 Local Service 只读 `listObjects()`，直接显示 `Lifecycle / Condition / version`，没有把 V2 映射回 V1 Phase，也没有增加状态源；
- 预先创建无 Task Copilot 属性的 `Project/V2 Desktop Unknown Conflict 20260720` 后，正式表单明确拒绝覆盖；未知页 UUID 与空属性不变，SQLite 对象数不变。证据完成后该临时冲突页已删除；
- 将受控页面改名为 `Project/V2 Desktop Project Gate Renamed 20260720` 后，页面 UUID、object_id 和所有权证据不变；用原创建意图重试解析到改名后的同一页，未创建旧名称页面或第二个对象；
- 冷重启 Logseq 后，bundle commit `65412e6f9e5b`、改名页面、同一 UUID/属性和 V2 对象列表均恢复；
- 真实进程 fault injection 在 `/projects/finalize` 到达时停止 Local Service：UI 明确提示保留受控页面并同名重试，descriptor 正常清除，SQLite 仍为原 3 个对象且目标 Project 为 0；重启同一 Service 后，同名重试复用页面 UUID `6a5e3fd6-7642-4f04-a1a9-8c08a7076ff2`、预发行 object_id 与 semantic commit，只生成一个 Project，UI 与 CLI 一致；
- 两个成功 Project 页面保留在专用测试 Graph 作为后续 Project/Review Gate 对象；未修改生产事项，截图与 SQLite 仍在 ignored 本地目录。

证据（本地 ignored）：

- `tmp/runtime/v2-desktop/project-create-7676ddc.png`
- `tmp/runtime/v2-desktop/project-list-65412e6.png`
- `tmp/runtime/v2-desktop/project-conflict-65412e6.png`
- `tmp/runtime/v2-desktop/project-reload-65412e6.png`
- `tmp/runtime/v2-desktop/project-finalize-outage-65412e6.png`
- `tmp/runtime/v2-desktop/project-finalize-recovered-65412e6.png`

自动合同已覆盖 prepare/finalize、未知同名零写入、响应不确定、同意图续跑、完成后改名与事务 fault injection；本轮补齐真实 Desktop 和进程边界，因此 E2E-19 标记 `DONE`。

## Slice C：Proposal → Review → Commit → Undo — PARTIAL PASS

在同一专用测试 Graph 中，以 authenticated Local Service 提交脱敏、确定性的 `source:user` Proposal（本项验证下游审阅闭环，不冒充 DeepSeek/Agent 生成）：

- Review Center “待审阅”真实显示当前上下文、理解与逻辑、最终可读预览、文本 Diff、语义 Diff、风险与组处置；
- 点击“接受该语义组”后，卡片与顶部消息均明确“尚未正式生效”；“提交前检查”真实重读 Block UUID/hash 并通过，仍不写正文/对象；
- “确认最终提交”在同一审阅上下文显示独立勾选确认；Commit 后 Block 正文、SQLite Task、Primary Anchor、Proposal `APPLIED` 和 SemanticCommit `COMPLETED` 一致，卡片立即显示“已正式生效”和 Undo；
- 首次真实 Commit 暴露确认框成功后未关闭，已修复 Commit/Undo settle 后关闭当前确认；
- 首次真实 Undo 暴露插件正文写入的 `DB.onChanged` 回声把自身对象推进版本，严格 Undo 因而拒绝。修复为一次性精确 UUID+content-hash 回声抑制：只忽略下一次完全匹配的插件写入，任何不匹配或后续观察继续进入正常同步；没有放宽 Undo 版本规则；
- 回声修复又揭示对象标题曾依赖错误回声从 Patch 前正文“补对”。新 Proposal submission 现强制 `CREATE_OBJECT.payload.text` 明确携带审阅后的最终对象正文；历史记录仍可读，旧 `APPLIED` 记录只允许生成逆向计划，不能借兼容入口重新提交；
- 修复后的最终 Commit 中，Graph 正文为 `[任务] 对照最终文本验证修复后的 Commit 与 Undo`，SQLite Task 文本为 `对照最终文本验证修复后的 Commit 与 Undo` 且保持 version 2，证明没有自回声和二次补漏；
- 同一卡片 Undo 后，Block 恢复原普通正文，Object/Primary Anchor 当前投影均不存在，正向 Commit 为 `UNDONE`、逆向 Commit 为 `COMPLETED`；确认框关闭，Audit 历史保留；
- 冷重启 Logseq 后，bundle commit `b75768eaf34e`、恢复后的正文、撤销卡片和正/逆 Commit 状态保持。
- 后续编辑拒绝 Gate：对已完成 Commit 的 Block 做用户后续编辑，再从同一卡片确认 Undo；UI 显示“对象或 Anchor 已有后续变化；Undo 没有写入”，确认框关闭，正文保留，Object version 继续前进，正向 Commit 仍为 `COMPLETED`，没有逆向 Commit。
- 真实复核发现 Logseq 普通 Block 的 UUID 在硬退出后的重新索引中可能变化；未持久化 `id:: <Block UUID>` 时，旧 Anchor 正确进入 `missing`，不是误报。V2 现将 `id::` 作为 Logseq 原生身份证据：正式同步、候选提交和 Proposal Commit 前确保写入并复核；Parser、Proposal evidence、Anchor hash 和回声抑制均忽略匹配的身份属性行，不把它混入用户正文。未知/不匹配的身份属性不被静默删除。

探索期第一个 pre-fix Proposal 已在本地测试库形成 version 3 的自回声对象，其严格 Undo 会按旧证据拒绝。该记录没有伪装成修复后结果，也未手工改库；它保留为诊断证据且只存在于 ignored 测试 Graph/SQLite。后续两个修复后闭环均按正式路径成功 Undo。

证据（本地 ignored）：

- `tmp/runtime/v2-desktop/proposal-review-ready-65412e6.png`
- `tmp/runtime/v2-desktop/proposal-accepted-not-applied-65412e6.png`
- `tmp/runtime/v2-desktop/proposal-applied-65412e6.png`
- `tmp/runtime/v2-desktop/proposal-undone-d33fbc4.png`
- `tmp/runtime/v2-desktop/proposal-final-applied-b75768e.png`
- `tmp/runtime/v2-desktop/proposal-final-undone-b75768e.png`
- `tmp/runtime/v2-desktop/proposal-final-reload-b75768e.png`
- `tmp/runtime/v2-desktop/proposal-stale-refused-b75768e.png`
- `tmp/runtime/v2-desktop/proposal-later-edit-applied-b75768e.png`
- `tmp/runtime/v2-desktop/proposal-later-edit-undo-refused-cf0bf600db5b.png`

本轮完成了 MEDIUM 单组接受、重验、最终 Commit、Undo、cold reload、审阅期 stale 原文停写和 Commit 后后续编辑拒绝覆盖。高影响独立确认、拒绝/暂缓与 Commit/Undo 进程故障仍需 Desktop，因此 E2E-08、E2E-12 仍为 `DESKTOP_PARTIAL_PASS`；E2E-09、E2E-10 的核心 Desktop Gate 已通过，但进程故障分支仍保留在 Slice C 待验收。

## 本轮发现的交互问题

1. Diagnostics 原先没有渲染已有的 `explicit_sync` snapshot，用户只能从底部结构化日志判断断线队列；已补可见 `pending / transportReady / reconciliationRequired` 区块。
2. V2 sync-only 模式打开主 UI 时使用基础 snapshot，导致 commit 显示 `unknown`、listeners `{}`；已改为完整脱敏 snapshot。
3. Anchor repair 仍位于 Diagnostics，符合开发期 Gate，但不符合最终日常入口；当前页候选已迁入 Review Center。

## 尚未通过

- 明确 `SERVICE_UNAVAILABLE` reload、协议版本错误。
- Plugin 退出期间变更后的已知 Anchor 恢复。
- Anchor missing 与审阅式 rebind（conflict→active 原 UUID 恢复已通过）。
- 跨页移动、复制新身份。
- 当前页两个离线新候选、stale preview 与逐项提交。
- 真实有限子树、裸 TODO、嵌套 Decision、粘贴、预算与取消。
- Now Work 的 Project/Area 筛选、键盘与深浅主题视觉 Gate（E2E-11 核心场景已通过）。

因此本报告不将 E2E-01、E2E-15 或整个 Slice A/B 标记为 DONE。

## 2026-07-21 增量 Gate：PAUSED 与期限清除 — PASS

在同一专用测试 Graph 的 Now Work 页面完成两条低风险交互：

- 对 `V2 Desktop Gate Task — marker restored` 打开已有期限，勾选“期限清除”并保存；卡片立即移除期限显示，Local Service/SQLite 读回保持对象与 Focus 不变；
- 对 `V2 Desktop Blocker — restore event` 打开“更新状态”，选择 `PAUSED`，填写原因“暂缓，等待下一轮集中验收”并保存；卡片立即显示 `TASK · PAUSED`，对话框关闭，未改变 Lifecycle 或 Focus；
- 两次操作均通过正式 Now Work → Local Service → Application → SQLite 路径完成，没有直接改 Graph 正文或新增状态源。

这补齐了 Condition `PAUSED` 点击路径与 Task 期限清除的真实 Desktop 证据；Condition 失败表单、协议错误和受限态 reload 仍待集中验收。

## 2026-07-22 增量 Gate：Anchor Move / Copy / Rebind / reload — PASS

环境：Logseq Desktop 0.10.15、专用 ignored Test Graph `logseq/`、同一 schema v10 SQLite、基于 `23ad015` 的本地重建 Plugin。全部操作均发生在专用测试页面；没有修改正式 Graph，也没有手工写 SQLite。

### 先失败、再收口的真实证据

1. 首次以 Logseq 原生 Cut/Paste 跨页移动正式 Task 时，`id::` 随 Block 保留，运行中 `object_id`/`anchor_id` 也保持；但 Plugin reload 后立即运行的 Anchor reconciliation 早于 Logseq 页面索引完成，把可恢复 Block 短暂误报为 `missing`。
2. 通过 Diagnostics 的高影响 Rebind 把同一 Object 绑定到新 Block 后，发现旧提交路径未先固化新 Block 的 `id::`；该 Anchor 下一次 reload 仍可能再次失联。
3. 曾评估从 `txData` 补抓粘贴 UUID；真实 `insert-blocks` 事件证明 `event.blocks` 已包含所需 Block，而 datom 还会包含瞬态空 Block。该补漏会制造无效子树读取，因此完整撤回，没有形成第二事件路径。

对应修复严格复用既有机制：

- Rebind 在独立确认和 stale 重读通过后，先调用既有 `ensurePersistentBlockIdentity` 写入并复核 `id:: <Block UUID>`，再以身份写入后的 Logseq version 和去身份属性 hash 调用唯一 Local Service Rebind；确认缺失或预览过期仍为 Graph/SQLite 零写入。
- Service 恢复后的同一已知 Anchor reconciliation 首轮延迟 5 秒，避开 Logseq cold reload 索引窗口；仍是原有一页 Anchor、同一 `readBlock` 和同一 `observePrimaryAnchor` 路径。没有新增表、扫描器、补漏器、协议、状态源或正式写入口。

### Rebind 与 reload

- 失联 Object：`obj_20260721164223658_cdcfa30bfe7149cca7996f0f3d4d042f`；首次旧 Anchor 保留 `replaced`，没有删除历史。
- 修复后重新绑定的新 Block UUID：`6a5fbcda-bc45-4524-b73d-5c9fd41c2b25`；UI 在确认后真实写入同值 `id::`，新 Anchor `anc_20260721184321814_e2c49fd576844d32b8dc20889a8bc44d` 成为唯一 active。
- 下一次 Plugin reload 中，页面先短暂为空、随后 Logseq 完成索引；5 秒后 reconciliation 将此前 `missing` 的同一 Anchor 恢复为 `active`，Object version 13→14，正文缓存保持 `Association 来源对象 20260722 Copy`，没有创建新 Object。

### E2E-04 跨页移动

将上述 active Task 从 `V2 Anchor Move Target 20260722` 以 Logseq 原生 Cut/Paste 移到新页 `V2AnchorNativeMoveTarget20260722`：

- Graph 目标页保留 `id:: 6a5fbcda-bc45-4524-b73d-5c9fd41c2b25`，源页不再含该 Block；
- 移动前后及 reload 后均为同一 `object_id`、同一 active `anchor_id`、同一 external Block UUID、同一正文和 object version 14；
- Primary Ownership 前后均为 0；既有 RELATED Association `rel_20260721165023297_2de4bc92d9dd40048bb35243d649bf88` 前后均为 `ACTIVE`；位置没有变成归属或 Association；
- reload 9 秒后 Anchor 仍为 active，没有 false missing、第二 Object 或第二 Anchor。

因此 E2E-04 的真实 Desktop + reload Gate 为 `DONE`。

### E2E-05 复制正式 Block

通过 Logseq “复制/导出为不含 properties 的正文 → 粘贴 → 结束编辑事务”复制同一显式 Task：

- 原对象保持 `obj_20260721164223658_cdcfa30bfe7149cca7996f0f3d4d042f` / UUID `6a5fbcda-bc45-4524-b73d-5c9fd41c2b25`；
- 副本获得新 UUID `6a5fb2b5-ee25-41e9-a85c-99e7f81493e0`、新 Object `obj_20260721175750014_fde635dc8c5542e79bfd1efcf3b408d5`、新 Anchor `anc_20260721175750014_c4bf040d3ed843e0801d5592410c880a`；
- 两者在 reload 后均为 active；副本没有继承原 `object_id`、Anchor、Ownership 或 Association，原对象也没有被覆盖。

因此 E2E-05 的真实 Desktop + reload Gate 为 `DONE`。本轮当时已通过 E2E-06 的 missing→显式确认→replaced 历史→新 active→reload 子路径；后文 2026-07-22 增量 Gate 已进一步补齐从真实删除开始的完整审阅场景。

## 2026-07-22 增量 Gate：删除 Primary Anchor → Review → Rebind → reload — PASS

在隔离测试 Graph 中对一个已物化 Decision 执行完整用户路径：

1. 停止 Local Service 后真实删除旧 Block UUID `6a609a8c-2a21-423c-b88b-48fc5e028460`，并在同一测试页新建未绑定 Decision UUID `6a60a094-6f26-49b7-9263-a877a76e42af`；随后 cold restart Plugin，会话内待同步事件没有变成持久第二队列，新 Block 未被自动扫描或物化。
2. 重启同一 SQLite Service 后，已知 Anchor reconciliation 只按 Service 返回的旧 UUID 读取；Diagnostics 显示 `EXPLICIT_SYNC_PRIMARY_ANCHOR_MISSING`。原 Decision Object 保留，version 2→3，旧 Anchor 为 `missing`，且只有一条 `observe_primary_anchor` Audit/Receipt。
3. 选中新 Decision 后，Diagnostics 预览同时显示新 UUID/正文/hash、同类型候选及旧 `missing` Anchor，并明确“object_id/Primary Ownership 不变，旧 replaced，新 active”。
4. 选择旧 Anchor 但不勾选独立确认时，UI 明确显示“没有执行写入”；SQLite 前后均为 object version 3、1 Anchor、2 Audit，证明零写入。
5. 重新预览并勾选独立确认后，插件先持久并复核新 Block `id:: 6a60a094-6f26-49b7-9263-a877a76e42af`，再调用唯一 Local Service Rebind。同一 object_id 前进到 version 4，正文更新为新 Decision；旧 Anchor 保留 `replaced`，新 Anchor `anc_20260722105315235_f928bbaffeb043979cb08dd2a3432764` 为唯一 `active`，只增加一条 `rebind_primary_anchor` Audit/Receipt。
6. cold reload 后 Object 仍是 version 4，旧 `replaced`/新 `active` 和新 `id::` 均保持。连续测试会话首次 reload 的旧 Graph broker 请求使 Plugin 进入受限态；按正常会话边界重启 Local Service 并重新探测后，Runtime/Store/Service 全部 `READY`，Graph bridge `CONNECTED`，Doctor `PASS`、integrity `ok`、foreign-key violations 0。Domain/Anchor 结果在受限期间也未变。

这补齐了之前只有“已经 missing 的对象→rebind”的子路径；E2E-06 现在有真实删除起点、明确零写入拒绝、唯一高影响写入和 reload 证据，可标记 `DONE`。未新增表、协议、扫描器、持久队列或恢复路径。

结构化脱敏证据：`docs/testing/v2-anchor-delete-rebind-desktop-2026-07-22.json`。
