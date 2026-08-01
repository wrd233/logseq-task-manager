# Task Copilot Global Object Directory — Phase 0 基线

> 基线日期：2026-08-01（Asia/Shanghai）
> 证据原则：当前代码与当前机器证据优先；历史 Desktop 报告只登记为历史运行证据。

## 1. 仓库与运行环境

| 项目 | 当前事实 | 证据 |
|---|---|---|
| 分支 | `feature/task-copilot-mvp` | `git status --short --branch` |
| HEAD | `cbc8442 docs(task-copilot): record worksite preview refresh gate` | `git log -1` |
| 工作区 | 唯一未提交修改：用户既有 `apps/task-copilot-local-service/package.json`（保留、不暂存、不提交） | `git status --short` |
| Node | 根级检查要求 Node 20：`/opt/homebrew/opt/node@20/bin/node` v20.20.2 / npm 10.8.2 | `check.sh` 环境约定 |
| Logseq | `0.10.15`，File Graph `logseq/`（嵌套、外层忽略） | CDP `App.getCurrentGraph()` |
| 已加载 Plugin | `task-copilot-personal-mvp_iframe` ← `tmp/releases/task-copilot-wrh-p1-09-final-cbc84423186f/task-copilot-plugin/dist/index.html` | CDP frame tree |
| Local Service | Launcher pid 1033；Service pid 29787（`service.js --database tmp/runtime/manual-v2/task-copilot.sqlite --graph-id logseq --descriptor ...`） | `ps` + descriptor |
| SQLite authority | `tmp/runtime/manual-v2/task-copilot.sqlite`，schema v12 | `sqlite3 .schema` |
| Provider | 真实 DeepSeek 配置存在（launcher-config）；本 Goal 不需要调用，也不读取凭据 | launcher-config（不提交） |

## 2. 当前“正式事项”入口与渲染

- 入口：主工作区导航“项目”区内的次级导航按钮 `正式事项与创建`
  （`ui.ts sectionNavigation`，`data-value="objects"`）。
- 渲染：`ui.ts renderObjects()`。当前结构：
  - 空态：`还没有正式事项` + “整理结构”折叠；
  - 列表：每行 `<article class="object-row">` = 标题 + `类型 · 进行中 · 可以行动`
    （所有生命周期都显示 Condition）+ 行内操作按钮
    （取消/重开、完成小项目、梳理小项目、升级为项目、编辑领域、调整项目）；
  - Project 行内展开 `项目当前信息`（目标/交付/阶段）；
  - 底部 `查看所属与相关内容（N 条）`、`整理结构（创建领域、项目与关联）` 两个折叠。
- 当前列表没有：搜索、筛选、排序、结果计数、打开原文、关注标记、Now 暗示、
  归档入口；关闭对象仍会显示“进行中 · 可以行动”式的当前 Condition。

机器证据（before）：

- `tmp/runtime/global-object-directory/baseline/objects-light-1000/`
- `tmp/runtime/global-object-directory/baseline/objects-dark-1000/`
- `tmp/runtime/global-object-directory/baseline/objects-light-760/`
- `tmp/runtime/global-object-directory/baseline/objects-dark-760/`
- `tmp/runtime/global-object-directory/baseline/objects-light-native-1440/`

每份证据包含 `screenshot.png / visible-text.txt / accessibility-tree.txt /
interactive-elements.json / computed-style.json / route-and-data.json / ui-state.json`。

## 3. 对象与数据来源

| 事实 | 当前值 | 来源 |
|---|---|---|
| 正式对象 | 22：TASK 12、MINI_PROJECT 6、PROJECT 2、OUTPUT 2（无 AREA/DECISION） | `directory-query.json`（SQLite objects） |
| Lifecycle | 22 全部 OPEN | 同上 |
| Condition | 22 全部 ACTIONABLE | 同上（condition_json） |
| Focus selection | 2 条（`focus_selections`，rank 排序） | `focus-selections.json` |
| Anchor | 27 条（`anchors`；含 primary_text/source/context/event/output 角色） | `anchors.json` |
| Primary Ownership | 0 条 | `ownerships.json` |
| Now 投影 | `GET /now-work`：focus / next / waitingReview（只含 OPEN，14 天/期限边界，nextLimit 12） | `service.ts` + `v2-now-work.ts` |
| 正式读取路径 | Plugin → Local Service → SQLite（`listObjects`、`nowWork`、`listPrimaryAnchors`、`listPrimaryOwnerships`、`listAssociations`） | `index.ts model()` |
| Focus 写路径 | `POST/DELETE /focus/:id` + `POST /focus/reorder`（仅 OPEN 对象可加入） | `service.ts` / `V2Application` |
| Focus 只读列表 | 尚无 `GET /focus`；Plugin 只能从 `/now-work` 间接看到 OPEN 对象的 focus | 本 Goal Sprint C 补齐 |
| 打开原文 | `openV2PrimaryAnchor(externalId)` → `scrollToBlockInPage`；返回现场用 Durable Origin + `OriginRouteController` | `index.ts` / `origin-route-controller.ts` |
| 归档 | 领域 `transitionV2Lifecycle` 支持 COMPLETED/CANCELLED→ARCHIVED；Plugin 无归档 UI | `domain/v2.ts` / `ui.ts` |

## 4. 已测量事实（MEASURED_STYLE_FACT）

- 四个视口下“正式事项”列表均存在 4px 横向溢出（clientWidth vs scrollWidth：
  1000→1004、760→764、1440→1444），当前是超宽/窄屏都存在的基线问题；
- 当前行内操作密度：objects 工作区可见按钮 51 个（含创建与结构入口），
  行内生命周期/结构操作直接平铺，构成按钮墙；
- 标题、类型、状态、操作在同一行内连续出现，无信息轴分层。

## 5. 与既有合同的关系

- SQLite 是唯一正式领域权威；本 Goal 只新增只读查询投影与 UI 消费，不新增状态源；
- Focus/Now 语义分离保持：Focus 是正式选择（仅 OPEN 可加入），Now 是查询投影；
- 打开原文复用 Primary Anchor + Durable Origin，不复制 Anchor、不按标题猜测；
- 正式生命周期操作仍走 Proposal → Review → Commit 安全链；
- UI 不直接写 Store；`GET /focus` 是只读端点，不改变领域模型。
