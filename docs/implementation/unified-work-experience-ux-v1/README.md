# Unified Work Experience UX v1

把已经存在的 Logseq 工作入口、当前结构、Reader、引用、历史与时间规划整合进同一个 DSH 工作界面。本轮只改 DSH 前端和必要的只读呈现，不重建 Work Context & Structure Core、Session/WorkRef 导航、连接恢复、Stage 历史或 Planner 存储。

- 核心基线：`origin/codex/work-context-structure-core-v1` = `ee3798d9`
- 开发分支：`codex/unified-work-experience-ux-v1`
- Worktree：`/Users/wangrundong/work/logseq-task-manager-unified-ux`
- 未合并 main，未修改核心分支
- 真实验收宿主：DSH `0.2.1-rc.2`（隔离 profile）、Logseq `0.10.9`（隔离副本）、独立测试 Graph、独立 companion

## 1. 结果

### 一个入口，而不是四个插件页面

- 会话头部只保留 **工作** 与 **规划**。
- **工作** 打开新的统一 Work tab：默认当前结构，可切到原文；历史回看与 Git 变更作为次级入口。
- 历史、规划、工作回顾仍是原生右侧栏 tab，因此可以并排或顺序共存；本轮没有把它们强塞进同一张卡片。
- 旧版左侧 360px 阅读浮层、框架 grid 改写和常驻工作切换条已移除。阅读器现在使用 DSH 原生右侧栏宽度，可拖动、全屏和分栏。
- Work tab 与 Planner tab 使用 `keepMounted`：切到历史或规划再回来，当前工作对象、阅读/结构模式和滚动位置不会丢。
- Work 菜单保留切换工作、新建此工作对话、工作文件和解除关联；解除关联保留原对话和草稿。

### 工作入口：重复进入不重复开页

沿用核心的 DSH handoff/offer 机制：

- 已打开的 DSH 页面处理票据；同一页面内切换到目标 Session。
- 同一件工作重复点「在 DSH 继续」会恢复最近有效 Session，不新建页面或 Session。
- 目标工作不同则在同一 DSH 页面中切换；只有 Logseq 明确要求新标签页时才交给系统打开。
- 前端成功时只显示短暂反馈「已恢复这件工作的最近对话。」，不弹技术卡片。

实际验证：在 Chrome 只有一个 DSH 页面时连续触发；页面数保持 1，Session id 保持同一值。

### 当前结构优先

Work tab 默认读取 `currentStructure`：

- 根节点是当前聚焦工作对象；默认只列直接下级工作对象。
- 点击子对象进入它自己的内部；面包屑和返回按钮回到上级工作。
- 只有当前根节点没有下级工作对象时才显示普通内容。
- 当前内容为空、只有标题或只有普通块时都有简短空状态，不伪造内容。
- 5 秒定向刷新保存后的 Logseq 来源；Logseq 插入或删除块后实测结构自动更新。
- 结构刷新不写 Stage 历史；实测刷新前后历史记录数不变。
- `current-structure-client.mjs` 的变更键补上 `content`，让叶子正文变化也能触发刷新。
- 当前结构保持树形，不另做图模式；历史 tab 继续使用同一快照投影的树/图。没有为图形模式复制过滤规则。

### Reader：真正的来源阅读器

- 保留 Logseq 原始父子层级与缩进；真正的折叠/展开。
- 状态保持原词（TODO / DOING / DONE / WAITING …），并用颜色和标签区分。
- `[注]` `[结论]` `[待确认]` `[风险]` 变成语义标签，不再占据正文行首。
- 对象行首标记 `[Project]` / `[MiniProject]` / `[任务]` 变成类型 chip，并从显示正文里隐去；代码块内的 `id::` 原样保留。
- Markdown 由服务端 Marked tokens 渲染：段落、强调、列表、引用、链接、页面引用、代码块和表格。
- 用户属性单独展示；`id::` 等内部属性不进入正文。
- 原始 HTML 只作为文本显示；链接只允许明确的安全协议。
- 默认长文自动收起较深层级；工具栏可展开/收起/定位当前。
- 引用交互不再给每块常驻按钮：
  - 悬停或键盘焦点时才在最近块显示 `＋`（加入引用）和 `↗`（Logseq 打开）；祖先块不因 hover 子块而全部显示操作。
  - 选中文字出现紧凑的「引用选中文字」浮层；跨块选择会分别映射到每个块的源 Markdown 范围。
  - 已选引用进入底部紧凑 tray，可逐条移除、清空。
  - 加入对话前调用 `reader-references` 验证真实 sourceId、版本和范围；成功后通过原生 inputActions 插入草稿，不发送。
  - 引用文本是「人类可读引文 + 紧凑来源身份行」，保留 sourceId、contentVersion、WorkRef、range；已有草稿由原生 captureInsertion 保留。
