# V2 Project Closure 外部 Agent Runtime Report

## 结论

```yaml
date: 2026-07-22
gate: E2E-20 external Agent generation, CLI handoff and Desktop completion
status: PASS
desktop_completion: PASS
formal_write_by_agent: false
agent_task: /root/real_external_closure_agent
agent_rounds: 2
context_fingerprint: c8b20c915046fa1714dd93de0c4d0b51affb6d188d117f6858a1742a29857232
context_manifest_sha256: 78a632e1d7cc22a3fb3388ae4ee62e7135e4d5c50e993e810f39f0eaaad4022b
proposal_sha256: 79d985d5f1583c2ca562a7383f993d5e9430a522660d8b4fd805589a307256c3
proposal_id: proposal_external_agent_project_closure_20260721T123414Z
object_id: obj_20260721122920356_9f684d9af2c549b99ab7d534ed276632
object_version: 2
```

一个独立 Agent 只读取 CLI 导出的 Project Context Package 和其中的 `task-copilot-core` / `design-project` Skills，生成结构化 Project Closure Proposal。该文件经真实 CLI `proposal validate` 与 `proposal submit` 进入同一 Local Service Review queue；CLI 返回 `proposalStored=true` 与 `formalWritesExecuted=false`，目标 Project 仍为 `OPEN` version 2。

## 证据链

1. 在临时 SQLite/Graph 中通过既有 Project prepare/finalize 合同创建一个 `OPEN` Project。
2. CLI `context export --scope project` 产生带 SHA-256 manifest 的只读 Context Package，包含正式 Object version/modify scope 与两份内置 Skill。
3. 独立 Agent 首次输出因使用自行推测的字段名，被 Domain Validator 以 `V2_PROPOSAL_SHAPE_INVALID` 拒绝；零 Proposal、零正式变化。
4. 调查确认 `design-project@1.0.0` 只描述语义而未提供机器 Schema。Skill 升级为 `1.1.0`，增加精确的 Closure Proposal 最小模板；Validator 未放宽。
5. 同一 Agent 只读重新导出的 Context/Skill 后修订输出，CLI Validate 返回 `VALID`，Submit 返回 `READY` Proposal，`source.kind=external_agent`。
6. 提交后 CLI Object 读回仍是 `PROJECT + OPEN + version 2`；未进行 Review、Commit 或 Desktop 写入。

CLI 结构化摘要（已脱敏）：

```yaml
validate:
  status: VALID
  proposalStored: false
  formalWritesExecuted: false
submit:
  proposalStatus: READY
  proposalStored: true
  formalWritesExecuted: false
readback:
  objectType: PROJECT
  lifecycle: OPEN
  version: 2
```

完整临时 Context、SQLite 和 Proposal 测试产物已在 Gate 后移入本机废纸篓，未纳入 Git；上述 hash 用于识别当次脱敏证据。

## Logseq Desktop 完成证据

2026-07-22 在 Logseq Desktop 0.10.15 使用隔离的 schema v10 SQLite 副本和专用 Project 走完后续 Gate。这一轮使用与上述独立 Agent 输出同一机器形状的脱敏 `external_agent` Proposal，专门验证 Review/Commit/Desktop 端；上述 Agent/Context 生成与 CLI 交接证据不替换为这个隔离 Proposal。该提案的 Graph read scope 为空，因此本轮不声称重复验证 Graph Context 采集；Project 页保留由 Desktop 与文件读回独立证明。

1. Review Center 渲染完整 Closure 最终预览、`UPDATE_PROJECT_INTERFACE` + `TRANSITION_LIFECYCLE` 语义 Diff，两个变更位于同一 HIGH 组。
2. 独立确认 HIGH 组后，Proposal 从 `READY` 变为 `ACCEPTED`；目标 Project 仍为 `OPEN + version 2`，且没有 Closure，证明“接受≠提交”。
3. 提交前检查通过后，最终对话明确要求已审阅原始目标、实际结果、未完成 Objective 的原因和去向，再执行精确的 Project Completion。
4. 提交后同一 `object_id` 从 version 2 进到 version 3，Lifecycle 为 `COMPLETED`，Proposal 为 `APPLIED`，单个 `proposal-commit:*` 为 `COMPLETED`。`closure_json` 读回原始目标和未完成项 next step。
5. Focus 计数为 0，reload 后 Now Work 不再显示该 Project；Projects 对象工作区仍显示 `PROJECT · COMPLETED · ACTIONABLE · v3`，并可读原始目标、结果、Deliverable、未完成项及后续、遗留、Decision 和未来总结。
6. Logseq 搜索能找到并打开原 Project 页；页上 owner/object-id/creation SemanticCommit 属性仍可读，文件 SHA-256 为 `641931d9a66cdd163d6e63e87d7a757c641d5cc7687ca65d2c0ea4f5a335d73b`。
7. 收尾时 Pending Commit=0、Recovery Required Commit=0、`PRAGMA integrity_check=ok`、`foreign_key_check` 无记录；停止隔离 Service 后 descriptor 已删除。

本地结构化运行证据位于 `tmp/runtime/v2-desktop/project-closure/`，包含 HIGH 确认、最终确认、完成态、reload 后 Closure、完成后 Now Work 不显示该 Project 和原页读回截图；该目录被 Git 忽略，不是产品权威或发布资产。

## 发现与修复

- 真实 Context 导出首次被 CLI 误拒：导出器允许嵌套相对路径，但原字符白名单不允许规范文件名 `SKILL.md` 的大写字母。
- 修复后按路径 component 校验：最多 16 层、总长最多 512，每段只允许有界的 ASCII 字母/数字/`._-`，明确拒绝空段、`.`、`..`、绝对路径和反斜杠。输出目录仍必须新建，所有文件先校验 hash/bytes，manifest 最后写入。
- 未新增表、状态、协议、写入路径或恢复机制。

## Gate 结论

- E2E-20 的外部 Agent 生成、CLI Proposal-only 交接、Desktop HIGH 审阅、最终 Completion、reload、完成后 Focus 计数为 0 / Now Work 不显示该 Project，以及原页保留均为 `PASS`。
- 本 Gate 没有新增表、状态、协议、扫描器、恢复器、用户概念或平行写路径。
