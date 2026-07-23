# 交互优化实施进度

> 更新时间：2026-07-23
> 当前结论：`PARTIAL` — P0-A Focus、P0-B“暂时做不了”和 P0-H descriptor 私有
> handshake 已完成自动与 Desktop 验收；Service 进程生命周期及其余 P0 仍未完成。

## 总体状态

| 阶段 | 状态 | 证据 |
|---|---|---|
| 设计文档完整阅读 | DONE | README、00–13 全部读取 |
| 仓库权威状态/ADR 阅读 | DONE | current-status、traceability、open decisions、Pilot、MVP_STATUS、全部 ADR |
| 当前真实基线 | DONE | branch/commit/worktree/Node/package/paths/process/UI/API |
| 根级自动检查 | DONE | Node 20.20.2；`./scripts/check.sh` PASS |
| 设计到代码映射 | DONE | `01_DESIGN_TO_CODE_MAP.md` |
| P0/P1/P2 路线图 | DONE | `02`–`05` |
| 测试/风险/缺口计划 | DONE | `06`–`08` |
| P0 代码实现 | IN_PROGRESS | P0-A/P0-B bounded scope DONE；P0-H handshake DONE / lifecycle OPEN |
| P1 | NOT_STARTED | 依赖 P0 |
| P2 | NOT_STARTED | 依赖 P1 |
| 最终验收 | NOT_STARTED | `10_ACCEPTANCE_REPORT.md` |

## 已完成

- 明确当前仓库不是 V2 底座缺失，而是用户交互仍工程化；
- 证明 Focus、Condition、due、Proposal、Commit、Undo、Audit、Anchor、Project aggregate、Doctor、Backup/Restore、迁移和 Provider 都可复用；
- 证明当前未注册 Block/Page 就近入口，主导航仍为六个工程工作区；
- 证明 Plugin 当前不自动管理 Local Service 生命周期；
- 证明本轮根级检查通过且未覆盖用户已有改动；
- 建立 Goal 要求的实施目录和首轮文档。
- 完成 P0-A 的 `BlockFocusController`、Block context menu 注册、原地反馈与会话内 Undo；
- 完成重复提交互斥、active Primary Anchor 唯一解析、stale/closed/missing fail-closed；
- Plugin typecheck 与首轮 132/132 测试通过；
- 修改后根级 `./scripts/check.sh` 再次 PASS；
- 在真实 Logseq Desktop 复现 filesystem descriptor → `SERVICE_DESCRIPTOR_PATH_INVALID`；
- 新增只接受本地 JSON 文件的私有 descriptor 导入入口：校验后只写固定 FileStorage key，
  设置中不保存 token 或 filesystem path；
- 导入期间有 loading、禁用与脱敏错误，首次真实运行发现并修复 settings change 与直接
  refresh 的 generation race；
- Plugin 测试增至 137/137，覆盖合法导入、非法零写入、存储失败脱敏和 First-run UI 状态；
- 真实 Desktop 一次导入进入 `Runtime READY / Store READY`，reload 后自动恢复 READY；
- 真实 Block context menu 完成 Focus 加入、移出、Undo 恢复及 Local Service 状态读回；
- 测试结束后 Focus 清回空集，临时 descriptor 文件和剪贴板已清理。
- 完成 P0-B 的 Block 现场 Condition router、三种最小字段表单、busy 状态和状态 Undo；
- Plugin typecheck、143/143 测试与 build PASS；
- 真实 Desktop 分别写入 WAITING/BLOCKED/PAUSED，Local Service 读回一致；
- 每种状态写入均保持 Lifecycle OPEN、Focus 空，Undo 后恢复 ACTIONABLE；
- 真实 WAITING Undo 发现 JSON key 顺序假 stale，改用 `stableJson` 并补回归后复测通过；
- 最终 force reload 读回 version 10 / ACTIONABLE / Focus 空。

## 当前进行

### Slice P0-C：低风险“接受并应用”

状态：`IN_PROGRESS`

下一项先建立 LOW 白名单和 accepted→revalidate→commit 连续编排 seam；高影响、跨对象、
Ownership、Closure、Lifecycle 与 Project structure 明确排除，任何不确定 transport 不自动重试。

## 当前阻塞

当前没有阻塞 P0-C 的外部依赖。P0-H 的进程自动启动/owned shutdown 仍需 capability spike，
但 descriptor handshake 不再阻塞其他正式 Desktop 写入 Gate。

## 当前风险

- SDK context menu 的正式 Block payload/排序及 Focus/Condition 动作已真实验证；普通 Block、
  Query/引用仍待后续 Gate；
- Service 产品化需要独立 runtime spike；
- 默认 shell Node v25，不得用于受支持 Gate；
- `@logseq/libs` 依赖告警继续公开保留。

## 证据

- P0-A 本地 commit：`e459939`；
- 根级检查：PASS；
- rule coverage：145；
- recovery rehearsal：differences `[]`；
- 本轮已归档 15 张脱敏 Desktop 截图：P0-A/P0-H 7 张，P0-B 8 张；
- 历史 V2：39/39 traceability DONE、E2E-01–24 DONE、真实 DeepSeek/Desktop/恢复均完成。

## 下一步

1. 跑 P0-B 修改后的根级全量检查、stub/skip 和 secret scan；
2. 精确提交 P0-B 代码、测试、文档和脱敏证据；
3. 以 TDD 实现 P0-C LOW 白名单与连续编排；
4. 在隔离 Graph 验收一次接受并应用、失败、PENDING/Recovery 和 Undo。
