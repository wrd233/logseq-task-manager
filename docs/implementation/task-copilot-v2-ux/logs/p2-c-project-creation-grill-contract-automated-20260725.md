# P2-C Project 创建 Grill 首个自动合同

日期：2026-07-25

状态：`IN_PROGRESS_CONTRACT_AUTOMATED`

## 已实现

- 通用 Grill session 新增 `PROJECT_CREATION` subject；
- 创建前 subject 不含、不伪造尚未由 Service prepare 颁发的 Object ID；
- 三种来源显式区分：
  - `BLANK`：不得声称已有 source evidence；
  - `PAGE`：必须保留至少一个有界 Page source ref；
  - `MINI_PROJECT`：必须保留至少一个有界正式对象/source ref；
- Project 创建 readiness 在通用四维之外，额外要求：
  - `INTERNAL_CLOSURE`：内部工作包如何各自收口；
  - `CURRENT_INTERFACE`：用户当前如何重新进入并知道下一步；
- 机器继续独占最大开放不确定性、readiness、evidence scope 和 provenance；
- 输出仍为 `SESSION_DRAFT_ONLY`，没有 Proposal、operation、Object identity 或正式写入权限。

## 自动证据

- TDD typecheck 先因缺少 `PROJECT_CREATION`、`INTERNAL_CLOSURE`、`CURRENT_INTERFACE` 和
  creation-source union 失败；
- focused contract PASS；
- Application tests 140/140、0 skipped；
- Application typecheck PASS；
- 覆盖 Page/MiniProject 必须有 source refs、Blank 不得伪造 refs、缺少 current interface
  不能 ready。

## 仍开放

- 三种入口的 bounded Context Package 构造；
- Project 创建专用 Skill/Prompt 和真实 Provider；
- 最终阅读预览与 server-owned create Proposal；
- Proposal Review 后复用既有 prepare→Page create/verify→finalize 原子链；
- failure、stale、reload、Recovery、Undo 与 Desktop。
