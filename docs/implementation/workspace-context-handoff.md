# workspace-context 实施交接

2026-10-02。交付本地「建立关联 → 权威读取 → 机械更新 → 恢复」闭环，复用远端已合入的材料服务。产品与数据权威见 [设计](../design/workspace-context-design.md)，数据布局、共享协议及生命周期见 [架构](../architecture/workspace-context-architecture.md)。

## 可复现起点与环境

| 项目 | 本次实际值 |
| --- | --- |
| 远端 | `https://github.com/wrd233/logseq-task-manager.git` |
| 启动 fetch 的 origin/main | `16ef663fc9485eb2dfb036d7eedf20d404511e70` |
| REMOTE_BASE_SHA | `16ef663fc9485eb2dfb036d7eedf20d404511e70`，启动时锁定，未追逐后续 main |
| OS / CPU | macOS 15.2 / x86_64 |
| 工作树 | `/Users/mac/.codex/worktrees/workspace-context-main/logseq-task-manager` |
| 分支 | `codex/workspace-context` |
| 工具链 | Node 20.20.2 / npm 10.8.2，下载在本工作树忽略目录 `tmp/toolchains`；未改系统默认 Node |
| 安装 | 本工作树独立 `npm ci`；未改依赖和 lockfile，workspace 链接指向本工作树 |
| 仓库规则 | 当前工作树及父路径未发现适用 AGENTS.md |

启动时原 checkout 为 main，只有用户未跟踪的 `docs/implementation/prompts/`，原样保留。当前聊天已有附带工作树 `/Users/mac/.codex/worktrees/workspace-context/logseq-task-manager`，但基线为更早 `23d0c71` 并有两份未提交文件。核对当前聊天 artifact 后，将其分支保留为 `codex/workspace-context-preserved-20261002`，未复制、清理或提交其文件；从已 fetch 的不可变 SHA 另建本工作树。未创建或联系其他聊天，未委派子 agent。

已从本次远端 checkout 阅读总体产品设计、包边界、整合文档、四轮重构结果、材料产品/架构/历史 handoff，以及相关源码与测试环境说明。材料历史 handoff 中的「材料尚未实现」没有覆盖已合入代码。

## 实际调用契约

插件 iframe 的 `window.taskCopilotWorkbench.workspace`：

| 方法 | 输入与行为 |
| --- | --- |
| bind | `{scope:{graphId,rootUuid},directory,organization?:"flat"\|"project",create?:boolean,rebind?:boolean}`，验证当前 Graph/root、目录与 manifest，建立/恢复身份并实际刷新 |
| resolve | `scope`，读取实际材料目录绑定并核验 manifest，返回含 entryPath 的 WorkspaceBinding；旧材料绑定没有 manifest 时返回 null |
| refresh | `scope`，真正读取已提交来源，发布对应文件或明确保留旧副本，返回 ContextReading |
| read | `scope`，读取并验证目录副本；始终 last-known / unavailable，不把历史检查当作当前在线读取 |
| unbind | `scope`，立即使旧作业失效，清实际绑定，不删除任何笔记、成果和历史 |
| associate | `{scope,source}`，source 是已核验的 logseq-block / logseq-page / material ID；持久关联并实际刷新 |

ContextReading 包含 `workspaceId/binding/freshness/mirror/status/observed?/problem?`。mirror 包含 `pointer/bundle/markdown/recovered`；bundle 包含 `primary/sources/lastKnownSources?`。observed 是本次真正读取结果；来源 unavailable 时其 content/contentVersion 为 null，旧内容只在独立 mirror / lastKnownSources 中。结构版本和来源集合版本来自共同 SHA-256 协议，时间和运行 epoch 不参与版本计算。

例如，下面只在真正的插件上下文中执行，不是外部 Codex session 的传输代码：

```js
const workbench = window.taskCopilotWorkbench;
const current = workbench.read(); // 既有 work-view scope；先从工作块打开视图
if (!current?.graph || !current?.root) throw new Error("请先打开实际工作块");
const scope = {graphId: current.graph, rootUuid: current.root};
const bound = await workbench.workspace.bind({scope, directory: "/absolute/work-directory"});
const fresh = await workbench.workspace.refresh(scope);
const original = fresh.observed?.primary;
console.log(bound.workspaceId, fresh.freshness, original?.sourceSetVersion);
```

显示命令同时注册 palette 和块右键：关联、新建并关联、重新关联、刷新工作记录、打开工作读取入口、解除关联。表单显示所选工作块首行、路径和收纳方式，无工作区管理后台或欢迎页。编辑中的块不会被强行保存；关联时需要结束原生编辑，错误说明保留在表单中。

## 自动化与实机验证

核心连续脚本：

```sh
node --import tsx --test apps/logseq-plugin/tests/workspace-reading.test.ts \
  apps/logseq-plugin/tests/integration/workspace-local-entry.test.mjs
```

12 个新增场景使用本工作树内临时目录及合成数据：完整原文/SHA/先序与 UTF-16 映射、同名与跨 Graph 隔离、入口/manifest 冲突、显式新建、机械注释更新与草稿隔离、不可用与重启、临时写/读回/指针故障、Graph / unbind / rebind 的晚读晚写、移动与缓存隔离、真实 MaterialService 的旧绑定/旧材料/fallback/角色目录、显式 block/page/material、读中变化重读、Desktop 缺父目录形状、独立失联来源旧副本、并发目录冲突与入口部分失败重试。单个场景可能覆盖多项行为，断言围绕实际文件和来源结果。