- 引用版本在 Logseq 变化后会标记已选引用为「已变化」，插入时返回 `REFERENCE_SOURCE_CHANGED` 并刷新。

### 连接恢复：安静、自动

- 正常连接时不显示任何连接控件。
- 断开时只显示一条具体、可行动的状态：
  - 本地工作服务未启动 → 启动 Logseq / 工作台后自动恢复；
  - 等待 Logseq 允许只读连接 → 在 Logseq 允许后重试；
  - 工作目录移动 → 重新关联；
  - Graph 不匹配 → 切回原 Graph。
- 每 8 秒静默重试；不重复弹技术提示。
- 实测停止真实 companion：出现一句「Logseq 工作服务还没启动」，不出现 descriptor、lease、binding、scope 等术语。
- 重启 companion 后，Logseq 端自动用新连接身份恢复原只读授权；DSH 自动恢复当前结构和 Reader，无需重新关联。

### Planner：当前时段专注 + 固定时间

- 默认进入「现在」，调用 `planner-current` 而不是前端自行推时间。
- 当前语义时段优先；显示当前时段内的灵活安排。
- 正在进行和接下来要发生的固定安排用紧凑区段保留，不会因为专注模式忘记今天的固定事项。
- 当前没有匹配时段时回退到当天安排，不显示空白。
- 「今天 / 明天 / 本周」保留全天入口。
- 固定安排：
  - 独立时间列、开始/结束、固定 badge；不进入语义时间段列表。
  - 没有拖动把手，HTML `draggable` 为空；普通 move/reorder 后端仍返回 `PLANNER_FIXED_EDIT_REQUIRED`。
  - 只能通过明确的编辑表单修改开始/结束时间。
  - 通过「＋ 固定」表单新建；计划投入、实际投入、截止时间仍是独立字段。
- 灵活安排仍可拖动、排序、编辑，普通 `move` 路径未改。
- 从 Planner 安排进入工作时：
  - 有引用时显示「在工作结构中查看」和「在 Logseq 打开原文」。
  - 「在工作结构中查看」复用当前会话，不创建新 Session；通过页内 focus request 把 Work tab 定位到该工作对象。
  - 这样修掉了从子 Task 引用调用 `planner-navigate continue` 时创建一个无法读取的新 Session 的问题。
  - `planner-navigate` 仍用于生成可核验的 Logseq 原文入口。
- 计划、实际、截止、固定时间四种语义在视觉上分开；标题、时间、引用、辅助参数不同权重。

### 历史回看与 Git 变更保持独立

- 历史 tab 现在是「历史回看」：顶部有「当前工作」返回 Work tab；仍用离散时间轴、结构树/图、真实父修订差异和只读快照。
- 当前结构页头有绿色实时点、读取时间；历史顶部明确「历史快照 · 只读」。
- Git 变更不混入 Logseq 结构树或历史时间轴；Work tab 的「变更回顾」打开原有 Work Evidence tab，按文件显示真实 Git 变更与 Diff。
- 实测：真实 Git 仓库修改 README 后，变更回顾显示 README.md；Logseq 结构页仍只显示工作对象。两者共享 DSH 页面但语义分开。

## 2. 主要文件

