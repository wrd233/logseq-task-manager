# Task Copilot 前端认知 UX 深度审计（2026-07-31）

## 结论

当前 V2 已经具备可信的正式写入安全链：真实 DeepSeek 只生成 Proposal，审阅、确认应用、Undo、进程中断后的 PENDING 续跑都能保持 SQLite、Logseq 正文与来源关系一致；Light、Dark 和 760px 窄窗也都可读可操作。

但当前版本还不能把“前台克制”视为完成。本轮在最新运行代码上确认了 2 个 P0、4 个 P1 和 3 个 P2 认知问题：

1. `整理当前页` 在没有合法候选时，同时显示“建议已放入待我确认”和“这次检查没有完成”，而待审阅队列实际为空。这是错误的完成感。
2. 从 Block 来源返回后 reload，Logseq 重新打开 `/page/<page-uuid>?anchor=<block-uuid>` 会得到空白的 `Page no longer exists!!`；按 Page 名搜索可以恢复正文，但原 Block 锚点和工作视角已经丢失。
3. 最终应用、Undo、PENDING 继续页都把聚焦确认框与原工作区同时保留，形成两个同名主动作或一个可见但失效的旧动作。
4. MiniProject / Project 梳理虽声称“这一轮只确认一件事”，同屏仍挂着 Area、Project、Association、正式对象列表和大量内部模型词。
5. 旧的成功/失败提示跨流程长期残留，能把上一次 Undo、一次已取消的 JSONL 下载、一次等待表单失败带入后续 AI、Now 和 Project 流程。

因此本轮建议的最小高价值原型不是重做视觉系统，而是先完成“聚焦确认态隔离”：当正式应用、Undo 或 PENDING 继续确认打开时，只渲染一个确认上下文和一个主动作，不再渲染底下仍可见的完整工作区。

## 审计基线与证据边界

| 项目 | 本轮实际值 |
| --- | --- |
| 仓库 HEAD | `08825d88071675aac41899e17dfcd74c712ed5aa` |
| Logseq | `0.10.15` |
| 已加载 Plugin | `0.1.0`，commit `89288614258c`，r8 安装目录 |
| 代码一致性 | `8928861..HEAD` 的 `apps/`、`packages/` 运行代码无差异；HEAD 后续变化仅是文档 |
| Local Service | `READY`，protocol 1，schema 12，formal writes / provider / backup / graph read bridge 均启用 |
| Provider | 真实 DeepSeek；Key 仅由 out-of-band reference 解析，本报告没有读取或记录凭据 |
| Graph | 本地测试 Graph `logseq/`；合成 Page `TC Cognitive UX Audit 20260731` |
| 屏幕 | 1000×720 标准宽度、760×720 窄宽；Host Light；Plugin Dark 与 Light 均实测 |
| 原始现场 | 含真实 Journal 上下文的原始截图只保留在 `tmp/runtime/cognitive-ux-audit-20260731/`，被 Git 忽略 |
| 可提交证据 | 本目录 `screenshots/` 只包含合成内容；没有 API Key、真实地址或私有 Journal 正文 |

本报告只把本轮当前截图和当前 CLI/Service 观察标为 `VERIFIED_CURRENT`。旧报告只用于理解设计合同，不作为当前视觉证据。

## 逐任务认知走查

### 1. 从工作现场记下一句内容

合成普通记录：`客户预计周五回复试用环境开通时间`。

真实 DeepSeek 返回：这条内容只记录预计回复时间，不构成明确承诺、决策或成果，不需要正式化。正文和正式状态没有变化。这个结果符合“普通记录默认留在 Logseq”的合同。

证据：[普通记录的真实 DeepSeek 不整理判断](./screenshots/14-real-deepseek-no-proposal-current-light-08825d8.png)

问题是同一画面仍保留了另一个“当前页检查没有完成”卡片，以及先前已取消的 Diagnostics 下载成功提示。用户必须同时理解三个不同时间、三个不同作用域的结果。

