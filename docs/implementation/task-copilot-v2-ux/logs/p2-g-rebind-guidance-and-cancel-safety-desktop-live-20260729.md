# P2-G Rebind 纠错指引与取消安全 Desktop Gate — 2026-07-29

## 结论

`REBIND_GUIDANCE_DESKTOP_DONE_EXPLICIT_SYNC_CANCEL_SAFETY_DONE`

本轮在真实 Logseq Desktop 中关闭两条相互关联、但权威边界不同的链：

1. Rebind 成功后，选错正文只重新进入受控 Rebind；需要回退整个正式状态时只进入
   Backup / Restore。系统不提供会把事项机械指回 missing/conflict 旧正文的通用 Undo。
2. Rebind 捕获窗口取消前，显式同步队列必须重新读取当前 Block。已删除或已取消显式语义
   的 Block 不得使用旧队列快照创建正式对象；已修改 Block 只同步最新内容；读取失败保持
   fail closed。

P2-G 整体仍为 `IN_PROGRESS`，因为它还包含 Release 级 Restore / Migration / Rebind
代表矩阵与最终发布验收；完整产品化 Goal 继续 `IN_PROGRESS`。

## 运行身份

- branch：`feature/task-copilot-mvp`
- commit：`075e031d98caf159770e12f245bcef19907deee2`
- Plugin build：2026-07-29 01:05:14 +0800
- Logseq Desktop：0.10.15
- Graph：本地 `logseq` File Graph 测试环境
- theme / viewport：Dark，1001×720
- Local Service：真实安装态，formal writes 可用
- Provider：本 Slice 未调用
- 密钥：未写入仓库、Graph、日志或截图

## 发现并关闭的取消缺陷

旧实现会在 Rebind 捕获期间暂停显式同步，但恢复时直接发送内存中的旧请求。真实操作复现为：

1. 开始 Rebind 捕获，显式同步进入暂停；
2. 新建显式 Task 并进入阅读预览；
3. 删除该 Block，取消捕获；
4. 旧请求仍可能在恢复时创建正式对象。

`075e031` 在恢复 transport 前复用现有 Logseq `readBlock` 与
`normalizeExplicitObjectBlock` 重新验证每一条 pending：

- Block 已不存在、或已不再是显式对象：丢弃旧请求；
- Block 已修改：只按最新 input version、hash、类型、marker 与标题重建请求；
- Block 无法读取：不恢复 transport、不写旧快照，保留 pending 并要求一致性检查；
- 未增加正式状态、Runtime、Recovery 分支或第二写入权威。

真实回归创建并删除
`[任务] P2-G 暂停队列取消回归 075e031（不应正式化）`，取消捕获后 Service 只读查询为
`objects=[]`；真实插件 reload 后再次查询仍为空。显式同步最终为
`pending=0 / transportReady=true / reconciliationRequired=false`。

## Rebind 纠错链

此前缺陷运行遗留的测试对象没有通用 materialization Undo 用户入口。本轮没有绕过 Service、
没有直接编辑 SQLite，而是使用正式 Rebind 修复：

1. 从正文失联用户状态进入重新连接；
2. 选择唯一候选
   `P2-G Rebind 纠错候选（不应用） · 任务 · 原连接位置不可用`；
3. Preview 只显示用户可判断的标题、类型与连接状态；
4. 单独确认并正式应用；
5. 成功态只提供“重新选择正文”“查看完整恢复选项”“关闭”；
6. 真实插件 reload 后对象标题更新为
   `P2-G Rebind 纠错候选（缺陷证据，已修复）`，系统不再报告正文连接风险。

最终技术诊断为：

- Plugin commit `075e031d98ca`
- Pending / Recovery / Source Conflict：`0 / 0 / 0`
- explicit sync：`pending=0 / transportReady=true / reconciliationRequired=false`
- Service Doctor：`12 PASS / 0 WARN / 0 FAIL`
- 最近错误：无

## 自动证据

- 新增 focused 回归：删除后丢弃、修改后只发最新内容、读取失败 fail closed，`3/3 PASS`
- Plugin full：`360/360 PASS`
- Plugin typecheck / build：PASS
- 根级 `./scripts/check.sh`：PASS
- stable rule coverage：145
- recovery rehearsal：PASS，differences `[]`
- npm audit 的既有 `3 high / 1 critical` 依赖告警未因本 Slice 增减，继续由发布依赖 Gate
  单独管理

## 当前截图

`CURRENT`（精确 `075e031`）：

- `p0-explicit-sync-cancel-reload-dark-075e031.png`
- `p2-g-rebind-preview-bounded-dark-075e031.png`
- `p2-g-rebind-success-guidance-dark-075e031.png`
- `p2-g-rebind-reload-healthy-dark-075e031.png`
- `p2-g-rebind-final-system-healthy-dark-075e031.png`

`3a47cf9` 的五张中间截图保留为 `HISTORICAL/SUPERSEDED`：它们促成了候选收窄和纠错指引，
但早于取消队列安全修复，不再代表当前完整构建。

## 有界产品结论

- Rebind 的安全纠错不是“撤销到旧正文”，而是重新选择当前可靠正文。
- 整库状态回退继续由 Restore 承担；不把高风险回退伪装成轻量 Undo。
- 自动物化对象目前没有通用用户层删除/Undo 入口。本轮将其登记为 UX debt，不绕过正式
  Application/Service 权威补做快捷写入；它不影响本次 Rebind 纠错 Gate，但 Final Release
  前仍应核对显式正式化的可撤销产品合同是否已有等价入口。
- 新增长期 Partial `0`；关闭 Rebind 新成功态/纠错指引和显式同步取消安全两个既有 Partial。
