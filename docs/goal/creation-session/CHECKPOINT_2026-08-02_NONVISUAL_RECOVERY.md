# Creation Session 无视觉接力收口 — 现场恢复 Checkpoint

> Updated: 2026-08-02（执行时事实，后续运行必须先复核）
> 性质：无视觉 Codex 接力收口（Goal objective
> `09d782f2-3946-4d7a-b283-81ffcd81710f/goal-objective.md`）

## 接手时恢复的事实

### Git / 工作树

- Branch: `feature/task-copilot-mvp`
- Base HEAD: `c0ad54dc5526d69c16416fa0e76af4407d5a24af`
- 未提交修改 17 个文件（上一轮 runtime 修复，尚未 Commit）：
  - Local Service：Draft/Round 输出合同收紧、`validationCategory`/`validationRule`
    脱敏诊断、Service 422 映射、DeepSeek `thinking: disabled`、相关测试；
  - Service Client：bounded `validationCategory` 透传；
  - Plugin：Creation Session Validator 失败用户文案、Dialog 视口内固定、
    MiniProject Tree mismatch 诊断（`treeMismatchRule`）、相关测试；
  - `apps/task-copilot-local-service/package.json`：用户已有改动（`logseq.id`），
    不属于本 Goal，不暂存、不提交。
- 接手时根级 `./scripts/check.sh` 在 Plugin typecheck 失败：
  未提交测试用双参 `getBlock` 覆盖单参宿主接口（已修复，见后）。

### 安装态（接手时）

- Node：默认 `v25.6.1`；仓库权威为 `/opt/homebrew/opt/node@20/bin/node`
  `v20.20.2`。
- 安装态 Service：`~/Library/Application Support/Task Copilot/bin/service.js`
  SHA-256 `e587e997…`，与源码 `apps/task-copilot-local-service/dist/service.js`
  完全一致（18:10 构建，已含上一轮未提交 Provider/诊断改动）。
- 安装态 Plugin：Logseq external
  `tmp/runtime/global-object-directory/plugin-dist/task-copilot-plugin`，
  dist 构建于 18:05，**落后于** 18:19 修改的
  `creation-session-mini-commit.ts`（mismatch 诊断未进 bundle）。
- Logseq Desktop `0.10.15` 正在运行，测试 Graph
  `/Users/wangrundong/work/任务管理中心-logseq插件/logseq`（transit 20:11 更新）。
- Launcher：`com.task-copilot.launcher.plist`（Node 20），config
  graphKey `graph-a00da3a2…`、`graphId=logseq`、
  database `tmp/runtime/manual-v2/task-copilot.sqlite`、Provider
  `deepseek/deepseek-v4-flash`（Keychain ref）。

### SQLite / 正式状态（接手时）

- Schema `16`，integrity `ok`，foreign-key violations `0`。
- Objects `59` / Anchors `64` / Proposals `51` / SemanticCommits `77` /
  Steps `154` / Receipts `267`。
- 上一轮真实 MiniProject 事务仍留账本：
  - Session `creation_20260802093016710_1254bc57c5444bf88f7ed7a2dfaa7bb8`
    `MINI_PROJECT / PREVIEW_READY / v17`；
  - Proposal `proposal-creation-8b4038f0` `ACCEPTED`（HIGH
    `CREATION_SESSION_V1`，PAGE_END 新树，9 节点）；
  - Commit `proposal-commit:fffce7…` `PENDING`，step0 GRAPH_WRITE
    `PREPARED`（before `732d4b44` / after `8b6970e5`），step1 DOMAIN_WRITE
    `PREPARED`；
  - Graph 已安全恢复（无残留 staging、无 root UUID），Object 未创建，
    Session 未进入 `CREATED`。
- Doctor（重启后复核）：PASS；WARN 仅 `STALE_PROPOSAL_PRESENT(1)` 与
  `COMMIT_PENDING(1)`（即上述旧事务）与 `BACKUP_LATEST_INVALID`。

