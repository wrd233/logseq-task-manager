# 可组合阅读方案：数据及完整性边界

历史 B 共同 BASE：`5b05d156cc03b37956d6f77de2d10213a6cb58e3`。下文保留无损原文布局契约；2026-11-19 的渐进式阅读扩展见末节，仍使用 schema v1，补充而非替换原文方案。

以下记录的是原文布局方案的历史基线：当时已接通数据校验、独立阅读控制器、界面和既有本机 CLI，隔离 Logseq 0.10.15 完成局部演练，尚未完成最终安装包及其余协作路径验收。新分支的安装包与真实模型验收另见 [渐进式工作台实施记录](../implementation/logseq-progressive-workspace-validation.md)。

`features/work-view/reading-plan.ts` 的 schema v1 引用真实 `SourceSnapshot`：requestId、planId、名称、scope、structureVersion、sourceSetVersion，以及完整 sourceId/contentVersion 集合。正文由插件获取，不允许替代正文、HTML、脚本、样式、actor 或权限字段。来源只有一次主要展示，重复句保留不同身份；必要上下文另列实际来源。

布局可组合，不是固定模板选择：

| 单元 | 字段 | 作用 |
| --- | --- | --- |
| sequence | key、sourceIds | 连续的原始块内容 |
| paragraphs | key、sourceIds | 连贯段落读法，仍有逐来源边界 |
| group | key、title、children | 局部组及来源集合标题 |
| comparison | key、title、2–4 个带 key/title/children 的列 | 各列完整原句及上下文对照 |
| material | key、materialId | 当前许可材料集合中的真实入口，不携带 path/role 或写权限 |

所有节点有不同的显示 key；key 与标题都不构造可写 UUID。校验返回标题的主要成员以及缺失的真实祖先上下文。点击所需的来源集合从实际 ID 扩展后代，选择重复句时不匹配文本。显示文本必须用安全的文本节点；标题是读法说明，不代表正式状态或认可。

校验要求全部原句的主要来源出现一次，全部原始版本在场，不接受缺失来源、跨 Graph/页面、缺少版本、旧内容/结构/sourceSet 或来源不可用。一个父块及其整棵子树保持连续；普通解释块的子项顺序保持。显式工作对象内可以调整稳定类别连续区间，仍保持同类别的源顺序；未知标记、无标签、含条件/不确定表达的来源与紧邻项固定，嵌套工作对象固定。即使类别检查允许移动，也必须重复展示完整的原序邻域及其后代作为来源上下文，不能把类别标签当作语义独立的证明。无法满足这些条件的重排拒绝，不自动改写原句。

条件和不确定性的文本检查属于保守限制，不是语义判断器。标题中明显的确定/全部完成断言在来源包含不确定表达时被拒绝；这不构成对任意语言全部语义的证明。后续界面须明确标题来自阅读层，完整展示原始限定与反例。

输入上限：2,000 个布局/列节点、16 层布局、10,000 个主要来源、序列化方案 1 MiB；含上下文的实际正文展示不超过 20,000 份来源/8 MiB 原文，按继承上下文去重后计算。文字、键和哈希各有界。未知字段、访问器、稀疏数组、重复 key 等不进入展示。读取大范围并不保证能生成超过这些上限的方案。

ReadingPlanController 拥有实际请求、基础版本及当前生命周期，最多保留 32 个请求/8 个方案。提交检查请求存在、基础版本和真实来源；同 ID 的相同重试幂等，显式更新可替换同名视图并保留上一版本。切换到缓存方案重新读取来源及核验材料范围；取消/切换/卸载使晚到结果失效。仅重排的原文方案按旧机制重新核验，带简报的方案保留旧依据并标记变化；来源失联不冒充已读取。

通道的阅读请求归属包含 instanceId、connectionId 和 clientId，提交必须匹配实际邀请；clientId 是调用者提供的会话关联标签，不是独立认证凭据。真正的信任来自既有本机私有连接、受信本地许可、绑定范围和 ScopeLease，外部不能指定 actor/root/权限。撤销连接同时使控制器中等待来源读取的请求/选择及原生高亮失效。页面来源保持真实 page scope，空页面不伪造可写根块；渐进式工作台已将页范围用于阅读交接，并不因此扩大任何原文或正式工作的写入权限。

界面复用每个主要来源的实际节点，标题和上下文副本没有可写 UUID。正文点击与 Enter/Space 保留展示焦点后调用独立 NativeSourceSetHost；显式“编辑原文”才调用原生编辑入口。标题使用成员后代与确切上下文的并集，祖先上下文不扩展无关兄弟内容。文字选择/复制、链接和材料按钮不触发整行定位；Esc 取消，组合输入期间不执行取消或布局切换。

NativeSourceSetHost 不调用 editBlock/updateBlock/setBlockCollapsed，不设置 textarea.value、不重建输入、不回灌草稿。缺少 DOM 时使用宿主 page/anchor 路由，重新校验来源/Graph/生命周期；正在输入时不路由。结果区分 requested、mounted、highlighted、viewport-visible 和 unavailable；新挂载但还没实际带标记的 DOM 不报告已经高亮。实际折叠/未挂载来源不能冒充已经标记。观察器支持宿主替换整个 main 容器后重新标记，范围变化/取消/卸载释放标记和监听。尚未通过所有实际折叠、物理 IME、平台与最终 ZIP 场景，不作全场景保证。

