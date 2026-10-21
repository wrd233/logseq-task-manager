# Capture / Inbox A 验证记录

日期：2026-10-21，Asia/Shanghai。实现分支 `codex/capture-inbox-v1`，输入共同基线 `f992619025f5b4d086a2e8ee1729936d488ecc89`，已获取 G2 方案批准 `75c8c44982e7348413c8cdd207f3eb69cb47b904`。独立 clone，不改日常 Graph/profile。**整体 Goal 未完成：等待共同基线真实宿主入口/RPC/来源验证/原生草稿适配及真实 DSH/Logseq 验收。**

## 已执行

- Node 20.20.2 / npm 10.8.2，`npm ci --no-audit --no-fund`、初始 `npm run typecheck`、`npm run build`，均退出 0，根依赖/lock 无变更。
- `node --import tsx --test apps/dsh-plugin/tests/capture-inbox.*test.mjs`，修订后 **30 / 30 通过，退出 0**；其中新增控制器连接真实文件 Store 的无项目/未知回执/重启恢复/继续编辑联合测试。同一请求只产生一条记录。可靠草稿回执后释放内存中的已确认候选快照，避免累积保留每次键入的文本副本。
- 其中真实文件系统测试使用 macOS 私有临时目录与 0600/0700 文件，不用内存替身；覆盖 fsync/读回、子进程重启、两进程并发 CAS、同 key 同参数/不同参数、新 key 同正文、请求意图已发布而正文未发布、回执丢失、追加版本/恢复/归档撤销、完整 scope/session 分区、对象版本和连接代次不换分区、文件与目录级 symlink 拒绝、损坏数据失败关闭。
- controller 测试明确使用合成 Store/SharedUiPort，覆盖异步续写、partial/unknown/failed/conflict 不清输入、同键重试、保存失败不关闭、编辑冲突显式 rebase、搜索包含归档和历史、今天/全选、同步 span 工厂时序、busy/stale/unavailable 保留引用、连接代次改变拒绝插入、首次读回失败重开不覆盖新输入、关闭期间和保存后刷新期间继续输入不隐藏。
- 独立审查先发现了初版测试未覆盖的六个问题；修订增加父目录检查、同一历史快照生成 parent、精确请求版本回执、首次读回失败保护、关闭和刷新期间输入代次检查，并补入回归。不能以初版 22 项通过替代这些修订。
- 修订 `4870b373` 的 29 项加基线 `service.test.mjs`、`workspace-context.test.ts`、`workspace-reading.test.ts`、`agent-workspace-entry.test.ts`：**54 / 54，退出 0**；受影响 Logseq workspace typecheck、DSH workspace build 均退出 0。
- 局部 ESLint 和受影响 Logseq workspace typecheck、DSH workspace build 均退出 0；新 JSX 另由独立浏览器预览显式打包，不能把原入口 build 当作新模块已注册。

## 浏览器合成证据

React 19.2.0 隔离预览运行于本机回环地址，模拟 Store/Port，不接真实 Graph、原生 DSH 草稿或真实模型；临时预览依赖在仓库之外，未改依赖/锁文件。

- 首帧正文获得焦点；DSH 内钉住后可靠模拟回执清空正文并重新聚焦。
- 紧凑列表、当前结果全选；模拟 native busy 后保留原始/当前正文与 session 来源，没有发送。
- 320px 内容容器内改为单列、控件换行，无可见横向溢出；使用容器查询，宽视口中的窄侧栏同样适用。
- 模拟 unknown 回执保留正文；Escape 关闭返回触发按钮，重开保留输入；双击进入编辑并自动聚焦编辑正文，已在修订浏览器预览复核。Inbox 打开时搜索框获得焦点，编辑草稿重开则回编辑框。

证据：[引用忙时保留](evidence/inbox-busy.png)、[窄容器未知保存](evidence/narrow-unknown.png)、[窄容器 Inbox](evidence/narrow-inbox.png)。截图包含“合成数据预览”标签。替身键入不是物理中文 IME；图片不证明真实持久化或真实宿主调用。

## 尚待共同基线/真实宿主

G1/G2/G4：主代理核验修订后，批准私有根、可信 context/来源核验与认证 RPC、入口挂载、原生 revision-guarded 插入、returnFocus。共享提交先发 main，再普通 merge 获取；A 不修改共享核心或另一线目录。

真实独立 Graph/profile 中验证：已有原生草稿、异步继续键入、换 session、提交锁定、关闭返回、连接/服务重启、真正的入口/来源/窄屏/减少动效。系统重启/掉电、物理 IME、跨设备同步未验证；单设备限制明确。主代理整合后执行根 check，检查文档生成差异。

可逆默认、边界、数据恢复见 README.md；卸载入口不删除私有数据，未知操作沿用原 key；旧正文恢复新增版本，不覆盖旧事实。首版没有 Journal、正式任务写入、系统跨应用置顶或自动发送。

## 交回

模块 PR：[Draft #1](https://github.com/wrd233/logseq-task-manager/pull/1)，在真实接线/宿主验证完成前保持 draft。主代理正在独立复审 `4870b373`，本线不自行合并 main。外部 DSH 尚未获得此最小目录的明确外发授权，未提交任务、未变更 approved_roots；独立提示词已交付 `FRONTEND-TASK.md`，前端在本机实现。