### 2. 从普通承诺生成并审阅 Proposal

合成承诺：`我已承诺明天下午五点前提交演示环境检查单`。

真实 DeepSeek 生成 TASK Proposal；正式正文与 SQLite 在此时均未改变。审阅卡片能回答：

- 系统如何理解；
- 本次会改变什么；
- 本次不会改变什么；
- 当前退出是否安全。

证据：[真实 DeepSeek Proposal 审阅卡](./screenshots/15-real-deepseek-proposal-review-card-current-light-08825d8.png)、[已审阅但尚未应用](./screenshots/16-accepted-not-applied-current-light-08825d8.png)

这一段是当前最成熟的主流程：改变和不改变分栏清楚，“审阅方案”与“确认应用”也分成两个状态。

### 3. 最终确认、正式应用与 Undo

打开最终确认后，顶部确认框和底下已接受方案同时出现两个 `确认应用`。顶部按钮在 checkbox 未选中时不可用，底下按钮仍保持强视觉主动作，破坏了动作唯一性和错误恢复模型。

证据：[最终确认的重复主动作](./screenshots/17-final-apply-duplicate-cta-current-light-08825d8.png)

完成应用后，结果卡明确显示“已应用”“所有步骤都已完成”和可撤销前置；Undo 后显示“已撤销”“历史证据仍保留”。关闭 Overlay 能回到原 Page 和相同内容位置。

证据：[正式应用结果](./screenshots/18-formal-apply-result-current-light-08825d8.png)、[Undo 确认上下文竞争](./screenshots/19-undo-confirmation-context-competition-current-light-08825d8.png)、[Undo 结果](./screenshots/20-formal-undo-result-current-light-08825d8.png)、[返回来源](./screenshots/21-return-to-source-after-undo-current-light-host-08825d8.png)

### 4. “暂时做不了”与恢复行动

Block 右键入口能在工作现场直接打开：等待别人、被问题卡住、我先暂停。每个选择都有一句后果说明，选择等待后表单只要求“在等谁或什么结果”和复查时间。

证据：[Block 右键入口](./screenshots/03-block-context-entry-current-light-host-08825d8.png)、[Condition 三选一](./screenshots/04-condition-entry-current-dark-08825d8.png)、[等待表单](./screenshots/05-waiting-form-current-dark-08825d8.png)

认知问题：

- Task Copilot 的 5 个命令埋在约 30 项的 Logseq 原生菜单底部，发现成本高；
- Condition 对话框下方仍显示完整 Now 筛选和卡片；
- 旧 Undo 成功提示和旧失败提示继续占据顶部；
- macOS AX/Computer Use 能让 datetime-local 看起来完整，但 DOM 最终仍返回空值；系统拒绝写入且 SQLite 保持 `ACTIONABLE`，安全保护通过，但无障碍输入链不可依赖。

证据：[显示完整但未被表单接受的等待输入](./screenshots/06-waiting-form-completed-current-dark-08825d8.png)、[安全返回且状态未变](./screenshots/07-waiting-failure-return-current-light-host-08825d8.png)

本轮没有把 AX 输入失败外推为鼠标用户的通用 datetime bug；它是一个明确的 Accessibility/automation 风险，需要单独手工复验。

### 5. Now / 今日优先

Now 能把 Focus、MiniProject、Task 收束为卡片，每张卡只有一个正面主动作，依据和更多操作默认折叠。760px 时卡片改为单列，没有横向滚动或动作截断。

证据：[Dark Now](./screenshots/02-now-current-dark-08825d8.png)、[Light 760px Now](./screenshots/13-now-narrow-760-current-light-08825d8.png)

但全屏 Concept Budget 仍偏高：4 个全局工作区、4 个类型筛选、2 个排列筛选、5 张可见卡、每张 2 个 disclosure，再叠加全局成功/失败 banner。卡片内部克制，屏幕整体仍不克制。