实际 CLI 入口：`workspace reading request --purpose <要求>` 返回已保存完整来源和材料 ID；`reading submit --input-file <方案>`、`read`、`select <planId>`、`original`、`cancel <requestId>`；`highlight --input-file <来源集合>` 和 `clear` 是只读来源定位。JSON 由 Agent 根据实际请求/版本生成，日常界面只展示方案名称、过期状态和返回原结构。

历史回归使用 101 个来源、4,041 个中文字符和四层关系的冻结合成样本。函数、DOM、独立 CLI 进程和真实隔离 Desktop 证据分别记录，不能互相替代，历史整项验收边界见原实施 handoff。渐进式工作台已经另行复验材料返回、阅读与原生写作、真实模型和 ZIP 重载；Journal、普通 TODO、共同指导的独立整项验收不在本轮范围内。

## 渐进式扩展（2026-11-19）

复用 `codex/contextual-work-briefing` 的 `briefing` 概念：`basisVersion` 等于邀请的 `sourceSetVersion`，`createdAt`、`paragraphs`（及可选 `followUps`）。段落含 `key`（稳定语义键，旧格式可省略）、`markdown`、`kind: fact|inference|suggestion`、`sourceIds`、可选 `tone: progress|attention` 和 `details`。每个 detail 包含唯一 `key`、`markdown`、真实 `sourceIds`，可选 `heading`、`kind`、`display: quote|table|chart` 和真实 `materialIds`。不要求固定章节或固定段落数。

- 顶层只概括数秒内恢复工作所需的最少信息，不要求概括所有记录；第一层描述是丰富的连贯文章，组织思路、条件、历史与必要冗余；第二层引用对应的原始内容。`layout` 仍需完整覆盖原文，未被简报概括的记录有独立可达入口。
- `ReadingViewStore` 按工作持久化方案和生成时的 `basis: SourceSnapshot`、`materialBasis`（可用版本和有界摘录），显式更新保存上一次修订及依据。旧简报不随当前快照重新贴版本；缺少旧快照的迁移数据标记未保存。比较 sourceId/contentVersion、结构和 material version，新增及移除来源不消失。
- 允许模型建议表格/图表形式，数值只由真实来源中的 Markdown 表解出；不接收模型制造的数值数组、HTML、可执行样式或任意文件路径。渲染器拥有交互、主题、宽窄布局。完整材料仍由材料 owner 打开。
- 历史第一轮的 Logseq「AI 整理」/「提问」以控制器 `request`、companion `/plugin/reading-model` 与配置模型完成；组织结果直接回到 `submit`。文章式 Agent 后续契约在下节描述，路径名称保留。
- DSH 继续使用同一份 `reading.view` 投影及 reading request/submit 工具。交接请求与来源版本只随明确用户动作进入对应 session，默认加入草稿由用户发送。

实现边界与场景见 [渐进式工作台](progressive-workspace.md)、[情境化阅读渲染](contextual-work-rendering.md)。本节描述本分支契约，真实宿主和模型验证结果以实施记录为准。

## 文章、Agent 与候选（2026-11-19 后续）

- schema v1 增加可选 `paragraph.cue`：可见 Markdown 中连续、无标记的短语。渲染器验证可定位性，找不到则使用轻量细读入口；没有描述的段落可以直接带脚注。旧方案无需迁移。detail 的 `materialQuotes` 为 `{materialId,quote}[]`，必须属于已关联资料并在真实捕获文本中逐字存在；不接受模型自造图表数值。
- 读取邀请保留完整主来源快照、实际关联材料版本和有界文本。已明确关联的 Logseq 页/块作为关联资料（`note` scope），仍区分主工作与临时浏览。文本资料可由工具分次读取，超出摘要的关联 Markdown 在捕获上限内可读；小型图片以材料 owner 的真实字节与版本提供本地预览，不虚构视觉理解。
- 复杂请求通过 DSH `agents.create` 创建独立原生任务，限制可见和可执行工具为范围索引、精确原块读取、关联资料读取、结构化成果提交。模型不直接接收整个固定文本包，而经实际工具按需读取已保存邀请；任务结束释放 handle，不占用户既有聊天。短且资料充分的请求、选中普通块的改写可使用快速生成。取消传播至 companion/DSH。
- 已有文章的 `prepare` 验证邀请、来源集合/结构、关联资料版本与原方案修订，保存单独候选，不改变已选方案；`adopt` 重读并核对实际来源和修订，再写入同一 planId，保留上一修订及依据。DSH 同名文章工具提交也准备候选。候选可保留待查看、暂不采用；主动准备须用户逐工作开启，已保存变更稳定后发起。后台局部修订复用未变化的单元；显式重新整理允许合并或下沉过长的顶层段落，尽量沿用仍适用的语义键。旧 `followUps` 兼容读取但也是顶层，不作为细读的替代。
- 版本标识、scope 和 UUID 保留于内部契约/历史，不是正文显示字段。现有 reading.view 共享已采用文章，候选状态独立；无模型时原文和已有成果可继续阅读。