## 真实 Tree 校验根因（结构化证据）

用原 Proposal 的 9 个节点复算：

```text
raw-order hash（子节点 order 1..8，即 Service 原 afterHash） = 8b6970e5
readback hash（Logseq 读回子节点数组下标 0..7）              = 9f2abdfa
canonical hash（按父级重排为 0 基 rank）                     = 9f2abdfa
```

- 期望侧使用 Draft/Provider 的 1 基 sibling `order`，实际侧使用运行时数组下标
  0 基；`creationSessionMiniTreeHash` 把原始 order 计入哈希，导致真实运行
  after-tree 校验必然失败；自动化 fixture 使用 0 基所以通过。
- 该差异属于“同一语义的不同运行时表达”，不降低任何安全属性：父关系、相对
  顺序、正文 Hash、UUID 仍全部精确比较。

## 本次已完成工程修复

1. 修复上一轮遗留 typecheck（FakeMiniHost `getBlock` 签名）。
2. `packages/application`：
   - 新增 `CREATION_TREE_CANONICAL_VERSION`（`task-copilot-creation-tree-canonical-v1`）；
   - 新增 `canonicalCreationMiniSiblingOrder`：按父级以
     `(order, blockUuid)` 排序后重排为 0 基 rank；
   - `creationSessionMiniTreeHash` 改为 canonical 哈希；
   - 保留冻结的 `creationSessionMiniTreeHashLegacyOrder`（旧账本兼容）；
   - `planCreationSessionMiniGraph` 可选 legacy 模式。
3. Local Service：prepare 对既有 PENDING/RECOVERY_REQUIRED 账本同时接受
   canonical 与 legacy step hash，旧事务仍可经同一 Proposal 续跑/补偿，
   返回的 graphPlan 一律为 canonical。
4. Plugin MiniProject：
   - 写入后读回增加有界 settle（最多 5 次、100/200/400/800ms，总上限 <2s，
     每次记录结构 Hash；超时仍 fail-closed）；
   - mismatch 诊断扩展为完整脱敏结构报告（节点数、missing/unexpected、
     rootUuidMatch、parent/order/uuid/contentHash mismatch 短 Hash 列表、
     preorder 短 Hash、canonical version、readAttempt、settleDurationMs）；
   - 错误消息仍携带 mismatchRule，不输出用户正文。
5. Plugin Project：Page Tree 精确读回同样有界 settle。
6. 测试：Plugin 531/531、Local Service 201/201、Application 180/180 通过；
   新增 canonical 0/1 基等价、swap 顺序差异、persistent mismatch 报告、
   transient settle 成功用例。
7. 重建并同步安装态：Plugin dist（新 hash）已复制到 Logseq external 路径；
   Service bundle 已复制并重启（新 PID 68943，READY / schema 16 /
   Doctor PASS）。

## 四类清单

### 已完成且不得重做

- schema 16 CreationSession authority、多会话、来源快照/drift/refresh、
  2–5 题轮次、answer-first、Draft Node/Revision、用户编辑保护、
  HIGH Proposal / Semantic Commit / 原子 Domain finalize / 补偿 / Undo、
  统一 Creation Session UI、terminal History。

### 已实现但尚未真实证明

- MiniProject 真实 `Commit success → reload → Undo → reload`；
- Project 真实 `Page source → new Page → Commit → reload → Undo → reload`；
- Recovery 真实收口（旧 PENDING 账本续跑）；
- 正常单对象创建是否仍被迫跳 Review Center 重复审阅。

### 当前真实缺陷

- 树校验 order 基差异（已修复并复算证实；待真实 Desktop 复验）。

### 仅需视觉复验

- Light/Dark、720×520/1000×720/1440×900、草稿 Logseq 感、面板墙、
  重复审阅观感、长内容/IME/焦点等（最终一次性清单见
  `NON_VISUAL_HANDOFF_TO_VISUAL_REVIEWER.md`，随收口生成）。

## 下一步唯一主阻塞

