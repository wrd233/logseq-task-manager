# 当前 Logseq Desktop 交互证据

本目录只把“当前代码的最新构建在真实 Logseq Desktop 中运行”登记为 `CURRENT`。
设计稿、静态 HTML、自动测试截图和历史 Commit 的 Desktop 截图都不能证明当前体验。

## 状态

- `CURRENT`：截图所记 commit 与待验收构建一致，场景和前置条件可复现；
- `HISTORICAL`：曾经是真实运行证据，但没有用当前构建复验；
- `SUPERSEDED`：同一场景已有更新且更完整的证据；
- `PROTOTYPE`：只证明视觉或宿主能力，不代表正式产品链。

当前已有 P2-C Page 来源链在 `913bbda` 构建上的 CURRENT Undo 确认、Undo 完成态和完整
Logseq restart 后健康态；Page reuse 另有 CURRENT readiness/Preview、返回原 Page、Undo
与 restart 健康态。MiniProject 演化链又在 `7d4f5e4` 最新构建上补齐 CURRENT Grill
ready、最终阅读、HIGH Review、接受未应用、正式创建、reload 重入、Undo 与再次 reload
健康态。`7a7492a` 又以最新构建重跑真实 DeepSeek→Preview→Review→Commit→reload→Undo，
证明专用 Undo 会返回原 MiniProject 根 Block；旧的 Journal 返回截图已降为 `SUPERSEDED`。
此前暴露 identity、fact key 和错误 closure 对象的截图只登记为真实 `HISTORICAL`
失败样本；同场景旧安全截图登记为 `SUPERSEDED`。

P2-C 当前结论是 `ALL_SOURCES_DONE_VISUAL_GATES_OPEN`：Blank、Page“保留来源另建”、
Page“升级当前 Page”和 MiniProject“保留来源演化”均完成真实 DeepSeek、Preview、Review、
创建、reload/restart、专用 Undo 与最终健康验证。Light/窄栏和部分宿主视觉 Gate 仍需在
集中 Desktop Gate 完成，P2-D～G 继续开放。完整记录见
`../logs/p2-c-project-creation-desktop-live-20260726.md`。

P2-D 的 MEDIUM 当前摘要链也已在当前真实环境闭环：真实 DeepSeek 草稿先经过
`recover-context@1.2.0` 与 Unified UX Validator，再进入单组 MEDIUM Review；正式 Commit
只替换 Project `currentSummary`，reload 后可读，专用 Project interface inverse Commit
恢复原摘要并再次 reload 健康。最终 CURRENT 为 `ae2395523798` 的 `p2-d-05`/`p2-d-06`；
早期 Review/apply/Undo 截图因旧 Provider 状态文案或 Undo 路由已标为
`HISTORICAL`/`SUPERSEDED`。完整记录见
`../logs/p2-d-project-narration-desktop-live-20260726.md`。

同一 `ae2395523798` 构建又完成 HEAVY 完整当前接口链：一个 Objective、Deliverable、
Work Stage、三项 Focus 与摘要进入单组 HIGH Review；最终 Commit 后 reload 可读，专用
inverse Commit 精确恢复原空结构与单一 Focus，再次 reload 健康。CURRENT
`p2-d-07`～`p2-d-10`。这不代表其他 HEAVY 类型或 P2-D 整体完成。

LIGHT Condition 又在 `58bf6306d04d` 最新构建上完成正式跨 reload Undo：Project
ACTIONABLE v8→PAUSED v9，reload 后由 Service receipt 准备 server-owned inverse，确认后
恢复 ACTIONABLE v10，再次 reload 读回原确定性投影。普通 Association 因尚无 inverse 已在
正式影响路由中禁用。CURRENT `p2-d-11`～`p2-d-13`；完整记录见
`../logs/p2-d-light-condition-undo-desktop-live-20260726.md`。

P2-E 的确定性 Closure 证据入口已在 `ec1a70d848d6` 最新构建上通过当前 Desktop Gate：
Project 影响路由明确先整理证据，不生成 Proposal 或完成 Project；空证据预览把候选、
unknown 和用户判断分开，且只有“取消”。reload 后 session preview 不残留，Runtime/Store
READY，同一 Project v10 可重新计算；正式计数保持 `2 Objects / 10 Proposals /
21 Commits`。CURRENT `p2-e-01`～`p2-e-04`。这只关闭 read-only preview，不代表真实
Provider 或 Closure 正式链完成。

## 每次取证必须记录

1. branch、commit、插件构建时间、Service/Launcher 版本和测试 Graph；
2. Logseq 版本、主题、窗口尺寸、main/sidebar/Query/reference/Zoom 等宿主位置；
3. 发起前现场、入口、关键判断、Preview/Review、结果与返回现场；
4. 适用时的 reload、失败、Recovery 和 Undo；
5. 操作距离、主结论、工程术语、LLM 长度和确定性降级评估。

截图不得包含 API Key、descriptor token、私人正文或未脱敏路径。