| 文件 | 变化 |
| --- | --- |
| `apps/dsh-plugin/src/client.jsx` | 统一入口、Work tab 注册、handoff 复用、行操作、去浮层、清理旧阅读代码 |
| `apps/dsh-plugin/src/work-experience/workbench.jsx` | 当前结构/原文/引用 tray/连接恢复/绑定/菜单/焦点与滚动保持 |
| `apps/dsh-plugin/src/work-experience/reader.jsx` | Logseq 层级 Reader、折叠、语义/状态、悬停操作、选区映射 |
| `apps/dsh-plugin/src/work-experience/markdown.jsx` | 安全 Markdown tokens 渲染 + UTF-16 源偏移映射 |
| `apps/dsh-plugin/src/work-experience/model.mjs` | 树、状态/语义、选区合并、连接文案、预览 |
| `apps/dsh-plugin/src/work-experience/focus-store.mjs` | Planner → 当前会话 Work tab 的页内焦点请求 |
| `apps/dsh-plugin/src/work-experience/styles.mjs` | Work/Reader 视觉层，使用 DSH 宿主 token |
| `apps/dsh-plugin/src/reader-draft.mjs` | 引文 + 紧凑来源身份插入，保留原生草稿 |
| `apps/dsh-plugin/src/current-structure-client.mjs` | 实时结构变更键包含叶子 content |
| `apps/dsh-plugin/src/planner.jsx` | 当前时段、固定安排、固定编辑、页内工作导航 |
| `apps/dsh-plugin/src/planner-styles.mjs` | Planner 全宽、当前/固定/灵活层级视觉 |
| `apps/dsh-plugin/src/styles.mjs` | 文件与工作搜索样式；移除旧浮层/阅读样式 |
| `apps/dsh-plugin/src/structure-history/client.jsx` | 移除头部重复入口，改「历史回看」，增加「当前工作」返回 |
| `apps/dsh-plugin/src/work-evidence/client.jsx` | 移除头部重复入口，保留原生 tab 与 Git 证据页 |
| `apps/dsh-plugin/README.md` | 新统一工作入口与边界说明 |
| `docs/implementation/unified-work-experience-ux-v1/` | 本记录与实机截图 |

## 3. 核心接口接入

- `status` / `bind` / `connection`：绑定和恢复状态。
- `reader` / `reader-references`：原文 tokens、来源版本、选区验证。
- `currentStructure` + `current-structure-client`：当前结构、子对象、叶子 content、实时刷新；焦点变化使用同一 Session 和原读取范围。
- `handoff-pending` / `handoff` / `opened`：Logseq「在 DSH 继续」票据领取、最近 Session、页面内切换。
- `enterWork`：工作切换。
- `planner-read` / `planner-current` / `planner-change`：全天、当前时段、固定/灵活保存。
- `planner-navigate`：可核验的 Logseq 原文入口；`continue` 仍保留在核心，本轮 UI 改为当前会话页内 focus 以避免子对象断开。
- `openSession` / `sessions.refresh`：原生 DSH 导航。
- 原生 `inputActions.captureInsertion` / `insertText`：引用和 Planner 草稿，不发送消息。

没有新增数据库、全局状态框架、watcher 或第二套 Refresh 机制。

## 4. 工程检查

在当前源码上实际完成：

- `node --import tsx --test apps/dsh-plugin/tests/*.test.mjs`：**73/73 pass**
- `node apps/dsh-plugin/scripts/build.mjs`：通过
- `node apps/logseq-plugin/scripts/build.mjs`：通过（用于隔离 Logseq/companion 验收）
- `eslint apps/dsh-plugin/src apps/dsh-plugin/tests`：通过
- `git diff --check`：通过

未运行全仓 `npm run check`：本轮只改 DSH 前端和两个纯视图辅助模块；按任务要求优先真实 UI 与关键回归，没有跑庞大矩阵。

## 5. 真实 DSH + Logseq 走查

隔离环境：

- Logseq Desktop `0.10.9` 自有副本；独立 HOME、profile、Graph。
- DSH `0.2.1-rc.2` 自有 profile / `DSH_HOME` / 端口 `50205`。
- 独立 Chrome profile、远程调试端口 `50206`。
- 生产 Graph、生产 Logseq profile、其他 Agent Worktree 未参与。

实际完成：

1. Logseq 中「在 DSH 继续」建立只读连接，DSH 自动打开 Work tab；同一页面、同一 Session 连续重复进入。
2. 当前结构默认根 + 只列直接下级；进入 Task、breadcrumb 返回、再进入。
3. Reader 层级、TODO/DOING、注/结论/待确认/风险、页面引用、代码、用户属性；`id::` 不在正文。
4. 选段、整块、多引用 tray、逐条移除、加入原生草稿；未发送；已有草稿机制保留。
5. 悬停操作仅出现在最近块；祖先块不显示操作。
6. Logseq 插入一个新 TODO 后 5 秒内结构出现；删除后消失；历史文件数保持不变。
7. 停止 companion → 一句恢复状态；重启 companion → 自动恢复结构和阅读，无需重新关联。
8. Planner 默认「现在」；当前固定安排、当前语义时段、接下来固定事项同屏；全天视图可编辑。
9. 固定安排无拖动把手；固定编辑器只有明确时间编辑；灵活安排仍可拖动。
10. Planner 引用 → 当前会话 Work tab 定位到对应 Task；页面和 Session 不新增。
11. 历史回看显示两个真实 HistoryStore 快照、时间轴、3 处真实变化和当前/历史区分；「当前工作」返回保留 Task 焦点。
12. 变更回顾显示真实 Git 修改 README.md；与 Logseq 结构页分开。
13. 工作、规划、历史、工作回顾四个 tab 同屏共存；Work/Planner keepMounted，切回不丢焦点和滚动。

