# P0-E 四项主导航 Desktop 证据

## 元数据

- 日期：2026-07-24（Asia/Shanghai）
- 宿主：Logseq Desktop 0.10.15
- Graph：隔离测试 Graph `logseq`
- Plugin：本地 `apps/task-copilot-logseq-plugin/dist`
- Local Service：Node 20.20.2；Runtime READY；Store READY
- 测试内容：仅使用 `Task Copilot/V2 Slice A Fixed/2026-07-22` 与虚构 P0 样本
- 证据边界：未记录 descriptor、token、filesystem path、真实业务正文或完整内部 Commit ID

## 自动化

- 先新增主导航结构测试并在旧六工作区实现上见到 3 项失败；
- 完成后 Plugin tests 157/157、0 skipped；
- Plugin typecheck PASS；
- Plugin build PASS；
- 主导航自动断言只有 `现在 / 待我确认 / 项目 / 更多`；
- `objects`、`reentry`、`audit`、`migration` 与 Diagnostics 均有可达性断言；
- 非法 delegated `view` value 由 `isWorkspace` 拒绝，不再直接作类型断言。

## Desktop 操作与结果

1. 在最新 build reload 后打开 Task Copilot，首屏只显示四个用户层主入口：
   `现在 / 待我确认 / 项目 / 更多`。顶部不再直接显示 Diagnostics。
2. 点击“项目”，进入“项目列表与重入”；Project 卡片、当前接口、打开正文、更新状态和
   加入当前关注仍可达。
3. 切换“正式事项与创建”，Area、Project、Association 的既有受控创建能力与正式对象列表
   仍可达；“项目”主入口保持 active。
4. 点击“更多”，进入用户层 hub；最近修改与恢复、系统状态与技术诊断、备份与恢复、迁移
   四组能力均可达。
5. 进入“最近修改与恢复”，真实 Audit/SemanticCommit 投影可读；该页包含完整内部 Commit
   标识，因此不保存截图。
6. 进入“迁移”，显示现有 V1 → V2 手动、可恢复流程与空 Run 状态；“更多”保持 active。
7. 进入“系统状态”，Runtime、Store、Graph、Pending、Recovery、stages、feature flags 和
   bounded logs 均可读；该页包含内部 Commit 标识，因此不保存截图。
8. 关闭诊断后从工具栏重新打开 Task Copilot，仍回到“更多 / 迁移”现场，证明旧子工作区
   不因主导航收束而丢失。

## 截图

| 文件 | 证明 |
|---|---|
| `screenshots/original/p0-e-01-four-primary-nav.png` | 四项用户层主导航与无 Diagnostics 顶栏 |
| `screenshots/original/p0-e-02-project-navigation.png` | 项目列表/重入、当前接口与原能力 |
| `screenshots/original/p0-e-03-project-formal-items.png` | 正式事项、Area/Project/Association 创建仍可达 |
| `screenshots/original/p0-e-04-more-hub.png` | 恢复、诊断、备份、迁移汇入“更多” |

四张文件均已转为真实 PNG 并逐张目视检查，仅包含隔离测试内容。

## 未扩大声明

- Logseq 窗口宽度无法由当前 Desktop 控制层可靠调整；≤760px 的单列 More hub 由 CSS 与
  build 覆盖，本次不把它声明为真实 Desktop 窄宽度 PASS。
- 既有 `V2_VIEW_KEYBOARD_THEME_DESKTOP_REPORT.md` 已证明主导航 Enter/Space 与焦点恢复；
  本次 Desktop 控制层拒绝 Tab keysym 注入，新增四项导航的键盘行为只按原生 button 与既有
  event delegation 自动覆盖，不虚报为本轮 Desktop 复验。
- P0-E 只重组入口，不改变 Domain、SQLite、Local Service、Proposal 或恢复语义。
