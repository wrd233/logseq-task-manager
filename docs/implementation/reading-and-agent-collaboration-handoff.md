# 阅读编排、Agent 协作与最终联调：实施记录

状态：**实施中，未完成交付**。不作为生产安装建议，也不把函数测试记为 Desktop 通过。

共同 BASE_SHA：`5b05d156cc03b37956d6f77de2d10213a6cb58e3`。按 REMOTE-START 明确 fetch `codex/workbench-visual-refresh` 后解析并固定；它包含视觉刷新 `eb07013d119584dbd3c68012541f1355118d2b0b` 和配套资料。B 分支为 `codex/reading-and-agent-collaboration`，使用独立管理工作树；用户主工作树 main 不变。Node 20.20.2 / npm 10.8.2，依赖独立安装。真实本机 Logseq 0.10.15/macOS ARM64 已开始隔离局部验收，完整最终安装验收仍待完成。

A 完整 SHA：**尚未交付/取得**。未合入 A，不新建整合分支，不推送、PR、main 合并、发布或联系其他聊天。

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

接口及限制见 [阅读方案契约](../design/reading-plan-contract.md)。材料入口目前使用基线真实 list/read/reference/open 服务的窄适配，未复制 A 的目录/预览算法；不把 mock 当作跨支通过。页面型阅读方案使用真实 page scope，空页面不伪造块；外部页面协作连接尚待扩展现有块范围基线。

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

仍是开发目录加载，尚未在最终 ZIP 或真正 Kernel 注册的正式对象上完成这组 Desktop 验收。基线 reference 标签仍消费真实服务返回值，完整当前文件名标签由 A 最终接线验证；不自行猜材料 UUID/路径。物理 IME、Finder、系统剪贴板完整保留、跨平台和普通 IO 竞态仍未由这些结果证明。

格式整理已接通独立 CLI `formatting.preview/result/recover` 和本地“查看并整理行首格式”。Agent 只提出来源绑定的真实差异；本地明确写入的是这一份不可变行首补丁，body/file/TODO 许可不会因此开启。默认自然标记及显式额外自然标记可选择，正式/受管标记禁止。64 处有界操作复用原 executor 和 Journal，记录本地确认作者、实际提议来源及已返回指导版本。旧 content 语法与 TODO 保护不放宽。全部范围版本逐组核对，只有本次已确认写入的版本可推进；其他来源的新条件会阻止旧提议。代码栅栏、缩进代码、HTML/Org/公式字面段、引文及延续行、字面祖先、属性、正式对象和任务保持；无法确认的范围保留。未知和部分结果先查询，明确 keep-current 后再产生新写入，不升级丢失的归属。

格式阶段 `tmp/format-check-final.log` 全量通过 761 项、零失败；随后 `tmp/format-check-delivery.log` 通过 762 项、零失败，全部 requirements/typecheck/lint/test/sandbox/build/boundaries/taste 通过。新增 11 项回归和真实独立 CLI 接线演练；覆盖受限差异、原句/CRLF/UTF-16、字面及受管边界、独立只读许可、多块自身版本推进、其他来源同时补充、部分/未知/日志失败、原生 id 读回、作用域与输入保护。实际差异总量超过 1 MiB 时要求缩小范围，不缓存或写入超限预览。CLI 测试使用真实独立进程/文件/Journal，但其 SDK 夹具仍不算 Desktop。

真实 Desktop 从本地保存明确的合成格式请求，read-only 连接的 body/file/TODO 都为 false。构建 CLI 对原有第 32 块 `[问一下]` 提出仅一个标记加粗的差异；原生编辑器在第 28 块保存“用户补充：不过离线阅读时也要保留问号与限定句。”，再从本地确认旧差异，实际 0/1、CONFLICT/FORMAT_SOURCE_CHANGED、日志已确认。原句/旧差异仍在。用户明确保留当前原文后，CLI 重读并提出新差异，本地再次查看/确认，实际 1/1 APPLIED_VERIFIED、durable=true。前后 104 来源的 UUID、父级、顺序、深度及数量保持；新鲜基础上只第 32 块的行首从 `[问一下]` 变成 `**[问一下]**`，全部其余内容及新增条件保持，Graph 文件持久化核对通过。原 requestId 的 recover 返回同一确认摘要，未发第二次写入。

证据为 [format-stage-evidence.json](assets/reading-agent/format-stage-evidence.json)，原始 `tmp/reading-desktop/evidence/format-exercise.json` 和 `format-final-runtime.json`；可携带脚本 `scripts/format-desktop-exercise.mjs` 只发真实 CLI 预览/查询，编辑和确认由实际 UI 完成，没有许可/SDK/IPC 注入。只读探针观测 104 阅读来源、100 个原生挂载、editing=false、零异常。仍是开发目录加载；随后源码新增能力说明、并发提议归属复核与保留当前提示措辞，不将它们混记成此运行 hash。新构建及最终包需按原矩阵重验。

仍需实施并验证：三条完整真实协作过程（当前格式场景只证明其中格式/同时补充子路径）；真正 Kernel 正式对象的 Desktop 边界及最终包 TODO/恢复复验；页面型外部协作入口；真实折叠/跨工作导航、物理 IME 及晚到调用的更多宿主验证；A 适配与五类预览/目录；最终安装包仓库外加载及完整矩阵。具体要求仍以两支 prompt 和共同契约为准。A 尚无最终 handoff/SHA，不合入其未提交或未经交付的内容。

最终 SHA、A 合入事实、ZIP/hash、三条演练、Desktop 格式矩阵、物理 IME/Finder/剪贴板及平台限制待实际执行后补齐；不能由这份阶段记录代替最终验收。
