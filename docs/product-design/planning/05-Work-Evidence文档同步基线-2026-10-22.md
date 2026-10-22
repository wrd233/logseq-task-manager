# Work Evidence 文档同步基线（2026-10-22）

## 远端核查

直接使用 Git 协议 `ls-remote` 并 `fetch --prune origin`；URL 为 `https://github.com/wrd233/logseq-task-manager.git`。本轮起点：

| 远端分支 | HEAD |
| --- | --- |
| main | `2cb0ced7688b7af19ac5814b1f556ecae255f3c9` |
| codex/work-evidence-v1 | `acae168666495e269b1c533f0e232783a2fc8777` |
| codex/work-evidence-ux-v1 | `29e40e4e4410e583d7b63a4a7d2665c58cef4951` |
| codex/work-structure-history-v1 | `b1c7c44d767d98454a641a97020df95b44623752` |
| codex/one-click-dsh-collaboration | `f84631604eba47e0311f927897da626ede4afb00` |

UX 是当前 Work Evidence 开发线，包含 v1 与体验改动，不切回旧 v1。主工作区本地 main 是 `019a48e62ca08a5eb9762f60cdacd901ce967099`，另有 Capture 未提交文件；本次不操作它，以远端 main 创建独立文档 Worktree 和 `codex/work-evidence-doc-sync`，只推送文档提交到 main。随后将同一提交移植到 UX，比较本次全部文档字节和生产目录树。

## 核对的实现边界

本轮阅读根 README、产品索引/模块/跨模块架构/来源与决策文档，以及 UX 的 Work Evidence 实现说明、源码和验收说明。静态核对 `apps/task-copilot-cli/src/work-evidence/git.ts` / `store.ts` 与 `apps/dsh-plugin/src/work-evidence/`：

- `observe` 采样当前 porcelain 状态、HEAD 与文件元数据；比较前次观察，不读取检查点至今提交区间的完整变化。提交后工作树干净不能据此证明中间没有工作。
- Store 提供不可变观察、补充修订与 quote；`supersedesId` 是用户意图修订，不是 Agent 分析或独立交接记录。
- DSH 扩展注入 Connection，客户端仅准备/确认原生草稿；没有模型分析、关联会话/Logseq 结构读取、澄清/局部重分析或结构视图切换。
- 当前元数据/有限 diff 与已有保存/失败保护可复用；历史正文、授权和敏感信息策略不能因新增分析目标而隐式扩大。
- 结构历史和 one-click 分支为独立参考；共享结构工具只是目标边界，未确认存在可直接依赖的公共包，不合并这些业务实现。

旧实现验收报告按其提交保留；本轮仅文档核对，不重新证明宿主或模型能力。main 不复制功能分支的源码或实现验收文件。

## 权威入口与交付顺序

1. [模块 06](../modules/06-工作证据与历史.md)整合产品需求，保留原结构历史部分；不另建重复产品规范。
2. [架构 02](../architecture/02-Work-Evidence交互式工作还原.md)承载专属局部工作流；架构 01 保留共同权限/身份/可视化边界。
3. 索引、来源状态、决策登记和来源摘要明确专项确认决定与历史倾向的区别；未决授权边界不变。
4. main 先落独立纯文档提交并推送；再将该提交 cherry-pick 到 UX。不得把整个 main 或功能分支互相合并。
5. [下一阶段 Goal](goals/03-Work-Evidence交互式工作还原-Goal.md)仅供后续显式启动。

验证：本次差异只允许 `docs/product-design/`；检查 Markdown 本地链接、设计输入章节覆盖、空白格式；比较 main 与 UX 本次文档完全一致；对比各分支同步前后 `apps`、`packages`、`scripts` 树对象不变。文档同步不运行无关业务测试，也不沿用旧测试结果作为本次新功能验收。
