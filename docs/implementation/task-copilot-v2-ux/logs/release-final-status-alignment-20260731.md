# Final Release 状态对齐与 Freeze 审计（2026-07-31）

## 结论

Task Copilot V2 v1.1 的交互优化与产品化实现满足 `RELEASE_READY`。P0、P1、P2 均按
已审计的 release boundary 完成；首发未开放能力已明确归为 Shadow、OFF、future
enhancement 或 bounded host limitation，没有模糊 Partial，也没有未解释 Release blocker。

本轮不宣布仓库级 `MVP_SUCCESS / overall_goal=COMPLETE`：`MVP_GOAL.md` 还要求外层仓库
clean，而当前存在用户已有、未授权纳入本轮的 package 与 `docs/research/` 改动。提交本轮
Task Copilot 状态文档后，产品代码和发布证据会收口，但外层 Git 仍不 clean；该 Gate 只能在
用户决定这些无关改动的去向后关闭。

本轮没有修改业务代码、正式状态、Agent Runtime、Recovery Kernel、Skill/Prompt/Validator
或数据库 schema。唯一产品改动是统一当前状态、风险、验收和截图权威。

## 审计基线

- 审计起点 HEAD：`03168d7`；当前安装产品代码 exact build：`8928861`；
- 当前发布包：`task-copilot-v2-0.1.0-8928861-r8.zip`；
- SHA-256：`1d36258a21827554b41dede1deaf1b63d4f68875d85762769b6faf4781627f07`；
- Logseq Desktop：`0.10.15`，File Graph 测试环境；
- Plugin 从 r8 稳定解压目录加载，Service/Launcher/Plugin 使用同一 Graph/database authority；
- 用户已有 `apps/task-copilot-local-service/package.json`、`package-lock.json` 与
  `docs/research/` 工作区改动未纳入本轮。

## 自动与运行证据

- Node `20.20.2` 下根级 `./scripts/check.sh` PASS：全部 workspace typecheck、lint、tests、
  build、Plugin package/bootstrap/dist、架构边界、145 条稳定规则与恢复演练通过；
- 因首次 PATH 未包含 Homebrew `rg`，仓库边界检查随后用完整 PATH 单独重跑并 PASS；
- 当前 Local Service Doctor：schema `12`、integrity/Graph/SQLite/Anchor/Identity/Commit/
  Backup/Key reference/Skill profile/Protocol PASS；仅有 1 条既有 stale Proposal warning；
- r8 当前 Desktop 已复验 Now Task 单一主操作、完整 quit/owned shutdown、reopen 与同一
  authority 自动恢复；当前真实 DeepSeek smoke attempt `1`、正式 Graph/Store 写入 `0/0`；
- P1 Attention 首发只开放确定性时间类 bounded Pilot；session-only disposition、reload
  重算、事实解除自动失效和一对象一主问题已通过；acted 不冒充 helpful；
- P2-D 复用一条 shared external Agent Context→Preview→正式 Commit→reload→Undo/
  Recovery→reload 链；外部 Agent 无正式写入权；
- P2-G Rebind、Restore 双重失败手工恢复、Migration Import response-loss、Verify/Activate
  failure 同 ledger 重试和窄栏均有代表性 Desktop 证据；File Graph host Light 为有界限制。

## 独立审查

Spec 与 Standards 两条审查线未发现安全、范围或架构级否决。审查发现的状态标题/历史正文
矛盾、P2-G 后续关闭证据遗漏和未定义截图状态已修复。截图索引按最新构建规则重新分类：
只有 r8 两张安装态截图保留 `CURRENT`，较早 exact build 的流程截图统一为 `HISTORICAL`。

## 发布边界

- Dynamic Now 不替换正式 Now；
- Waiting 过久、Project 静默、跨对象 LLM 观察与建议关注保持 Shadow/OFF；
- Block Marker OFF；
- P2-F Shadow/default-off；
- Association 与 Project due 不从 Project Router 开放；
- File Graph Page Head/host Light 及无可靠 identity 的 Query/reference/sidebar 使用安全隐藏或
  有界降级；
- 上游 `@logseq/libs` advisory 保持已登记风险，不执行破坏兼容性的强制升级。

这些是有证据的产品边界，不是被伪装成 DONE 的未实现写入能力。未来自然日用和宿主版本
变化只作为发布后观察；若没有新的 Release blocker，不重新打开已关闭的 P0/P1/P2 Slice。
