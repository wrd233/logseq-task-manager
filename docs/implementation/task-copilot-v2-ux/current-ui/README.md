# 当前 Logseq Desktop 交互证据

本目录只把“当前代码的最新构建在真实 Logseq Desktop 中运行”登记为 `CURRENT`。
设计稿、静态 HTML、自动测试截图和历史 Commit 的 Desktop 截图都不能证明当前体验。

## 状态

- `CURRENT`：截图所记 commit 与待验收构建一致，场景和前置条件可复现；
- `HISTORICAL`：曾经是真实运行证据，但没有用当前构建复验；
- `SUPERSEDED`：同一场景已有更新且更完整的证据；
- `PROTOTYPE`：只证明视觉或宿主能力，不代表正式产品链。

当前已有 P2-C Blank 主链的 CURRENT 入口、专用 Undo 完成态和 Undo 后 reload 健康态。
同轮较早的 Grill、Preview、HIGH Review 与首次创建截图来自真实运行，但拍摄时包含尚未
提交的 Validator 修复或随后被 Desktop 缺陷修复替代，因此明确登记为 `HISTORICAL` 或
`SUPERSEDED`，不伪装成最新界面。

P2-C 当前结论是 `BLANK_DESKTOP_CHAIN_DONE_SOURCE_GATES_OPEN`：Blank 已真实穿过
DeepSeek、Preview、Review、同一 SemanticCommit 的恢复、正式创建、reload、专用 Undo、
再次 reload 和健康状态；Page 与 MiniProject 来源的当前 Desktop 边界仍需单独验证，P2-D～G
也仍开放。完整记录见
`../logs/p2-c-project-creation-desktop-live-20260726.md`。

## 每次取证必须记录

1. branch、commit、插件构建时间、Service/Launcher 版本和测试 Graph；
2. Logseq 版本、主题、窗口尺寸、main/sidebar/Query/reference/Zoom 等宿主位置；
3. 发起前现场、入口、关键判断、Preview/Review、结果与返回现场；
4. 适用时的 reload、失败、Recovery 和 Undo；
5. 操作距离、主结论、工程术语、LLM 长度和确定性降级评估。

截图不得包含 API Key、descriptor token、私人正文或未脱敏路径。
