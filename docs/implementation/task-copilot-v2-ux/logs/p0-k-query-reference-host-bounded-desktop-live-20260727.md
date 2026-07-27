# P0-K Query / reference 宿主边界 Desktop Gate（2026-07-27）

## 结论

当前 `feature/task-copilot-mvp`、HEAD `73fea9a`（运行代码 `d7526f4`）在 Logseq
0.10.15 File Graph 的脱敏专用页面完成 Query 与 Block reference 复验：

- 普通 Page / Block 的既有入口和 UUID 路由能力不变；
- Query 结果会由宿主接管为页面预览，不提供 Task Copilot 的精确 Block 菜单入口；
- Block reference 使用宿主专用引用菜单，只提供打开、复制、删除、替换等引用动作，
  不提供 Plugin Block context menu item；
- 两种投影均不猜测来源 UUID，不用 DOM hack，不创建第二条入口；
- 可用替代路径是先打开来源 Block，再使用普通 Block 入口。

因此 Query / reference 的“原地精确入口”按当前宿主能力记为
`BOUNDED_HOST_LIMITATION`，不是功能性 PASS，也不是整体 P0-K 完成。

## 场景与证据

- Graph：仓库忽略的专用 File Graph；
- 页面：`Task Copilot Lab/P0 K Host Gate 20260727`；
- 内容：一条脱敏来源、一个 live query 和一个 block reference；
- 主题：Dark；
- 窗口：1000 × 720；
- reload：外部创建测试页后完整 reload，页面、Query 和 reference 均重新解析；
- 正式 Object / Proposal / Commit / Recovery / Undo：零写入。

CURRENT 截图：

- `../current-ui/screenshots/p0-k-04-query-reference-synthetic-current-dark-73fea9a.png`
- `../current-ui/screenshots/p0-k-05-reference-native-menu-bounded-current-dark-73fea9a.png`
- `../current-ui/screenshots/p0-k-06-query-preview-bounded-current-dark-73fea9a.png`

## 仍开放

- 来源 Block 移动、删除后的用户层返回；
- 成功、失败和 Undo 完成后的来源返回；
- P0-J 原生中文 IME；
- DB Graph 是否提供不同的稳定宿主能力。

## 复杂度

- 新正式状态、Runtime、Recovery 分支、Skill、Prompt、Validator：`0`；
- 没有将 Query / reference 投影身份持久化；
- 没有为宿主限制增加脆弱 DOM 注入。
