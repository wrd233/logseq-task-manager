# Goal 2：DSH 工作发现与搜索入口

分支 `codex/dsh-work-discovery-v1`。独立 worktree：`/Users/mac/.codex/worktrees/dsh-work-discovery/logseq-task-manager`。

开始和交付前都核对了远端：main 为 `018c3368bbe764a55cce466db36c8fcc4da43e37`，Goal 1 为 `76d8eea226141d38a3489acffa2cc6bd5fe18722`，后者尚未合并。因此直接以远端 Goal 1 为依赖基线；未合并 main，未修改其他工作区，也未停止其他实例的服务。全程一个 Agent。

## 用户体验

DSH 原生聊天右上角的当前工作按钮打开搜索；也可用 `⌘⇧K` / `Ctrl+Shift+K`。弹层有 General、当前工作、最近使用、全部工作；输入名称、类型或来源位置即可筛选，方向键选择、Enter 进入、Esc 返回。点击直接打开最近实际打开且仍有效的原生会话，没有会话则创建空白会话，没有中间工作页。

同名结果显示 Graph、页面和父链；完全相同位置还显示完整身份。没有目录的工作先在原生默认/General 目录开始对话，保留独立 WorkRef。Registry 已登记目录只作为导航 cwd；目录变化导致原会话 cwd 不一致时拒绝继续，保留输入，通过“新建此工作对话”在正确目录新开。搜索与 General 切换都不迁移原会话。

## WorkCatalog 的实际实现

- 在现有私有 companion 状态目录下，原子保存一份 `work-catalog.json`，内部按 Graph 分区。不是新数据库或独立服务。
- Logseq 用现有 SDK 的候选查询和 `extractObjectNavigationLabel` 识别 `[事务]`、`[事项]`、`[任务]`、`[MiniProject]`、自然 `[Project]`。普通 TODO、普通正文和未收录页面不作为结果。
- 正式对象来自真实 `listObjectAnchorIndex()`，使用真实 objectId；不凭标题或属性语法认定正式身份。Kernel 元数据暂不可用时复用上次已验证的元数据，避免将已知正式来源降级为自然对象；首次尚无 Kernel 元数据时保留已有发现快照。
- 快照只含 WorkRef、标题、类型、位置、时间，以及可选的 Registry 目录定位和真实当前页面 UUID。无正文、grant、lease、聊天内容或凭据。
- 复用 DB 变更通知做 700ms 合并刷新，并用 15 秒轻量刷新覆盖空闲、重新连接及 Kernel 变化；无文件 watcher 或同步总线。DSH 弹层每 10 秒重读保存目录；超过 35 秒未刷新标为“离线快照”，显示保存时间。
- 每个 Graph 的显式页面选择单独保存于现有 FileStorage，不会被派生索引覆盖。Logseq 命令面板提供“将当前页面加入/移出工作搜索”以及手动刷新入口。

文件型 Graph 的未持久块 UUID 在重新解析时可能变化。自然工作复用 `ensurePersistentSourceIdentity` 保存原生隐藏 `id::`，不改写正文语义。明确收录页面使用一个原生空块的持久 UUID 作为 page 命名空间内的导航锚点；通过该块的真实 page 关系定位当前页面。没有空块时追加空块，原生 `id::` 保存身份。改名/重载不按标题或路径重建身份。实际读取仍使用真实当前 page UUID 的 SourceScope；发现身份不是虚构的读取范围。删除页面锚点后保留显式选择和最后标题，不猜测同名替代来源。

## 复用与权限边界

Goal 1 的 `DshHandoffs`、BindingStore、WorkRef、原生创建/inspect/list/archive、实际打开时间、cwd 校验和 General 逻辑继续负责导航。Logseq handoff 与发现入口共用 `recentSession`，新建失败重试先检查预留的原生 ID，防止重复创建。没有复制会话、草稿或模型调用。

main 的 Workspace Registry、Graph identity、原生身份保存、对象识别、私有认证发布通道、Kernel anchor index、WorkEvidence 和 Structure History 均保持。没有移植旧分支或重构这些模块。

**Goal 3 边界仍在：** 发现入口只关联导航身份，不自动建立 Logseq 正文连接，不恢复旧写入授权。没有有效来源连接时仍可聊天，读取明确返回 `SESSION_NOT_BOUND` / offline 等已有诊断。Logseq 读 A、DSH 独立实时读 B 的完整路由、并发写授权和全面 Graph 协议重构没有实现。目录位置本身不授予 Logseq 正文读取权限。

## 主要文件

