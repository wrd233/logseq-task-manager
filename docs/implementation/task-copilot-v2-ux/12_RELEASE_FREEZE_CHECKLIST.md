# Task Copilot V2 Release Freeze Checklist

> 状态：`RELEASE_CANDIDATE_READY`
> Freeze 起点：`8d24569` 及其 P2-D 当前证据提交之后
> 原则：不新增大功能、正式状态、顶层导航、Skill 家族、Agent Runtime 或 Recovery Kernel；
> 只处理 Release blocker、明确回归和严重体验问题。

## 已满足

- [x] P0 代表性 Desktop 总 Gate：入口、IME、宿主有界降级、Service 生命周期、Graph authority、
  accepted-not-applied、PENDING、RECOVERY_REQUIRED、Undo、reload/restart；
- [x] P1 Context Recovery 当前 Skill/UI/Provider/错误/stale/主题/窄栏代表链；
- [x] P1 首批确定性 Attention：session-only disposition、reload 重算、事实解除自动失效；
- [x] P1 Block Marker：Logseq 0.10.15 File Graph 宿主拒绝，有界关闭；
- [x] P2-D A/B/C/D 唯一发布路由和一条 C 类外部 Agent
  Context→Review→Commit→reload→Undo→reload 代表链；
- [x] P2-E 单步 Closure 有界恢复结论；
- [x] P2-F 保持 Shadow、默认关闭、不阻断首发；
- [x] P2-G Rebind、Restore 与 Migration 高风险代表链；
- [x] 根级测试、typecheck、build、145 条规则、恢复演练和仓库边界 PASS；
- [x] 真正零参数 install 安全停止；提供 Graph identity 且不传 `--database`
  的同 Graph 重装保留既有 database authority；Launcher、Service、Plugin descriptor
  指向同一映射；
- [x] 当前构建 P2-D 正常操作、真实失败、安全补偿、Undo 和 reload 证据。

## Freeze 中仍需复核

- [x] 对当前 freeze commit 执行分层 Release 代表矩阵：零参数安全停止；Graph-identity
  重装（不传 `--database`）保留 authority；当前 Plugin
  reload、真实 Provider、Project create→reload→Undo→reload PASS；quit/reopen、owned
  shutdown、Graph switch/切回与失败/Recovery 复用完全相同 Launcher/Service payload 的既有
  Desktop 证据，不机械重跑未受影响的宿主 Gate；
- [x] 核对当前 Skill catalog、安装态和运行态只使用明确 active 版本；五个 Skill 的源文件、
  payload、安装态和 Service catalog SHA-256 一致。`1549728` Freeze 基线又用
  `recover-context@1.3.0` 完成一次真实 Provider Desktop smoke，Project v31 保持零写入；
- [x] 核对 Project create→reload→Undo 与 Context Recovery 当前构建证据；当前 Dark
  1000×720 主链重新取证，Light/窄栏使用未发生样式变化的既有代表 Gate，不扩成笛卡尔积；
- [x] 生成并校验可安装 Release 包；`unzip -t` PASS，SHA-256 为
  `d3f2242d2a0c3721656a6a9f8b72052e3c3fe301d4ea33b0971d1eb5c43f83d3`（当前
  `task-copilot-v2-0.1.0-9e7a105-r5.zip`）；包内 Plugin 对应 `9e7a105` 源码。
  `70a7fe7` 根级 rebuild 仅更换内嵌 build-commit provenance：归一化后 JS 与包内
  一致，CSS hash 一致；安装、启动、
  关闭、恢复、升级与安全卸载说明已同步到 `13_RELEASE_RUNBOOK.md`；真正零参数 install
  以 `LAUNCHER_INSTALL_ARGUMENTS_INVALID` 安全停止；直接从解压包提供 Graph identity、
  但不传 `--database` 的正式重装为 `INSTALLED`，authority/hash 保持，真实 Plugin reload
  后 Service READY、Doctor PASS；`70a7fe7` 又将 Logseq 的 Plugin 注册固定到稳定
  `tmp/releases/...-r5/task-copilot-plugin`，不使用 `/var/folders` 临时目录；再次完成
  Plugin Manager reload、完整 quit/owned shutdown/reopen，重开后 iframe 仍来自稳定
  r5 目录，CLI `READY · objects 14`、Doctor PASS；
- [x] Release Candidate 自然 Block→真实 Provider→Review→应用→reload→Undo→reload 回归；
  `ae9c6d7` 关闭已完成“最近修改”的无效“查看”和 Commit/Object ID 泄漏，Plugin
  `378/378`、根级检查、Doctor 与恢复演练 PASS；
- [x] 完成发布前 TODO/FIXME/stub、skipped、silent overwrite、Pending Recovery、依赖审计与
  当前截图/文档一致性检查；没有 skipped test，源码 TODO 命中均为 Logseq Marker 合同；
- [x] 只把真实 Release blocker 保持为 OPEN；当前没有未解释的代码/数据安全 blocker。
  上游 SDK advisory、bounded host limitation、Shadow 与默认关闭研究能力均列入已知边界，
  不冒充 blocker。

## 当前依赖审计

- `1549728` 将 ESLint 开发链的 `brace-expansion` 从 `5.0.7` 升至 `5.0.9`，audit 从
  `4` 项降为 `3` 项，根级检查保持 PASS；
- 剩余 `2 high / 1 critical` 都来自 `@logseq/libs@0.0.17` 的 DOMPurify/lodash runtime；
- 既有 ADR-0007 的结论仍成立：npm 建议的 `@logseq/libs@0.3.4` 不能消除当前 advisory，
  type-only 又不能在 Logseq 0.10.15 建立 `window.logseq`。因此保留为显式上游发布风险，
  不执行 `npm audit fix --force`。

## 首发默认关闭与已知限制

- Dynamic Now Shadow 不替换正式 Now；
- Waiting 过久、Project 静默、跨对象 LLM 观察与建议关注不前台化；
- Block Marker 关闭；
- P2-F 保持 Shadow；
- Association 与 Project due 不从 Project Router 正式开放；
- File Graph Page Head 与真实 host Light 能力按宿主限制安全隐藏或有界降级；
- 无可靠 identity 的 Query/reference/sidebar 位置不猜测目标；
- 直接显式标记已经产生并发生后续变化的正式对象不提供通用“删除对象”按钮；新建且保持
  精确原状态的 Proposal 正式化继续支持既有安全 Undo，其他情况使用 Lifecycle/受控恢复。