### 截图

| 文件 | 说明 |
| --- | --- |
| [01-work-structure.png](screenshots/01-work-structure.png) | Work tab 默认当前结构根；只显示直接下级 |
| [02-work-focus.png](screenshots/02-work-focus.png) | 进入 Task，显示面包屑、返回与下级工作 |
| [03-reader-hierarchy.png](screenshots/03-reader-hierarchy.png) | 原文视图：真实层级、状态、语义、页面引用、代码、属性 |
| [04-reader-hover.png](screenshots/04-reader-hover.png) | 悬停才出现的最近块引用/打开操作 |
| [05-reader-selection.png](screenshots/05-reader-selection.png) | 选中文字后的紧凑「引用选中文字」 |
| [06-reader-references.png](screenshots/06-reader-references.png) | 选段 + 整块两处引用 tray |
| [07-reader-draft.png](screenshots/07-reader-draft.png) | 引用加入原生草稿，未发送；引文 + 紧凑身份行 |
| [08-planner-focus.png](screenshots/08-planner-focus.png) | 当前时段专注：正在进行固定 + 当前时段 + 接下来 |
| [09-planner-day.png](screenshots/09-planner-day.png) | 全天：固定安排独立时间列，灵活安排按语义时段 |
| [10-planner-fixed-edit.png](screenshots/10-planner-fixed-edit.png) | 固定安排只能通过明确编辑修改开始/结束 |
| [11-history.png](screenshots/11-history.png) | 历史回看：时间轴、快照树、真实变化、「当前工作」返回 |
| [12-evidence.png](screenshots/12-evidence.png) | Git 文件证据与 Logseq 结构分开 |
| [13-connection-recovery.png](screenshots/13-connection-recovery.png) | 服务停止时的简短恢复状态，不暴露内部术语 |
| [14-connection-restored.png](screenshots/14-connection-restored.png) | 重启后自动恢复阅读与结构 |
| [15-handoff.png](screenshots/15-handoff.png) | 重复进入只显示「已恢复这件工作的最近对话」 |
| [16-planner-to-work.png](screenshots/16-planner-to-work.png) | Planner 引用 → 当前会话 Work tab 定位到对应 Task |

## 6. 尚未完成 / 已知限制

- 浏览器后台标签页的定时器仍会被浏览器节流；核心 offer 的 2.5 秒认领窗口过后，Logseq 仍可能走系统打开票据 URL。本轮没有新增跨标签页 leader election，也没有改变核心票据协议。
- 无法强制 macOS 浏览器窗口置顶；只能 `window.focus()` 请求。
- 当前结构只提供树，不提供图；历史仍保留树/图。这是有意的，避免维护第二份结构过滤投影。
- Planner 的「在工作结构中查看」是页内 focus，不写 URL、不做跨会话深链；刷新页面后 Work tab 回到工作根。
- 引用在草稿中是「引文 + 紧凑 JSON 身份行」，没有自定义 chip；这是为了保留原生草稿、版本和来源身份。表格单元格的选区偏移为近似映射。
- 历史截图使用真实 `ProjectRecords` 存储写入的两个测试快照，不是本轮由 Agent 现场生成；历史 UI、因果链、比较与来源检查走真实代码。真实 Stage 记录接入未在本轮重新验收。
- 变更回顾的模型「理解这些文件」未调用（验收环境禁用外部模型）；真实 Git 状态、Diff 和文件证据路径已验证。
- 截图主题为 DSH 深色；样式使用宿主 token 和 light-dark fallback，浅色未单独截图。
- 没有触摸设备实机验收；`@media(hover:none)` 有操作兜底。
- 空会话时 DSH 不渲染会话头部 utilities，因此「工作」按钮在第一条消息后才常驻；Work tab、tab guide 和会话行 ◈ 操作仍是入口。