- `packages/contracts/src/work-catalog.ts`、`work-ref.ts`：发现元数据与身份约定。
- `apps/logseq-plugin/src/features/agent-workspace/work-catalog.ts`：现有识别和来源父链的元数据投影。
- `catalog-pages.ts`、`catalog-publisher.ts`：明确页面选择、持久原生锚点、Graph 生命周期与发布。
- `apps/logseq-plugin/src/index.ts`、`features/agent-workspace/installer.ts`：Registry/Kernel 接线及 Goal 1 页面进入的身份复用。
- `apps/task-copilot-cli/src/work-catalog.ts`、`workspace-server.ts`：既有认证通道内的原子快照发布。
- `apps/dsh-plugin/src/discovery.jsx`、`client.jsx`、`styles.mjs`：原生工作切换器、键盘/焦点/加载/空结果/离线状态、过期导航结果丢弃。
- `apps/dsh-plugin/src/handoff.mjs`、`index.mjs`、`service.mjs`：共享恢复规则、发现 RPC、无正文授权的工作归属、真实 page scope 与导航身份的分离。
- 三端 `work-catalog` / `discovery` 测试，以及已有会话连续性回归。
- `scripts/work-discovery-desktop.mjs`、`work-discovery-dsh.mjs`、`work-discovery-proof.mjs`：复用 Goal 1 的隔离宿主方式与生产观察采集；不注入替代 Graph SDK 或搜索 UI。

## 验证

类型检查、lint、构建与构建产物检查、12 项依赖边界检查、5 项隔离启动器检查和 taste 评估通过。855 项 workspace 测试的分包结果全部通过：Logseq 571/571 使用 `--test-concurrency=2` 完整重跑；其余包通过原 workspace 回归，DSH 49/49 在最终导航调整后另行通过。新增 6 项关键测试及既有 4 项会话连续性测试也全部通过。

默认高并发 `npm run check` 的两次全量尝试曾出现不同的材料/阅读 UI 时序超时，不能称该单一命令全绿；没有通过放宽断言处理。本次最终 Logseq 571 项限并发完整回归无失败，保留了实际结果。工程检查随后单独完成。

生产插件与安装版 DSH SDK 的 host proof 8/8 通过，见 validation.json；该检查使用合成 SDK/脚本模型，与下面的真实双端验收区分。

## 真实双端验收

macOS，独立 Logseq 0.10.9 副本、专用 Graph、真实 Kernel、DSH 0.2.1-rc.2 原生 standard preset、专用 HOME/DSH_HOME 和端口 3092。记录与截图见 [host-results.json](evidence/work-discovery-2026-10-31/host-results.json)、[ui-observations.json](evidence/work-discovery-2026-10-31/ui-observations.json)、[offline-search.jpg](evidence/work-discovery-2026-10-31/offline-search.jpg)。

| 验收 | 实际结果 |
| --- | --- |
| 新事务从未进入 DSH、无目录 | 在真实 Logseq 原生编辑创建；DSH 搜索到“首次发现验收”，点击直接打开空白原生会话。 |
| 自然 Project | 识别为 Project，点击进入；持久 UUID 在后来 Logseq 重载后保持。 |
| 正式 Kernel 对象 | 真实 Logseq 正式化命令创建 Task；生产 anchor index 与搜索结果使用相同真实 objectId，点击进入原生会话。 |
| 明确加入页面 | 原生命令收录 Oct 31st, 2026；Logseq 重载后真实 page UUID 已变化，导航锚点不变、选择仍保留，搜索并进入页面对话。 |
| 排除普通 TODO/正文/未收录页面 | 搜索“普通”无结果；未收录页面本身没有进入结果，页面内已标记工作仍正常发现。 |
| 两处同名事务 | 分别显示日志顶层与“位置乙”父链；点击进入不同原生会话，后者的草稿不会出现在前者。 |
| Logseq 离线 | 只停止本 Goal 的 Logseq 与 companion 后，仍可搜索；显示“离线快照 · 更新于 10/31 18:42”，能恢复已有工作，也能为另一工作创建空白会话。 |
| General 独立 | General 与位置乙工作各自保留原生草稿；切回分别恢复，不改变 WorkRef。 |
| 没有正文授权/自动模型 | 生产 read RPC 返回 `SESSION_NOT_BOUND`；专用模型审计中网络尝试数为 0。 |

Registry 目录 cwd、归档/删除跳过和创建回包丢失有关键逻辑测试；本轮真实发现流程集中验证此前没有目录/会话的工作。未宣称真实模型回复、物理中文 IME、跨设备同步或长期运行验收。采样证据只含专用合成工作与身份元数据，不含凭据。

验收后停止本 Goal 的宿主和 Kernel，保留忽略目录 `tmp/work-discovery-desktop` 的私有状态供重验。没有更改日常 Logseq、DSH、Provider、凭据或全局模型设置。
