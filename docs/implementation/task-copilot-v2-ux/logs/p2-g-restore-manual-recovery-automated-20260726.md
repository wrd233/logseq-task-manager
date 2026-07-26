# P2-G Restore 手工恢复自动 Gate（2026-07-26）

## 结论

状态：`MANUAL_RECOVERY_CHAIN_AUTOMATED_DONE_DESKTOP_OPEN`

`4c71af1` 已把双重 Restore 失败后保留的 `RECOVERY_REQUIRED` 事实接成一条受控恢复链，
`c70088a` 补齐子进程超时后强制终止的确定性回归；但尚未在最新 Logseq Desktop 中注入
真实双重失败，因此不得登记为 Desktop Done。

## 复用边界

- 没有新增正式 Domain 状态、顶层导航、Agent Runtime、Prompt/Skill 或 Recovery Kernel；
- Launcher 继续只负责编排 Graph-owned 进程与 lease，SQLite 权威仍只在 Local Service；
- 恢复点只能从 0600 私有互锁中的服务端 Backup identity 推导，Plugin/客户端不能提供路径；
- 正式状态切换复用 `V2SqliteStore.restoreOffline`、恢复前安全快照、完整性校验和 Doctor；
- 前台复用用户系统状态，只增加 session-only 的准备、确认和忙碌投影。

## 自动证据

- 只有 `RECOVERY_REQUIRED`、精确 Graph、已确认恢复点、无活动 Service/lease 和固定 HIGH
  确认同时成立才会启动 one-shot maintenance；
- maintenance 先验证保留恢复点，再保存当前歧义状态，恢复后重新打开正式库并要求 Doctor
  PASS，最后以完整 expected interlock 做 exact clear；
- ARMED、Graph mismatch、无效/缺失恢复点、子进程失败、超时、活动 Service/lease 和
  Doctor 失败均不清锁；同一恢复入口可重试；
- Plugin 在 refresh/Graph 变化时立即清除旧 apply authority，执行中禁重复提交；Provider
  环境不会传给 maintenance 子进程；
- Launcher `29/29`、Local Service `160/160`、Service Client `13/13`、Plugin `328/328`、
  Shared `9/9`；`./scripts/check.sh` PASS，145 条规则覆盖 PASS，recovery rehearsal
  `differences: []`。

## Desktop 仍开放

- 最新构建真实注入 activation 与 automatic rollback 双重失败；
- 用户系统状态显示一个主结论、准备恢复、独立 HIGH 确认和执行中状态；
- 成功后 Launcher 重建同 Graph Service，Plugin 返回 READY；
- reload 后互锁保持清除、正式对象为保留恢复点状态、Doctor PASS；
- 一种 maintenance 失败证明安全锁保持且同入口可重试；
- Dark/Light 与窄栏代表性视觉 Gate。

现有 `p2-g-44`～`46` 截图只证明 `0c4526d` 的 activation failure→automatic rollback→
reconnect→reload，不证明本文件中的手工恢复链。
