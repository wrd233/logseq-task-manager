# Work Evidence：交互式工作还原

在 DSH 的“工作变化”中，明确选择一个 Git 根目录，点击“同步一下我刚才做的事”。本模块把上次有效检查点之后的新提交与当前工作区变化合成文件条目，再允许逐条分析、按工作目的归组、回答/修订/跳过关键问题，最后保存并引用工作交接。

产品依据：[模块 06](../../product-design/modules/06-工作证据与历史.md)、[交互架构](../../product-design/architecture/02-Work-Evidence交互式工作还原.md)。本轮实现与真实宿主验收见 [reconstruction/ACCEPTANCE.md](reconstruction/ACCEPTANCE.md)。v1 的 [ACCEPTANCE.md](ACCEPTANCE.md)、[可靠性验收](reliability/ACCEPTANCE.md)与 [v1.1 体验记录](../2026-10-22-work-evidence-ux-acceptance.md)保留为各自版本的历史证据；本轮信息层级与隔离宿主调整见 [ux-v1/README.md](ux-v1/README.md)。

## 个人体验入口

双击 `apps/dsh-plugin/scripts/work-evidence-experience.command`，按菜单启动/继续、生成包含新提交的样例、停止或重置。无需管理 RUN_ID。见[按点击顺序的短指南](personal/开始体验.md)与[本轮验证](personal/验收.md)。

## 体验

1. 选择自己的 Git 根目录并同步；首次只建立初始范围，不推断更早工作。后续包含新提交及当前已暂存、未暂存、未跟踪、重命名和删除。
2. 默认浏览文件列表，展开具体文件查看提交、暂存或未暂存差异。提交与工作区来源保留在同一文件条目，不按每个 commit 重复堆成文件列表；每条先显示新增、删除、重命名或修改及提交数，分析状态只在需要时出现。工作区内部记录（如 `.task-workspace`）默认折叠保留，正文受限。
3. 需要 Agent 解释时，展开“分析范围与相关上下文”，确认允许当前 DSH 模型读取本轮允许范围内的有限差异与已保存说明；然后点击具体文件的“分析此条”。不配置模型也能观察、查看、保存和整理交接。
4. 有问题时回答，或基于当前解释修订，或跳过。回答和修订作为用户说明独立保存；已允许分析时只更新此条。未允许模型、分析失败或被中断时明确保留待更新状态和原解释。跳过不会补造答案。
5. 随时“整理交接草稿”，检查、编辑后保存。待分析、失败、来源变化及未知项仍保留。已保存记录可重开；修订另存新版并指向原记录。
6. 在历史交接中“准备交接引用”，检查预览，再“确认插入原生草稿”。只追加引用，不覆盖原草稿，不发送。原始观察也可按所选文件单独引用。
7. 需要整体查看关系时切换“查看结构变化”，选择文件查看同一份证据；列表仍为默认。

查看某文件差异时，其他工作区文件的无关变化不会让该文件差异失效；该文件本身或来源版本改变仍会拒绝旧正文。

选择证据目录不会更改 DSH 会话的工作区、cwd、Logseq 绑定或工具权限。分析通过宿主 LLM 服务完成，无 Agent 工具、无原生会话提交。文件正文和上下文是待核对数据，不是执行指令。

## 独立启动与继续运行

在本 Worktree 根目录使用项目要求的 Node 20 管理依赖，DSH 使用本机 Node 24；不改全局 Node 或日常 DSH profile。

```sh
PATH=/opt/homebrew/opt/node@20/bin:$PATH npm ci --no-audit --no-fund
PATH=/opt/homebrew/opt/node@24/bin:$PATH node --import tsx apps/dsh-plugin/scripts/work-evidence-playground.mjs new --clean
PATH=/opt/homebrew/opt/node@24/bin:$PATH node --import tsx apps/dsh-plugin/scripts/work-evidence-playground.mjs start RUN_ID
```

`new` 返回确切的 RUN_ID、合成 Git 仓库和专属运行路径。可用 `new`（不加 `--clean`）建立带暂存/未暂存/重命名/删除/未跟踪样例的仓库。不要在自己的实际项目上模拟破坏性故障。

每次运行独占 `tmp/work-evidence-ux/run-UUID/` 中的 bundle、CLI、状态、日志、DSH_HOME/profile 和 documents。首次监听回环地址的系统分配端口；`address.json` 记录实际地址，`origin.json` 保留浏览器来源。同一运行重启复用该地址，使未保存文字和 DSH 草稿的同源备份继续可用；端口被占用就报错，不接管占用服务或静默换端口。需要另一套环境时新建运行。

```sh
PATH=/opt/homebrew/opt/node@24/bin:$PATH node --import tsx apps/dsh-plugin/scripts/work-evidence-playground.mjs status RUN_ID
PATH=/opt/homebrew/opt/node@24/bin:$PATH node --import tsx apps/dsh-plugin/scripts/work-evidence-playground.mjs stop RUN_ID
```

`stop` 发出停止请求；先用 `status` 确认 parent/host 已退出，再 `start`。启动器拒绝复用仍存活的自有运行。浏览器首次需使用启动终端打印的本机认证 URL；`host.log` 对 URL token 脱敏，不将认证 URL入库。模型由用户在该隔离 DSH 中配置；不要把密钥写入仓库、日志或聊天。

