# V2 显式对象有限子树 Desktop 验收报告

> 日期：2026-07-22  
> 环境：Logseq Desktop 0.10.15 / macOS arm64 / Node 20.20.2 / SQLite schema v11  
> 状态：核心用户闭环 `PASS`，E2E-03 `DONE`；A-RT-03.18 的精确 256 截断与卸载中止工程边界已由事件入口集成测试收口。

## 真实失败与修复

在隔离测试页中新建根 Task、内部裸 `TODO` 和嵌套 Decision 后，Desktop 真实写入了两个显式 Block 的 `id:: <UUID>`，但 `tc object list` 仍为空，Diagnostics 的 pending 也已回到 0。

根因位于同一现有回声抑制窗口：用户首次显式事件在写入 `id::` 时注册了精确 content hash，随后正式待交付请求又被该 hash 当作插件自回声删除。这不是 Service、SQLite 或 Logseq 事件丢失。

修复只让现有身份持久化函数返回“本次是否实际写入身份”，并在进程内 pending 项上保留一个来源布尔值。该项可穿过自己创建的抑制窗口，而 Candidate/Commit 属性回声、先排队后插件写入及断线待恢复回声仍被删除。没有新表、新协议、扫描器、持久队列或第二写路径。

## Desktop 结果

- 逐项编辑：根 Task 与嵌套 Decision 分别建立独立 Object/Primary Anchor；裸 `TODO` 无 `id::`、无 Object、无 Service 写入。
- 快速连续编辑：同一 Task 只保留最新标题 `Slice A rapid edit latest`，object_id 不变，version 只前进一次。
- 整树批量粘贴：用 Logseq 真实 `insert_batch_block` 插入 Task → 裸 TODO + Decision。测试期间 Service 进程退出，正文和树保持；重启同一 SQLite 并更新会话后，现有会话队列只补交 Task/Decision，裸 TODO 仍为零写入。
- 服务端读回：4 个 Object（2 Task + 2 Decision）、4 个 active Primary Anchor；`materialize_explicit_object` Audit/Receipt 各 4，快速编辑只增加 1 个 `synchronize_explicit_object` Audit/Receipt。
- 33 根并发 fixture：Diagnostics 精确显示 `EXPLICIT_SYNC_SUBTREE_QUEUE_CAPACITY_EXCEEDED`，`reconciliationRequired=true`，Object 数保持 4。
- 257 子块 fixture：Desktop bridge 在达到稳定截断回执前返回 `EXPLICIT_SYNC_SUBTREE_READ_FAILED`，Object 数仍保持 4。这证明真实不可读路径安全停写，但不冒充 `EXPLICIT_SYNC_SUBTREE_TRUNCATED` Desktop 证据。
- 大型 bare fixture 在验证后删除；没有修改正式 Graph。
- 基于修复提交 `c28fa06881f1` 重建并 cold restart Logseq 后，Diagnostics 为 Runtime/Store/Service `READY`、formal writes true、pending 0、`reconciliationRequired=false`；CLI 仍读回同一 4 个 Object，Doctor `PASS`、integrity `ok`、foreign-key violations 0。

## 自动回归

- 新回归测试先在修复前得到 `[]`，修复后证明“新显式 Block 写入身份后，原始观察仍恰好同步一次”。
- 原有 Candidate/Commit 回声、已排队 Commit 竞态、断线待恢复回声和在途读竞态回归仍通过。
- 根级 `./scripts/check.sh` PASS：431 tests，145 rules，0 failed/skipped；typecheck/lint/build/package/boundary/acceptance 全部通过。依赖审计仍是已知 2 high / 1 critical，未执行破坏性 `audit fix --force`。

## 边界与剩余项

E2E-03 的真实用户语义已完成：在 Task 子树中，裸 TODO 不成为领域对象，嵌套显式对象独立物化，快速编辑只取最新权威正文，整树粘贴可在断线后恢复。后续事件入口集成测试又构造了 257 节点链，精确证明只读取并同步前 256 项、第 257 项不触达、发出 `EXPLICIT_SYNC_SUBTREE_TRUNCATED` 且 reconciliation=true；既有进行中读取测试证明 unregister/dispose 后不再读取子节点、不迟到写入。两项都是确定性工程边界，自动测试比反复制造 Desktop 时序更精确，因此不再保留重复 Desktop Gate，也没有新增产品机制。

结构化脱敏证据：`docs/testing/v2-explicit-subtree-desktop-2026-07-22.json`。
