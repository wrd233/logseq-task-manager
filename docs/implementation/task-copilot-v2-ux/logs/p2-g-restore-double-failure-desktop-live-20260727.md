# P2-G Restore 连续双重失败与人工恢复 Desktop Gate

## 结论

状态：`REAL_DOUBLE_FAILURE_MANUAL_RECOVERY_DESKTOP_DONE`

本 Gate 在隔离测试 Graph 和专用故障 Launcher 中真实触发：

1. Restore 候选激活后的异常；
2. 自动回滚也异常；
3. `RECOVERY_REQUIRED` 互锁保留切换前恢复点；
4. Plugin 不经 reload 重新发现 Launcher 并展示人工恢复；
5. 用户进入独立 HIGH 确认；
6. 同一 Recovery Kernel 保存当前歧义状态、恢复切换前状态、运行 Doctor、精确清锁并重连；
7. 回切正常 Launcher 后 reload，正式能力保持健康。

这关闭 P2-G 的真实连续双重故障子 Gate，但不关闭 P2-G 或完整 Goal。Migration
import/verify/activate failure、Service 中断续跑以及 Restore Light/窄栏仍开放。

## 运行基线

- branch：`feature/task-copilot-mvp`
- commit：`fe0b590034ac`
- Plugin：`0.1.0`
- Plugin build：`2026-07-27T01:12:43+0800`
- Logseq Desktop：`0.10.15`
- Graph：仓库隔离测试 Graph `logseq`
- theme / viewport：Dark / 约 `1001 × 720`
- 正常 Launcher：LaunchAgent，loopback port `19673`
- 故障 Launcher：只在本次 Gate 存活的测试进程，loopback port `19674`
- 操作方式：bundled Computer Use 只定向操作 Logseq，不抬升应用、不发送全局鼠标事件
- 隐私：专用虚构对象；API Key、descriptor token、私人正文和数据库内容均未进入截图或报告

## 故障注入

故障入口只存在于被忽略的 `tmp/runtime/launcher-gate/`：

- `afterRestoreActivate` 抛出异常，模拟候选已切换后失败；
- `beforeRestoreRollback` 再次抛出异常，模拟自动回滚也失败；
- `recover-restore` 仍调用生产 `recoverRetainedRestoreState`，不绕过恢复互锁。

测试前活动库有 7 个正式对象，所选旧快照有 6 个对象。双重失败后：

- 活动库暂为 6 个对象；
- 切换前 7 对象数据库以 `.previous-*` 保留；
- 私有恢复互锁为 `RECOVERY_REQUIRED`；
- 正式写入被暂停；
- 没有继续启用未经确认的状态。

## 真实发现与修复

第一次精确故障运行对应 `da080d2`。Plugin 已正确显示“需要人工恢复”，但失败 catch
释放 Service 后没有重新发现仍可用的 Launcher，因此正文提示“请在下方核验”，实际恢复控件
直到 Plugin reload 才出现。`p2-g-53` / `54` 保留为 `HISTORICAL` 缺陷证据。

`fe0b590` 在既有 Restore failure catch 中复用 `recoverConfiguredServiceRuntime`，并同步
diagnostics、toolbar 和 Project Page Head。它没有新增正式状态、恢复入口、写入权威或第二套
Recovery Kernel。

第二次同样的真实连续双重故障证明：

- 不 reload 即显示唯一“准备恢复”主动作；
- 恢复点记录时间和当前保护可读；
- 数据库路径、Backup ID、token 和命令均未出现在用户层；
- 独立 HIGH 确认未勾选时不执行；
- 确认后恢复成功并立即回到健康用户状态。

## 恢复与最终健康

人工恢复完成后结构化读回：

- active objects：`7`
- Anchor conflicts：`0`
- SemanticCommit `PENDING`：`0`
- SemanticCommit `RECOVERY_REQUIRED`：`0`
- Restore interlock：cleared
- Plugin runtime：`READY`
- Local Service：`READY · formal writes true`
- Explicit sync：`pending 0 / transportReady true / reconciliationRequired false`
- Plugin exact build：`fe0b590034ac`

随后停止故障 Launcher、恢复原私有 descriptor、重新 bootstrap 正常 LaunchAgent，
确认 Launcher config、pairing descriptor 和 Plugin descriptor 都指向正常 loopback
Launcher，token 只做相等性核验而未输出。Graph authority 仍为原
`tmp/runtime/manual-v2/task-copilot.sqlite`，没有静默替换。Plugin Manager reload 后系统
继续为 `READY / 0 / 0 / 0`。

两次双重失败各留下一个权限为本地测试环境所有的 `.previous-*` 安全副本。它们不是活动
authority，也不再触发 interlock；当前恢复例程有意不自动删除这类可取证副本。本 Gate 不在
恢复成功后静默清理它们，后续只作为 P2-G 有界保留策略检查，不重新发明恢复状态。

## 自动证据

- Plugin typecheck：PASS
- Plugin tests：`336/336` PASS
- Plugin production build：PASS
- 根级 `./scripts/check.sh`：PASS；rule coverage `145`，acceptance recovery rehearsal
  differences `[]`

本 Slice 不调用 LLM/Provider；Validator 拒绝率、模型重试与 Skill 版本不适用。

## CURRENT 截图

- `../current-ui/screenshots/p2-g-55-restore-no-reload-manual-recovery-current-fe0b590.jpeg`
- `../current-ui/screenshots/p2-g-56-restore-final-confirmation-current-fe0b590.jpeg`
- `../current-ui/screenshots/p2-g-57-restore-manual-recovery-success-current-fe0b590.jpeg`
- `../current-ui/screenshots/p2-g-58-restore-normal-runtime-final-health-current-fe0b590.jpeg`
- `../current-ui/screenshots/p2-g-59-restore-final-diagnostics-current-fe0b590.jpeg`

五张均来自 commit `fe0b590034ac` 的真实 Logseq Desktop。它们替代 `p2-g-47`～`50`
对“当前手工恢复实现”的解释权；旧图仍保留为受控前置条件历史证据。

## 仍开放

- Migration import / verify / activate failure；
- Migration Service 中断后的续跑或安全停止；
- Restore Light / 窄栏代表性视觉 Gate；
- `.previous-*` 安全副本的长期保留与显式清理策略；
- P2-G 其他尚未关闭项和完整产品化 Goal。