### 6. “整理当前页”与 Review 空态

当前 Page 已有显式对象，没有新的合法候选。实际结果应是“没有候选，没有写入”。界面却同时出现：

- 绿色：`整理建议已放入“待我确认”`；
- 红色：`这次检查没有完成`；
- 待审阅页：`当前没有需要审阅的方案`。

证据：[同屏成功与失败](./screenshots/08-current-page-organize-contradictory-state-current-dark-08825d8.png)、[成功提示后的空审阅队列](./screenshots/09-empty-review-queue-after-false-success-current-dark-08825d8.png)

这是信任级问题：系统没有写错，但前台错误地暗示已经产出方案。

### 7. MiniProject 梳理

从 `[MiniProject] 准备一次内部演示` 的 Block 右键“处理这条内容”能进入真实 DeepSeek 梳理。Provider 能把事实、推断、仍待澄清和建议分开，并且一次只问一个问题。

证据：[MiniProject 首轮问题](./screenshots/23-miniproject-grill-question-context-competition-current-light-08825d8.png)

但 Context Isolation 没有兑现。Grill 下方仍挂着：

- 新建 Area；
- 新建 Project；
- Association；
- 正式对象全量列表；
- `OUTPUT / MINI_PROJECT / TASK / PROJECT / OPEN / ACTIONABLE / v2`；
- `Primary Ownership / Lifecycle / Focus / SQLite / Graph / Anchor`。

证据：[Project 工作区的概念负荷](./screenshots/24-project-workspace-concept-load-current-light-08825d8.png)

用户正在回答“这次演示的边界是什么”，却被迫携带整个领域模型。

### 8. 从空白创建较长 Project

真实 Project Grill 第一轮能把结果、边界、完成证据、内部闭环、当前接口和 Page 关系列为待澄清项，并要求先说明长期维系的成果。

证据：[Project 创建第一轮](./screenshots/25-project-creation-first-question-current-light-08825d8.png)

问题：第一屏包含大量解释、事实/判断/未知列表和内部词，真正的单一问题与输入框落在首屏以下。它在语义上只问一件事，在视觉和工作记忆上却要求用户先读一个模型报告。

### 9. 来源变化与系统状态

System Status 能在正文一致性需要核对时，先回答：发生了什么、哪些能力受影响、哪些仍可用、数据是否安全、是否需要用户操作；技术诊断默认折叠。

证据：[来源一致性警告](./screenshots/11-source-consistency-warning-current-dark-08825d8.png)

这是本轮最好的失败态之一。它把“正文仍由 Logseq 权威保存”和“不要重复编辑”放在前台，没有先抛出技术错误码。

### 10. 正式修改进程中断、PENDING 与 Recovery

本轮使用合成 Proposal 和真实安装 Service，在 `prepare` 生成 `PENDING` ledger 后、Graph/Domain finalize 完成前终止 Service。Launcher 自动以新 PID 恢复。

当前 UI 显示：

- 本地运行环境已自动恢复；
- 修改未完成；
- 已完成步骤已安全保存；
- 继续时沿用原记录并跳过已完成步骤；
- 不会重复提交。

CLI Doctor 同时显示 `SEMANTIC_COMMIT = WARN / COMMIT_PENDING / count 1`。继续原记录后 Commit 变为 `COMPLETED`，Doctor 回到 `COMMIT_HEALTHY / count 0`；随后 Undo，正文恢复为普通句，对象搜索结果为空。

证据：[真实 PENDING Recovery](./screenshots/28-true-pending-recovery-current-light-08825d8.png)、[沿用原记录完成](./screenshots/29-pending-recovery-completed-current-light-08825d8.png)

安全语义通过，但确认页再次出现两个“继续”入口：顶部 checkbox 确认和底下原卡片的“继续原修改”。这与最终应用的重复 CTA 是同一个结构性缺陷。

