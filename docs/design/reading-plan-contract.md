# 可组合阅读方案：数据及完整性边界

本轮 B 共同 BASE：`5b05d156cc03b37956d6f77de2d10213a6cb58e3`。执行依据为 `docs/implementation/prompts/2026-10-07-agent-collaboration/` 中的共同契约和两支 prompt。

当前已接通数据校验、独立阅读控制器、界面和既有本机 CLI。隔离 Logseq 0.10.15 与随构建生成的 companion 已完成阅读局部演练；最终安装包与其余协作路径仍在实施。这不构成整项生产交付声明。

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

ReadingPlanController 拥有实际请求、基础版本及当前生命周期，最多保留 32 个请求/8 个方案。提交检查请求存在、基础版本和真实来源；同 ID 的相同重试幂等，不同方案不能替换同 ID。切换到缓存方案重新读取来源及核验材料范围；取消/切换/卸载使晚到结果失效。来源变化撤销当前方案，旧方案仍可辨认过期状态；来源失联也不冒充仍可呈现。

通道的阅读请求归属包含 instanceId、connectionId 和 clientId，提交必须匹配实际邀请；clientId 是调用者提供的会话关联标签，不是独立认证凭据。真正的信任来自既有本机私有连接、受信本地许可、绑定范围和 ScopeLease，外部不能指定 actor/root/权限。撤销连接同时使控制器中等待来源读取的请求/选择及原生高亮失效。页面来源保持真实 page scope，空页面不伪造可写根块；当前外部连接基线仍是块范围，页面外部协作入口尚待实施。

界面复用每个主要来源的实际节点，标题和上下文副本没有可写 UUID。正文点击与 Enter/Space 保留展示焦点后调用独立 NativeSourceSetHost；显式“编辑原文”才调用原生编辑入口。标题使用成员后代与确切上下文的并集，祖先上下文不扩展无关兄弟内容。文字选择/复制、链接和材料按钮不触发整行定位；Esc 取消，组合输入期间不执行取消或布局切换。

NativeSourceSetHost 不调用 editBlock/updateBlock/setBlockCollapsed，不设置 textarea.value、不重建输入、不回灌草稿。缺少 DOM 时使用宿主 page/anchor 路由，重新校验来源/Graph/生命周期；正在输入时不路由。结果区分 requested、mounted、highlighted、viewport-visible 和 unavailable；新挂载但还没实际带标记的 DOM 不报告已经高亮。实际折叠/未挂载来源不能冒充已经标记。观察器支持宿主替换整个 main 容器后重新标记，范围变化/取消/卸载释放标记和监听。尚未通过所有实际折叠、物理 IME、平台与最终 ZIP 场景，不作全场景保证。

实际 CLI 入口：`workspace reading request --purpose <要求>` 返回已保存完整来源和材料 ID；`reading submit --input-file <方案>`、`read`、`select <planId>`、`original`、`cancel <requestId>`；`highlight --input-file <来源集合>` 和 `clear` 是只读来源定位。JSON 由 Agent 根据实际请求/版本生成，日常界面只展示方案名称、过期状态和返回原结构。

当前回归使用 101 个来源、4,041 个中文字符和四层关系的冻结合成样本。函数、DOM、独立 CLI 进程和真实隔离 Desktop 证据分别记录，不能互相替代。真实 Desktop 局部结果及未完成范围见实施 handoff；材料预览、Journal 写作、普通 TODO、共同指导和最终 ZIP 的整项验收仍未完成。
