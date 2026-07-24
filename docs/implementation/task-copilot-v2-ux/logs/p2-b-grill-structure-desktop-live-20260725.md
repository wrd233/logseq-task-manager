# P2-A/P2-B MiniProject Grill 与原位重构 Desktop Live Gate

日期：2026-07-25

环境：Logseq Desktop 0.10.15、隔离测试 Graph、LaunchAgent-owned Local Service、DeepSeek V4 Flash

结论：`BOUNDED_VERTICAL_SLICE_DONE`

本记录只证明一个隔离 MiniProject 的完整纵向链。它不代表 P2-C～P2-G 或整个交互优化 Goal
完成，也不把测试 Graph 的人工排障步骤包装成用户产品能力。Provider Key 只经既有
Keychain reference 使用，未进入仓库、Graph、截图或普通日志。

## 1. 场景与安全边界

- 根 Block UUID：`6a622050-6f86-4811-847b-d6322328d30a`；
- 原材料：根 Block 加四个直属子 Block；
- 正式结构操作：四个 `CREATE_BLOCK` 加四个 `MOVE_BLOCK`，`REWRITE_BLOCK=0`，
  `DELETE_BLOCK=0`；
- Proposal 风险：`HIGH`，必须先阅读预览、显式确认，再进入正式 SemanticCommit；
- Graph 只使用隔离测试数据；正文权威、Object version、Anchor、完整子树指纹和每步观察均由
 机器重验。

## 2. Grill 与最终阅读预览

真实 Provider 完成四轮自适应提问，依次收敛 boundary、outcome、completion evidence 和
无法归类材料处置；问题由当前未确定性驱动，不是固定字段问卷。第一次 Provider 输出被
Validator 拒绝，UI 保留已确认回答并允许安全重试，正式 Graph/SQLite 零写入。重试后进入
`READY_FOR_PREVIEW`。

预览读回结果：

- source material：5；
- moved material：4；
- added derived material：0；
- deleted material：0；
- unclassified material：0。

真实 Gate 发现 Logseq 为带 custom UUID 的 Block 注入 `id::` identity property；该属性不是
用户材料，却曾进入预览权威和 Proposal source hash，导致
`GRILL_PREVIEW_PROPOSAL_INVALID`。修复后 Service 在预览与 Proposal 构建两处都使用同一
canonical content：仅剥离 identity property，用户正文和 UUID 仍保持权威。过期 preview
handle 现在回到可恢复的 preview error，并保留已确认回答，不再让按钮静默失效。

证据：

- `../screenshots/task-copilot-grill-ready-light.png`
- `../screenshots/task-copilot-grill-preview-canonical-light.png`

## 3. Proposal、Review 与正式 Commit

Service 从 opaque preview handle 重新读取同一 Object/Anchor/子树并生成一个不可拆的 HIGH
Proposal；客户端不能上传或替换 preview。Review 明示最终阅读效果、删除为 0、UUID/正文保留
和整树重验。用户显式确认后，八个 `GRAPH_WRITE` step 全部从 `NOT_APPLIED` 进入
`VERIFIED`，SemanticCommit 完成，Proposal 进入 `APPLIED`，unfinished step 为 0。

Commit 后 reload 读回：

- Runtime `READY`；
- Store `READY`；
- 四个机器 section Block 存在；
- 四个原材料 UUID、正文与每个 section 下的顺序保持；
- 最近修改提供专用“撤销原位重构”，没有落入通用单 Block Undo。

证据：

- `../screenshots/task-copilot-structure-review-high-light.png`
- `../screenshots/task-copilot-structure-accepted-light.png`
- `../screenshots/task-copilot-structure-commit-complete-light.png`
- `../screenshots/task-copilot-structure-reload-complete-light.png`

## 4. 真实失败、Recovery 与 Undo 修正

第一次完整 Undo 暴露了一个真实顺序缺陷：旧 planner 按 forward step 全逆序执行，先恢复
后一个 sibling，而它引用的 previous sibling 此时仍位于另一个 section。Logseq 接受了该
move，但把 Block 放到错误父级；Service 的写后观察检测到 divergence，进入
`RECOVERY_REQUIRED`，没有静默宣称成功。自动补偿遇到意外中间态后进一步收紧为
`MANUAL_RECOVERY_REQUIRED`。

在隔离测试 Graph 中先按精确 UUID 恢复该单个偏移 Block，再让既有 recovery ledger 收口为
`FAILED_COMPENSATED`，Graph 回到完整已应用结构。为重新验证修正后的同一正式 Undo，测试库在
Logseq 与 owned Service 都停止后做了本地备份，并只移除这一次失败 inverse Commit 及其 step；
没有修改原 Proposal、原 Commit 或个人数据。该动作是测试排障，不是产品 Recovery 向导。

修正后的 completed-state Undo planner：

1. 先按 source sibling 的拓扑顺序恢复全部 `MOVE_BLOCK`；
2. 再按创建逆序删除机器新增且仍为空的 section；
3. forward partial-failure 的 compensation 仍保留原来的严格逆序语义。

新的八步 inverse SemanticCommit 全部 `VERIFIED` 并完成；原 Commit 标记 `UNDONE`，unfinished
step、Pending 和 Recovery 都为 0。Undo 后：

- 原五个 UUID 全部存在；
- 四个子 Block 的 parent 与 sibling chain 恢复；
- 正文逐项一致；
- 四个机器 section UUID 全部不存在；
- reload 后 Runtime/Store 仍为 `READY`。

证据：

- `../screenshots/task-copilot-structure-undo-complete-light.png`
- `../screenshots/task-copilot-structure-undo-reload-light.png`

## 5. 最近修改折叠与返回工作现场

真实数据曾把 inverse structure Commit 再投影成一张“已应用”卡，并错误提供通用 Undo。
投影现在识别 `mini-project-restructure-undo:` identity，把 inverse 折叠回原用户意图；应用态
结构 Commit 只路由专用 subtree-safe Undo。reload 后“最近修改”共有四张历史卡，当前结构
意图只出现一次且为“已撤销”，没有重复 inverse 卡，也没有再次 Undo。

从“现在”中的 MiniProject 卡点击“打开正文”后，Logseq 返回原页面并带根 Block anchor：
`block-content-6a622050-6f86-4811-847b-d6322328d30a`。这证明完整链最终回到 Logseq 工作现场，
而不是停在 Review、Audit 或技术诊断页。

证据：

- `../screenshots/task-copilot-recent-changes-undo-folded-light.png`
- `../screenshots/task-copilot-return-root-light.png`

## 6. Gate 结论

| 能力 | 状态 | 证据边界 |
|---|---|---|
| 自适应 Grill 多轮与 Validator retry | Desktop DONE | 真实 DeepSeek、隔离 Graph、零正式写入直到 Review |
| canonical 零丢失预览 | Desktop DONE | 5/5 材料、0 删除、identity property 不冒充正文 |
| HIGH Proposal / explicit Review | Desktop DONE | server-owned preview handle、用户显式确认 |
| 正式八步 Commit 与 reload | Desktop DONE | 8/8 VERIFIED、完整结构读回 |
| divergence 检测与 Recovery | Desktop DONE | 真实失败进入 Recovery；未静默覆盖 |
| 独立 inverse Undo 与 reload | Desktop DONE | 8/8 VERIFIED、原结构/UUID/正文恢复 |
| 最近修改折叠与返回根 Block | Desktop DONE | 单卡已撤销、精确 anchor 返回 |
| P2-C～P2-G | OPEN | 本 Gate 不覆盖 |
| Recovery 产品化向导 | OPEN | 本次精确测试排障不是用户向导 |
