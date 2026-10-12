# DSH 插件设计基线

2026-10-11。本机验证目标为 DSH 0.2.0-rc.2；上游 master 为 0.2.1-alpha.2，正式实现以安装版本的类型和行为为准。

## 产品职责

Logseq 持有原文、行首语义标记、工作身份、授权与写回结果。DSH 持有会话、模型执行和面向会话的界面。插件把同一份工作带入 DSH，不复制一套项目管理状态。阅读编排仍通过现有有限方案协议进行，不接受任意 HTML 或替换原句。

最新界面方向（2026-10-11）：DSH 原生对话与输入框保持中心。左侧保留会话导航，按需显示当前会话关联的 Logseq 原文摘要；右侧是可收起的密集工作文件列表。文件点击后使用本机应用打开，DSH 插件不再内置文件阅读器。Logseq 中既有的连续阅读和语义标记功能仍属于 Logseq 本身。当前示例为 `prototype/chat-first.html`，此前的阅读优先原型仅保留作设计历史。

全貌后续通过单独入口或统筹会话进入，不常驻日常对话区。首版采用领域 → 项目 → 工作的紧凑分组列表，缺少来源就显示未知。未接入实际投入时不绘制比例面积，跨领域引用不重复计作正式归属。

## 已核对的接口与缺口

| 需求 | 已有能力 | 插件需要完成 |
| --- | --- | --- |
| DSH 浏览器 UI | `dsh.client`、客户端模块、Slots、会话行扩展、header utilities、右侧 tab 注册 | `./client` bundle、关联入口与摘要浮层、工作文件 tab、恢复状态 |
| 当前工作 | `collaboration.read/refresh`、来源版本、指导、草稿排除、权限现场 | 稳定的 DSH Session → Logseq binding；有限上下文预算与过期处理 |
| 工作文件 | `files.list/read`；材料关联、目录观察；DSH 外部打开宿主能力 | 合并列表、受控路径解析、外部打开与定位、对话引用 |
| 正式对象 | Kernel 已有 `/v1/console/world`，含正式对象及归属相关投影 | 用户端读取许可、Graph 过滤、分页；不能把整个 console payload 直接送入模型 |
| 自然工作 | Logseq 工作范围、目录注册和来源身份 | 与正式对象合并的显式索引；去重、失联标记、未关联工作覆盖范围 |
| 工作全貌 | 现有总体设计定义领域、项目和工作层级 | 不同来源的统一投影；目前没有对 DSH 开放的完整全貌接口 |

`所有` 必须显示覆盖范围：当前 Graph、已索引工作、上次成功读取时间、遗漏/截断。Kernel 未启动仍可看已关联自然工作；这不能标称全部正式对象。对象出现于全貌，不自动赋予当前 agent 其正文或文件权限。

## 身份与数据流

三种身份分别保存：DSH session id、Logseq workspace id、Graph + root UUID；DSH 会话 cwd 只是执行目录。UI 选择项 `browsingWorkspace` 与绑定项 `sessionBinding` 独立。

浏览另一个对象只改变界面。首版提供“为此工作新建会话”：明确新身份和现场，不让旧对话历史在新工作里继续生效。已绑定会话切换原生普通子块也不切换工作。接入握手必须由 Logseq 端签发有效 connection，界面按钮本身不生成授权。

正式 UI 的流向为：浏览器组件 → DSH Remote → 宿主 bridge service → 现有本机 companion → Logseq 权威读取/受控操作。私有 descriptor / token 只留在宿主，不放客户端、资源地址或聊天记录。全貌阅读另设用户级索引通道，不绕过当前工作 connection 的单范围约束。

图切换、撤销连接、目录重绑：停掉旧读取，清空可操作现场；旧会话和最后已知数据可保留，但标记失联与时间。响应须核对 session / binding generation / source version，丢弃晚到结果。

## 文件与外部打开

文件页直接显示工作默认目录及外部关联目录中的文件。`目录` 是来源，不是把文件藏起来的另一套入口。密集行显示名称、所在目录、来源；重名保留完整相对路径，不按 basename 去重。目录可折叠。材料稳定 ID 另存，不要求每个可见文件先成为材料。

首版 DSH 列表只承担打开、定位和引用，导入留在 Logseq 既有材料入口；后续若接拖入，必须明确目标目录和写入能力，不把所有入口都放在初始界面。

所有格式都走外部打开，不在 DSH 内构建 Markdown、PDF、图片、Word 或 Excel 预览。文件行默认动作是使用系统关联应用打开；更多菜单只保留外部打开、显示文件位置、引用到对话。目录沿用原生访达/文件管理器打开控件的样式。

DSH 已有 `ui-open-in-app` + `host-open-in-app` 及 Session Remote 打开/定位能力。现有 `session.openWorkspacePath` 保留会话路径边界；Logseq 外部关联材料可能不在 session cwd 下，必须由 Logseq bridge 验证材料身份、当前绑定和路径再交宿主打开，不能把任意浏览器传入的绝对路径交给原生打开器。无需读取整个文件或准备预览字节就能打开。

用户打开文件不代表模型读懂内容。“引用到对话”创建工作/材料/版本引用，由模型工具按需读取。PDF 文本提取、图片视觉输入和 Word 文本结构仍分别适配，注明来源与截断；外部打开动作不触发模型读取。

## 已验证的 UI 扩展边界

本次通过认证入口打开本机 DSH 0.2.0-rc.2，检查了真实对话、56px 收起轨道、展开会话导航及右侧面板，并核对安装包类型。