### 11. reload 与返回来源

关闭 Overlay 后，当前路由是 `/page/<page-uuid>?anchor=<block-uuid>`。执行 Logseq reload 后，窗口标题和 AX 都变成 `Page no longer exists!!`，画面完全空白。

证据：[reload 后空白页](./screenshots/26-reload-page-uuid-return-failure-current-light-host-08825d8.png)

Markdown Page 文件仍在；通过 Logseq Search 按 Page 名重新打开可以恢复全部正文。但恢复后的路由变为 `/page/TC%20Cognitive%20UX%20Audit%2020260731`，原 Block anchor、选中行和 Block-focused 视角均丢失。

证据：[按 Page 名人工恢复](./screenshots/27-reload-recovered-by-page-name-current-light-host-08825d8.png)

这是 Carried Context 的 P0 失败：数据安全，但用户的返回位置和“我刚才在哪”不安全。

## 四项认知模型评估

### Concept Budget

| 场景 | 屏幕实际要求理解的概念 | 判断 |
| --- | --- | --- |
| 普通记录 DeepSeek 判断 | 当前内容、是否整理、正文/正式状态不变 | 合格，但被旧状态卡污染 |
| Review Card | 系统理解、改变、不改变、审阅、确认应用 | 合格 |
| 最终确认 | checkbox、顶部确认、底部同名确认、审阅状态、完整依据 | 不合格 |
| Now | 4 工作区、6 筛选/排列、5 卡片、依据/更多、全局 banner | 可用但偏高 |
| MiniProject Grill | MiniProject、Block、事实、推断、未知、Area、Project、Association、正式对象及状态轴 | 严重超预算 |
| Project Grill | Project、Page、Review、正式对象、结果/边界/证据/闭环/重入等 | 严重超预算 |
| PENDING Recovery | 自动恢复、未完成、沿用原记录、已完成步骤 | 文案合格；重复继续动作不合格 |

### Carried Context

| 检查 | 结果 |
| --- | --- |
| 关闭 Overlay 回原 Page / 原 Block | PASS |
| Apply / Undo 后来源正文可见且可回到原处 | PASS |
| Provider 分析时正文仍可编辑 | PASS |
| Service 重启后沿用原 PENDING ledger | PASS |
| reload 后自动回到 Page / Block | FAIL：UUID Page 路由空白，需按名搜索，anchor 丢失 |
| 来源变化时说明数据安全和受影响能力 | PASS |

### Visual Competition

主要竞争源：

1. 全局 message / latestError 跨工作区长期存在；
2. 聚焦 confirmation 与底下完整工作区同时渲染；
3. Grill 与 Area/Project/Association/对象列表同时渲染；
4. Now 的筛选、卡片和旧 banner 同时竞争；
5. 成功与失败颜色在同屏表达不同时间和不同作用域，但没有时间/作用域标签。

### Context Isolation

通过：

- Provider 只分析当前选中 Block；
- Review 卡片有清晰边界；
- System Status 用户摘要与技术详情分层；
- Apply、Undo、PENDING 都有显式确认。

失败：

- 最终确认、Undo、PENDING continue 没有隔离底下工作区；
- MiniProject / Project Grill 没有隔离整个 Project 管理面；
- `整理当前页` 的结果与当前 Block AI 状态共用同一 Review 页面；
- reload 没有恢复来源上下文。

## 优先级清单

### P0

| ID | 问题 | 用户风险 | 当前证据 | 验收条件 |
| --- | --- | --- | --- | --- |
| CUX-P0-01 | 无候选时同时显示“已放入待我确认”和“检查未完成”，队列实际为空 | 错误完成感，破坏 Proposal-only 信任 | 08、09 | 每次动作只产生一个与真实结果一致的 scoped outcome；无候选必须是中性空结果 |
| CUX-P0-02 | Block UUID 来源路由 reload 后空白，需按 Page 名恢复且 anchor 丢失 | 用户失去工作位置，无法相信“返回原处” | 26、27 | reload 后自动解析到稳定 Page 路由并恢复 Block anchor；失败时提供一键返回来源而非空白 |

