# 阅读编排、Agent 协作与最终联调：实施记录

状态：**实施中，未完成交付**。不作为生产安装建议，也不把函数测试记为 Desktop 通过。

## 当前安装包与已核验闭环（2026-10-09）

当前可加载 ZIP 为 `docs/implementation/assets/simple-start-reading/task-copilot-workbench.zip`，SHA-256 `c20cfa893a38e7f1c034e3358da2a1d691fcae6905cce11b50f9dfe284cba688`。实际应用源码提交为 `cda68037f82dfb5496d3a9427e4d2a4562d5580c`；后续证据与交接提交不改变包内应用身份。旧包 `d564a87c…` 的记录仅证明旧版本，不能混入本包结论。

在仓库外的 `integrated-layout-final` 实例逐项核对了 615 个包内资源，使用自己的 Graph、profile、材料与通道。当前[同包核心证据](assets/reading-agent/package-layout-final-core-evidence.json)实际通过：101 来源的两种读法、未授权正文/文件/TODO 拒绝；三条真实 CLI/Graph/文件/Journal 协作演练；共同指导一处更新、两工作重读同版并保留不同项目要求；并发新增条件使旧方案与旧格式提议失效，明确保留当前原文后仅批准一处标记；103 来源及已完成子项重启仍在，全部连接权限撤销。

五类中文 MD、DOCX、PDF、XLSX、PNG 均从目录、原生稳定链接、阅读正文链接进入真实预览，独立窗口与面板 ID/SHA 一致，24 份原件字节保持。实际可读内容包括 Markdown 表格/代码/本地图片、Word 标题/列表/表格/图片、PDF 中文文本与扫描页、Excel 合并区域及第二张表 101–200 / 351 行、720×320 PNG。公式缺少保存值明确报告为部分呈现，不计算公式。两个根的同名文件 ID/正文/SHA 不同；两层目录与外部新增文件在无 Agent 连接时可用。系统窗口菜单实际移动并调整尺寸；自由拖动仍未证明。

旧包的原结构文字被放入 18px 控制列，真实画面不可读。已修复网格文字列，回归先失败再通过，新包实机 101 行最窄文字列 223px，正文列位置为 3。`tmp/structure-layout-check.log` 的全量检查为 **799 项通过、零失败/跳过/取消**，`tmp/structure-layout-package.log` 保留生成结果。测试数量不能代替上述 Desktop 核验。

保留一次换行 PDF 链接的 AX 自动点击误点：DOM 外接矩形中心落在来源行的空白区域，两段链接文字都不包含中心。实际可见文字点击打开同一 PDF，清除这次误点产生的定位后重验五类链接，来源与高亮集合均保持；原失败快照未删除。期间原 Desktop/companion PID 已不存在，保留 Graph/profile 后重新启动同包；未把跨重启快照组合成资源释放证据。

当前本地证据/ZIP 交付提交为 `5649f1f`，包内应用仍是上述 `cda68037…`。[工作范围释放](assets/reading-agent/package-layout-final-work-scope-evidence.json)随后在同一 PID/宿主 target 实测：PNG 主预览与独立窗口 2→0，已观察的旧 blob 全部不可读；切换到讨论工作后，原工作状态和迟到方案选择均拒绝为 `WORKSPACE_OFFLINE`。插件 document 监听 223→71、宿主 document 46→44，常驻宿主 worker 1→1；这不表示全部监听/worker 都应被清除，也未证明长期无泄漏。

[页面闭环](assets/reading-agent/package-layout-final-page-evidence.json)也在本包重跑完成：真实页面 UUID `6ac905ed-42ac-4361-a00a-504c7d481c1a`、103 来源，没有伪造可写根块；正文/TODO/格式/阶段调用均拒绝为 `BLOCK_SCOPE_REQUIRED`。独立文件许可保存实际比较文件，重试仍是材料 `03c5e013-1fdf-c7a7-b0c1-9f32cb24491f`；Graph 和用户 WORKSPACE 字节不变。块/页面切换使旧调用失效；重新只读连接仍返回同一来源和文件。此过程中旧块描述符实际返回 `CONNECTION_STALE`，如实记录，不把它改写成另一种拒绝码。核对脚本现接受协议已有的过期/撤销拒绝码，未放宽应用权限。

[原生已保存输入](assets/reading-agent/package-layout-final-input-evidence.json)在本包实测：选择真实输入中的一段文字，点“目标”标题，再打开正文 PNG 引用，textarea 的 backend node `71635`、文字和 9–21 选区均保持；Graph 字节和保存原文不变，文件点击不改变来源集合。标题实际标记 6 来源/6 已挂载/0 当前可见，没有把屏幕外来源说成已可见。焦点按明确点击移至阅读控件。这次输入包含已保存文本，不能证明未提交草稿或物理 IME。

[同包生命周期证据](assets/reading-agent/package-layout-final-lifecycle-evidence.json)完成工作/Graph 切换、正常禁用图片与 PDF 四组检查，每组前后都是 PID 3226 与同一宿主 target。Graph 切换撤销真实切换前阅读邀请，迟到 submit 与旧 status 均返回 WORKSPACE_OFFLINE；PNG 两预览与旧 blob 释放，PDF 两预览及两个额外 worker 释放，禁用后的插件 iframe 为零、宿主监听 44→18。两个 ASCII 资产副本和原件、主合成页面字节均保持。此结论不证明所有定时器、长期无泄漏或特殊文件名 URL 兼容。

带现场去协作也保留同一原生输入节点和 9–21 选区，现场明确 `nativeDraft included=false/editing=true/reason=saved-source-only`，只导出 103 份已保存来源；保存文字没有因导出强制退出编辑。

本包还需实际 Kernel 正式对象边界复验，再做逐条完成审计与最终交付。旧包对应路径有实测记录，但本段不把它们当作新版通过。物理 IME、未提交草稿、原剪贴板恢复、其他平台/宿主版本、普通 IO 竞态、整套升级/降级/恢复仍未证明。原生产审计的自动 Fake 正式化、schema 23/CLI 22 恢复不匹配、生产路径与写入竞态等风险没有因此修复；本包仍不建议直接用于重要生产 Graph。

## 以下为历史阶段记录

共同 BASE_SHA：`5b05d156cc03b37956d6f77de2d10213a6cb58e3`。按 REMOTE-START 明确 fetch `codex/workbench-visual-refresh` 后解析并固定；它包含视觉刷新 `eb07013d119584dbd3c68012541f1355118d2b0b` 和配套资料。B 分支为 `codex/reading-and-agent-collaboration`，使用独立管理工作树；用户主工作树 main 不变。Node 20.20.2 / npm 10.8.2，依赖独立安装。真实本机 Logseq 0.10.15/macOS ARM64 已开始隔离局部验收，完整最终安装验收仍待完成。

A 完整 SHA：用户于 2026-10-09 明确交付 `d0c38706b79c63f6f5b15e16286e1c49d28736ff`，其中 handoff 位于 `docs/implementation/materials-and-preview-handoff.md`。共同 merge-base 核对为上述 BASE_SHA；A 实施提交 `98c0d4e6d5122ff8a763683e96e25dd511928e36` 是该交付的祖先，之后两次提交仅增加可携带样本、交接及证据。已在 B 本分支合入这一明确提交，合并提交 `a5e0888c9d512045bf6805437517f4db67b44b67`，controller/index 自动合并、没有文本冲突；组合行为仍须验收。不新建整合分支，不推送、PR、main 合并、发布或联系其他聊天。

