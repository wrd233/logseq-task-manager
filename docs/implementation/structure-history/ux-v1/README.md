# Structure History UX v1

以结构树为中心的历史回看体验。本轮只改 DSH 结构历史前端与必要的只读查询边界，没有重写历史存储、StageRecorder 或差异算法。

- 基线：`origin/main` = `018c3368bbe764a55cce466db36c8fcc4da43e37`
- 分支：`codex/structure-history-ux-v1`
- Worktree：`/Users/wangrundong/work/work-structure-history-ux`
- 基线校验：创建时 `HEAD`、`origin/main`、`merge-base` 均为 `018c3368`，ahead 0 / behind 0
- 验收宿主：DSH `0.2.1-rc.2`，独立 `DSH_HOME`、profile、端口 `3155` 和测试工作区；未切换、停止或修改 Goal 3 / WorkEvidence 工作区

## 设计结果

### 时间轴是历史时点的控制器

薄薄一条离散时间轴放在结构树上方：

- 每个时点显示阶段名、`#序号`、记录时间和“最新”标记。
- 左右箭头前进/后退一个时点；键盘 `←` / `→` / `Home` / `End` 也能移动。
- 时点较多时横向滚动；更早记录通过“载入更早”继续分页。
- 顺序来自保存的真实父链：优先使用 Stage 修订的 `facts.parentRevision`，缺失时回退到追加父链；**不按 `occurredAt` / `recordedAt` 排序**。
- 因果链不完整、存在旁支或更早记录未载入时，明确说明；不会用时间戳补造顺序。
- “最新已记录 #N”与“实时结构未读取”同时出现。选中最新时提示“此后的实时修改不会出现在这里”，选中旧时点提示“当前实时结构可能已不同于此快照”。

### 结构树是默认主视图

- 真正的父子层级，按保存的 `order` 排序；缺父节点的部分快照把节点安全地提升到根，不伪造父级。
- 每个有子节点的分枝可展开/折叠；支持全部展开和全部收起。
- 节点标题最多两行，长标题可读；状态和“正文未知”靠右，变化标记紧贴标题。
- 新增、移动、层级、改名、正文修改分别用绿、蓝、琥珀的轻量标签；颜色不是唯一信号。
- 选择态有明确底色和左侧强调线。
- 搜索保留匹配节点及其祖先，其余节点淡化。
- 结构图保留为辅助视图（树/图切换），删除节点不会作为幽灵节点进入当前树或当前图。

### 变化列表默认折叠、只讲真实变化

- 自动比较“所选快照”与“真实父修订”，不再要求手动选比较基准。
- 折叠时只显示一行摘要：`较 #N · 7 处 · 新增 2 · 删除 1 · 移动 1 · 修改 3`。
- 展开后显示：新增、删除、移动、改名、正文、顺序、声明状态、依赖、来源、深度。
- 移动显示旧路径与新路径；深度变化也显示路径变化。
- 删除节点只出现在变化列表和详情里，并明确说明“不在当前结构树里”，正文取删除前快照。
- “未再观察”不会被当作删除。
- 首个快照没有父修订时，显示“这是当前历史线的起点”，不推断变化。

### 节点详情不挤占结构浏览

- 宽屏为右侧详情栏（约 370px）；窄窗口/侧栏宽度不足时变为右侧覆盖抽屉，不完全遮住结构树。
- 显示所选快照的历史标题、当时父级路径、层级/同级位置、声明状态、依赖、历史正文。
- 字段差异折叠在“与 #N 的字段差异”中，默认不展开。
- 来源核对把“历史保存版本”和“今天的版本”分开；今天的内容永远标注为“不是历史正文”。
- 来源身份或绑定 scope 不能核验时不读取、不提供跳转；历史版本未知时仍可查看今天的内容，但不提供跳转，并明确说明历史正文仍来自哪个快照。
- 只有来源仍可核验且历史/当前版本都存在时，才生成 Logseq 原文入口；“来源已变化”时入口文案改为“定位今天的块”。文件来源显示核对结果，不伪造 Logseq 跳转。

### Agent 解释按需带入草稿

- 默认只显示确定性差异，不自动调用模型。
- “解释本阶段”把“基线/当前快照 + 真实变化清单 + 不猜测动机的约束”插入 DSH 原生草稿，**不发送**。
- 截图录制时按钮点击后未出现“深度求索中”，草稿中出现了解释请求；模型调用由用户之后发送触发。
- 已有 Agent 解释只作为“非历史事实”单独折叠显示，不混进变化列表。

## 修改范围

| 文件 | 变化 |
| --- | --- |
| `apps/dsh-plugin/src/structure-history/client.jsx` | 重写历史工作台 UI：离散时间轴、默认结构树、折叠变化列表、节点详情、来源核对、按需解释草稿 |
| `apps/dsh-plugin/src/structure-history/styles.mjs` | 新的历史工作台视觉层；复用结构图的既有样式作为辅助视图 |
| `apps/dsh-plugin/src/structure-history/service.mjs` | `list` 增加既有 `facts` 子集；`source` 增加来源身份/scope 预检与可核验的 `navigation`，不写存储 |
| `apps/dsh-plugin/src/structure-view/model.mjs` | 新增 `historyChain` 与 `lineage` 两个视图侧纯函数 |
| `apps/dsh-plugin/src/structure-history/model.mjs` | 转发上述纯函数 |
| `apps/dsh-plugin/tests/history.test.mjs` | 增加真实 Stage 父链顺序、时间戳反例、路径、来源跳转边界测试 |
| `apps/dsh-plugin/README.md` | 更新工作结构历史的用法说明 |
| `docs/implementation/structure-history/ux-v1/` | 本轮记录与真实界面截图 |

没有修改：