### P1

| ID | 问题 | 用户风险 | 当前证据 | 验收条件 |
| --- | --- | --- | --- | --- |
| CUX-P1-01 | 最终应用、Undo、PENDING continue 同屏保留两个主动作/旧动作 | 误点、重复确认、无法判断哪个生效 | 17、19、28 | 聚焦确认态只渲染一个 action surface、一个主动作和一个取消 |
| CUX-P1-02 | MiniProject / Project Grill 与整个 Project 管理面同时显示 | 工作记忆被领域模型和维护操作打断 | 23、24、25 | Grill 活跃时隐藏无关创建、关联、对象列表；首屏可见唯一问题与输入 |
| CUX-P1-03 | 日常 Project 面暴露大量实现/领域内部词 | 用户必须理解 SQLite、Graph、Anchor、Association、Lifecycle 等 | 24、25 | 日常层改为用户语言；内部词只在显式技术详情中出现 |
| CUX-P1-04 | 全局成功/失败 banner 跨流程残留，取消下载也显示“已导出” | 新流程被旧因果污染，形成错误完成感 | 02、08、10、12、14、15 | 每条消息绑定 action + scope + 生命周期；取消不声明成功；打开新任务清理无关瞬时提示 |

### P2

| ID | 问题 | 当前证据 | 验收条件 |
| --- | --- | --- | --- |
| CUX-P2-01 | Now 整体筛选/卡片/Disclosure 密度偏高 | 02、13 | 默认只保留当前筛选和主要卡片；次级筛选折叠或记忆 |
| CUX-P2-02 | Provider 瞬时失败只显示“稍后重试”，诊断为 `UNCLASSIFIED_ERROR` | 10 | 前台给出可行动的安全重试/系统状态入口，日志保留结构化分类 |
| CUX-P2-03 | datetime-local 的 AX 输入看似完成但提交读取为空 | 06、07 | 单独的键盘/VoiceOver/Desktop 手工 Gate；失败时字段级说明而非复用旧全局错误 |

## 保留的优点

- Proposal 与事实严格分离；真实 DeepSeek 从未直接写 Graph/SQLite。
- Review 明确展示改变与不改变，accepted-not-applied 状态真实存在。
- Apply、Undo 和 PENDING 都有版本/正文重验，不静默覆盖。
- PENDING-first ledger、Launcher 自动恢复和继续原记录在真实进程故障中通过。
- System Status 的用户摘要优先，技术详情默认折叠。
- Now 卡片内部保持一个主动作，760px 单列无横向溢出。
- Light/Dark 均可读，安全结果/警告/失败层级可辨。
- 关闭 Overlay 后正文仍可读，Undo 后来源与对象都恢复。

## 本轮原型选择

选择 `CUX-P1-01 聚焦确认态隔离`，原因：

1. 同一结构同时影响正式应用、Undo 和 PENDING Recovery 三条高风险路径；
2. 修复范围可以限制在 UI render 分支，不改变 Application、Service、SQLite、Proposal 或 Commit 语义；
3. 可以用现有 UI 单测和真实 Logseq 的 accepted-not-applied → final confirmation 快速复验；
4. 它直接减少主动作数量、视觉竞争和工作记忆负担。

原型验收：

- 任一 confirmation 打开时，主工作区不渲染；
- 只显示一个确认标题、必要摘要、checkbox、一个主动作、一个取消；
- 取消后完整工作区原样恢复；
- 确认后结果卡、Undo 和 PENDING 语义不变；
- Light/Dark、1000px/760px 均不溢出；
- 根级检查通过，真实 Logseq 复验当前构建。
