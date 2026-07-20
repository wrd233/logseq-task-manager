# V1 → V2 迁移设计

> 状态：`V2_MIGRATION_DESIGN_READY`  
> 日期：2026-07-20  
> 约束：手动、小批次、幂等、可恢复；FileStorage 只读；切换后 SQLite 是唯一领域状态源。

## 1. 主权交接

```text
V1 A/B FileStorage + 恢复包（只读）
  → Scan（零写入）
  → Preview（可审阅映射）
  → Import Batch（SQLite 事务）
  → Verify（数量、身份、Anchor、Commit、checksum）
  → Explicit Activate
  → V2 SQLite + Local Service（唯一写入）
```

安装、升级和首次启动均不得自动扫描、迁移或切换。V1 与 V2 不长期双写；切换失败时停止 V2 写入并恢复快照，而不是同时恢复两个写入源。

## 2. 输入与不可变证据

迁移只接受通过恢复包校验器的 V1 bundle。输入清单包括 manifest、两个 slot、active state、objects、captures、proposals、commits、anchors、relations、events、配置和 checksum。扫描时记录：

- source bundle SHA-256、schema version、active slot、generation 和 state revision；
- 每条记录的 legacy identifier、canonical hash 和来源文件；
- object_id、Block UUID、page reference、Primary Anchor 状态；
- Commit 的正向/逆向关系、pending/recovery 状态和事件顺序；
- 无法解析、冲突、信息损失和需人工决定的记录。

源文件、恢复包和 Graph 正文在整个迁移中保持只读。迁移报告不复制凭据或完整敏感正文。

## 3. 阶段与状态机

每次迁移由 `migration_run` 管理，状态仅允许：

```text
SCANNED → PREVIEWED → IMPORTING → VERIFIED → ACTIVATED
                 ↘ FAILED / CANCELLED
```

每个 `migration_batch` 有稳定 idempotency key、源 hash、范围、事务状态、导入数量、验证结果和逆操作引用。

1. **Scan**：只读解析；checksum、schema 或 pending/recovery 异常时停止。
2. **Preview**：展示旧值、建议语义、理由、信息损失、冲突和预计写入。
3. **Snapshot**：复制 SQLite 文件或创建空库基线；记录 V1 bundle hash。
4. **Import**：默认每批不超过 50 个聚合根，在一个 SQLite 事务/保存点内写入。
5. **Verify**：逐批校验数量、唯一约束、引用、hash 和可重建投影。
6. **Activate**：用户显式确认后写入唯一 activation marker；Plugin/CLI 随后只经 Local Service 使用 SQLite。

中断后只从最后一个 VERIFIED batch 继续。重复执行同一批返回原结果，不制造重复对象、Anchor、Commit 或事件。

## 4. SQLite 目标边界

首版核心表职责：

| 表 | 权威内容 |
|---|---|
| `schema_meta` | database/schema/protocol 版本和 Graph identity |
| `objects` | 六类对象、Lifecycle、版本和当前内容字段 |
| `object_conditions` | 当前 Condition 与必要详情 |
| `focus_selections` | 临时 Focus 选择及过期信息 |
| `anchors` | Block UUID、角色、观察状态和唯一 Primary 约束 |
| `ownerships` / `associations` | 主归属与非归属关系 |
| `proposals` / `proposal_operations` | 非事实的建议与审阅状态 |
| `commits` / `commit_steps` | pending-first SemanticCommit、补偿、Undo 和恢复 |
| `events` | 追加式审计事实 |
| `legacy_evidence` | V1 只读标识、hash 和映射依据，不作为当前状态轴 |
| `migration_runs` / `migration_batches` | 扫描、批次、验证、撤销和激活证据 |

`object_id`、Primary Anchor、Primary Owner、idempotency key、Commit identity 在数据库约束与 Domain 校验两层执行。Project 页面与对象创建由一个 Application command 和 step ledger 管理，不允许半成功显示为完成。

## 5. 回滚

- Preview 前：无正式写入，直接放弃。
- 未激活批次：按 batch inverse ledger 撤销；Doctor 必须通过。
- 激活前全量失败：删除仅属于本次 run 的未激活数据库副本，保留恢复包。
- 激活后 P0/P1：关闭正式写入口，恢复激活前 SQLite 快照，执行 Doctor；不恢复双写。
- 回退后 V1 仍只作为只读历史入口。若需要暂时继续使用 V1，必须是明确的运行模式回退，而不是两套 Store 同时写。

## 6. Gate

- 用户手动启动并看到范围、成本与回滚点；
- 不确定映射不会自动进入当前状态；
- object_id、Anchor、Commit 链和恢复证据零丢失；
- 中断/继续、重复导入、单批 Undo、锁和损坏路径均有自动测试；
- activation 前后可证明只有一个当前状态源；
- 临时恢复演练和 Doctor 通过；
- Desktop copied-data 迁移验收通过后才允许正式 Graph 迁移。

