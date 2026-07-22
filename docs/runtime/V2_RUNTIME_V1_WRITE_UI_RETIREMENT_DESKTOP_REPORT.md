# V2 Runtime V1 写入 UI 退役 Desktop Report

日期：2026-07-22
环境：Logseq Desktop 0.10.15，Node 20.20.2 Local Service，隔离 SQLite/descriptor
结论：`PASS`

## 验收目标

- 正常 Plugin Runtime 不再加载或调度 V1 Application/FileStorage 写入；
- 顶栏不再提供必然失败的 V1 Capture，而复用现有当前页 Candidate 入口；
- Audit 不再提供 V1 Backup/Pending/Anchor 写按钮，只读展示 V2 SemanticCommit 并指向现有 CLI/Service 恢复能力；
- Diagnostics 的 Pending Commit 与 Anchor Conflict 来自 Local Service，不再以未初始化 V1 state 错报为 0；不可读取时显示 `unavailable`。

## 自动证据

- Plugin 入口已移除 `@task-copilot/application`、`@task-copilot/persistence`、`TaskCopilot`、`VersionedStateRepository`、`LogseqFileStorageBlobStore`、Recovery Bundle 与全部 V1 action dispatch；未知 action 以 `V2_UI_ACTION_UNSUPPORTED` 零写入失败；
- `check-bootstrap.mjs` 与根级边界检查固定 V2-only 模型、Local Service client 和 fail-closed action guard；
- UI 回归证明默认进入 Now Work、正常导航不再暴露 V1 Inbox，顶栏只有 `v2-candidate-open`，Audit 不含 `export-backup`、`verify-backup`、`recover-pending`、`scan-anchors`；
- Project 重入回归以 V2 Object、Primary Ownership、Association 和 Now Work 投影出恢复上下文，不读写 V1 恢复包；SemanticCommit 查询失败与空历史有独立可见状态；
- Plugin 针对性检查：typecheck、125 tests、build 全部 PASS，0 failed/skipped；根级 `./scripts/check.sh` 的全部 typecheck/lint/tests/build、Plugin/架构边界、145 rules、acceptance rehearsal 与仓库边界均 PASS。

## Desktop 证据

1. 完整重启 Logseq 以排除旧 iframe cache 后，Plugin 以当前磁盘构建启动，所有 Runtime stage 为 `READY`；
2. 顶栏真实显示“整理当前页”，HTML action 为 `v2-candidate-open`，没有 `capture`；默认工作区为 Now Work，主导航中没有 Inbox 或 V1 Capture 文案；
3. 点击“整理当前页”真实进入 Candidate 视图；本次当前 Page tree 不可读时显示“候选同步未执行 / 没有扫描 Graph 或执行写入”，没有假成功或静默按钮；既有 Candidate 成功闭环未重复执行；
4. Audit 真实显示 SQLite/Local Service 单一权威、`tc backup` / `tc doctor` / `tc backup restore` 指引和空 V2 SemanticCommit 状态；V1 四个写入按钮均不存在；
5. Project 重入在隔离空库中真实显示“从同一 SQLite 投影恢复状态、关联和下一步”的空态；非空 Project/Ownership/Association/Now Work 的组合投影由渲染回归覆盖，未为此制造正式对象；
6. Diagnostics 真实显示 `READY`、formal writes `true`、explicit sync transport `true`、Graph bridge `true`，并通过 Local Service 查询显示 Pending / Source Conflict `0 / 0`；导航语义为 Now Work / Review Center / Projects / Audit，V1 previous-slot/probe 按钮不存在。

## 安全与清理

- 未修改正式 Graph 正文；未执行 Provider 或迁移/Restore；
- descriptor 只经 Plugin 私有 FileStorage 临时配置，结束后已清除；
- 隔离 Service 正常退出，最终回归运行目录可恢复地移动到 `/Users/wangrundong/.Trash/task-copilot-v2-runtime-final-20260722-2133`；
- 未新增表、状态、协议、扫描器或恢复器。本轮只删除平行 V1 Runtime 路径并复用既有 Candidate、Service query 与 CLI。
