# V2 仓库评估

> 评估日期：2026-07-19
> 结论：V1/MVP 是可复用的安全内核和 Logseq 适配证据，但不是 V2 数据模型或运行架构。V2 需要渐进迁移，不能在现有插件进程内直接把 Phase 改名或把 FileStorage 替换成 SQLite。

## 1. Git 与目录

| 项目 | 当前事实 |
|---|---|
| Git 根 | `/Users/wangrundong/work/任务管理中心-logseq插件` |
| 分支 | `feature/task-copilot-mvp`，HEAD `8c2f8e9` |
| 外层工作区 | 调研开始时 clean；`npm ci`、构建产物和 `tmp/` 均被忽略 |
| remote | 实际存在 `origin=https://github.com/wrd233/logseq-task-manager.git`；当前分支跟踪 `origin/feature/task-copilot-mvp` |
| push | 本 Goal 明确禁止；本地 pre-push hook 也拒绝 push；本轮未 push、未修改 remote |
| 嵌套 Graph | `logseq/` 是被外层完全忽略的独立 Git 仓库，不是 submodule；其 dirty 只作运行环境信息 |
| 正式插件源码 | `apps/task-copilot-logseq-plugin/` |
| Capability Lab | `apps/logseq-plugin-capability-lab/`，仅作 SDK/运行时证据，不是产品语义权威 |
| 领域与用例 | `packages/domain/`、`packages/application/` |
| 适配与持久化 | `packages/logseq-adapter/`、`packages/persistence/` |
| 构建产物 | 各 app 的 `dist/`，忽略且由完整检查重建 |
| 不应修改 | `logseq/` 业务/测试数据、依赖、`dist/`、下载原件、未知用户文件 |

旧文档中“外层未配置 remote”的描述已经漂移；这是文档事实问题，不授权删除 remote。

## 2. 技术栈与入口

- npm workspaces，根包要求 Node `>=20.19 <21`，TypeScript 5.9、ESLint 10、esbuild；
- 正式插件使用 `@logseq/libs@0.0.17` 和 Vanilla TypeScript renderer；入口为 `apps/task-copilot-logseq-plugin/src/index.ts`；
- 根 `./scripts/check.sh` 执行 `npm ci`、typecheck、lint、全部测试、两插件构建、包完整性、架构边界、旧规则覆盖、恢复演练、仓库边界和 `git diff --check`；
- 当前持久化是 Logseq FileStorage 上的 checksummed A/B JSON；Node 恢复工具使用文件原子写；
- 当前 Application 由插件直接实例化 `TaskCopilot`，同时直接连接 `LogseqContentPort` 与 `VersionedStateRepository`；没有 Local Service、HTTP/IPC、SQLite 或 CLI；
- Provider 只有 `NoAgentProvider` 和确定性 Demo；没有真实 Provider、Prompt Runtime、Structured Output 或 DeepSeek 在线证据；
- 系统 `/usr/bin/sqlite3` 为 3.43.2；正式根检查固定使用 Node 20.20.2。Local Service 的 SQLite library 仍需 ADR 与隔离 spike，不能把系统 CLI 当长期数据库驱动。

## 3. 基线验证

2026-07-19 执行 `./scripts/check.sh`：PASS。

| 检查 | 结果 |
|---|---|
| install | `npm ci` PASS，118 packages |
| typecheck / lint | 全 workspace PASS |
| unit / integration | 85 tests PASS：Capability Lab 13、Plugin 14、Application 26、Domain 11、Logseq Adapter 12、Persistence 6、Shared 3；0 skipped |
| build | Capability Lab 与正式插件 PASS；正式 bundle 约 230.3 kB |
| boundaries / rules | 架构边界 PASS；V1 145 条规则覆盖 PASS |
| recovery rehearsal | 临时 Store 导出、恢复和比较 PASS；differences 为空 |
| plugin load | 本轮无法代替用户在 Desktop 点击加载；当前 build 的 load 基线仍未完成。进入 Slice A 结构实现前必须完成现有 RT-MVP-001B，或至少记录当前 commit 的最小 load/page-read/受控写入证据；不能把旧 runtime 记录视为本次 V2 证据 |
| audit | 2 high + 1 critical，来自 `@logseq/libs@0.0.17` 的 `dompurify` / `lodash-es` 依赖；可用修复要求 SDK major upgrade，须独立兼容验证 |

## 4. V1 能力矩阵

