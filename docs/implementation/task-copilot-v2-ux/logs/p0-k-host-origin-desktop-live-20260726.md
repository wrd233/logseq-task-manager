# P0-K 主 Page 与右侧栏来源 Desktop Gate

## 结论

状态：`MAIN_PAGE_RETURN_DONE_SIDEBAR_BOUNDED_QUERY_REFERENCE_OPEN`

真实 Logseq 0.10.15 已验证普通主 Page 的 Task Copilot 入口、session-only 来源说明和“返回原
Page”主动作；关闭后回到同一页面。右侧栏页面的宿主 `More` 菜单只提供 Close、Collapse、
Open as page，不提供 Plugin Page menu item，因此插件继续安全隐藏精确 Page 操作，不猜测
secondary identity。P0-K 仍为 `PARTIAL`。

## 运行基线

- branch：`feature/task-copilot-mvp`
- Plugin 运行构建：`a835f59bf1c4d0f7583b403fd86a57a18d59d2c7`
- 证据登记源码提交：`47df2aa`
- Plugin：`0.1.0`；Logseq Desktop：`0.10.15`
- Graph：专用测试 Graph `logseq`
- theme / window：Dark，`1000 × 720`
- 操作方式：Computer Use 只操作 Logseq；未操作其他前台应用
- 隐私：没有 API Key、token、内部 identity、路径或私人正文进入 Task Copilot 前台

## 真实链

1. 在普通主 Page 的宿主 `More` 菜单选择“Task Copilot：页面操作”；
2. Task Copilot 读取当前 Page，前台说明执行前重验身份，完成或取消后回到原 Page；
3. 点击“返回原 Page”，overlay 关闭，URL 与页面标题仍是原 Page；
4. 打开右侧栏页面并检查其专用 `More` 菜单；宿主只给 Close / Collapse / Open as page；
5. 没有调用 Page action、没有创建 fallback identity、没有正式写入，随后收起右侧栏。

## 证据与边界

- 自动合同此前已覆盖 main Page 按 UUID 重验、secondary 只关闭 overlay、来源缺失安全关闭；
- 本轮根级 `./scripts/check.sh`：PASS；Plugin `329/329`，`0` skipped；
- 本轮 Desktop 只关闭 main Page 与 right-sidebar 两个代表组合，避免扩张宿主笛卡尔积；
- 本 Slice 不调用 LLM / Provider；Validator 拒绝率和模型重试次数不适用；
- 未新增状态、持久来源 token、恢复入口、Prompt、Skill 或写入路径。

## CURRENT 截图

- `../current-ui/screenshots/p0-k-01-main-page-origin-current-dark.png`
- `../current-ui/screenshots/p0-k-02-main-page-return-current-dark.png`
- `../current-ui/screenshots/p0-k-03-sidebar-menu-bounded-current-dark.png`

## 仍开放

- Query / Block reference 投影的精确 Block payload 与返回；
- 来源 Block 移动、Page rename、来源删除的跟随或安全降级；
- 成功、失败、Undo 后的代表性返回；
- Light / 窄栏；
- P0-H Graph switch、P0-J 中文 IME/受限态及完整 P1/P2 Goal。