真实 Logseq Desktop 上重跑同一 MiniProject 事务（reload 新 Plugin →
从旧 Proposal 继续 → after-tree PASS → finalize → reload → Undo → reload），
随后完成 Project 真实闭环与重复审阅审计。

## 收口结果（2026-08-02 晚，全部真实 Desktop 0.10.15 + 真实 DeepSeek）

### MiniProject 真实闭环

- 同一原 Proposal `proposal-creation-8b4038f0` / PENDING Commit
  `proposal-commit:fffce7…` 经 UI“继续原修改”续跑完成：
  step0 GRAPH_WRITE VERIFIED（canonical afterHash `9f2abdfa` 与独立复算一致）、
  step1 DOMAIN_WRITE VERIFIED、Commit COMPLETED、Proposal APPLIED；
- Object `creation-object-8b4038f0` MINI_PROJECT v2 OPEN、Anchor active、
  Audit 195（0→2）、Receipt 存在；Session `CREATED` v18；
- reload（完整 Logseq 重启）后保持；最近修改正确路由
  `v2-creation-session-undo`；Undo 后正向 UNDONE、inverse COMPLETED、
  Object/Anchor 0、Journal 精确恢复、Audit 196（2→0）、Session 保留
  `undoneAt=12:58:34`；再次 reload 后 Pending/Recovery 0。

### Project 真实闭环

- 来源页 `Task Copilot Lab/Creation Session Project Source 20260802`（7 Block，
  含多主题/背景/历史/无关内容）→ 真实 DeepSeek 4 轮 Grill →
  Draft WORKABLE（缺口 2 项）→ 共识折叠修复后 Revision READY（17 节点）→
  Placement `Project/统一监控告警治理` → 会话内“确认正式创建”：
  同一 HIGH Proposal `proposal-creation-55597c18` 接受 + Commit
  `proposal-commit:ceb61e21…` COMPLETED；
- 独立 Page 树 17 节点精确写入（2 roots：3 属性元数据 + 根；16 子节点顺序精确）、
  来源页零修改、Object `creation-object-55597c18` PROJECT v2 OPEN、Audit 197；
- reload 后保持；真实 Undo（Page 删除、Object/Anchor 0、Session
  `undoneAt=14:04:34`、Audit 198）；再次 reload 后 Pending/Recovery 0、Doctor PASS。

### 重复审阅审计

- 原实现：Draft → “生成正式审阅方案”→ 必须去 Review Center 接受 → 再确认。
- 收口实现：Draft → Placement/影响摘要 → 会话内“确认正式创建”（勾选 + 一次确认）：
  Service 接受同一 HIGH 组（`highImpactConfirmed: true`）→ 同一
  prepare/finalize/补偿/Undo 内核。Review Center 保留为历史与恢复入口。
- 自动证据：`creation-session-ui.test.ts`（PRE_COMMIT 后仍显示确认按钮）、
  `creation-session-controller.test.ts`（prepare 保存 proposal 状态）、
  `recent-changes.test.ts`（Creation Session 撤销路由）、
  `service.test.ts`（每会话一个活跃 Proposal）。

### 其余修复

- `currentCreationConsensus`（domain）：Provider 上下文与“当前共识”页按
  uncertainty 取最新条目，历史保留；
- Service：重复 prepare 返回既有活跃 Proposal（不新增、不重复 PRE_COMMIT）；
- UI：`sourceAddedAfterDraft` 排除 PRE_COMMIT 捕获；proposal 存在时始终显示
  会话内确认；`recent-changes` 增加 `creation-session-undo:` 前缀与路由。

### 最终状态

- 安装态：Plugin dist（`e6b9d734…`）与源码一致、Service bundle
  （`8a80baa5…`）与源码一致、schema 16、Doctor PASS、Pending/Recovery 0；
- 测试会话 `creation_20260802130728459_…` 已 ABANDONED；
- 状态：`RUNTIME_STRUCTURAL_PASS`；视觉 Gate 待独立 reviewer。