| 能力 | 判定 | V2 处置 |
|---|---|---|
| 独立 Domain / Application | 已实现可复用 | 保留包边界和纯 Domain 原则；重塑 V2 契约 |
| 稳定 object_id | 已实现可复用 | 保留 ID factory 与不依赖路径/正文的不变量；补数据库唯一约束 |
| Anchor / Graph identity / hash | 已实现可复用 | 保留 UUID、graph_id、hash 前置和防御性 runtime shape；扩展多类 Anchor |
| Ownership / relation validation | 已实现可复用 | 保留单一主归属、位置分离和依赖校验；映射到 V2 简化关系 |
| Phase / Condition / Signal | 已实现但冲突 | V2 取消多阶段 Phase 与 Signal 轴，改为 Lifecycle + Condition + Focus；需要 Schema/命令/UI 迁移 |
| Proposal operation DAG / 风险 / partial accept | 已实现可复用但需升级 | 保留依赖、风险重算、高影响确认；升级为 read/modify scope、operation group、两文件格式和 V2 schema |
| SemanticCommit / compensation / Undo | 已实现可复用 | 保留 pending-first、反向补偿、stale 停写和 inverse Commit；适配 SQLite transaction 与 Service |
| JSON/FileStorage Store | 已实现但冲突 | 保留为 V1 只读迁移输入和恢复证据；V2 当前状态必须是 SQLite，不能并行双写为两个权威 |
| Capture / Inbox / 手工正式化 | 部分实现 | 可复用交互、诊断和 source repair；V2 改为 Candidate/Review Center 语义与显式对象同步 |
| Now Work / Re-entry | 部分实现 | 可复用纯 ViewModel 和克制 renderer；排序、Focus、Lifecycle 与三区域需按 V2 重做 |
| Logseq adapter | 已实现可复用 | 保留 runtime shape、UUID 定位、hash/graph 停写；补事件、防抖、页面创建、复制/删除/一致性 |
| Diagnostics / bootstrap | 已实现可复用 | 保留相关 ID、脱敏、fallback、reload cleanup；扩展 Service/DB/Provider/CLI Doctor |
| Decision / Output | 仅类型预留 | V2 要求正式契约、命令、表、Proposal、审计和 UI 候选 |
| SQLite / Local Service | 不存在 | Slice A 新建，且成为唯一正式写入路径 |
| CLI / Context / Skill | 不存在 | Slice A 建 status/object/doctor 骨架，Slice F 完成 |
| 真实 LLM / DeepSeek | 不存在 | 受保护 Goal 附件包含 Key，但未形成已验证的完整 Provider/Base URL/实际 Model 配置；在 Slice C、完整配置和显式 live gate 就绪前只做 Mock、fixture 和安全门，绝不复制附件凭据 |
| 手动迁移 / 批次 Undo | 不存在 | Slice F；先建立 V1 JSON 只读识别与数据映射 |

## 5. 关键差距与风险

1. **领域替代风险**：V1 的类型化 Phase/Signal 深入 Domain、Application、UI 和测试；直接改枚举会丢失历史语义并破坏 Undo。
2. **双权威风险**：插件当前直接写 FileStorage；V2 要求所有入口通过 Service 写 SQLite。过渡期必须明确 `legacy read-only`，禁止双写。
3. **Graph/DB 半提交风险**：已有 Saga 可复用，但 SQLite transaction、Service 崩溃、进程间 idempotency 和锁要重新验证。
4. **运行时启动风险**：Logseq 插件能否可靠发现/启动本地 Node Service 尚无 Desktop 证据；需受限模式和手工启动命令。
5. **SQLite driver 风险**：插件内 native addon 的旧风险不再等同于独立 Service 风险，但仍需 Node 20/arm64/打包/升级/备份 spike。
6. **LLM 质量与凭据风险**：没有真实 DeepSeek 配置和证据；Slice D 只能在用户显式提供配置和 live 开关后过 Gate。
7. **远端与文档漂移**：实际 remote 与旧 Goal 描述不一致；不能以旧文档为当前 Git 事实。
8. **SDK 供应链风险**：major 升级可能改变 Logseq runtime shape；应隔离评估，不与 Slice A 数据迁移捆绑。

## 6. 推荐实施顺序

1. 冻结 V2 工作约定和迁移 ADR；保留 V1 提交/tag 作为可回退基线。
2. 先在 Domain/Application 新接口旁建立 V2 contract tests，不直接删除 V1 类型。
3. 建立独立 TypeScript Local Service、SQLite schema/migration、status/doctor 和只读 CLI；验证数据库备份/恢复。
4. 把插件改成 Service client + 受限模式；V1 FileStorage 只读导出，不双写。
5. 完成显式对象同步和 Graph 事件/一致性后，再接 Proposal 正式写入。
6. 安全闭环稳定后接真实 LLM；最后完成 Now Work、外部 Agent、迁移和运行保障。

在总体计划确认前，只提交调查、追踪、ADR 候选和测试计划，不进行上述结构改造。
