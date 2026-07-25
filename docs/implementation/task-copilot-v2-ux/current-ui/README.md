# 当前 Logseq Desktop 交互证据

本目录只把“当前代码的最新构建在真实 Logseq Desktop 中运行”登记为 `CURRENT`。
设计稿、静态 HTML、自动测试截图和历史 Commit 的 Desktop 截图都不能证明当前体验。

## 状态

- `CURRENT`：截图所记 commit 与待验收构建一致，场景和前置条件可复现；
- `HISTORICAL`：曾经是真实运行证据，但没有用当前构建复验；
- `SUPERSEDED`：同一场景已有更新且更完整的证据；
- `PROTOTYPE`：只证明视觉或宿主能力，不代表正式产品链。

当前已有 P2-C Page 来源链在最终 `913bbda` 构建上的 CURRENT Undo 确认、Undo 完成态和
完整 Logseq restart 后健康态。此前 Blank 与 Page 的 Grill、Preview、HIGH Review、创建和
首次恢复截图来自真实运行，但早于最终 identity 漂移/diagnostics 修复，因此明确登记为
`HISTORICAL` 或 `SUPERSEDED`，不伪装成最新界面。

P2-C 当前结论是
`BLANK_DONE_PAGE_PRESERVE_DEDICATED_BOUNDED_DONE_MINI_AND_PAGE_REUSE_OPEN`：Blank 已真实
完成全链；Page“保留来源另建”也完成真实 DeepSeek、Preview、Review、创建、restart、
跨 runtime identity 漂移 Undo 和再次 restart 健康验证。Page“升级当前 Page”、
MiniProject 来源、Light/窄栏、来源返回与全程同 commit 中间截图仍需验证，P2-D～G 也仍
开放。完整记录见
`../logs/p2-c-project-creation-desktop-live-20260726.md`。

## 每次取证必须记录

1. branch、commit、插件构建时间、Service/Launcher 版本和测试 Graph；
2. Logseq 版本、主题、窗口尺寸、main/sidebar/Query/reference/Zoom 等宿主位置；
3. 发起前现场、入口、关键判断、Preview/Review、结果与返回现场；
4. 适用时的 reload、失败、Recovery 和 Undo；
5. 操作距离、主结论、工程术语、LLM 长度和确定性降级评估。

截图不得包含 API Key、descriptor token、私人正文或未脱敏路径。
