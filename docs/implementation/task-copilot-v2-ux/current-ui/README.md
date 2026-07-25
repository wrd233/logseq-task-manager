# 当前 Logseq Desktop 交互证据

本目录只把“当前代码的最新构建在真实 Logseq Desktop 中运行”登记为 `CURRENT`。
设计稿、静态 HTML、自动测试截图和历史 Commit 的 Desktop 截图都不能证明当前体验。

## 状态

- `CURRENT`：截图所记 commit 与待验收构建一致，场景和前置条件可复现；
- `HISTORICAL`：曾经是真实运行证据，但没有用当前构建复验；
- `SUPERSEDED`：同一场景已有更新且更完整的证据；
- `PROTOTYPE`：只证明视觉或宿主能力，不代表正式产品链。

当前没有截图被迁移为 `CURRENT`。仓库既有截图继续保留为历史证据，直到对应场景用最新
构建重新执行。P2-C 已有 Grill/Preview/HIGH Review、正式创建、失败补偿、重启恢复与
专用 Undo 自动证据，以及 Blank 真实 Provider 证据；三来源最新 Plugin 用户入口也已自动
接通并移除直建 bypass，但当前 commit 的 Desktop 操作链尚未执行，因此仍不制作伪“当前”
截图。

## 每次取证必须记录

1. branch、commit、插件构建时间、Service/Launcher 版本和测试 Graph；
2. Logseq 版本、主题、窗口尺寸、main/sidebar/Query/reference/Zoom 等宿主位置；
3. 发起前现场、入口、关键判断、Preview/Review、结果与返回现场；
4. 适用时的 reload、失败、Recovery 和 Undo；
5. 操作距离、主结论、工程术语、LLM 长度和确定性降级评估。

截图不得包含 API Key、descriptor token、私人正文或未脱敏路径。
