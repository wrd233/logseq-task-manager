# P0 RECOVERY_REQUIRED 前台与安全补偿 Desktop Gate

- 日期：2026-07-30
- 分支：`feature/task-copilot-mvp`
- 代码：`872d2d4`（终态历史分离与恢复结果翻译）、`684491f`（最近修改摘要压缩）
- Logseq：0.10.15，File Graph `logseq`
- 场景：host Light / Plugin Dark，约 1000×720
- 测试页：`Task Copilot Lab/P0 Recovery Frontstage 20260730`
- 正式对象：`obj_20260730075549982_2507bf283ff8499f97e32c44749d2a44`，全过程保持 `v4`

## 真实链

1. 通过真实 Logseq 输入建立一个 MiniProject 根 Block 与两个真实子 Block。正式 Service
   读回根 UUID `6a6b037c-55fb-4818-83b4-eace1b20c190`、两个子 Block UUID、顺序和
   scope hash；没有用 SQLite 手工篡改 Graph。
2. 真实 Provider 的 MiniProject Grill 先走 flash，随后用安装器在不改变数据库 authority
   和 Keychain 引用的前提下短暂切换 pro。观察到一轮 Grill Turn Validator 拒绝、两轮
   Preview Validator 拒绝、多次 Provider unavailable，以及 pro 约 60 秒超时；没有把失败
   JSON 或失败 Preview 冒充正式 Proposal。pro 未改善问题压缩，最终恢复 flash。
3. 为隔离恢复内核而不伪造 LLM 成功，使用用户明确给出的两条材料顺序生成一个
   `source=user` HIGH Proposal。它仍经过正式 Service Proposal 校验、Desktop Review 和
   “审阅方案→确认方案”，零 Graph 写入。
4. `prepareMiniProjectRestructure` 返回两个 `MOVE_BLOCK`。通过 Computer Use 在真实 Logseq
   把第二条子 Block 上移；Service 的正式 Graph bridge 读回并把 step 0 标记 `VERIFIED`。
5. step 1 注入 `DESKTOP_DISCONNECTED` 后，Service 返回 `COMPENSATION_REQUIRED`；Proposal
   保持 `ACCEPTED`，没有报告成功。
6. 真实 Plugin Manager reload 后，工具栏、最近修改和 Review 均从同一账本重建“上次修改
   需要恢复”。用户确认“沿用同一恢复记录”并执行“恢复到安全状态”；插件按反向步骤补偿。
7. 最终 Proposal=`FAILED`、原 SemanticCommit=`FAILED`、错误码
   `V2_MINI_PROJECT_RESTRUCTURE_EXECUTION_FAILED`；这表示已补偿终态，不是待用户继续的
   Recovery。Service=`READY`、schema=`12`、对象仍为 `v4`。
8. Graph bridge 最终读回根与两个原 UUID、原内容、原顺序完全一致。随后完整退出并重新
   打开 Logseq；插件自动重连，待审阅为 0，终态失败只在折叠历史和最近修改中保留。

## 失败驱动的 UI 修复

- `872d2d4`：`FAILED` Proposal 不再占据“待审阅”计数或无动作首屏卡；它与 APPLIED、
  REJECTED、STALE 一起归入历史。最近修改对已补偿的 MiniProject 结构失败明确说明
  “已执行步骤已经恢复，正文和正式状态保持原样”，不再误用 Undo 前置变化文案。
- `684491f`：最近修改只显示最终 Preview 的首段用户摘要，完整 Markdown 仍留在原审阅记录，
  避免恢复历史把入口、材料和机器结构整份重复铺到首屏。
- 新增正式状态 0、Runtime 0、Recovery 分支 0、Skill/Prompt/Validator 版本 0、写入权威 0。

## 自动与 Desktop 证据

- 红灯先证明两处缺陷；修复后 `ui.test.ts + recent-changes.test.ts` 为 `84/84`。
- `./scripts/check.sh` 在 Node 20.20.2 下完整 PASS；第二次最终根级检查记录在本轮提交前。
- CURRENT 截图：
  - `../current-ui/screenshots/p0-recovery-review-empty-after-restart-current-684491f.jpeg`
  - `../current-ui/screenshots/p0-recovery-compensated-history-current-684491f.jpeg`
  - `../current-ui/screenshots/p0-recovery-restored-source-after-restart-current-684491f.jpeg`
- `872d2d4` 的三张过渡截图保留为 `SUPERSEDED`，不能代表最新摘要压缩。

## Provider / Skill 结论

- 本轮没有新增 Skill 版本。flash/pro 的共同问题是已明确材料仍被重复追问；pro 还出现长超时，
  因此没有仅为单样本追加 Prompt 特例，也没有把 pro 设为运行默认。
- 本次 Service restart 后 session-only interaction summary 为 0，不能反推完整调用次数或拒绝率；
  因此只登记可直接观察的一轮 Turn rejection、两轮 Preview rejection 和一次 pro timeout，
  不制造平均重试次数。
- 恢复 Gate 使用用户来源 Proposal，不计作 LLM Proposal 成功；正式写入边界仍完整保留。

## 结论

P0 `RECOVERY_REQUIRED` 代表 Gate 从 `AUTOMATED_ONLY` 升为
`DONE_DESKTOP_REPRESENTATIVE`。P0 仍因最终代表视觉汇总与完整 Goal 其他 P1/P2/Release
项目保持 `IN_PROGRESS_DESKTOP_GATES`；本结论不关闭 P0，更不关闭整体 Goal。
