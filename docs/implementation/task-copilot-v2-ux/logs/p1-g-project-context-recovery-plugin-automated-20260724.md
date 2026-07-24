# P1-G Project Context Recovery Plugin 自动证据（2026-07-24）

结论：`AUTOMATED_PASS / EXPLICIT_ONLY / DETERMINISTIC_BASELINE_PRESERVED / DESKTOP_OPEN`

## 交互

- Project 重入卡显示“帮我恢复上下文”，只有用户点击才调用 Provider；
- 确定性 headline、summary、evidence、entry point 与原动作始终保留在 Copilot 草稿上方；
- 草稿明确分区展示已确认事实、Copilot 判断、仍不知道与可讨论建议；
- `DRAFT_PROPOSAL` 只显示“必须另建 Proposal 审阅”，不提供 apply/commit 按钮；
- loading 禁用重复提交；错误保留上方确定性入口；版本变化后旧草稿不继续显示。

## 动作安全

Plugin 不直接执行模型 `targetRef`。`OPEN_SOURCE` 必须匹配当前 Project 投影中的 active Primary
Anchor，`OPEN_REVIEW` 必须匹配当前 Recovery Commit，随后只复用既有打开正文或 Audit
route。未知、伪造、过期或 `ASK_USER` target 均不生成按钮。

## 会话与隐私

- 草稿仅在 Plugin session 内存保存；
- Graph switch、Service reconnect/restricted 清空全部草稿并使进行中结果失效；
- UI 不显示 context fingerprint、scope hash、Anchor ID 或对象 ID；
- structured logger 只记录动作和 ready/error/discarded 结构状态，不记录草稿正文。

## 自动验证

- Plugin tests：225/225 PASS，0 skipped；
- Plugin typecheck：PASS；
- 覆盖 loading/ready/error、前后 Project version 重验、重复点击、in-flight clear、
  分区渲染、建议的 review-only 文案、内部标识隐藏和伪造 target 不可点击。

## 尚未声明

- 真实 DeepSeek 语义 Gate 未运行；
- Logseq Desktop 中的主题、窄栏、loading/error/stale 与真实只读动作未验证；
- 因此 P1-G 与 P1 仍未完成。
