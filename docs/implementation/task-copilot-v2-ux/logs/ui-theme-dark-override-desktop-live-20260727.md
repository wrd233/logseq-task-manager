# Task Copilot 深色表面与自定义主题边界 Desktop Gate

- 日期：2026-07-27
- 分支：`feature/task-copilot-mvp`
- 当前代码提交：`d7526f43e798`
- 前置主题同步提交：`59dcf93`
- Logseq：0.10.15
- Graph：真实 File Graph 测试知识库
- 宿主：`custom.css` 强制深色背景；Logseq 保存偏好和系统媒体查询仍报告浅色
- 窗口：1001×720、723×720
- 状态：`CURRENT_DESKTOP_VERIFIED`

## 发现

`59dcf93` 已让可读的宿主表面优先于可能过期的保存偏好，并将错误、警告、提示、
禁用态和主按钮收敛到同一组 Light/Dark 语义 token。自动测试通过，但真实 Desktop
reload 后插件仍为白底。

进一步证据表明，这个 File Graph 的 `custom.css` 无条件把宿主正文背景设为深色；插件
iframe 无法跨文档可靠读取最终计算色，而 Logseq 官方 `preferredThemeMode` 与系统
`prefers-color-scheme` 仍返回浅色。该组合不能靠猜测或宿主 DOM 注入安全解决。

## 用户链

1. 使用 `d7526f43e798` 构建完整 reload Logseq；
2. 进入插件管理 → Task Copilot → 打开配置项；
3. “界面外观”默认保持“自动”，并明确说明 custom.css 不一致时可选择浅色或深色；
4. 选择“深色”后返回工作现场；
5. 打开 Task Copilot，1001×720 中壳层、导航、提示、卡片、按钮和滚动区均为深色；
6. 完整 reload 后再次打开，深色设置保持；
7. 窗口收窄到 723×720，主结论、主导航、筛选、每卡唯一主动作和滚动区仍可读；
8. 恢复 1000px 级窗口并关闭面板，回到原 Logseq 工作现场。

## 证据

- `current-ui/screenshots/ui-theme-dark-current-d7526f4.png`
- `current-ui/screenshots/ui-theme-dark-current-narrow-d7526f4.png`
- Plugin tests：342/342，0 skipped；
- `./scripts/check.sh`：PASS；
- stable rules：145；
- recovery rehearsal：`differences=[]`。

## 安全与复杂度

- 正式 Object、Graph、Proposal、Commit、Recovery、Undo：零写入；
- 新正式状态、Runtime、Skill、Prompt、Validator、Recovery 分支、写入权威：0；
- 只增加现有 Logseq 插件设置中的一个显示偏好，默认 `auto`；
- 用户明确覆盖只影响 Task Copilot 表面，不改变 Logseq 主题或业务状态；
- Logseq File Graph 自身无法切到真实浅色的 bounded host issue 仍 OPEN，不能用本 Gate
  冒充 Light PASS。