- StageStore、StageRecorder、Stage 历史存储或哈希链；
- `compare` 的差异判定；
- WorkEvidence / Goal 3 只读来源路由或共享协议；
- 正式任务状态或 Graph 内容。

`service.source` 的行为有一处收紧：Logseq 来源现在要求记录里有可核验的 `facts.scope`，并且 `source.ref` 是匹配该 scope 的 `["logseq", graphId, blockUuid]`。不满足时不读取、不跳转。这是为了守住“来源身份无法核验时不能伪装成正常来源”的边界，不改变存储格式。

## 验收

### 自动检查

- `node --import tsx --test apps/dsh-plugin/tests/*.test.mjs`：45/45 通过
- `npm run typecheck --workspaces --if-present`：全部 workspace 通过
- 变更文件 ESLint：通过
- `node apps/dsh-plugin/scripts/build.mjs`：通过
- 浏览前后历史目录 4 个不可变记录 SHA-256 完全一致
- 来源核对与页面浏览前后测试工作区 `notes/` 和 `.task-workspace/` SHA-256 一致

### 真实界面走查

在独立 DSH profile、独立测试工作区和 4 个连续快照上验证：

1. 打开“工作历史”默认进入结构树和时间轴。
2. 切换时点，结构树、节点标记和变化摘要同步变化。
3. 展开变化列表，变化与快照差异一致；移动显示旧/新路径。
4. 删除节点从变化列表打开旧正文，不进入当前树。
5. 点击节点查看所选快照的历史正文。
6. 来源仍可核验时生成 Logseq 原文入口；来源变化、删除、scope 不匹配时不跳转。
7. 解释按钮只插入原生草稿，没有自动模型调用。
8. 1000px 窄窗口下详情为覆盖抽屉，结构树仍保留可见区域。
9. 结构图作为辅助视图可用。
10. 历史记录与测试来源文件字节未因浏览改变。

### 截图

目录：`screenshots/`

| 文件 | 说明 |
| --- | --- |
| [01-timeline-tree.png](screenshots/01-timeline-tree.png) | 默认：时间轴 + 结构树，最新已记录 |
| [02-first-snapshot.png](screenshots/02-first-snapshot.png) | 首个快照：阶段起点，没有可比较父修订 |
| [03-stage-two-tree.png](screenshots/03-stage-two-tree.png) | 切到阶段二：结构树随历史时点变化 |
| [04-changes-expanded.png](screenshots/04-changes-expanded.png) | 变化列表展开：新增/删除/移动/改名的真实差异 |
| [05-moved-node-detail.png](screenshots/05-moved-node-detail.png) | 移动节点详情：旧路径、新路径、历史正文 |
| [06-deleted-node-detail.png](screenshots/06-deleted-node-detail.png) | 删除节点详情：删除前快照正文，不进入当前树 |
| [07-source-changed.png](screenshots/07-source-changed.png) | 来源已变化：历史正文与今天内容分开 |
| [08-source-unavailable.png](screenshots/08-source-unavailable.png) | 来源文件已删除：只报不可用，不伪装跳转 |
| [09-logseq-source-unverified.png](screenshots/09-logseq-source-unverified.png) | Logseq 来源身份不匹配：不读取、不跳转 |
| [10-logseq-source-valid.png](screenshots/10-logseq-source-valid.png) | 可核验来源：版本一致后显示 Logseq 原文入口 |
| [11-explain-draft.png](screenshots/11-explain-draft.png) | “解释本阶段”只带入草稿，未自动发送 |
| [12-fullscreen-tree.png](screenshots/12-fullscreen-tree.png) | 全屏结构树主界面 |
| [13-graph-mode.png](screenshots/13-graph-mode.png) | 结构图辅助视图 |
| [14-fullscreen-detail.png](screenshots/14-fullscreen-detail.png) | 全屏并排详情 |
| [15-narrow-detail.png](screenshots/15-narrow-detail.png) | 1000px 窄窗口覆盖详情 |

截图来自实际运行的 DSH 页面（`http://127.0.0.1:3155`，独立 profile），不是静态原型或生成图片。

## 测试数据与来源边界

- 4 个连续快照，最终 11 个节点；包含新增、删除、移动、改名、正文修改、顺序/深度变化。
- 测试工作区含真实文件来源，覆盖版本一致、版本变化、文件删除三种情况。
- Logseq 来源使用隔离测试 Graph 块（`UxTest`）与遵循生产 `/call` 协议的 fixture companion；DSH 页面、绑定检查、版本比对和入口生成均为真实代码路径。
- **未启动真实 Logseq Desktop，也未实际点击 `logseq://` 打开 Logseq 窗口**。因此“来源身份可核验时生成入口”已验证；“在真实 Logseq Desktop 中完成跳转”仍是未验收项。
- fixture companion 与种子脚本位于本地 `tmp/`（不提交），截图与测试结果已提交。

## 未完成 / 已知限制

- 真实 Logseq Desktop 的原文跳转未实际点击验收；入口 URL、scope/版本核验和不可跳转分支已分别覆盖。
- 结构树当前按展开状态渲染全部可见节点；超大结构（数千节点）没有专门的虚拟滚动，仍建议用结构图或折叠浏览。既有 5000 节点布局/存储测试未被本轮破坏。
- 极端长正文使用 `pre-wrap` + 详情内部滚动；未单独对超长文本做压力走查。
- “解释本阶段”只负责把事实化请求带入草稿；模型解释质量、语言风格和发送后的回答不在本轮验收范围。
- 变化列表按保存父链比较；若历史记录本身缺页或父修订丢失，会显示因果链提示，但仍不能补造缺失状态。
- 没有自动播放、复杂筛选器和游戏化效果；时间轴与详情保持只读。
