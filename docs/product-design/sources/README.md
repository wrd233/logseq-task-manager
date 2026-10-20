# 来源类别与文档基线追溯

## 入库记录

- 整理日期：2026-10-21（Asia/Shanghai）。
- 仓库：`wrd233/logseq-task-manager`。
- 整理前 `main` 与抓取后的 `origin/main` 均为 `0e9d2f9d6a5838f13811baa44041e9083f3c93d0`，工作区干净。
- 输入：用户提供的 `TaskCopilot-Product-Docs-Complete.zip`，以其中独立 Markdown 文档为主；本地解压目录不替代 ZIP 输入。
- ZIP SHA-256：`3d8b69dea23b818ee2dd161ad44e47351eef162704277c0ca7bb6632ce5c787d`。
- 本次仅新增 `docs/product-design/` 下的文档，未重新验证现有业务能力。

## 来源类别与保留策略

| 来源 | 用途与状态 | 仓库保留方式 |
|---|---|---|
| 多轮讨论中的用户表达、原型评语 | 理解需求方向；不能由助手总结推断额外承诺 | 总览、模块和待决登记中的整理结果 |
| Round 2 Grill Me 反馈 | 区分倾向与未答；核对到 74 个 leaning、17 个 unanswered、0 个 accepted | 仅保留状态摘要；原始 JSON 留在本地 |
| 前序完整设计上下文 | 研究背景与固定版本核查摘要，非当前实现证明 | 保留必要边界及下列历史版本锚点；完整上下文留在本地 |
| 独立 Markdown 文档 | 本次主要输入 | 保留目录结构并整理为日常维护来源 |
| 合订本与研究原型 | 阅读快照或探索材料，非独立权威或生产能力证明 | 不入库；不复制原型、截图或完整 ZIP |

本地原始文件名为 `TaskCopilot-Round2-Feedback-2026-10-20.json` 与 `TaskCopilot-Pro-Complete-Context.md`。它们不是仓库内文件，故不建立相对链接。需要复核原话时使用用户保留的本地 ZIP；仅持有仓库的 Agent 应保留不确定性并请求相应证据。

## 前序研究的历史代码锚点

以下值按输入文档记录，仅用于定位旧结论：

- 项目 `main`：`0e9d2f9d6a5838f13811baa44041e9083f3c93d0`（本轮 Git 检查也匹配此值）。
- 项目 `codex/one-click-dsh-collaboration`：`fe0ac2162c2970797f4dfe42b658b915c10bac9a`（本轮未核查该分支）。
- DSH 上游研究参考：`687f282e8625c6b8d11ff58211a90524be2e4317`（本轮未核查 SDK）。

Kernel schema、可信用户来源、Graph 投影和 DSH slots 均需在后续开发时重新核查。版本锚点不能替代运行验证。

## 整理差异

保留产品内容与九模块结构；增加候选状态说明、维护权威范围和导航；去掉原始文件链接与旧的“不修改仓库”交付说明；将实施清单限定为未来参考；显式保留四个未决边界，并把历史只读先行标为建议；总览中的“四类”状态标签修正为“五类”。未带入合订本，避免正文双份漂移。

## 输入独立文档校验值

下表为 ZIP 内原始文件的 SHA-256，用于核对输入；整理后的仓库文件以 Git 记录为准，不预期与输入字节一致。

| ZIP 内相对路径 | SHA-256 |
|---|---|
| `01-产品总览.md` | `895c5d2fbce624b6a74e0a5b68abe0dd43d2a875ec57e25ff666bbacbcb5a4dd` |
| `DECISION-REGISTER.md` | `6025a3a8f793c0e0e07bf2c99ec98cce95817dc287bf2040c7ce6b5f7e31a7b9` |
| `INDEX.md` | `aaccaa21890de19d72e6835212f368e4b393dab567622a31fc82d3cf81fb9679` |
| `README.md` | `29ac69271061cef1cb884baa10ec1a1de9b2d1010d5f10f1be95d5648befb0e7` |
| `SOURCE-AND-STATUS.md` | `567edbde41c74dc1b0780f3a9d28e58ca9cbaf39a9e5416fd868159c9d868509` |
| `architecture/01-跨模块设计.md` | `0cd6b1bdb2179d314493d46c7bde6fb11c05243a85125c5af83000991992b8d2` |
| `modules/01-Capture与Inbox.md` | `33d60d004ecbdd6e181eeee29a7a1eff9ba293b58af05dd7c2e9aa8788c9b1eb` |
| `modules/02-DSH工作现场.md` | `385e46133c9b819971872878e0a1f1a368e58268ce577fb887d25994a4ac4164` |
| `modules/03-工作接续与收尾.md` | `637619fbff0988b6d0e01e2f520296105341ee578af8024236b9e7ea7974b3d0` |
| `modules/04-工作结构与编排.md` | `90523c217f13385567f49285a6788fb2121d01f3dbdb104b023f89635f2d36b2` |
| `modules/05-变更与正式操作.md` | `56230a5e7b616ccad650c6d36ff5823596d0c8beda22b7d3b4cf89bf911e943b` |
| `modules/06-工作证据与历史.md` | `a872ae134baea714ab3bc7bc816cc31b2889c3c75be48f6fc1c90b4d57f25a67` |
| `modules/07-个人规划.md` | `c72dd5fdb27b24f5f03908c54aaacfccde9b7cb799418d1784540f567c46a259` |
| `modules/08-AI线索与有限领航.md` | `33ec461b501ffbf619073765d0e09cc1b62977f0332ae1575679cdf83a25064d` |
| `modules/09-视觉与主题.md` | `925dba41da349ecb99a5d4d226e5fa8d8dea204be984186c807f5408847a840e` |
| `planning/01-总体实施安排.md` | `16ecd034cd437d56374615e19f4b624fcf1553fb2e7508a27890dfa482715a73` |

返回[基线说明](../README.md)或[文档导航](../INDEX.md)。