| 呈现 | 已有扩展点 | 约束 |
| --- | --- | --- |
| 左侧关联标识 | `sidebar.session.row.leading`，root / list | 小型会话状态标识，不把整段正文塞进 leading 席位 |
| 左侧来源摘要 | `sidebar.session.row.hover`，或 row action + 插件自有 `shell.overlay` | 原生 hover 摘要只在浮层打开时挂载；点击摘要可用插件自有浮层，仍需实际 React 挂载验收 |
| 左侧会话动作 | `sidebar.workspaces.session.row.action/menu.item` | 通过会话身份解析 Logseq 绑定 |
| 会话头部关联入口 | `conversation.session.header.utilities`，session / list | 一个紧凑入口，原输入框和模型控件继续归 DSH |
| 右侧工作文件 | `ctx.sidebarRightTabs.register` + keyed `sidebar.right.pane.tab` | 注册 `logseq-files` 页，沿用面板收起与会话作用域 |
| 外部打开 | `ui-open-in-app` / `host-open-in-app`；受控 bridge | 宿主重新验证材料路径及可用应用，失败就地反馈 |

当前左栏没有通用的常驻正文内容插槽；`sidebar.workspaces` 是由原生浏览器占用的 single slot。因此本方案只承诺会话关联入口与按需摘要，不替换原生会话树。如果以后要求左栏持续显示完整正文，应先新增一个专用内容席位，不能宣称现有 SDK 已支持任意左栏区域插入。

原型保留原生产品的白/深灰表面、蓝色强调、对话/轨迹切换和圆角输入框；没有修改运行中 DSH 的代码。文件外部打开、Logseq 定位、引用和模型回复均为本地模拟。

## 会话与全貌

当前会话只携带当前工作已保存正文、指导、必要材料索引和明确选择的片段；不发送整个 Graph。文件菜单中的“引用到对话”创建指向工作/文件/版本的引用，由现有受控读取工具取内容。原型模拟这个引用，不连接真实模型。

全貌分析使用独立的统筹会话：按显式选择的对象集合、期限/等待事实和必要摘要读取；进入深层正文再次检查该工作读取能力。AI 可以解释与提议，正式归属/完成状态仍走既有治理路径。

状态分属两处：DSH 保存会话绑定引用与面板/滚动布局；Logseq 保存阅读方案、材料身份与原文。UI 标签/排序不成为原文必填字段。原型保存的是本地演示选择，不保存真实路径、密钥或聊天记录。

## 交付顺序与验收

1. 本次：feature 分支、项目内设计、可交互原型、保留原生 host 验证适配器。
2. 原生挂载：构建客户端 bundle，注册会话关联入口、摘要浮层及工作文件 tab；Remote 只读 bridge、会话握手与清理。
3. 文件：实际列表、来源目录、受控外部打开与定位、明确文件引用。
4. 全貌：合并正式对象/自然工作索引，验证跨 Graph 过滤、去重、失联、分页、未知字段和索引覆盖范围。
5. 模型：上下文预算、取消、刷新竞态、阅读方案 UI；再接可审阅写回。

原生宿主研究已验证 Tools、SystemPrompt、AgentLoop 及真实 companion 路径，但使用合成 Logseq SDK 和脚本模型，不能替代正式桌面 UI + 真实模型的最终验收。原型本次检查交互、明暗主题与窄屏；没有声称已完成步骤 2–5。

参考：
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/modules/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-slots/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-sidebar-right/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-sidebar-files/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-sidebar-documentpreview/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-workspace/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-open-in-app/README.md

## 2026-10-11 实现状态

正式实现现位于 `src/`，已链接到本机 web profile。原生客户端 bundle 注册头部/会话动作、原文 overlay 子席位和右侧文件 tab；host 通过 Connection 的 exact Fetch routes 提供认证 RPC，与原生 /api interceptor 共存。会话绑定私有持久化、身份核验、取消/刷新、预算和模型工具已实现。

宽屏临时几何适配使用 frame 的 `data-shell-overlay` / `data-sidebar-right-panel` 地标：左栏 360px、右栏 280px，避免浮层挡住对话。rc.2 尚未提供左栏几何 setter；此适配只在原文打开且宽度 >=1100px 时生效，关闭/卸载撤销。框架原生外部打开接口已实机验证访达定位。

生产插件验证包含真实 companion + 原生 AgentLoop + 脚本模型，但 Logseq SDK 是合成的。实机浏览器验证使用同一隔离 companion，确认原文/文件、原生草稿引用、文件定位和关联清理；真实用户 Graph 与远端模型未代替用户试用。原型内的模拟消息不属于正式插件。

全貌索引、二进制文件模型输入、自定义引用 chip 和可审阅写回仍未交付。当前身份/来源解析延续 Logseq 原有协议，不变更行首语义。实际安装和剩余限制以 README 为准。

## 2026-10-12 共享读法交付

共享读法已在 `feature/shared-reading-views` 集成：命名方案、工作选择、基础模式和上一版恢复由 Logseq 状态统一提供，DSH 两秒轮询并使用便携布局投影。Logseq 保留原有 shell 和阅读器；Markdown 与行首标记解析共享。方案按工作保存在当前 Logseq profile 的 localStorage，不保存原句副本。

同一 planId 可更新命名读法；新 planId 新增。原文变化保留布局，新增段落保留在“新增 · 尚未归类”，删除来源移出。用户切换选择后，Agent 的晚到结果只保存；同一工作其他会话能选择已有方案，请求提交仍由各自邀请归属约束。实现和完整验收见 `shared-reading.md`；全貌、任意新渲染组件和文件窗口不在本轮范围。
