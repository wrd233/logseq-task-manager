# Goal：启动 Task Copilot vNext 高破坏性重构并打通第一条可信纵向链

> **STATUS: HISTORICAL / SUPERSEDED by `05-Task-Copilot-vNext-产品与治理宪章.md` (2026-08-15). Keep for archaeology only; do not treat as current truth.**

> 你正在接手 `wrd233/logseq-task-manager` 的 vNext 重构。  
> 这不是一次常规增量开发，也不是要求在旧 V1 上继续补功能。  
> 本 Goal 的目标是：**理解当前仓库 → 高破坏性清理历史负担 → 建立 vNext Kernel 骨架 → 打通第一条端到端可信链路。**

---

# 1. 先理解目标，不要直接改代码

请首先完整阅读仓库内提供的 vNext 设计文档，尤其：

1. `01-Task-Copilot-vNext-Architecture-Product-Baseline.md`
2. `04-Task-Copilot-vNext-Decision-Register-1-67.md`
3. `02-Task-Copilot-vNext-Repository-Refactor-Implementation-Blueprint.md`

若这些文件暂未放入仓库，请先从我提供的文档读取，不要依据旧代码猜测新设计。

核心架构判断：

> **Task Copilot vNext 是本地优先的可信工作内核。Logseq 是自然工作现场；Local Kernel Service 是正式事实和 Semantic Commit 的唯一写权威；Plugin 是 UI 与 Graph Adapter；Agent 是认知执行器；Skill 是版本化治理政策。**

---

# 2. 这次允许高破坏性重构

不要把“兼容旧系统”当作目标。

明确允许：

- 删除 V1 代码；
- 删除 Capability Lab；
- 删除旧 Candidate；
- 删除旧 Session/Prompt 流程；
- 删除旧 Proposal partial-apply 机制；
- 删除旧 UI；
- 删除旧 API；
- 重建数据库；
- 重建 Local Service；
- 重建包结构。

原则：

> **能零复杂度兼容就顺手兼容；只要兼容会引入长期分支、Legacy Adapter、Migration Framework 或新 Domain 妥协，就不要兼容。**

Git 历史就是旧代码档案，不要把历史目录搬到 main 里长期保存。

---

# 3. 调研阶段

在做结构性修改前，请调查当前仓库并输出一份简洁但证据充分的 Implementation Reconnaissance。

必须回答：

## 3.1 当前 Monorepo / Build

- package manager；
- workspace；
- TypeScript build；
- test runner；
- Logseq Plugin build；
- Local Service 是否已经存在；
- CLI 是否已经存在；
- 当前 dev / package / release 流程。

## 3.2 当前 Domain

定位：

- Task；
- MiniProject；
- Project；
- Area；
- Candidate；
- Proposal；
- Session；
- Anchor；
- Commit；
- Undo；
- Recovery；
- SQLite。

标记每个模块：

```text
DELETE
REWRITE
POSSIBLE TRANSPLANT
NEEDS EVIDENCE
```

不要给“保守兼容”优先级。

## 3.3 Graph Integration

调查：

- Page / Block 读取；
- UUID；
- mutation API；
- event subscription；
- marker update；
- properties；
- current managed projection；
- crash / reload behavior；
- 当前哪些 Logseq SDK 行为已经被真实运行验证。

只保留已经通过真实 Logseq 验证的 SDK 知识。

## 3.4 Service / IPC

调查：

- 是否已有 localhost service；
- descriptor；
- port；
- auth；
- process lifecycle；
- plugin reconnect；
- shutdown；
- test harness。

旧实现即使存在，也必须判断是否适合 vNext。

---

# 4. 在调查后提出一次“删除计划”

不要直接在旧结构里加 `vnext/` 然后长期双轨。

请列出：

```text
明确删除
明确重写
可能移植
暂时保留直到替代完成
```

如果一个旧模块没有 vNext 的正式职责，就删除。

尤其检查并准备删除：

```text
Capability Lab
Candidate Entity
generic RELATED
persistent Health Finding lifecycle
persistent Cohort entity
legacy Session domain
legacy Prompt-per-flow
special AI direct-write paths
arbitrary partial Proposal apply
V1-specific migration UI
duplicate Now / attention formal state
```