Happy DOM 场景调用真实安装函数、实际注册的块菜单与表单保存，再调用真实 Materials.bindDirectory / capture；重启安装器、Graph 暂不可用读取旧副本、明确搬迁重关联、DB Graph 不写文本 id、dispose 释放监听与菜单。组合根回归在 tasksEnabled=false 下确认工作区/材料/视图可用且无 Kernel 请求；DB 监听新增为工作区自己的独立订阅。

自动化命令包含插件 typecheck/test/build、check:boundaries 和本工作树的完整 `npm run check`。最终完整门禁通过：410 项业务测试（插件 182 项）、5 项 Sandbox 测试、12 项边界测试均 0 fail / 0 skip；requirements、全仓 typecheck、lint、build/二进制检查、实际边界扫描及 Taste PASS。核心与实际安装器连续脚本 12 项通过。最后一次完整检查使用最终源码，日志 `tmp/workspace-check-delivery.log`；针对性日志 `tmp/workspace-targeted-final.log`，不是历史验收复用。

真实 Desktop 使用仓库现有 macOS harness：Logseq 0.10.9 / SDK 0.3.4，应用副本、home、profile、Graph、SQLite、descriptor 与材料目录全在本工作树 `tmp/logseq-sandbox/`。先确认 19333 未占用，只连接 URL 落在该测试应用副本的 CDP target；未加载生产 Logseq。验证实际 SDK root 身份、原文读取与文件发布，提交自然批注后 DB 事件自动更新；子块没有 id 写入。通过宿主已注册命令唤起目录表单，结束原生编辑后点击关联，实际结果与截图均已读回。

tasksEnabled=false 重载后导航只剩工作视图/材料；身份核验后停止本工作树的 Kernel，workspace.refresh 返回 checked，真实材料接口保存到绑定目录。移动整个工作目录后，旧路径只能读缓存且 last-known，显式重关联保持 workspaceId 并恢复实际刷新。身份核验后停止/重启隔离 Desktop/Kernel，插件从持久绑定及 manifest 恢复同一身份与搬迁后路径，旧正文/批注仍在。

Desktop 发现 0.10.9 的 missing-parent stat 为 `{}`、listdir 为 null，首次 manifest 读取原本拒绝。修复集中在工作区 optionalRead：只有核验父目录确实缺失才视为文件不存在；已有但不可读的记录继续失败关闭。回归已覆盖这两个实际分支，未改共享 host。

本地证据：`tmp/logseq-sandbox/evidence/workspace-bind.json`、`workspace-update.json`、`workspace-task-disabled-offline.json`、`workspace-materials.json`、`workspace-command-entry.json/png`、`workspace-relocation.json`、`workspace-restart.json`、`workspace-final-code.json`；不提交 descriptor/token 或整份环境文件。最终完整构建后重载测试插件，再核验同一身份、搬迁目录、来源版本与 checked 结果。验收后使用 harness 核验归属并停止本工作树的 Desktop/Kernel，保留 Graph、文件、记录与证据。

未实机验证：真实双 Graph 及 A→B→A 晚到竞态（自动化覆盖）、Graph 断连（DOM/核心覆盖）、DB Graph（DOM 与既有 identity 回归覆盖）、中文 IME、系统粘贴/Undo、外部进程竞争、断电和长期使用、Windows/Linux。正文修改使用真实 SDK 提交，不能冒充真实输入法或用户键入验收。外部 agent CLI/MCP transport 没有实现；文件可承接不等于完整远端集成。

## 提交与共享改动

- `42b07b0`：材料共享绑定窄端口及显式绑定枚举，默认构造行为兼容。
- `00ff900`：workspace 六个核心模块、薄安装器、核心/DOM 测试、产品与架构说明。
- 组合根提交：index.ts 的 import/install/dispose/API 及材料 provider 注入；组合根回归调整和本交接。

功能/组合根的实际 SHA 以本分支最终 `git log` 和交付回复为准。提交仅显式暂存本任务路径；未 push、建 PR、合入 main、部署或删除工作树。

必要共享变动只有 `workspace/material-context.ts`、材料 controller 的可选绑定命令注入，以及 index.ts 最小组合。没有改 host、PluginRuntime、公共样式、PanelCoordinator、work-view 实现、Kernel/domain/contracts/sqlite 或 lockfile。既有 read/open/openMaterial/close/readMaterials/materials/apply 保留，apply 没有正文写入。

## 后续接线与限制

1. 合入 view-lenses / content-writeback 时，统一消费正式 `workspace/source-protocol.ts`；已绑定工作可从 refresh.observed.primary 获取真快照，未绑定块可用同一 SourceReader 窄宿主端口，不能导出 work-view 草稿/布局冒充来源。
2. 外部 agent transport 单独设计并接入；本轮没有可从另一个 session 远端调用的 CLI/MCP 命令，也不恢复孤立原型。
3. 未持久化子块 UUID 的重索引限制保留；Graph 身份仍是宿主 name/url，不自动认领另一 Graph 的入口。
4. 材料整体搬迁后的原文件定位仍遵循材料模块的显式登记/重定位规则，不静默重写旧 locator 或绝对路径。workspaceId 恢复不表示所有材料外链已自动修复。
5. 无 manifest 的既有管理目录、极端 pointer rename 竞争、符号链接真实路径及长期版本清理仍需独立处理。现有 FileIO 没有 realpath / 跨进程 CAS；本轮未扩大其保证。身份冲突和旧记录不可读时保留并拒绝猜测。

本轮不要求其他并行分支先存在：材料已真实接入，缺少 lenses/content 分支时关联、读取、更新和恢复仍完整可用。
