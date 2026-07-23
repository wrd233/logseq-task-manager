# P0-D Page 现场路由自动与 Desktop 证据摘要

日期：2026-07-23

环境：macOS arm64、Logseq Desktop 0.10.15、Node 20.20.2、SQLite schema v12、Dark、
994×700 capture viewport、Logseq 默认 Zoom

分支：`feature/task-copilot-mvp`

代码与证据提交：`6f6ef49`

数据：ignored Test Graph，仅使用虚构 Page、Project 与 MiniProject；Provider 关闭，未调用 LLM

## 实现边界

- 只注册一个稳定原生 Page 菜单入口 `Task Copilot：页面操作`；
- 入口执行时从 SDK payload 解析 Page UUID，并重读 Page、Block tree、active Primary Anchor 与
  正式对象投影；
- 仅 active page-level Project Primary Anchor 能把普通 Page 分类为 Project Page；
- 普通 Page 提供“整理当前页 / 查看本页正式事项 / 将本页建立为 Project”；
- Project Page 提供“更新项目当前状态 / 讨论项目结构 / 项目操作”；
- 所有正式变化继续进入既有 Candidate、Proposal、Project create 或 Application Command；
- page name 只用于显示和导航，不作为持久身份；重复 Project Anchor、游标循环、目标消失或变化
  均 fail closed；
- secondary-page payload 可单独重验并按目标 Page 限定 Block tree，不把 main Page 当作隐含目标。

## 自动证据

- 普通 Page 与 Project Page 分类、三项意图和 page-scoped 正式事项投影；
- Page payload、Logseq entity tuple 与 secondary-page target 解析；
- active Anchor 分页、重复 Project Anchor、游标循环、目标消失/变化的 fail-closed；
- main-page route 必须保持当前 main Page；secondary-page route 不要求等于 main Page；
- 整理当前页使用目标 Page UUID 读取 Block tree；
- 受控 Project 创建成功后进入新 Project Page；
- Project 当前状态复用带对象版本保护的 HIGH Proposal 编辑器；
- 讨论项目结构只进入 Proposal Review，不直接改正式状态；
- 从 Page Context 派生的表单取消时关闭插件 overlay，返回原 Logseq Page；
- Plugin tests 155/155 PASS，0 skipped；typecheck 与 build PASS。
- 根级 `./scripts/check.sh` PASS；rule coverage 145；recovery rehearsal differences `[]`。

## 真实 Desktop 结果

1. 普通 Page 的原生 Page 菜单显示唯一入口，路由展示三项普通 Page 意图；
2. “查看本页正式事项”只显示本 Page tree 中通过 active Primary Anchor 关联的正式对象；
3. “将本页建立为 Project”进入既有受控创建器，并明确不转换当前 Page；
4. 创建虚构 Project `P0 Page Route Gate 20260723` 后自动进入新
   `Project/P0 Page Route Gate 20260723`；
5. SQLite 读回 Project `OPEN` / version 2，且只有一个 active page-level
   `primary_text` Anchor；
6. Project Page 路由展示更新当前状态、讨论项目结构、项目操作三项；
7. “更新项目当前状态”进入既有 HIGH Proposal 编辑器；取消后对象、正文和 Anchor 均未改变；
8. 关闭路由后回到 Project Page，浏览器 Back 又回到原普通 Page；
9. Journal `Jul 23rd, 2026` 被识别为普通 Page，并显示同一三项安全路由；
10. 右侧栏 Page 与主 Page 同时存在时，主 Page 路由打开/关闭均保留右侧栏；
11. Logseq 0.10.15 的右侧栏 `…` 菜单仅提供关闭、折叠、作为页面打开，不暴露已注册的
    Plugin Page menu item。因此本次 Desktop 只能证明“右侧栏共存且不丢失”；secondary-page
    payload 的精确路由由自动测试证明，不能伪称当前宿主已提供右侧栏扩展入口。

## SQLite 读回

- 对象：MiniProject `OPEN` 1；Project `OPEN` 1；
- 新 Project：version 2，active Primary Anchor 1；
- Semantic Commit：`COMPLETED` 2、`UNDONE` 1；
- Proposal：`APPLIED` 1；
- Pending / Recovery Required：0；
- `pragma integrity_check`：`ok`；
- `pragma foreign_key_check`：无记录。

## 截图元数据

下表的 branch、commit baseline、Logseq version、theme、viewport、Zoom、runtime 与 evidence
status 均继承本文件顶部元数据；对象与 Commit 不登记完整 ID。

| Screenshot ID | Scene / precondition | Action | Actual result |
|---|---|---|---|
| `p0-d-01` | 普通测试 Page 已打开 | 点击原生 Page menu entry | 显示三项普通 Page 意图 |
| `p0-d-02` | 普通 Page tree 含一个 active 正式 Anchor | 查看本页正式事项 | 只投影一个关联 MiniProject |
| `p0-d-03` | 普通 Page route | 将本页建立为 Project | 进入受控创建器，并声明不转换当前 Page |
| `p0-d-05` | 受控测试 Project 已创建并进入 Project Page | 打开 Page route | 显示三项 Project Page 意图 |
| `p0-d-06` | Project Page route | 更新项目当前状态 | 进入版本保护 HIGH Proposal 编辑器 |
| `p0-d-08` | 从新 Project 返回 | 浏览器 Back | 回到原普通 Page |
| `p0-d-09` | main Page 与 right-sidebar Page 同时打开 | 打开 main Page route | 路由正确针对 main Page，sidebar 保留 |
| `p0-d-10` | 同上 | 关闭 route | main Page 与 sidebar 均保持原现场 |
| `p0-d-11` | Journal Page 打开 | 打开 Page route | Journal 走普通 Page 三项路由 |

## 隐私与证据处理

- `p0-d-05`、`p0-d-06` 裁掉旧成功提示中的完整对象标识，只保留相应路由/编辑器；
- `p0-d-11` 裁掉 Journal 正文，只保留插件界面；
- 九张文件均已转换并验证为真实 PNG；
- 两张暴露完整内部对象/Commit 标识的未提交生成截图已删除，未删除用户数据；
- 当前九张截图不含 descriptor、token、API Key、绝对路径、PID、终端历史或真实业务内容。