若某个模块暂时保留，必须写明：

- 为什么当前还不能删；
- 谁仍依赖它；
- 替代它的 vNext 模块是什么；
- 删除条件是什么。

---

# 5. 目标架构

最终逻辑应接近：

```text
Logseq Plugin
    │
    │ localhost API
    ▼
Local Kernel Service
    ├─ Domain
    ├─ Operation Registry
    ├─ Proposal Validator
    ├─ Semantic Commit
    ├─ Undo / Recovery
    ├─ SQLite Current State
    └─ Append-only Commit Ledger

CLI
 └──────────────→ Local Kernel API

Built-in Agent
 └──────────────→ Agent Contract / Proposal

External Agent
 └─ MCP Adapter ─→ Local Kernel API
```

第一阶段不需要实现全部 Adapter。

---

# 6. 强制依赖边界

## Domain 不得依赖

- React；
- Logseq SDK；
- SQLite；
- HTTP；
- LLM SDK；
- MCP；
- CLI。

## Plugin 不得

- 直接写 SQLite；
- 实现另一套 Domain；
- 绕过 Semantic Commit；
- 让 UI local state 成为正式事实。

## CLI 不得

- 直接打开 SQLite；
- 拥有独立业务逻辑。

## Agent 不得

- 直接修改 Graph；
- 直接 CRUD WorkObject；
- 直接修改 SQLite。

---

# 7. 第一阶段只建立最小 Domain

先实现：

```text
WorkObject
  id
  kind
  title
  lifecycle
  engagement
  version

PrimaryAnchor
EvidenceReference
PrimaryOwnership
```

Kind：

```text
TASK
MINI_PROJECT
PROJECT
```

Lifecycle：

```text
OPEN
COMPLETED
CANCELLED
```

Engagement：

```text
ACTIONABLE
WAITING
PARKED
null
```

第一阶段不需要完整 Project KR / Closure UI，但 Domain 边界不要与未来设计冲突。

---

# 8. 第一阶段 Operation

只需要先完成：

```text
CREATE_WORK_OBJECT
RENAME_WORK_OBJECT
```

如果为了第一条链确实需要，可以增加：

```text
SET_PRIMARY_ANCHOR
ADD_EVIDENCE_REFERENCE
```

不要一次实现全部 16 个 Operation。

Operation 必须：

- strongly typed；
- schema validated；
- semantic；
- no arbitrary JSON Patch；
- no raw table names；
-有明确 precondition 与 inverse/undo 语义。

---

# 9. SQLite Current State

建立全新的 vNext Schema。

不要迁旧数据库。

至少支持：

```text
work_objects
anchors
evidence_references
ownerships
schema_versions
```

以及后面的 Proposal / Ledger 必要表。

不要过早建几十张未来表。

---

# 10. Commit Ledger

第一阶段必须真正实现，不允许“以后补”。

至少表达：

```text
PREPARED
KERNEL_APPLIED
GRAPH_APPLIED
COMMITTED
RECOVERY_REQUIRED
ABORTED
```

每个 Commit 应能记录：

- actor；
- operation；
- target；
- preconditions；
- before / after 或 inverse 信息；
- graph effect；
- result；
- timestamps；
- failure reason。

不要把 Ledger 降级为文本日志。

---

# 11. Local Kernel Service

第一版：

```text
127.0.0.1 only
HTTP/JSON
```

提供 descriptor + random token。

不要监听 `0.0.0.0`。

CLI 和 Plugin 都通过统一 client 访问。

网络认证与领域权限要分开。

---

# 12. CLI

尽早实现 CLI，因为它是 Kernel 的 Reference Client。

至少：

```text
task-copilot status
task-copilot object list
task-copilot object show <id>
task-copilot commit show <id>
task-copilot recovery list
```

可以增加用于测试的显式 create 命令，但不要让 CLI 绕过 Operation / Commit。

所有关键命令建议支持：

```text
--json
```

方便自动化验证与未来 Agent 调用。

---

# 13. Graph Adapter Contract

Kernel 不 import Logseq SDK。

建立类似：

```text
readGraphSnapshot(...)
applyGraphEffect(...)
```