已实施：

- schema v1 有限可组合阅读单元、完整来源/版本与父子依赖校验；材料入口只接受当前许可集合。
- 真实身份来源集合扩展，重复句不串 ID；小标题主要集合及必要祖先上下文可核对。
- 阅读控制器保存实际请求及方案，校验请求/基础版本，限制重用 ID；相同重试幂等。取消、范围切换、历史/输入保护、卸载和迟到读取有失效回归；来源失联保留可核对旧方案但撤掉当前呈现，选择旧方案时重新核验来源及材料范围。
- 101 块、4,041 中文字符、四层合成原文及可携带生成脚本；两种不同有效布局的函数回归。
- 界面复用主要来源节点，支持连续段落、分组、对照列与材料入口；原结构/多方案切换保留有效书签、节点、选区和展示焦点。标题/上下文没有可写 UUID，伪造来源 HTML 不能成为写入落点。
- 正文点击与 Enter/Space 默认走独立只读来源集合端口，只有显式编辑入口进入原生编辑。结果区分实际挂载、屏幕可见、折叠/未挂载与输入阻止路由；Esc/范围变化/卸载释放标记与监听。原生草稿/组合输入期间不切换布局、不强制结束输入。
- 既有私有 companion/CLI 新增 `reading request/read/submit/select/original/cancel/highlight/clear`。请求绑定 instance/connection/client 标签；外部不能指定 actor/root/grants。标签是关联字段，不是独立认证；受信本地连接及 ScopeLease 才是许可来源。连接撤销使等待中的选择/方案和高亮失效。
- 重排后重复展示完整原序邻域，不能把类别标签当作语义独立证明；上下文展示有总量边界，材料列表/同范围重绑定会重新核验或撤销方案。
- 本地“带当前工作去协作”保存本次请求、必要背景与祖先、真实保存原文/版本、原有 manifest/发布 revision、实际材料引用、读法状态、共同指导版本和本次许可；Node 继续使用既有 files/session 观察。外部只读 `collaboration.read/refresh`，不能自选本次请求或权限。scene 与 current 分开，旧现场不冒充当前 checked 来源；草稿不导出、未知结果仍查询原 Journal。
- 一份共同指导使用插件全局 FileStorage 源，各工作只存差异；本地明确保存有版本与读回校验，读取失败不静默覆盖。`guidance.read` 返回实际文本/hash/key/loadedAt，不承诺任意 Agent 或现有聊天自动重读。实际启动语使用当前加载插件的 CLI 文件及私有通道位置，没有可靠链接不编造。
- 新协作入口只建立 read lease，不补写原生 id。正文/结构与文件写作有独立本地入口，Node/插件双重检查材料写入。工作切换对 lease 附加即时限制，永久撤销，返回原工作不能复活；停止连接撤销该内容 lease，已可靠写入的旧请求仍可在重连后查询。
- 普通 TODO 新服务、受信范围/操作/当前连接许可表单及真实 CLI `todo.read/apply/result/recover/retry/resumeIdentity` 已接线。有限动作编译到原 Journal 引擎，旧 content API 保持保护；完成核验真实 scoped 材料文本版本及指定原样片段，状态与简洁引用同一宿主调用，正式对象的源码边界仍拒绝。详见[契约与核验限制](../design/ordinary-todo-contract.md)及下方真实 Desktop 演练。
- 外部正文、重试、TODO 和 stage.submit 的 Journal 已接实际通道/连接/client/运输请求/命令，以及该 client 最后显式读回的共同/项目指导版本。未读取为 null；标签不证明个人/模型身份，返回文本不证明遵循规则。

接口及限制见 [阅读方案契约](../design/reading-plan-contract.md)。材料入口已使用 A 的真实 list/read/reference/open 服务窄适配；Agent 新增 materials.resolve 经真实 Node 路径约束后调用 A resolveDirectoryFile，返回实际 ID、完整文件名/reference、身份核验状态。它需要本次独立文件许可，只登记材料元数据、不写原文件或 Graph。materials.associate 的路径入口也消费同一解析结果并保持旧 material 结果形状；capture/已知 ID 关联仍明确关闭 Graph 自动引用。正文与上下文文件点击先同步委托 A 的统一预览；失联材料从当前阅读许可集合排除，旧计划保留为 material-unavailable。未复制 A 的目录/预览算法；不把 mock 当作跨支 Desktop 通过。页面型阅读及外部协作使用真实 page scope，空页面不伪造块；正文、TODO、格式及阶段维护仍需另选实际块范围。

检查：`npm run check` 已通过，最新全量日志 `tmp/reading-stage-check.log`，各 TAP 测试合计 736 项、零失败，包含 requirements/typecheck/lint/test/sandbox/build/boundaries/taste。首次全量检查发现 DOM 书签顺序及材料往返展示焦点两处回归，修正后相关 27 项与全量重跑通过。随后把滚动锚点由祖先上下文改为点击组的主要成员，插件 typecheck/ESLint、9 项阅读 UI 回归及 build 通过；最终整项 check/package 仍将在全部 B/A 接线完成后重新执行。最终包尚未生成/验收。

协作现场/指导阶段新增全量日志 `tmp/collaboration-check.log`：741 项、零失败，requirements/typecheck/lint/test/sandbox/build/boundaries/taste 全过。独立真实 CLI 进程与真实文件的回归覆盖本地表单→保存现场→读取指导、未授权正文/文件拒绝、旧现场版本比较、局部差异、重读、scope 切换永久撤销及旧 Journal 查询；宿主仍为测试 SDK，不能冒充下面的 Desktop 事实。

局部真实 Desktop：`scripts/reading-desktop.mjs` 建立自有 Graph/home/profile/channel/进程/端口；复制宿主仅隔离目录、更新和外部链接，不添加 IPC/FileIO 能力，不替换 SDK。工作目录绑定和许可从真实本地界面操作，`scripts/reading-desktop-exercise.mjs` 通过构建生成的 `dist/workspace.mjs` 实际运行：101 块/四层、连续和对照两方案、原结构往返、同请求重试、其他会话标签拒绝，以及 25 来源真实原生定位。跨页面路由后 25 个挂载、4 个当时在屏幕内；全部来源/正文版本/父级及 Graph Markdown 文件 SHA-256 保持。原文件前后均为 `d06502d84004dfe86ef548796b3ade5280bdfdeb61a48dffda44656acf341aea`。

阶段事实摘要在 [reading-stage-evidence.json](assets/reading-agent/reading-stage-evidence.json)。原始证据在 `tmp/reading-desktop/evidence/exercise.json`、`stage-runtime.json` 和 `title-click.json`；阶段演练主 JS 为 `ad500039620f5e77c3b028ae2c9bf051ca26884f3afba720447d18b70762340c`，companion 为 `e23cbed91b44779157027bd74d8dcad46f997dedf9ae65e8617558be1dffd9e7`。同时核对 101 个主要 DOM 来源身份/版本、标题无可写 UUID，以及 25 个实际原生标记；该次有 12 个来源在屏幕内，宿主 editing=false。真实标题点击也验证了 25 个讨论成员加一个父来源，共 26 个实际标记，editing=false。先前跨页面路由的 25/25/4 结果单独保留，不能混淆不同时刻的可见数量。