本轮实际体验运行：`run-212cb4eb-374d-45da-b15f-fc952994b049`，地址 `http://127.0.0.1:58060`。它保留两次观察、真实模型解释、澄清、跳过、交接修订和未发送原生草稿。自己的新仓库使用另一个 `new` 运行，避免把验收样例当作实际工作。

## 存储、来源与限制

复用 EvidenceStore，不建立第二套 Formal Kernel Evidence。观察、分析起点/结果/失败、用户澄清、交接都是独立不可变记录。补充与交接的修订追加保存；请求回执丢失时原 key 重试，输入期间的新文字不会被旧回执清掉。历史损坏明确显示部分可用；不把缺失记录当作没有工作。

- 保存 Git 元数据、来源版本/引用、分析输入的来源哈希与截断标记、模型解释和主动输入的文字。原始 diff、会话正文和 Graph 正文不批量存档。哈希不是签名，不承诺防本机管理员篡改。
- 每个 Git 子进程有 5 秒/1 MiB 输出限制；增量元数据整理有总预算，最多 100 个提交、500 个文件。范围不完整、历史改写、没有 HEAD 或并发变化均保留明确状态；不完整观察不推进有效检查点。
- 文件条目保留提交、工作区来源和重命名别名。路径聚合不是旧未提交正文与后来提交正文完全相同的证明；不保存全量历史正文，因此不承诺按内容精确去重或完整历史回放。
- diff 只在主动查看或明确允许该条目分析时读取。当前文件最多 256 KiB，diff 最多 64 KiB；未跟踪内容不自动读取；敏感路径、符号链接/gitlink、二进制、大文件及明显凭据正文受限。过滤器不是完整秘密识别器，投递前应检查范围，发送草稿前仍应审阅。
- 分析仅取所选文件至多 3 个提交差异及两侧工作区差异，正文总预算有限；用户澄清优先保留，差异和上下文截断可见。模型最多 30 秒，不自动升级、重试或调用工具。
- DSH 上下文只读取用户勾选的当前会话最近可见文本，要求 cwd 与证据目录完全匹配；不取系统提示、推理、工具结果或附件。
- Logseq 上下文只经已有 CompanionTransport，读取所选目录已有可信连接的 `collaboration.read`；要求目录精确匹配、当前读授权与来源版本仍有效，不建绑定、不刷新协作现场、不写 Graph。没有连接时明确记录不可用，不伪装成已检查。
- 浏览器未保存草稿属于同一来源的本机临时备份，正式记录以保存回执为准。清除浏览器数据、切换设备/浏览器或换运行不会迁移未保存文字。无需答完问题即可交接；尚未分析或更新的说明保留未知。

禁止自动 commit、发送、创建/完成正式任务、写 Journal、Logseq Graph 或正式 Kernel。本轮没有增加常驻扫描器、全盘索引、完整文件快照或结构回放。

## 不依赖模型的引用核对

构建与状态均可指向本 Worktree 专属目录：

```sh
PATH=/opt/homebrew/opt/node@24/bin:$PATH WORK_EVIDENCE_RUN_DIRECTORY="$PWD/tmp/work-evidence-reconstruction-build" node --import tsx apps/dsh-plugin/scripts/work-evidence-build.mjs
/opt/homebrew/opt/node@24/bin/node tmp/work-evidence-reconstruction-build/cli.mjs /绝对路径/专属状态目录 read SCOPE_ID OBSERVATION_ID
/opt/homebrew/opt/node@24/bin/node tmp/work-evidence-reconstruction-build/cli.mjs /绝对路径/专属状态目录 work SCOPE_ID OBSERVATION_ID
/opt/homebrew/opt/node@24/bin/node tmp/work-evidence-reconstruction-build/cli.mjs /绝对路径/专属状态目录 items SCOPE_ID OBSERVATION_ID
/opt/homebrew/opt/node@24/bin/node tmp/work-evidence-reconstruction-build/cli.mjs /绝对路径/专属状态目录 commit-diff SCOPE_ID OBSERVATION_ID ITEM_ID COMMIT_SHA
```

`read` 返回观察/用户意图；`work` 返回分析、澄清、交接的原记录、哈希与派生视图。交接引用格式为 `work-evidence:v1:SCOPE_ID:OBSERVATION_ID:handoff:EVENT_ID`，可在 `work.records.items` 中按 ID/哈希核对。既有 `select/scopes/observe/history/note/diff/quote` 命令继续可用。

## 共享结构工具与整合边界

结构历史分支的现有视图直接依赖 StageHistory、structureFrame 和来源选择，不能整块搬入。本轮将通用节点/边、分层布局、选择与展开放在 `apps/dsh-plugin/src/structure-view/`；Work Evidence 仅把文件和 Agent 主题适配为结构。工具不负责 Git、分析、历史存储或正式任务语义，也未依赖整个结构历史业务模块。

本轮独立 bundle 已接实际 DSH 扩展机制。后续整合仅需由串行整合者把该 bundle 加入目标 profile，传入专属 `stateDirectory`；非默认 Companion 状态目录另传 `workspaceStateDirectory`。没有修改共享 client/index/service/styles、Kernel、公共契约或根依赖，也没有合并 main。