以及明确的：

```text
expected state
mutation
actual result
```

先用 Fake Graph Adapter 测试。

Graph Effect 应尽可能幂等，并携带 commit/effect identity。

---

# 14. 第一条纵向黄金链

这是本 Goal 的首要验收对象：

```text
Logseq 自然记录
→ 用户显式“正式化”
→ CREATE_WORK_OBJECT
→ Semantic Commit
→ SQLite WorkObject
→ Primary Anchor
→ Managed Projection
→ Commit Ledger
→ Audit
→ Undo
```

最开始可以先用 CLI + Fake Graph Adapter 代替真实 UI，但 Goal 结束前需要接真实 Logseq。

---

# 15. Managed Projection

第一阶段不要做漂亮 UI。

只实现最小确定性投影。

原则：

- 原自然正文不被破坏；
- managed content 有稳定 Block UUID；
- 字段级更新；
- 用户自然内容不被整体覆盖；
- 删除 Projection 不等于删除 WorkObject；
- Projection 能在重启后重新定位。

Task 只需要很薄。

---

# 16. Cross-medium Commit

正式实现：

```text
VALIDATE
→ PREPARE
→ KERNEL_APPLY
→ GRAPH_APPLY
→ VERIFY
→ COMMIT
```

关键：

> `KERNEL_APPLIED` 不等于成功。

只有 Verify 后才对外返回正式成功。

如果 Graph Effect 失败，不允许 UI 显示“已完成”。

---

# 17. 故障注入必须与第一条链一起做

至少测试：

## Case A：Graph Apply Failure

```text
KERNEL_APPLIED
→ Graph Adapter throws
```

重启后能够识别未完成 Commit。

## Case B：Expected Hash Mismatch

Graph expected hash 不匹配。

必须：

```text
RECOVERY_REQUIRED
```

不能覆盖用户内容。

## Case C：Undo After User Edit

Undo 前 Graph 已被用户继续编辑。

不能静默删除后续内容。

## Case D：Crash Between Stages

模拟 PREPARED / KERNEL_APPLIED / GRAPH_APPLIED 后进程退出，确认重启扫描逻辑。

---

# 18. Undo

Undo 是新的补偿 Commit。

不要：

- 删除 Ledger；
- 直接恢复数据库旧 snapshot；
- 假装原 Commit 没发生；
- 覆盖用户在原 Commit 之后的新编辑。

Undo 应先 re-read 当前状态并验证逆操作仍安全。

---

# 19. 不要过早接入 Agent

本 Goal 的第一主线不是 External Agent。

顺序必须是：

```text
Kernel
→ Ledger
→ API
→ CLI
→ Graph Contract
→ Graph Commit
→ Recovery
→ Plugin
```

之后再接 Agent。

原因：

> Agent Contract 只有建立在稳定 Semantic Commit 上才有价值。

---

# 20. 但架构必须为 Agent 保留正确边界

请从第一天保证：

```text
Proposal
≠ Commit

Agent
≠ Writer

Skill
≠ Kernel Rule

Broad Read
≠ Broad Write
```

不要为了测试方便给未来 Agent 暴露 `updateObject()`。

---

# 21. 实现风格

优先：

- simple；
- explicit；
- strongly typed；
- small modules；
- boring local HTTP；
- deterministic tests；
- failure injection。

避免：

- generic framework；
- dependency injection empire；
- event sourcing；
- workflow DSL；
- plugin system；
- abstract repository hierarchy；
- meta-schema engine。

---

# 22. 每次想新增抽象时先问

> 这是当前第一条黄金链或某条故障链真正需要的吗？

如果不是，不做。

如果需要新增正式 Entity / Status / Operation，请在实现前写一个极短 ADR，说明：

- 哪条黄金链需要；
- 为什么 Projection/Receipt/普通文件不够；
- 未来删除成本。

---

# 23. 不要为了“架构完整”提前实现

本 Goal 不要求：

```text
Webhook
Email
Calendar
MCP
External Agent
full Skill Registry UI
Cohort
Health Dashboard
Project KR UI
Artifact Manager
Decision UI
full Closure
multi-provider
migration
enterprise auth
```

