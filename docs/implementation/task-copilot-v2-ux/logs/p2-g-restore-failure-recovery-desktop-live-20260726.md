# P2-G Restore 故障、自动回滚与 reload Desktop Gate

## 结论

P2-G Restore 的真实故障主链已从 `OPEN` 进入
`FAILURE_ROLLBACK_RELOAD_DESKTOP_DONE`。在隔离测试 Graph 中，正式 Restore 的原子激活
被操作系统真实拒绝后：

- Restore 没有留下半成品；
- 原正式 SQLite 状态自动回滚并重新可用；
- Restore 前恢复点保留且完整性检查通过；
- owned Service 由 Launcher 重建；
- Plugin 只显示一次用户层失败结论，不同时显示成功；
- Plugin Manager reload 后陈旧错误清空，系统状态回到可正常使用。

这只关闭“激活失败但原库可自动回滚”的主链。若激活和原库回滚同时失败，
`V2_RESTORE_ROLLBACK_FAILED` 仍只具备自动合同、受限状态与用户层说明，尚未完成手工恢复
向导的真实 Desktop Gate；Light 与窄栏也仍开放。因此 P2-G 与整体 Goal 继续
`IN_PROGRESS`。

## 当前构建与环境

- branch：`feature/task-copilot-mvp`；
- Plugin commit：`0c4526d4006f7e4b144d96afb25cd7a60066c9fe`；
- Restore 安全底座 commit：`94038e6`；
- Plugin / Local Service / Launcher version：`0.1.0`；
- Plugin build：2026-07-26 16:05:30 +0800；
- installed Local Service / Launcher payload build：2026-07-26 15:51:25 +0800；
- Logseq Desktop：0.10.15；
- Graph：仓库内隔离测试 Graph `logseq`；
- theme：Dark；
- window：994 × 700；
- 页面场景：Journal 主页面中的 Task Copilot“更多 → 备份与恢复”；
- 证据性质：真实 Logseq Desktop、真实 Launcher/Service、真实 SQLite 文件系统故障；
  不是设计稿、静态原型或历史截图。

本 Gate 未调用 Provider，不涉及 API Key。文档、截图与普通日志不记录 descriptor token、
Backup ID、数据库绝对路径或测试正文。

## 故障注入边界

仅对隔离测试 Graph 的当前活动 SQLite 文件临时设置 macOS immutable flag。这样只读校验和
Restore 前恢复点仍可完成，但 atomic replace 在激活阶段收到真实 `EPERM`。点击正式
Restore 后立即对同一精确文件移除 flag；未使用目录级、Graph 级或个人数据级破坏操作。

该方法验证的是真实操作系统写入失败，而不是伪造 Provider 响应或只在测试中抛出异常。
代码侧另有 test-only post-activation fault，用于自动证明“候选已经激活后发生故障”也能
恢复原库、保留恢复点并停止 Service。

## 真实操作链

1. 从“更多 → 备份与恢复”选择一个 Service-owned、完整性通过的四对象快照；
2. Service 重新校验候选，界面说明 SQLite 会被替换、Logseq 正文不会被改写、系统会保存
   当前状态为恢复点并自动重启；
3. 勾选独立 HIGH 确认；
4. 对隔离活动数据库注入精确文件级写入拒绝；
5. 点击“恢复并自动重启”；
6. atomic activation 失败，Service 回滚原正式状态并保留新恢复点；
7. Plugin 停止旧连接并通过 Launcher 重连；
8. 用户只看到一次红色结论：“恢复未完成；原正式状态已回滚并重新可用，Restore 前恢复点
   仍保留”；
9. Plugin Manager reload 后重新打开“系统状态”，显示 Task Copilot 可以正常使用。

首轮真实故障运行在安全结果之外暴露了一个纯前台缺陷：同一回滚结果同时出现绿色成功条和
红色“未执行”。`0c4526d` 删除重复成功态，并把通用失败后缀从不准确的“未执行”改为
“未完成”；该首轮截图只作诊断，不列为 CURRENT。随后在当前构建完整重跑。

## 状态与恢复证据

最终 CURRENT 重跑前后：

- Service PID：`99248 → 99711`，证明旧 Service 退出、Launcher 为同 Graph 重建；
- Backup 目录：`10 → 11`，新增项为 Restore 前恢复点；
- 新恢复点：Doctor `PASS`、schema 12、integrity `ok`、foreign-key violations 0、
  object count 5；