这是开发目录加载的局部演练，最后滚动锚点调整和其余 B/A 实施会改变主 JS；最终 ZIP 必须单独记录并仓库外安装后重跑。只读 probe 记录实际 SDK/DOM/Graph，不执行自选脚本或伪造能力。隔离配置最初误写 `theme: "light"`，实际宿主要求 theme 对象/null；已修正为 null，正常重启直接握手，无需手工重载。物理 IME、剪贴板/Finder 的完整保留及所有折叠宿主场景未由这些结果证明。

协作阶段真实 Desktop：两份工作从本地界面关联，分别 101/25 块；新入口实际建立只读连接并保存现场，构建出的 `dist/workspace.mjs` 实际读取，正文 apply 和 materials.capture 均因独立许可不足拒绝。两工作区共同版本先同为 `b24bf505fbaf…`，只在工作乙的“明确保存共同指导”更新后，两入口实际重读均为 `ec7c83ec964c…`；项目差异分别保持 `f5d22b17d5a2…` / `0902bbb53a9c…`。工作乙的旧 scene 仍载旧共同版、current 报新版，refresh 再采用新版。工作乙已有用户 WORKSPACE.md 字节保持，生成入口是独立文件。

实际切换到另一工作后，原目录 CLI status 返回 WORKSPACE_OFFLINE，需要本地重新允许。演练中发现旧连接未即时随阅读工作撤销的问题，修补了私有 lease 的同步限制，再在新构建上跑了实际切换与重连；源码回归还验证了等待中的写入不落地，以及返回原工作不恢复旧 lease。四次合成原文页 SHA-256 均保持 `d06502d84004dfe86ef548796b3ade5280bdfdeb61a48dffda44656acf341aea`。这只证明该合成页面字节保持，不等同所有 Graph 元数据/原生 Undo/物理 IME 已验证。

阶段摘要为 [collaboration-stage-evidence.json](assets/reading-agent/collaboration-stage-evidence.json)，各阶段实际 JS/CLI hash 单独记录，首阶段在租约修补之前，不能混成同一构建。原始数据在 `tmp/reading-desktop/evidence/collaboration-work-*.json`、`collaboration-final-runtime.json`。`scripts/collaboration-desktop-exercise.mjs` 只运行真实 CLI 与拒绝写入检查；UI 由实际 Desktop 操作，未补造 IPC/SDK 能力。仍不是最终包，也不是三条写作与普通 TODO/A 联调通过。

普通 TODO 阶段全量 `tmp/todo-check-final.log`：751 项、零失败，requirements/typecheck/lint/test/sandbox/build/boundaries/taste 通过。新增 10 项受信 TODO 回归，加真实独立 CLI 接线回归，覆盖独立许可、范围/操作/生命周期、正式/受管/代码边界、材料/原文变化、撤销再授权不复活旧调用、终端属性、宿主原生 id 规范化、幂等、部分身份、日志未确认和未知不重试。外部收纳的最小接线显式关闭自动 Graph 引用；文件许可不会自动取得正文能力。

真实 Desktop 演练从本地表单允许一个实际普通任务子树的 create/complete，再单独允许文件写作；body=false。实际构建 CLI 读取现场/指导、保存两段原样来源到工作目录的比较文件、核验材料版本/字节、取得真实引用、在原任务下新建明确测试子步骤、完成并读回 Journal。103 个此前来源的正文/父级/顺序/深度保持，只有新增子步骤成为 DONE，父任务仍为 TODO，实际 Graph Markdown 文件也已保存这个子步骤。点击其正文实际只读高亮 1 个原生来源，editing=false，阅读层有 104 个来源；不同挂载数量仍按实际结果表达。

本次实机先发现两处基线/新接线边界：终端 id 属性无换行使依据追加被属性保护拒绝；宿主把 id 属性移至首行后导致严格读回未知。旧拒绝/未知日志保留，后者 recover 观察到预期内容但仍是归属未知，未盲目重放。修正后另外明确新建的“原生属性读回复验”完成，Journal 同时保留提议和实际内容及规范化标识，旧 content 保护与读回不放宽。此前基线材料 capture 自动插入的一条引用也保留在合成数据中，没有删除来隐藏问题；随后新材料 capture 的前后真实来源集合相同，证明 file-only 接线。它是 A controller 的最小内部参数，合入 A 时需保留。

实际停止连接后 CLI 为 WORKSPACE_OFFLINE。只读重连后 body/file/TODO 都未授权，原已确认请求查询/相同 apply 只返回原日志，来源集合没有再次变化。证据摘要为 [todo-stage-evidence.json](assets/reading-agent/todo-stage-evidence.json)，原始记录为 `tmp/reading-desktop/evidence/todo-native-id-exercise.json`、`todo-normalized-runtime.json`、`todo-final-runtime.json` 与旧失败/恢复文件；可重用脚本 `scripts/todo-desktop-exercise.mjs` 不注入许可、SDK 或 IPC。各阶段运行文件 hash 单独记录，不能把旧失败构建与新复验混成同一安装结果。

该 TODO 阶段仍是开发目录加载，当时尚未在最终 ZIP 或真正 Kernel 注册的正式对象上完成这组 Desktop 验收；后续真实注册的局部正式边界见下文。基线 reference 标签仍消费真实服务返回值，完整当前文件名标签由 A 最终接线验证；不自行猜材料 UUID/路径。物理 IME、Finder、系统剪贴板完整保留、跨平台和普通 IO 竞态仍未由这些结果证明。

格式整理已接通独立 CLI `formatting.preview/result/recover` 和本地“查看并整理行首格式”。Agent 只提出来源绑定的真实差异；本地明确写入的是这一份不可变行首补丁，body/file/TODO 许可不会因此开启。默认自然标记及显式额外自然标记可选择，正式/受管标记禁止。64 处有界操作复用原 executor 和 Journal，记录本地确认作者、实际提议来源及已返回指导版本。旧 content 语法与 TODO 保护不放宽。全部范围版本逐组核对，只有本次已确认写入的版本可推进；其他来源的新条件会阻止旧提议。代码栅栏、缩进代码、HTML/Org/公式字面段、引文及延续行、字面祖先、属性、正式对象和任务保持；无法确认的范围保留。未知和部分结果先查询，明确 keep-current 后再产生新写入，不升级丢失的归属。

格式阶段 `tmp/format-check-final.log` 全量通过 761 项、零失败；随后 `tmp/format-check-delivery.log` 通过 762 项、零失败，全部 requirements/typecheck/lint/test/sandbox/build/boundaries/taste 通过。新增 11 项回归和真实独立 CLI 接线演练；覆盖受限差异、原句/CRLF/UTF-16、字面及受管边界、独立只读许可、多块自身版本推进、其他来源同时补充、部分/未知/日志失败、原生 id 读回、作用域与输入保护。实际差异总量超过 1 MiB 时要求缩小范围，不缓存或写入超限预览。CLI 测试使用真实独立进程/文件/Journal，但其 SDK 夹具仍不算 Desktop。