即使设计基线已经描述了这些边界，也不意味着这次 Goal 要一次实现。

---

# 24. 文档要求

实施过程中维护：

```text
docs/architecture/
docs/adr/
docs/golden-paths/
```

至少形成：

1. Repository Cleanup Record；
2. Target Package Map；
3. Kernel API Contract；
4. Commit State Machine；
5. First Golden Path；
6. Failure Injection Results；
7. Known Deferred Items。

文档只记录真实实现，不虚构“未来已完成”。

---

# 25. 测试要求

每次提交前至少运行：

- typecheck；
- unit tests；
- integration tests；
- Kernel service tests；
- CLI tests；
- Graph adapter fake tests。

真实 Logseq 路径可单独记录手工 / 自动验证证据。

如果现有仓库没有某一类测试基础设施，可以选择最简单可靠的方式建立，不要为了测试先造大型框架。

---

# 26. 第一阶段完成标准

只有同时满足以下条件才算完成。

## Architecture

- 不存在长期 old/new dual write；
- Kernel Service 是唯一正式写权威；
- CLI 不直接写 DB；
- Plugin 不直接写 DB。

## Domain

- WorkObject 使用统一模型；
- lifecycle / engagement 拆分；
- ID 与 Anchor 解耦。

## Transaction

- Commit Ledger 正常；
- Graph failure 不显示成功；
- Recovery 能识别半事务；
- Undo 是 compensation commit。

## Vertical Slice

一条真实 Logseq 记录能：

```text
正式化
→ 成为 WorkObject
→ 写入 Kernel
→ 在 Graph 显示 managed projection
→ 在 Activity / CLI 看见 Commit
→ 安全 Undo
```

## Failure

至少一个真实或模拟 Graph Apply Failure 被正确恢复。

---

# 27. 后续阶段的方向，不要在本 Goal 中抢跑

完成第一条链后，后续顺序建议：

```text
Phase 2：current_focus + Built-in Agent
Phase 3：ACTIONABLE ↔ WAITING
Phase 4：用户主动 Completion / Cancellation
Phase 5：External Agent + Read Gateway + MCP
Phase 6：Project Re-entry + 4 个一级入口
Phase 7：完整 6 Golden + 4 Failure MVP 验收
```

不要因为这些已知就提前横向铺开。

---

# 28. 输出给我的最终报告

完成后不要只说“已实现”。

请输出：

## A. 删除了什么

按目录 / 概念说明。

## B. 保留 / 移植了什么

说明为什么值得保留，以及它是否经过重新测试。

## C. 新架构

给出实际目录树和依赖图。

## D. 第一条黄金链

逐步说明真实调用路径：

```text
UI / CLI
→ API
→ Application
→ Operation
→ Ledger
→ Store
→ Graph Effect
→ Verify
```

## E. Commit / Recovery

给出真实状态机和故障测试。

## F. 测试证据

命令 + 结果。

## G. 尚未实现

明确列出，不包装成 Partial Success。

## H. 复杂度审计

回答：

- 新增多少长期概念；
- 有没有为了历史兼容增加分支；
- 有没有新增暂时没黄金链使用的基础设施；
- 有没有 generic API；
- 下一阶段最小目标是什么。

---

# 29. 最后的判断标准

如果你在两个实现之间选择，请优先选择：

> **能够让 vNext 的正式事实、事务和 Agent 接口更简单、更可验证、更容易删除未来错误假设的方案。**

不要优先选择：

> “最大程度复用旧代码”。

这次重构的目标不是保存过去的工程投入，而是为未来几年的 Task Copilot 建立一个足够干净的可信内核。


1. 总体选择

本次 vNext 不新建独立 Git 仓库。

继续使用当前仓库：

wrd233/logseq-task-manager

但在当前 V1 稳定状态基础上：

main
→ 保留当前 V1 最后稳定状态

vnext
→ 作为 vNext 高破坏性重构的长期开发分支

vNext MVP 验收通过后，再让 vnext 接管 main。

2. 为什么不新建仓库

Task Copilot vNext 仍然是同一个产品的下一代架构，而不是一个全新、无历史关系的产品。

因此：

保留同一 Git 仓库
≠
承担旧运行时兼容义务