- 活动正式库：object count 5；
- 对象版本：`[1, 5, 6, 13, 14]`，与故障前完全一致；
- 五个正式对象均保持 `OPEN`；
- 最终 Doctor：`PASS`，无 failed checks；
- 文件 immutable flag 已移除；
- reload 后 Runtime、Store、正式状态与 Graph 均健康，系统状态不再显示故障条。

第一轮诊断运行也独立产生了一个有效恢复点（目录 `9 → 10`），并保持同样的五对象正式
状态；它促成了 `0c4526d` 的交互修复，但不替代最终 CURRENT 重跑。

## CURRENT 截图

- `current-ui/screenshots/p2-g-44-restore-failure-review-current-dark.png`：
  候选重新校验、最终影响与独立确认；
- `current-ui/screenshots/p2-g-45-restore-rollback-recovery-current-dark.png`：
  真实 atomic activation 失败后的单一用户层回滚结论；
- `current-ui/screenshots/p2-g-46-restore-rollback-reload-health-current-dark.png`：
  Plugin Manager reload 后系统恢复健康。

## 交互评估

- 用户不需要复制 Backup ID、路径、错误码或执行 CLI；
- 故障后唯一主结论同时回答“是否完成、原状态是否安全、恢复点是否保留”；
- 原 Logseq 工作现场保持打开，失败与 reload 都不要求离开 Graph；
- 前台没有暴露 atomic rename、descriptor、PID 或 rollback disposition；
- Provider 与 LLM 不参与 Restore 决策，正式写入仍由既有校验、确认、原子 Restore 与
  Recovery 底座控制；
- reload 后陈旧错误消失，避免用户误以为系统仍不可用。

## 仍开放

- `V2_RESTORE_ROLLBACK_FAILED` 的手工恢复向导与真实 Desktop 证据；
- Restore Light / 窄栏视觉 Gate；
- Migration import/verify/activate 的失败、中断与不确定结果恢复；
- P0/P1 其余集中 Desktop Gate。

## Review 后续自动安全加固

Desktop 主链提交仍是 `0c4526d`。随后 `2eb6df1` 根据双轴 review 补齐以下自动-only
合同，不把它们冒充为本页截图已经验证的界面：

- Launcher 对同一 Graph 串行化 `ensure`，并发客户端只生成一个 owned Service 和两个
  独立 lease；
- Restore 在认证后取得独占 admission，拒绝晚到请求并排空已进入请求；确定性并发测试
  证明先进入的正式写入先完成且进入 Restore 前恢复点，晚到写入以 `SERVICE_STOPPING`
  零写入拒绝；
- 私有 0600 sidecar 使用 `ARMED→RECOVERY_REQUIRED` 两阶段；只有恢复点完整性与 Doctor
  通过后才允许用户层声称“恢复点已保留”；
- sidecar 写入使用 fsync、原子 rename 与 readback；创建、状态升级和清除由同目录跨进程
  mutation lock 串行化，初始 arm 不覆盖已有记录，清除必须匹配完整 expected record；
- 损坏、权限异常、残留锁和竞态保持 fail-closed，并以“恢复身份与完整性未知”表达，不
  虚构回滚或恢复点事实；
- 双重回滚失败测试先验证保留恢复点，再执行 offline Restore 和 Doctor；只有匹配结果通过
  后才 compare-and-clear 并允许 Service 重启。

`e418c87` 继续关闭双轴 review 最后发现的两个并发/隔离缺口：

- sidecar 与 mutation lock 使用 resolved database path 的 SHA-256 摘要形成数据库级路径，
  且启动时核对 interlock Graph identity；默认共享 data root 内两个 Graph 可独立 arm、
  读取与清除；
- Launcher 的 ensure、最后 lease release、reap 与 close 使用同一 per-Graph lifecycle
  gate；旧 child 完成 stop 前不能生成替代 child，close 也会等待已进入的 spawn 并收回它。

Node 20 聚焦 Gate：Shared `8/8`、Launcher `23/23`、Restore 相关 Local Service `5/5`
通过；根级 `./scripts/check.sh` 全量 PASS，Local Service 全量 `158/158`，rule coverage
145，acceptance rehearsal differences `[]`。人工恢复产品向导与真实双重失败 Desktop
Gate 仍保持 OPEN。
