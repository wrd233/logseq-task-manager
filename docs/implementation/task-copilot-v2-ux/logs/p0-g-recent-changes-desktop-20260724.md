# P0-G 最近修改与用户层结果 Desktop 证据

## 元数据

- 日期：2026-07-24（Asia/Shanghai）
- 宿主：Logseq Desktop 0.10.15
- Graph：隔离测试 Graph `logseq`
- Plugin：本地 `apps/task-copilot-logseq-plugin/dist`
- Local Service：Node 20.20.2；Runtime READY；Store READY
- 测试对象：虚构 MiniProject `P0 Focus Gate`
- 证据边界：未记录 descriptor、session token、filesystem path、真实业务正文或 API Key；
  Commit/Proposal ID 与 checksum 只在未截图的折叠技术详情中检查

## 设计语义

- 由既有 Proposal 与 SemanticCommit 投影用户意图、时间、应用结果和动作，不新增 Audit、
  Receipt、Commit、表或持久缓存；
- 主卡使用“已应用 / 尚未完成 / 需要恢复 / 未能应用 / 已撤销”，不要求用户理解内部状态；
- Commit/Proposal ID、error code 和 checksum 只在折叠“技术详情”中显示；
- generic、Ownership、Lifecycle 与 Project 当前接口分别复用既有 Undo handler；
- inverse Commit 折叠到原用户修改，不显示为第二次业务变化；
- failed inverse 根据对象版本、正文、Anchor、Ownership 或 Project interface error 分类说明
  哪种后续变化阻止覆盖；
- 即时结果只保存 session 内 commit identity，再从同一长期投影查回；导航或关闭后清除，不创建
  第二份成功状态。

## 自动化

- 纯投影测试先因 `recent-changes.ts` 不存在而见到 `ERR_MODULE_NOT_FOUND`；
- 新增覆盖：已应用与 generic Undo、PENDING、RECOVERY_REQUIRED、FAILED、UNDONE、inverse
  折叠、后续对象变化阻止 Undo、Ownership 专用 Undo；
- UI 覆盖：主卡不显示工程 ID、折叠详情含完整 identity、即时结果选择指定 Commit 而不是
  最新猜测、查询失败不显示为空历史、Recovery 用户语言；
- Plugin tests 167/167、0 failed、0 skipped、0 todo；
- Plugin typecheck PASS；
- Plugin build PASS。

## Desktop 操作与结果

1. reload 最新 build，进入“更多 → 最近修改与恢复”；既有历史首先显示用户意图、时间、
   “已应用/已撤销”和可用动作，不再以 SemanticCommit ID/checksum 作为卡片标题。
2. 折叠时 accessibility tree 不含 Commit、Proposal 或 checksum；展开“技术详情”后才出现
   三类工程证据。含 ID 的展开态不保存截图。
3. 点击既有记录的“查看”直接进入“待审阅”而不是 Candidate，并显示对应 Proposal 标题。
4. 以现有虚构 LOW `REWRITE_BLOCK` 语义创建新的 READY Proposal；提交 Proposal 本身没有
   Graph 或正式对象写入。
5. 在 Review 点击“接受并应用”；完成后即时结果显示“验证最近修改与长期撤销 / 已应用”，
   并提供“查看 / 撤销”。该卡由实际返回的 semanticCommitId 查询长期投影，不以 toast
   文案猜测身份。
6. reload Plugin 清除 session 即时提示；“更多 → 最近修改”仍显示同一用户意图、`已应用`
   和长期“撤销”，证明长期入口不依赖 session。
7. 点击长期“撤销”，确认只在正文、对象与 Anchor 未变化时创建逆向 Commit；完成后即时
   结果显示 `已撤销`，不再提供第二次撤销。
8. Local Service 与 live Graph bridge 最终读回：
   - 对象正文 `P0 Focus Gate`，version 14；
   - Graph Block 恢复 `#MiniProject P0 Focus Gate` 与既有 `id::`；
   - 正向 Commit `UNDONE`，逆向 Commit `COMPLETED`；
   - Pending=0，Recovery=0。

## 截图

| 文件 | 证明 |
|---|---|
| `screenshots/original/p0-g-01-recent-changes-user-language.png` | 既有历史以用户意图/结果为主，技术详情默认折叠 |
| `screenshots/original/p0-g-02-immediate-result-same-commit.png` | LOW 应用完成后的即时结果、查看与撤销；已裁掉含 ID 的旧 Review 区域 |
| `screenshots/original/p0-g-03-long-term-undo-entry.png` | reload 后长期“最近修改”仍提供同一修改的撤销入口 |
| `screenshots/original/p0-g-04-long-term-undo-completed.png` | 长期 Undo 完成后显示已撤销且不再提供重复 Undo |

四张文件均为真实 PNG，并已逐张目视检查。截图只含隔离测试正文；技术详情保持折叠。

## 未扩大声明

- 当前测试库最终没有 PENDING/RECOVERY_REQUIRED。为避免数据库直写或人为破坏一次正式操作，
  新用户语言与无重复命令边界由纯投影/UI 自动测试证明，不写成此次 Desktop 故障注入 PASS。
- P0-G 只提供现有安全动作。generic/Ownership/Lifecycle/Project interface 可进入各自既有
  Undo；Project/MiniProject Closure 没有通用 Undo 时明确说明并只提供查看，不伪造按钮。
- Recovery 的真正“继续完成”产品入口仍依赖 P0-H/P0-I，不在本 Slice 新建并行恢复器。