保留同一仓库的价值在于：

保留完整工程演进历史；

可以随时通过 Git 查看旧实现；

需要时可 cherry-pick 少量经过验证的实现知识；

GitHub Issues、README、Release、链接、项目历史保持连续；

不需要长期维护“哪个仓库才是真正的 Task Copilot”这种额外认知负担。

但必须明确：

Git History Compatibility 很便宜，可以保留；Runtime / Domain Compatibility 很贵，默认不做。

3. 当前 V1 先打 Tag

在开始 vNext 高破坏性重构前，先为当前稳定状态创建一个明确 Tag。

推荐：

git checkout main
git pull

git tag -a v1-final -m "Final V1 baseline before Task Copilot vNext refactor"
git push origin v1-final

如果你认为当前状态还不适合称为 v1-final，也可以使用：

pre-vnext-refactor-2026-08-12

但不要为了保险创建大量意义重叠的 Tag。

原则：

一个清楚的 V1 冻结点就足够。

4. 创建 vnext 分支

从当前 main 创建：

git checkout -b vnext
git push -u origin vnext

不要使用：

git checkout --orphan vnext

因为我们希望：

继承 Git 历史
但不继承旧架构负担

vNext 可以在共享历史的前提下，直接删除旧代码并建立全新架构。

5. 强烈推荐使用 Git Worktree

如果开发环境允许，建议使用 Git Worktree，让 V1 与 vNext 同时存在于两个本地工作目录中。

例如：

git worktree add ../logseq-task-manager-vnext vnext

最终：

logseq-task-manager/
→ main
→ 当前稳定 V1
→ 必要时仍可启动、比对、验证

logseq-task-manager-vnext/
→ vnext
→ vNext 高破坏性重构
→ Codex 的主要施工目录

这样有几个重要好处：

Codex 可以大胆删除和重构；

即使 vNext 暂时无法启动，也不影响 V1 参考；

不需要复制仓库；

两个工作目录仍共享同一 Git 历史；

可以方便比对旧行为；

避免在一个工作目录里频繁 checkout 导致本地状态混乱。

如果现有开发环境已经有其他 worktree，需要先检查，不要重复创建。

6. 不要建立长期 legacy/ 目录

明确禁止为了“保险”把旧代码搬成：

legacy/
old-v1/
deprecated/
v1-backup/
old-plugin/

长期放在主工作树。

错误示例：

apps/
├─ v1/
├─ vnext/
├─ legacy/
└─ capability-lab-old/

这样会导致：

Codex 搜索时同时看到新旧 Domain；

旧 Candidate / Session / Proposal 继续污染认知；

新代码容易误 import 旧模块；

每次修改都会重新产生“是不是还要兼容 V1”的疑问；

构建、测试和依赖图继续承担历史负担。

正确策略：

旧实现
→ Git History / v1-final Tag

当前工作树
→ 只保留当前真正相信的架构

7. V1 Feature Freeze

从 vNext 正式开始后，main / V1 原则上进入 Feature Freeze。

只接受：

P0 / 严重 Bug
数据安全问题
影响当前继续使用的必要修复

不接受：

新功能
新 Agent 能力
新 UI
新 Domain
结构重构
新的长期能力

原因：

V1 继续加功能
→ vNext 是否同步？
→ backport / forward-port
→ 双轨维护
→ 历史负担重新出现

应尽量避免这种状态。

8. vNext 最初的 Commit 应清楚分层

不要把：

删除旧代码
+ 建 Kernel
+ 改 Plugin
+ 改 SQLite
+ 接 Agent

全部塞进一个巨型 Commit。

推荐将 Git History 本身变成重构记录。

建议类似：

Commit 1
docs(vnext): freeze architecture and implementation baseline

Commit 2
chore(vnext): remove obsolete capability lab

Commit 3
refactor(vnext): remove legacy candidate/session workflows

Commit 4
refactor(vnext): establish vNext package boundaries

Commit 5
feat(kernel): add local kernel service skeleton

Commit 6
feat(kernel): add vNext current state store

Commit 7
feat(kernel): add append-only commit ledger

Commit 8
feat(cli): add kernel reference client

Commit 9
feat(graph): add graph adapter contract

...