真实 Desktop 从本地保存明确的合成格式请求，read-only 连接的 body/file/TODO 都为 false。构建 CLI 对原有第 32 块 `[问一下]` 提出仅一个标记加粗的差异；原生编辑器在第 28 块保存“用户补充：不过离线阅读时也要保留问号与限定句。”，再从本地确认旧差异，实际 0/1、CONFLICT/FORMAT_SOURCE_CHANGED、日志已确认。原句/旧差异仍在。用户明确保留当前原文后，CLI 重读并提出新差异，本地再次查看/确认，实际 1/1 APPLIED_VERIFIED、durable=true。前后 104 来源的 UUID、父级、顺序、深度及数量保持；新鲜基础上只第 32 块的行首从 `[问一下]` 变成 `**[问一下]**`，全部其余内容及新增条件保持，Graph 文件持久化核对通过。原 requestId 的 recover 返回同一确认摘要，未发第二次写入。

证据为 [format-stage-evidence.json](assets/reading-agent/format-stage-evidence.json)，原始 `tmp/reading-desktop/evidence/format-exercise.json` 和 `format-final-runtime.json`；可携带脚本 `scripts/format-desktop-exercise.mjs` 只发真实 CLI 预览/查询，编辑和确认由实际 UI 完成，没有许可/SDK/IPC 注入。只读探针观测 104 阅读来源、100 个原生挂载、editing=false、零异常。仍是开发目录加载；随后源码新增能力说明、并发提议归属复核与保留当前提示措辞，不将它们混记成此运行 hash。新构建及最终包需按原矩阵重验。

格式实现本地提交为 `5aeda96`。继续审查发现既有本地正文恢复入口会调用写权限建立函数；已改为缺少范围或切换范围时仅建立只读范围，同范围已明确授予的正文/结构权限及原 lease 保留。查看恢复不持久化原生 id；重新提交仍检查独立写权限。受控回归核对首次/只读/已有明确许可/切换范围四种情况和 SDK 写入计数；真实最终包的恢复入口仍须复验，不能以此回归代替 Desktop。

该权限修补后 `tmp/recovery-read-check.log` 全量通过 763 项、零失败，requirements/typecheck/lint/test/sandbox/build/boundaries/taste 全部通过。用户主工作树仍干净，main 为 `eb07013d119584dbd3c68012541f1355118d2b0b`。本轮只停止经实际 PID/命令身份核对的隔离 Desktop 与 companion，停止后两 PID 实际缺失。A 当前只读核对为 `98c0d4e6d5122ff8a763683e96e25dd511928e36`、工作树干净，但仍没有指定最终 handoff，因此不是已核对交付 SHA，没有合并它。

页面协作已完成局部真实 Desktop：实际页面 UUID `6ac623ce-78f3-4ca1-bbc0-d34ac9ed1c1a` 关联独立 page-work，保留已有用户 WORKSPACE.md，并生成真实 `?page=` 入口。只读场景和 CLI 读回 104 个原生块，没有页面 UUID 对应的伪根；work.read 的可写工作根仍为空。实际 content.apply、todo.read、formatting.preview、stage.read 均拒绝 BLOCK_SCOPE_REQUIRED。单独从本地允许文件写作后，保存两段退出条件原句到比较文件，重复 capture 返回同一 ID、材料实际字节与版本一致；页面正文和 Graph Markdown SHA 保持。实际页面材料页签及 MD 预览打开可读。一次同进程的页面→块工作切换立即使旧页面 CLI 返回 WORKSPACE_OFFLINE；回到页面从本地重连/准备现场后，body/file/TODO 均 false，保存材料及原文仍一致。

阶段事实在 [page-stage-evidence.json](assets/reading-agent/page-stage-evidence.json)，可携带 `scripts/page-desktop-exercise.mjs prepare/capture/switched/reconnected` 只运行实际构建 CLI/文件核验，绑定/授权/切换由真实 UI 完成，不注入 SDK、IPC 或许可。旧块入口另返回 DESCRIPTOR_STALE，仅证明旧实例失效，与本次同实例的 Page→Block WORKSPACE_OFFLINE 分开记录。页面目录绑定不持久化原生块 id；受控回归另核对空页面、重启恢复、真实 page 来源身份、无 Graph SDK 写入，以及每个可信绑定独立校验，重新选择目录不会使旧绑定复活。外部 materials.associate 和 capture 的最小内部接线均显式关闭 Graph 自动引用，合入 A 时需保留。

页面阶段 `tmp/page-final-check.log` 全量通过 766 项、零失败；requirements/typecheck/lint/test/sandbox/build/boundaries/taste 全部通过。真实 Page 演练为 Logseq 0.10.15/macOS ARM64 开发目录加载，具体 JS/CLI hash 记录在阶段摘要，仍需最终 ZIP 重验。物理 IME、Finder、剪贴板、其他平台和普通 IO 竞态未由本阶段证明。

