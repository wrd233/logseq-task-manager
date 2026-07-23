# 交互优化实施进度

> 更新时间：2026-07-23
> 当前结论：`PARTIAL` — 首个 P0-A 自动化 Slice 已完成；Desktop 正式写入 Gate 正在由 P0-H descriptor handshake 解锁。

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
| P0 代码实现 | IN_PROGRESS | P0-A 自动化完成；Desktop BLOCKED_BY_P0_H |
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
- Plugin typecheck 与 132/132 测试通过；
- 修改后根级 `./scripts/check.sh` 再次 PASS；
- 在真实 Logseq Desktop 复现 filesystem descriptor → `SERVICE_DESCRIPTOR_PATH_INVALID`。

## 当前进行

### Slice P0-H 前置：descriptor private handshake

状态：`IN_PROGRESS`

P0-A 的正式 Desktop 写入必须先让插件获得 READY client。当前已证明：

- Service/CLI READY；
- renderer 无可用 Electron descriptor reader；
- 设置中传 filesystem path 会进入 FileStorage fallback 并被安全拒绝；
- 当前没有把 descriptor 内容安全导入插件私有 FileStorage 的产品入口。

下一项实现一个不把 token 放入设置、Graph、日志或截图的私有 descriptor 导入/重连纵向
Slice；完成后回到同一隔离 Graph 验证 P0-A。

## 当前阻塞

P0-A Desktop 正式写入被 P0-H descriptor private handshake 阻塞；自动化与其他 P0 工作不受阻。

## 当前风险

- SDK context menu 动态性需真实 Desktop 验证；
- Service 产品化需要独立 runtime spike；
- 默认 shell Node v25，不得用于受支持 Gate；
- `@logseq/libs` 依赖告警继续公开保留。

## 证据

- 当前 HEAD：`d6ef86e`；
- 根级检查：PASS；
- rule coverage：145；
- recovery rehearsal：differences `[]`；
- 本地当前 UX 调研：3 张真实 Desktop 截图，另有 CLI/Service/Restore 证据；
- 历史 V2：39/39 traceability DONE、E2E-01–24 DONE、真实 DeepSeek/Desktop/恢复均完成。

## 下一步

1. 精确 stage P0-A 代码、测试、实施文档与脱敏证据；
2. 创建 P0-A 本地 commit；
3. 以 TDD 实现 descriptor 私有导入/重连；
4. 在隔离 Graph 取得 Plugin READY；
5. 回归 P0-A Desktop Focus/Undo/读回；
6. 继续 P0-B。