不要机械追求小 Commit，但应保证：

删除旧架构与建立新架构在历史上可以清楚区分。

9. 第一个正式 vNext Commit 建议先放设计文档

建议先把已经冻结的设计文档放入仓库，例如：

docs/vnext/
├─ README.md
├─ architecture-product-baseline.md
├─ implementation-blueprint.md
├─ decision-register.md
└─ codex-implementation-goal.md

这样后续任何实现选择都有仓库内设计依据。

重要原则：

旧代码当前怎么实现，不能推翻已经冻结的 vNext 设计。

如果代码与设计冲突，应优先判断旧代码是否应删除，而不是默认修改设计去兼容旧实现。

10. Codex 在清仓前必须先做一次仓库调查

不要直接根据文件名大规模删除。

先输出：

DELETE
REWRITE
POSSIBLE TRANSPLANT
TEMPORARILY KEEP UNTIL REPLACED

四类清单。

重点调查：

Capability Lab；

Candidate；

Proposal；

Session；

Prompt；

SQLite；

Commit / Undo / Recovery；

Logseq SDK 封装；

Graph Event；

Plugin Entry；

Local Service；

CLI；

测试工具；

已验证的故障恢复代码。

目标不是保守，而是：

只把仍有独立工程价值的知识带进 vNext。

11. 什么可以从旧代码移植

旧实现只有在满足下列条件时才值得移植：

与新的 Domain Contract 不冲突；

是确定性工程能力，而不是旧业务模型；

可以独立测试；

不要求保留旧 API；

不要求保留旧数据库结构；

移植后能放进新的依赖方向。

可能值得移植的例子：

可靠的 Logseq SDK wrapper
Block / Page UUID 处理
Graph event debounce
SQLite connection / migration utilities
failure injection helpers
Undo 时保护用户后续编辑的实现经验
Provider structured-output parsing
Plugin reload / reconnect 的稳定实现

但必须：

extract knowledge
→ re-home into vNext module
→ add vNext tests

不要整包搬旧模块。

12. 什么不应因为“还能用”就保留

以下旧概念如果与当前实现绑定，应默认删除或重写：

Candidate Entity
legacy Session Domain
Prompt-per-flow
旧 Proposal partial apply
generic RELATED
persistent Health Finding lifecycle
persistent Cohort entity
Capability Lab product code
旧 Now / Attention 正式状态
AI direct-write paths
old CRUD-style mutation APIs
V1-specific migration logic

“现在测试还能通过”不是保留理由。

13. 数据策略与 Git 策略必须分开

不要因为 Git 还保留 V1 历史，就误认为 vNext 需要兼容旧 SQLite。

分别处理：

Git / 代码历史

保留

通过：

v1-final
Git history

用户 Logseq Graph

保留原样

这是用户资料，不是 V1 私有数据库。

V1 SQLite

vNext 不依赖
不要求迁移
不为其建立复杂兼容框架

如果简单保留旧文件副本几乎零成本，可以保留；不要为此引入长期 Runtime 分支。

14. 不专门建设“迁移旧系统”的产品能力

未来如果 vNext 本来就具备：

从自然 Logseq 内容正式化 WorkObject

那么它自然也可以重新理解旧 Graph。

不要专门建设：

V1 Migration Wizard
Legacy Domain Importer
V1 Candidate Converter
Old Proposal Translator

除非未来发现真实需要，而且实现成本极低。

15. main 什么时候由 vNext 接管

不要一开始就在 main 上直接进行大规模拆迁。

建议：

main
→ V1 冻结

vnext
→ vNext 开发

至少等到第一条完整可信纵向链跑通：

Logseq Natural Record
→ Formalize
→ WorkObject
→ Semantic Commit
→ SQLite
→ Managed Projection
→ Audit
→ Undo

更理想的正式切换条件是：

6 条黄金链
+
4 条故障链

达到 vNext MVP 设计基线。

16. 切换 main

当 vNext 达到接管条件时：

冻结 main；

确认没有仍需保留的 V1 新 Commit；

执行最终全量测试；

将 vnext 合入 main；

保留 v1-final Tag；

删除长期 vnext 分支。

如果整个期间 main 没有发生新的独立开发，可优先使用：

