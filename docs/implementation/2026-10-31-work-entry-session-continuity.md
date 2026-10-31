# Goal 1：Logseq → DSH 工作入口与会话连续性

分支：`codex/work-entry-session-continuity`。基线：开始时 fetch 后核对的远端 main `018c3368bbe764a55cce466db36c8fcc4da43e37`，交付前再次核对未变化。本分支不合并 main。

## 行为与复用

Logseq 标题旁、工作视图、块右键、命令面板、工具栏、已关联真实 Logseq 来源的正式对象讨论入口，共用 `openWork(target)`。普通子块选择最近已识别工作祖先，补齐 `[Project]`。无工作祖先则保留当前块临时范围；目录关联不等于加入全局工作目录。正式身份由 Kernel anchor index 重新核验，使用真实 objectId。正文、整理、TODO、文件授权入口保持各自原有的精确范围。

复用一键协作分支的 `ensureDshWork`、只读 handoff、原生 Workspace/Session 创建与导航，以及正文/文件独立读取思路。只整合必要代码；main 的 WorkEvidence、Structure History 注册及其余并行模块保持。没有修改其他 worktree 的未提交文件。

现有 BindingStore 升为兼容 v1 的 schema 2，增加 WorkRef 与 lastOpenedAt。绑定不更新时间；公开 `sidebarRight.mounted` owner 订阅与浏览器可见性/焦点事件记录实际打开，后台标签页不记作用户打开。宿主原生列表、inspect 和 archive set 核验存在性与 cwd。恢复按 lastOpenedAt 排序，跳过已删除或归档会话。

Work 内新建调用原生 create，预留原生 ID 保证不确定回包可恢复；只关联身份，不复制聊天、草稿、旧 request 或开场总结。General 恢复最近未关联会话，缺少记录时通过原生 Workspace 创建空白会话。切换不解绑、迁移或归档原 Work Session。原生其他新建入口维持 General。

Session cwd 与登记目录使用真实路径比较。错配拒绝读取/执行和继续进入，保留旧会话；明确的新建入口在正确目录创建另一段原生 Session。辅助便携引用失败只提示，并有独立重试保存入口。正文、文件、指导分开处理；旧正文仅作带读取时间的显示缓存，不成为模型当前来源或授权。

## 关键文件

- `packages/contracts/src/work-ref.ts`：稳定身份值类型，无新增数据库。
- `apps/logseq-plugin/src/features/agent-workspace/dsh-work.ts`、`installer.ts`：祖先解析、目录复用、统一进入、Graph 代次取消。
- `apps/logseq-plugin/src/index.ts`、`host/reading-entry.ts`、`features/task-center/controller.ts`：入口接线；正式对象复核 Kernel 身份。
- `apps/dsh-plugin/src/service.mjs`、`handoff.mjs`：BindingStore、最近打开、原生创建恢复、cwd 保护、局部失败。
- `apps/dsh-plugin/src/index.mjs`、`client.jsx`：生产 RPC 与原生 UI 导航，保留 WorkEvidence/Structure History。
- `apps/task-copilot-cli/src/dsh-handoff.ts`、`workspace-server.ts`：本机只读交接定位与现有认证边界。

## 工程检查

最终 `npm run check` 成功：849 项 workspace 测试、5 项隔离启动器测试、12 项依赖边界测试，均无失败；类型检查、lint、构建和边界检查通过。taste 评估 PASS，未自动更改活跃配置。新增测试验证最近打开顺序、v1 迁移、引用失败、创建回包丢失、归档、cwd、局部失败、自然 Project、正式身份与 Graph 切走又切回的请求失效。

这些检查不替代下面的真实双端操作。

补充运行 `apps/dsh-plugin/tests/host-proof.mjs`：8 项生产插件/真实 HTTP companion/安装版 DSH SDK 集成检查通过；该补充测试使用合成 Logseq SDK 与本地脚本模型，与真实双端验收分别记录。

## 真实宿主验收

环境：macOS，Logseq 0.10.15 独立副本与合成 Graph；DSH 0.2.1-rc.2 独立 HOME/DSH_HOME、原生 `standard` preset；专用端口 3087。宿主未注入替代 Graph API 或模拟 UI。原来的 Logseq、3081 DSH 和后台服务未停止或改配。原生会话与持久化均落入本 Goal 专用状态目录。

证据见 [host-results.json](evidence/work-entry-2026-10-31/host-results.json) 与 [ui-observations.json](evidence/work-entry-2026-10-31/ui-observations.json)。后者是 CUA 真实窗口操作的文字记录，不是生成的界面截图。证据中的 `$FIXTURE_ROOT` 仅替换本机绝对路径。