随后完成多轮讨论的实际 CLI/Graph/文件/Journal 演练：从工作乙的真实本地请求建立只读现场，27 个来源；正文 apply、材料 capture 未获独立许可时拒绝。明确正文与文件许可后，真实材料保存两段退出条件，取得服务 reference；在原讨论 MiniProject 下只新增一条 **[想法]**/**[注]** 记录，第二轮把离线引用条件及详见链接续接到同一 UUID `96a18fb2-c612-5169-ab96-f9a474ba48c3`。两个写回均 complete/durable、实际身份已确认，原 27 来源逐项保持，未执行的询问仍 TODO，整体未被宣告完成。相同 requestId 返回相同日志，未新增第二条想法或每轮总结树。实际点击正文 reference 打开同一 MD 文件，前后原生来源标记均为空；断连实际 WORKSPACE_OFFLINE，重连 body/file/TODO=false 后 result/recover/相同 apply 仍返回原摘要，原文及 Graph 文件持久化核验通过。

该阶段摘要为 [discussion-stage-evidence.json](assets/reading-agent/discussion-stage-evidence.json)，脚本 `scripts/discussion-desktop-exercise.mjs prepare/first/second/disconnected/reconnect`，原始事实 `tmp/reading-desktop/evidence/discussion-exercise.json` 及同名前缀 runtime。作者为真实私有通道/client/指导读取依据，仍不把 client 标签当个人或模型身份；reference 继续消费基线服务原样输出，完整文件名交接仍依赖 A。

零散记录过程随后在完整 105 来源上实际提交连续和对照两读法。真实 DOM 核对每个主要 sourceId/版本一次出现；连续没有分组标题，对照实际显示四个标题，全部保存来源及 Graph SHA 保持。目标第 28 块本来已加粗，格式预览实际零差异；首次演练脚本误认为裸标记而停止，保留这次失败，不将零差异伪称写入。重新邀请读法时旧 planId 不能换请求复用，实际 ID 冲突拒绝后脚本给新邀请独立身份。原生 UI 给第 28 块追加“用户追加：不过离线引用还需要保留当时文件的版本，尚未验证能否做到。”，旧对照方案返回 stale-reading-plan；重读后继续两方案，旧补充和新限制全部在场。实际只这一处内容变化，其余来源及层级保持；本轮格式仍零差异，没有正文或 TODO 许可。

摘要为 [scattered-stage-evidence.json](assets/reading-agent/scattered-stage-evidence.json)，脚本 `scripts/scattered-desktop-exercise.mjs prepare/comparison/original/stale/fresh/collect`。此前第 32 块的真实“格式旧提议冲突→保留当前→重读→单处加粗”仍使用独立 [format-stage-evidence.json](assets/reading-agent/format-stage-evidence.json) 及其构建 hash，不能混成当前同一构建的再次格式写入。边做边记录的实际材料→新子步骤→有据完成→父任务仍 TODO 已在 TODO 阶段记录；这些局部过程与最终包同一构建的三条回放仍区分。

讨论实机也暴露了一处许可表达问题：旧“允许 agent 连接”实际授予正文，却未在动作名称中说明；只读连接后的正文升级也需要先断连再找这个入口。现改成明确“允许 Agent 维护这里正文”，只读当前工作的菜单直接可用，按已有受信正文连接路径更新范围。它不会继承原文件/TODO许可，也不授予结构。范围由当前真实工作根指定，不跟随临时原生子块；增加真实独立 CLI/界面接线回归，新构建的实机复验另记。

这次修补及写作演练后 `tmp/writing-exercises-check.log` 全量通过 766 项、零失败，requirements/typecheck/lint/test/sandbox/build/boundaries/taste 全部通过。新构建正常重启隔离 Desktop 后，真实菜单从只读连接直接显示明确正文许可；先独立允许文件，再点正文许可，CLI 实际 body=true/file=false/TODO=false/structure=false，当前根为实际第 1 块，105 个来源及 Graph SHA 全保持。摘要 [body-grant-stage-evidence.json](assets/reading-agent/body-grant-stage-evidence.json) 单独记录新构建 hash；脚本 `scripts/body-grant-desktop-exercise.mjs readonly/files/body` 只读实际 CLI 和文件，许可来自真实 UI。临时原生子块的范围隔离另有受控夹具回归，不把该回归冒充物理 IME 或此实机临时选块验证。

正式对象的局部 Desktop 验收已使用正常 Kernel 服务、独立 SQLite/描述文件及真实本地注册入口，无 Lab、SDK/IPC 能力注入或外部模型提供方。两个既有合成锚点分别注册为 OPEN Task；首次注册暴露基线私有记录文件名包含完整中文 Graph 路径，导致 ENAMETOOLONG，SDK 保存调用还可能仅通知失败而返回成功。该首次 Kernel 注册实际成功，私有恢复记录未可靠保存，失败证据和已注册对象保留，未盲目重放。

修补使用范围身份散列形成固定 87 字节文件名，在记录内保留并严格核对逻辑键和 Graph 身份；每次保存后实际读回确认，未确认的意图不向 Kernel 发送。因这种已证明未发送的失败，只在原文仍等于本次规范化文本时恢复原内容，保留更新的人工文字。已接受的正式回执不因随后清理私有记录失败而改成未提交。真实新构建再次注册第二个既有锚点，三个实际私有文件分别保存已清空的待处理请求、当前事项、最近提交，范围和正式回执一致。正常重启后，“查看当前 Task Closure”可读回持久化事项；旧工作连接及正文、文件、结构、TODO、认可许可全部为 false。

升级兼容通过受控真实临时文件回归：旧的短范围记录仍可读取，旧文件不删除；新的空记录阻止旧 pending 再次出现。旧版本不识别新的散列记录，可能读取旧的当前事项、最近提交或 pending 指针，**没有安全降级验收**；不能由这些兼容读取测试宣称来回换版本没有副作用。私有 IO 失败、静默丢失、读回不符及范围切换均有回归；实际断电和普通 IO 竞态仍未实测。

为建立真正存在的受管字段，正常外部 AGENT CLI 读取真实来源、冻结依据、启动批准的 current-focus-maintenance Skill，以封闭结果生成提议并走正式 apply；并未改用 USER 身份。实际 SET_CURRENT_FOCUS Commit 为 `ef34470b-50dd-464b-85e1-c49ef17de0dd`，投影 VERIFIED，Task 保持 OPEN，仅增加当前推进和未询问限制。按同一提议再次 apply 返回同一 Commit，正式状态和 Graph 字节保持。随后正文/TODO 独立许可来自真实本地界面：body=true，结构/文件=false，普通 TODO 仅允许第 48 块及后代的 complete。实际普通正文替换两个已注册根标题和真实受管推进字段，均返回 durable/not-applied/BLOCKED，分别 PROTECTED_FORMAL_TITLE、PROTECTED_FORMAL_TITLE、PROTECTED_MANAGED；原请求查询摘要相同。针对两个正式根的普通 TODO complete 均拒绝 TODO_OUTSIDE_GRANTED_RANGE。这证明该实机范围外拒绝，不能将它改述为“已授权正式根内 TODO 执行后再由正式校验拒绝”。拒绝前后保存来源、正式状态和 Graph Markdown SHA 均保持。

摘要为 [formal-stage-evidence.json](assets/reading-agent/formal-stage-evidence.json)，原始证据为 `tmp/reading-desktop/evidence/formal-storage-exercise.json`、`formal-focus-exercise.json`、`formal-boundary-exercise.json`、`formal-restart-runtime.json` 及保留的首次失败。`scripts/reading-kernel.mjs` 只配置自有合成 profile 的正常 Kernel 描述文件，不改写既有私有凭据；实际本地连接负责刷新。`scripts/formal-focus-desktop-exercise.mjs first/replay`、`formal-boundary-desktop-exercise.mjs` 使用正常真实 CLI；`formal-stage-evidence.mjs` 从原始事实校验并提取摘要，不提交 bootstrap/描述文件凭据。该组运行的实际主 JS 为 `be30996b36c15346de5367898b4a4f6200a2931fd0ecd2bd755332384fe6bd61`，CLI 为 `55a6383c8be69fbc464fa1543c4269edede979d1a2865b10fb6c56a297d9db1a`，仍是开发目录加载。其后仅改了私有保存未确认的中文界面提示，后续构建和最终包需记录新 hash，不混成同一实机结果。

原生输入局部验收另记 [native-input-stage-evidence.json](assets/reading-agent/native-input-stage-evidence.json)：第 28 块真实原生编辑中追加合成测试句，选区 106–112；点击阅读标题后同一编辑块、输入文字和选区保持，准确标记 4 个真实来源，导航 unchanged。焦点转到阅读面板，未声称保持原生焦点。宿主在定位前已经把输入同步到保存来源，所以**不计未保存草稿验收**；textarea 对象身份和物理 IME 未测。通过原生界面撤回测试句后，原内容及 Graph SHA `99008558edbbbd7b607d3cbf976e10b499b17c959c744b4f3cb5c7c1f0f4ca81` 恢复，编辑结束、高亮取消。正式投影新增之前的旧 SHA 与本次基准不同，不混淆。

私有恢复修补的稳定全量 `tmp/formal-private-check-final.log` 通过 770 项、零失败，包含 requirements/typecheck/lint/test/sandbox/build/boundaries/taste。中文提示修补后的 `tmp/formal-private-delivery-check.log` 同样全量 770 项、零失败；随后新增的证据/复验脚本另通过 ESLint。仍不以旧运行 hash 代替最终源码与安装包验证。

B 的阶段 ZIP 已开始仓库外正常安装预检，不能计为最终包。`npm run package:plugin -- tmp/reading-package-staging/task-copilot-workbench-c4fc087.zip` 成功，打包提交为干净 `c4fc08773aa3ecf8cfd14f8864acf50452a4d58c`，ZIP SHA 为 `81a980fc0367eba832a194cdcfee645f150f62cd79cb578a4c6b74a04cfa0fc7`，428 项中 425 个 dist 文件逐项与 build-identity 一致。`scripts/package-desktop.mjs` 在用户 Cache 下建立全新自有宿主/Graph/home/profile/channel/工作目录及安装目录，拒绝覆盖、Git checkout 和未核对包身份；实际 companion 的路径与工作目录均在仓库外。通过真实 UI 选定合成 Graph、打开完整原文、关联合成工作目录，保留已有用户 WORKSPACE.md，准备 101 来源的只读现场，读取/编排之外许可全部 false。

第一次真实首启观察到未处理 LOGSEQ_GRAPH_SHAPE_UNSUPPORTED，来自还没有选择 Graph 时的 restoreReadingSession；后来的手动阅读可用不能冲销启动失败。失败摘要 [package-bootstrap-initial-evidence.json](assets/reading-agent/package-bootstrap-initial-evidence.json) 及原实例保留；仅停止经 PID/完整命令身份确认的自有包实例。修补缺图 null/undefined 时不恢复、不读旧来源，也不制造 Graph 身份；非空畸形数据仍拒绝。新增回归验证缺图、异常数据、随后真实 Graph 恢复及来源不变，针对 5 项和全量 `tmp/package-first-start-check.log` 771 项全部通过。新干净 ZIP 与新 profile 的首启必须另行实测；旧 ZIP 不变，不把源码修补说成已改变旧安装。

修补后的阶段 ZIP 来自干净 `2aa342ca5868d759128a1ff8122f45c3824cd919`，SHA 为 `3bc7bcf3f1531ca669c8a85cd51dc3a7a0ee8a87a9f2976c90bb145640b88ab2`，428 项、425 个 dist 文件身份逐项一致。在全新仓库外实例 `reading-package-second` 的缺图首启中，真实 API 已发布、connected=true，未处理异常及控制台错误为零。真实 UI 选择 Graph、关联目录并准备只读现场后，`package-reading-exercise.mjs NAME` 通过包内实际 CLI 和固定只读探针完成 101 来源、三种独立权限拒绝、连续/对照方案、相同方案重试、25 个实际原生来源定位及用户 WORKSPACE.md 保持。两读法分别 0/4 个标题，每个主要来源 ID/版本一次出现。全部实际来源及 Graph SHA 保持。协议 original 是取消 Agent 方案；另从真实 UI 切换“查看原结构”核对 101 个真实行、原序及深度，再返回 101 主要来源/4 标题对照方案，逐个核对中文原句序列及版本。

本次另由真实原生界面折叠第 28 块，再点击阅读来源：原生折叠保持，4 个请求来源中实际标记 1 个、3 个不可挂载，editing=false；实际宿主 URL 路由到第 29 块锚点，不能把稍后只读状态中的 navigation=unchanged 当成未曾路由。定位前后实际 SDK 来源与折叠后 Graph SHA 保持。手动展开后原生内容、身份及层级恢复，collapsed 属性移除，但宿主把整页缩进由空格改成 tab，并移除文件尾换行，原始字节 SHA 没有恢复。保留最初严格字节恢复断言失败及后续逐来源/规范化文本核对，不把用户主动折叠/展开的序列化作用归给只读定位，也不把整个往返说成 Graph 字节不变。

摘要 [package-stage-evidence.json](assets/reading-agent/package-stage-evidence.json) 由 `scripts/package-stage-evidence.mjs NAME` 从实际原始记录核对生成；原始记录位于该自有 Cache 实例的 evidence 目录。探针已改为观测 SDK 的真实 collapsed? 字段，DOM class 不能证明折叠状态。两次阶段包均保留，各自进程已核对停止。这些是 B 单支预检，不能代替 A+B 最终包三条写作/五类预览/独立窗口矩阵。

仍需实施并验证：最终同一安装包中的三条完整协作回放；最终包真正 Kernel 正式对象/TODO/恢复复验；跨工作导航、物理 IME 及晚到调用的更多宿主验证；五类预览/目录/独立窗口；最终安装包仓库外加载及完整矩阵。具体要求仍以两支 prompt 和共同契约为准。

最终 SHA、A 合入事实、ZIP/hash、三条演练、Desktop 格式矩阵、物理 IME/Finder/剪贴板及平台限制待实际执行后补齐；不能由这份阶段记录代替最终验收。

合入后针对材料解析、文件许可、符号链接拒绝、无 Graph 写入、来源高亮优先委托及失联方案失效的 10 项回归通过，日志 `tmp/integration-adapter-tests.log`；全仓类型检查通过。独立依赖安装仍报告 3 high / 4 moderate，不宣称依赖无漏洞。日常材料预览/窗口/目录及实际 Agent resolve 指南已更新。`scripts/acceptance-context.mjs` 与原演练脚本新增明确 `--package NAME`，核对实际 clean ZIP、全部资源、限定自有 Cache 路径并运行包内 CLI；不会复用旧开发现场或注入许可。包验收解压器保留命令启动器执行权限，最终实际启动器仍需验收。合并后的 `tmp/a-b-integration-check.log` 全量通过 798 项，零失败/跳过/取消，requirements/typecheck/lint/test/sandbox/build/boundaries/taste 均通过。新仓库外完整矩阵待执行，不把这次函数/CLI 夹具检查记为最终 Desktop 通过。

最终组合包已从干净实施提交 `31b1a751a0df5c582da776fc2e271ee8bd4ec119` 生成，`tmp/reading-package-staging/task-copilot-workbench-integrated.zip` 的 SHA 为 `d564a87ccd14e3c665234b6d21acec3d6426fb003e6044347b60a9f3af4a8dae`，618 项、615 个实际运行资源逐项一致。全新仓库外实例为用户 Cache 下 `integrated-final-first`；24 个可携带 A 合成样本逐字节还原到独立 preview-corpus，未使用生产资料。隔离宿主共用应用标识影响真实键盘目标，已仅调整自有宿主名称/标识及系统登记，不改 SDK/IPC/FileIO。实际插件/companion/工作目录一直在仓库外，插件资源保持该 ZIP 原始字节。首启缺图无异常；真实 UI 选定本次 Graph、关联实际工作目录、保留用户 WORKSPACE.md，建立 101 来源只读现场。

同包实际通过连续/对照读法（0/4 标题）、同方案重试、25 个真实来源定位及三个独立未授权写入拒绝。真实 UI 的原结构往返核对 101 行原序/深度/内容，返回对照后逐来源中文原句序列和保存版本核验通过；这段操作来源与 Graph 字节均保持。随后明确本次“保存两段退出条件原句”请求，本地独立文件许可和仅第 48 块及后代的新建/完成 TODO 许可；正文未授权。包内实际 CLI 保存比较文件，新增一个真实子任务、有据完成、按相同请求返回同一 Journal，原 101 来源保持、原父询问仍 TODO，未新增重复子项或总结树。真实 A materials.resolve 返回同一材料 ID/完整文件名/reference；Stock Desktop 不能确认物理身份，结果如实为 unverified/needs-verification，不称已核验 inode 或可自动跟随外部改名。

实际点击原生 DONE 子项中的 reference，打开同一 ID/文件 SHA 的 Markdown 内置预览，完整原句与核验依据可读。预览前后实际 SDK 原来源深比较保持，已请求/已标记来源集合保持；可见数量从 9 变 0，因为材料替换阅读面板，先前严格整份定位对象相等断言失败保留。不能把可见数量变化说成文件点击新建高亮，也不能把整份定位状态说成完全不变。通过真实“独立窗口”点击创建 about:blank 原生窗，独立只读 probe 核对其实际 opener 为此包插件且 Graph 相同，目标/版本一致；实际原生缩放由 900×720 变 1440×813，目标/版本保持。两次标题栏拖动尝试实际位置未变，移动不计通过，系统“移动与调整大小”后续待验。

后续进入一轮时原 PID/完整命令核对均实际缺失，才在同一包/Graph/profile 上正常重启；102 来源恢复，旧阅读计划不活动、预览不存在，连接和读/正文/结构/文件/TODO/认可均 false。用户手动解锁后，已通过真实入口只读重连，原 TODO 请求返回同一可靠 Journal，来源不变、不重复创建，正文/文件/TODO 均未授权。组合安装预检摘要为 [package-integration-stage-evidence.json](assets/reading-agent/package-integration-stage-evidence.json)，前述 B-only 包证据继续分开保留。正式对象及资源生命周期等剩余项不记为整项完成。

同一组合包的三条协作流程、共同指导和核心格式路径已继续实际完成，摘要为 [package-collaboration-stage-evidence.json](assets/reading-agent/package-collaboration-stage-evidence.json)，由 `scripts/package-collaboration-evidence.mjs --package integrated-final-first` 核对原始记录生成；没有修改包内插件/CLI 或补造宿主能力。第二工作通过真实目录关联使用 `work-two`、讨论块真实 UUID 范围，保留已有用户 WORKSPACE.md。先拒绝未授权正文和文件，再从本地入口分别授予正文/文件许可，TODO 未授予。两轮只新增同一条想法 `be05fc96-bfeb-58e9-af46-bfc1caf75446` 并续写第二轮，保留目前偏向、可能、尚未询问和实际服务 reference；原 26 来源不变、询问 TODO 未完成。停止后实际 WORKSPACE_OFFLINE；只读重连的 result/recover/同请求 apply 返回同一日志，落盘来源不变。

共同指导只在真实 UI 的明确保存入口补充一次，两个入口实际重读同一新版 `ee07ef4d1d54982ad5bc70c1a69b34dae6abf582517e1e5b54da5f717a5f2939`。旧现场仍识别旧版 `b24bf505fbafca1f91b37526d43453dc1f18e05d5d755dc3b7586996e1d9a3ee` 且 guidanceMatches=false；重准备后为 true。项目甲、乙分别保存且保留不同差异版本，两份用户 WORKSPACE.md 原样保留。

零散流程在实际 103 来源上生成连续段落和四标题局部对照，实际 DOM 每个来源恰好出现一次且版本一致。用户通过原生编辑器在第 28 来源补充两条离线条件后，旧阅读方案 stale-reading-plan；旧格式请求在本地确认时 0/1、FORMAT_SOURCE_CHANGED、Journal 已确认。明确保留当前后重新生成第 32 来源 `[问一下]` 单处加粗提议，经真实本地确认 1/1 APPLIED_VERIFIED；仅此行首差异，身份、层级、顺序、属性、TODO 和用户新条件保留。格式表单重开默认仍选旧提议；第一次再次确认只返回旧冲突日志，未写入。实际切到第 3 个新版提议后才通过，不把错误选择记为新版冲突。

核心格式已在同一 ZIP 中从材料列表/原生引用/阅读正文引用分别打开 MD、DOCX、中文多页 PDF、XLSX 和 PNG，主面板与独立原生窗口的目标/文件 SHA 相同。MD 有实际中文图片、表格、代码及相对文件链接；DOCX 有标题、段落、列表、3 行表格和真实图片；PDF 文字页与扫描页实际可见，包内 worker/字体资源生效；XLSX 有合并区域、351 行第二表的 101–200 分页，缺公式保存值明确提示，故其 complete=false 是部分预览事实；不计算公式、不冒充全部工作簿完整。五类正文点击前后已保存来源及 requested/highlighted 集合不变，未误触来源定位。合成引用块由真实原生编辑器附加服务返回 reference，原槽位文字仍保留；这一步为验收资料准备，不能冒充 Agent 写回。

实际访达新窗口复制本次两个合成目录，向真实材料只读入口粘贴后当前层可读；没有伪造 Clipboard/FSA/IPC。第一根外部新增合成 MD 自动出现，一级/二级及逐层返回真实可用；两个根的同名 MD 的实际 ID、SHA 和正文分别独立。24 原样本 SHA 全部保持。独立窗口自由拖动仍未证明；系统“Window→移动与调整大小→左侧”实际改变位置/尺寸且同版本。只读 DOM/SDK 观察脚本需要 Node 24 的原生 WebSocket；Node 20 仍是实际插件 CLI/companion/Kernel 与构建运行时，前次用 Node 20 跑观察器的 constructor 错误不记为插件异常。

剩余组合包验收：真正 Kernel 注册对象与正式端口/普通 TODO 边界；原生输入、选区与折叠来源的最终复验；改名/失联/范围及 Graph 切换/正常停用的窗口、worker、监听和资源释放；Page 范围与升级恢复复验。物理 IME、完整剪贴板保留、跨平台、普通 IO 竞态和长时间浸泡仍未实测。基线生产风险仍存在，798 自动检查和上述路径通过不能推出整个插件已生产成熟。

上述剩余项中的原生输入和正式边界已继续复验，见 [package-input-stage-evidence.json](assets/reading-agent/package-input-stage-evidence.json)、[package-formal-stage-evidence.json](assets/reading-agent/package-formal-stage-evidence.json)。用户新条件和五类服务引用保存后重新编排，真实原生第 28 块的 textarea 后端节点 61414、value 和选区 41–46 在标题集合高亮及正文材料点击后保持；已保存来源不变。标题请求/标记 28 来源、视口实际 7 个，材料点击保留非空集合。焦点转到阅读控件；不宣称已证明物理 IME 或未保存草稿。

正常 Kernel 使用独立合成 SQLite/描述文件、无外部 provider；插件和 companion 仍来自仓库外同一 ZIP，Kernel 本身从仓库源运行，不宣称是包内独立 Kernel 发行版。已有第 77/2 锚点通过真实正式化命令分别注册 `19faebbd-636b-4243-82dc-7191a4d0b54a`、`416fa57e-c5ae-4e37-8bc8-bfdbd442dd16`。实际四份 FileStorage scoped envelope 的文件名均 87 字节，两个创建 pending 是空 tombstone，current-object/recent-commit 均保存；最初证据脚本误假设三份记录，已按真实必需键核对，未改产品数据。正常受治理 AGENT 程序维护第二对象当前推进，projection VERIFIED、lifecycle OPEN；真实重复 apply 返回同一 commit，业务状态和 Graph 字节不变。

独立普通正文许可下，两正式标题分别 PROTECTED_FORMAL_TITLE、实际投影字段 PROTECTED_MANAGED，均 BLOCKED/not-applied/durable；所选第 48 普通任务范围之外，两正式根 TODO_OUTSIDE_GRANTED_RANGE，来源/正式业务状态/图文件保持。真实本地 TODO 表单排除正式根，未通过注入许可构造范围内正式 TODO 调用；该路径只记为范围外拒绝与本地不可授权，不扩大成范围内 Desktop 拒绝证明。正常重启后 104 来源保持，所有旧 Agent 许可失效，直接只读 Closure 查询仍能读取恢复的当前事项；真实只读重连的三个 result/recover 返回同一可靠阻止日志，来源不变。安全降级、整套备份还原、目录/窗口/worker/监听生命周期和 Page 最终复验仍待后续完成。

同包资源生命周期已完成四组实际前后观察，摘要为 [package-resource-stage-evidence.json](assets/reading-agent/package-resource-stage-evidence.json)。真实工作切换和 Graph 切换分别关闭旧 PDF/图片独立窗口、worker 回到宿主基线 1、旧 blob 不再可读；旧工作 status/reading select 均 WORKSPACE_OFFLINE。后续续接时旧桌面/companion/Kernel 进程实际已退出，重新启动同一包后重新建立停用基线，没有把退出跨越当成停用证明。正常插件管理开关两次由 1 变 0：图片主预览/独立窗口消失、先前 blob 在原生宿主也读取失败；PDF 主预览/独立窗口消失、worker 从 3 回到 1。两组同一主 target/PID 的原生 document 监听由 45 减为 18；CDP 的宿主包装函数不能可靠归属每个插件组件，不能据此声称全部监听、定时器或长时间泄漏已证明。只读探针新增实际 PID/完整命令核对及跨进程重启拒绝。

Graph-two 的原生 Markdown 链接使用 `%20` 时，Logseq 0.10.15 实际生成 `%2520`，界面提示“文件状态暂不可核验”；此兼容形式未通过。保留原始失败事实后，在合成 assets 新增无空格同字节别名，真实原生编辑两条子链接；父原文保持。别名 PDF/PNG 主预览和原生独立窗口可读，但两个普通叶块分别形成范围，点另一叶会关闭前一独立窗口；没有把它描述成同一工作范围的双窗保留证明。24 原始材料及组合插件资源保持原字节。

同一组合包的 Page 最终复验见 [package-page-stage-evidence.json](assets/reading-agent/package-page-stage-evidence.json)。真实“阅读当前页面”进入整页范围，正常页面目录关联保留既有 WORKSPACE.md、生成 WORKSPACE.task-copilot.md；真实页面 UUID `6ac83d9e-2af2-44a3-94bd-33848f387de5` 与 104 来源完整在场，来源块中不伪造同 UUID 根。真实“带当前工作去协作”保存页面请求，只读连接的 todo/content.apply/formatting/stage 四条块写入路径拒绝 BLOCK_SCOPE_REQUIRED，旧块连接离线。随后只从本地独立开放文件写作，包内 materials.capture 保存“页面阅读比较.md”，重试同一真实 ID `ea23ab65-6a9c-18b9-cf77-471a18c3140b`；保存来源、Graph SHA 和用户入口保持。真实切回块后旧 Page 连接 WORKSPACE_OFFLINE；回到页面重新准备只读现场，文件/正文/TODO 均未授权，实际重读同一材料和全部来源，scene.sourceMatches=true。未把页面读取能力扩述为页面正文/TODO/阶段可写。

同包选择/键盘/折叠/书签阶段见 [package-interaction-stage-evidence.json](assets/reading-agent/package-interaction-stage-evidence.json)。实际拖选“阅读与协作合成验收；”不改变 requested 集合和来源；Enter 在同一阅读 article 请求 104 来源，宿主实际挂载/标记 75、不可用 29；Escape 清除全部标记、未进入编辑。首次坐标换算错误误入原生输入，没有改字并按 Escape 退出，最终选择事实来自真实阅读区域。正常原生菜单折叠全部子项后，定位仍保留折叠状态，只标记实际存在的 1 个根、其余 103 如实不可见，定位前后 Graph SHA 相同；随后正常原生菜单展开。手工折叠/展开会改变序列化 collapsed 元数据，不能把整个夹具设置过程说成只读。

中段来源 15 的焦点、来源 13 的锚点在材料往返完全保持；连续/对照/原结构/返回对照的锚点偏移差不足 1 像素，Graph SHA 一致。104 个来源在最终连续/对照中逐 ID/保存版本与中文正文字符序列核对通过，已知语义行首标记在阅读标签，未知/问一下/当前推进/等待仍保留原字面。原结构模式保留已有个人展示排列；新正式字段的来源父级/深度保持，但展示兄弟位置和原生源序不同，未声称精确原生全序。

随后实际视觉复验发现原结构模式不可读：原生 Chromium 的 369px 阅读区域中，row 四列为 `18px 18px 259px 30px`，正文 grid-column=auto，被自动放入 18px 控制列，中文逐字竖排；总滚动高度 110169px。故前述身份/版本/书签通过不能推出原结构视觉可用。原始证据 `structure-layout-failure-runtime.json` 与上述摘要的 visualFailure 保留。修补共享行样式将正文明确放入第 3 个伸缩文字列；报告模式既有更高优先级第 2 列保持。加入 report→structure→report 的节点/正文/计算列回归，确认旧实现实际失败，新实现相关 13 项通过；新包及同包核心闭环需重新验证，旧组合包不作为最终视觉通过包。

目录最终演练见 [package-directory-stage-evidence.json](assets/reading-agent/package-directory-stage-evidence.json)。禁用/重启后通过真实访达复制本次材料根、在只读同步入口粘贴恢复访问，23 个当前层项可读。额外合成 MD 通过真实“改文件名”操作变为“自动加入改名验收.md”，材料 ID `78b5bb2a-2f75-48f7-a4f7-25c0529e116f`、正文 SHA 保持，rename Journal complete，旧/新 reference 的 ID 同一；物理 identity=null，未宣称自动跟随任意外部改名。仅把固定自有 materials 目录独占移到自有离线路径：目录 complete=false，材料记录/ID/reference 保留、availability=unavailable；旧材料方案新选择拒绝 material-outside-scope，状态 material-unavailable。证据脚本最初猜错原因已纠正，未改产品行为。恢复原目录后实际自动重读 23 当前项，原 ID/版本/路径恢复，同方案材料按钮再次打开同一目标/版本，原文与 Graph SHA 保持，24 个原样本全程 SHA 保持。被动 plan listing 在新读取校验前仍含上次 current 状态；新选择会现场校验，不称所有异步提示即时刷新。

原结构文字列修补后的 `tmp/structure-layout-check.log` 全量通过 799 项，零失败/跳过/取消；requirements/typecheck/lint/test/sandbox/build/boundaries/taste 均通过。后续仅修改证据探针/摘要/交接，相关 ESLint 和 diff 检查通过。修补的新安装包/实际视觉与最终核心闭环尚需验收，不能把这次自动门禁改述为 Desktop 已修复。