git checkout main
git merge --ff-only vnext
git push origin main

若不能 fast-forward，不要为了保持某种 Git 形式强行操作；先检查分叉原因。

最终：

main
→ vNext

v1-final
→ V1 永久访问点

17. 不建议长期保持 V1 / vNext 双主线

vNext 接管后：

vnext branch
→ 删除

不要形成：

main-v1
main-v2
stable
next
legacy

长期多主线。

Task Copilot 是个人/小规模项目，不需要建立大型企业 Release Train。

18. Branch / PR 策略

在 vnext 内部，Codex 可以继续使用短生命周期 feature branch，例如：

vnext/kernel-skeleton
vnext/graph-transaction
vnext/current-focus

或者：

codex/kernel-skeleton
codex/graph-transaction

具体命名可以结合当前开发习惯。

但这些分支必须：

短生命周期；

完成后合回 vnext；

不成为长期产品版本分支。

如果是一个人 + Codex 高频迭代，也可以直接在 vnext 上小步 Commit，不强制 PR 流程。

选择以：

降低认知和合并成本

为优先，而不是模仿大型团队 Git Flow。

19. 不采用 Git Flow

不要建立：

master
develop
release/*
hotfix/*
feature/*

完整 Git Flow。

当前项目更适合：

main
  ↓
vnext   （重构期间唯一长期开发分支）
  ↓
main    （MVP 后接管）

配合必要的短 feature branches 即可。

20. Codex 对 Git 的权限边界

Codex 可以：

创建 vnext；

创建临时 feature branch；

commit；

删除旧代码；

重构；

运行测试；

准备 merge。

但对于以下高影响 Git 操作，应非常谨慎：

force push
rewrite published history
delete remote main
delete v1-final tag
git reset --hard on uncommitted user work
mass remove untracked user files

原则：

高破坏性重构针对代码架构，不意味着可以随意破坏 Git 历史或用户未提交内容。

在任何 destructive Git 操作前先检查：

git status
git branch --show-current
git worktree list
git log --oneline --decorate -n 20

不要假设工作区是干净的。

21. Codex 开始实际 Git 操作前的检查

请先确认：

当前 branch
working tree 是否干净
是否存在未 push commit
是否已有 worktree
是否已有同名 vnext branch
remote 状态
当前 main 是否确实是 V1 冻结点

如果发现用户本地有未提交工作，不要覆盖或删除。

22. 推荐最终拓扑

重构期间：

                         v1-final
                            │
                            ▼
─────────────── main (V1 freeze)
                  \
                   \
                    ───────── vnext ── refactor ── kernel ── golden paths

本地：

~/.../logseq-task-manager
→ main

~/.../logseq-task-manager-vnext
→ vnext

MVP 后：

v1-final
   │
   ▼
old V1 history ─────────────────────────┐
                                        │
                                  main = vNext

23. 最终仓库原则

请把以下几句话作为实施约束：

同一个产品，保留同一个 Git 仓库。

保留 Git 历史，不保留旧架构负担。

旧代码属于 history，不属于 current tree。

兼容是偶然收益，不是 vNext 目标。

V1 Feature Freeze，避免双轨演化。

vnext 是过渡性长期分支，MVP 后由它接管 main，而不是永久存在。

Git 的可追溯性应帮助我们大胆删除旧代码，而不是成为保留旧代码的理由。

24. 你在执行主 Implementation Goal 时应如何使用本补充

建议顺序：

1. 读取 vNext Architecture & Product Baseline
2. 读取 vNext Implementation Blueprint
3. 读取主 Codex Implementation Goal
4. 读取本 Git Repository Strategy Addendum
5. 检查 Git / Worktree 当前状态
6. 冻结 V1
7. 创建 vnext
8. 把设计基线放入仓库
9. 做仓库 reconnaissance
10. 提交清仓计划
11. 高破坏性清理旧架构
12. 建立 Kernel 骨架
13. 打通第一条纵向黄金链

在整个过程中，不要因为旧代码看起来很多、历史投入很大，就自动增加兼容目标。

这次重构的主要目标是：

让未来的 Task Copilot 拥有一个足够干净、可信、可持续演进的主干。