| 验收项 | 实际结果与证据 |
| --- | --- |
| 1 普通子块进入事务 | 真实 Logseq 命令面板“在 DSH 继续”解析到根 `c731…0001`；原生 DSH 显示该事务。 |
| 2 已有目录复用 | 反复进入和 Graph 返回后复用同一 Registry workspaceId/目录，无重复填写。 |
| 3 最近有效 Session | 原生 owner 打开时间持久化；后续继续恢复对应原生 Session。 |
| 4 原生列表打开旧 Session | 从原生列表选择会话 A 后，再从 Logseq 子块进入，恢复 A 的原生消息和草稿。 |
| 5 Work 空白新建 | 原生投影 blank=true、turnOutline=[]、turns=0，正确 WorkRef/cwd。真实密钥启用后再验：官方模型请求数 2→2，新增为 0。 |
| 6 General 独立 | General 无 WorkRef，原生输入和文件控件可用；Work 草稿 `draft-A-preserved` 与 General 草稿 `general-draft-independent` 分别保留。 |
| 7 切回 Work | 原生会话 A 与 Logseq 继续均恢复工作会话；General 草稿在再次切回 General 后仍在。 |
| 8 辅助引用失败 | 专用引用文件临时换成目录，生产 reference RPC 返回 SESSION_RECORD_INVALID；新原生会话仍打开，重试不新建；恢复文件后保存成功。创建回包丢失另有自动化恢复测试。 |
| 9 cwd 错配 | 专用宿主停机后注入有意不一致的旧关联；UI 保留 `wrong-cwd-draft-preserved` 并拒绝继续，生产读取返回 SESSION_CWD_MISMATCH；生产 newWork RPC 在登记目录新开，原会话 cwd 未改变。 |
| 10 局部失败 | 真实文件目录 EACCES 仅列入 fileTruncation；真实 Logseq FileStorage 指导记录损坏时报错；两种情况下正文仍成功读取 3 块。故障文件均已恢复。 |
| 11 Graph 隔离 | 第二份 Graph 含相同根 UUID，切换后生产 read 返回 WORKSPACE_OFFLINE；旧正文保留并标明上次成功读取时间，未显示第二份 Graph 正文。返回需显式重新连接，未恢复写授权。 |
| 12 没有聊天副本 | BindingStore 只有 sessionId/WorkRef/binding/lastOpenedAt；便携文件只有 Session reference。扫描插件运行时存储不含合成原生消息/草稿标记。会话消息、草稿、模型运行均归原生 DSH。验收 JSON 仅采样原生 RPC 投影作为证据。 |

会话 A 的第一次手动测试故意阻断外网，产生原生失败消息及 6 次被拦截的重试，用于使旧会话出现在原生列表。随后按用户提供的密钥，通过 DSH 原生凭据接口保存到隔离凭据存储；只开放 `https://api.deepseek.com`，保持 TLS 校验。一次明确的合成测试在原生 DSH 完成，HTTP 200，返回 `DSH_KEY_TLS_OK`，原生统计 1 轮 1 步。两次官方请求包含原生标题生成；均发生于明确手动发送之后。再次创建空白 Work 会话时请求数未增加。密钥未写入代码、Git 或交付证据。

## 支持边界

- 本轮未实现全局工作搜索/catalog，也未完成 Logseq 阅读 A、DSH 读取 B 的完整独立路由。原有 scope/lease、Graph generation、版本和权限检查仍生效；不满足检查时明确拒读。
- 正式对象入口支持当前 Graph 中经过 Kernel 核验的真实来源锚点。Kernel-only 或没有当前 Graph 锚点的对象明确提示缺少来源，未伪造 UUID 或擅自创建 Formal Task。
- 空白会话无自动模型请求已在当前安装版本与 stock `standard` preset 验证。自定义 preset 的插件可能有启动行为，需要另外验收，不能仅由本插件“不发送 prompt”推出保证。
- v1 没有历史打开时间，迁移值为 0；第一次实际打开之后才有可靠最近时间。不能反推出安装之前用户最后看过哪一段 General 会话。
- 未宣称长期运行、重启后的完整双端恢复、物理中文 IME、生产 Graph 写入或所有其他原生新建入口继承 Work。

## 后续 catalog 所需接口（本轮未实现）

1. 复用 WorkRef 与 `openWork(target)`；发现结果携带身份和显示元数据，不携带旧 grant/token。
2. Logseq 提供自然工作标题/类型/位置及明确收录页面的元数据投影；普通 TODO、普通正文和只有临时目录关联的块不自动进入 catalog。
3. Kernel 复用 `listObjectAnchorIndex()` 的真实 objectId；无 Logseq 锚点的工作需要明确目录与来源接口，不能构造假 SourceScope。
4. DSH 复用 BindingStore.recent(workRef)、原生有效性检查与 handoff 进入；catalog 快照带 lastSeenAt，只用于发现，不作为正文读取权限。
5. 独立只读路由后续显式携带目标 SourceScope，并由宿主重新核验当前 Graph 代次与 lease；写授权继续单独明确授予。

## 重验入口

使用 Node 20 运行 `scripts/work-entry-desktop.mjs prepare|start|status|stop` 管理本 Goal 独立 Logseq 与 companion；使用 Node 24 运行 `scripts/work-entry-dsh.mjs start|status|stop` 管理独立 DSH。默认阻断外网，只有明确 `start --allow-official-model` 才允许官方 HTTPS。真实密钥通过原生设置界面保存，不作为参数交给证据记录脚本。`work-entry-faults.mjs` 的故障操作仅接受本 Goal 的专用目录。

验收后已停止本 Goal 的两个宿主与 companion，保留忽略目录 `tmp/work-entry-desktop` 中的私有状态供重验；未停止其他实例。

本轮使用开发目录加载构建产物，没有发布安装包或修改用户全局 Provider、登录和主模型。
