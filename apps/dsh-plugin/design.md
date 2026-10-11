# DSH 插件设计基线

2026-10-11。本机验证目标为 DSH 0.2.0-rc.2；上游 master 为 0.2.1-alpha.2，正式实现以安装版本的类型和行为为准。

## 产品职责

Logseq 持有原文、行首语义标记、工作身份、授权与写回结果。DSH 持有会话、模型执行和面向会话的界面。插件把同一份工作带入 DSH，不复制一套项目管理状态。阅读编排仍通过现有有限方案协议进行，不接受任意 HTML 或替换原句。

界面只有两个尺度：单份工作（正文、文件）和工作全貌。单工作默认是连续阅读；对话按需打开或并排。全貌首版采用领域 → 项目 → 工作的紧凑分组列表。列表呈现已有方向、主要下一步和等待事实，缺少来源就显示未知，不凭空补任务。未接入实际投入时不绘制比例面积；跨领域引用不重复计作正式归属。

## 已核对的接口与缺口

| 需求 | 已有能力 | 插件需要完成 |
| --- | --- | --- |
| DSH 浏览器 UI | `dsh.client`、客户端模块、Slots、右侧 dock / fullscreen、tab 注册 | `./client` bundle、服务依赖声明、Logseq 工作 tab / 全貌 tab、恢复状态 |
| 当前工作 | `collaboration.read/refresh`、来源版本、指导、草稿排除、权限现场 | 稳定的 DSH Session → Logseq binding；有限上下文预算与过期处理 |
| 工作文件 | `files.list/read`；材料关联、目录观察；现有多格式阅读 | 目录与材料合并投影；明确来源、截断和错误；二进制授权传输 |
| 正式对象 | Kernel 已有 `/v1/console/world`，含正式对象及归属相关投影 | 用户端读取许可、Graph 过滤、分页；不能把整个 console payload 直接送入模型 |
| 自然工作 | Logseq 工作范围、目录注册和来源身份 | 与正式对象合并的显式索引；去重、失联标记、未关联工作覆盖范围 |
| 工作全貌 | 现有总体设计定义领域、项目和工作层级 | 不同来源的统一投影；目前没有对 DSH 开放的完整全貌接口 |

`所有` 必须显示覆盖范围：当前 Graph、已索引工作、上次成功读取时间、遗漏/截断。Kernel 未启动仍可看已关联自然工作；这不能标称全部正式对象。对象出现于全貌，不自动赋予当前 agent 其正文或文件权限。

## 身份与数据流

三种身份分别保存：DSH session id、Logseq workspace id、Graph + root UUID；DSH 会话 cwd 只是执行目录。UI 选择项 `browsingWorkspace` 与绑定项 `sessionBinding` 独立。

浏览另一个对象只改变界面。首版提供“为此工作新建会话”：明确新身份和现场，不让旧对话历史在新工作里继续生效。已绑定会话切换原生普通子块也不切换工作。接入握手必须由 Logseq 端签发有效 connection，界面按钮本身不生成授权。

正式 UI 的流向为：浏览器组件 → DSH Remote → 宿主 bridge service → 现有本机 companion → Logseq 权威读取/受控操作。私有 descriptor / token 只留在宿主，不放客户端、资源地址或聊天记录。全貌阅读另设用户级索引通道，不绕过当前工作 connection 的单范围约束。

图切换、撤销连接、目录重绑：停掉旧读取，清空可操作现场；旧会话和最后已知数据可保留，但标记失联与时间。响应须核对 session / binding generation / source version，丢弃晚到结果。

## 文件与预览

文件页直接显示工作默认目录及外部关联目录中的文件。`目录` 是来源，不是把文件藏起来的另一套入口。密集行显示名称、所在目录、来源；重名保留完整相对路径，不按 basename 去重。目录可折叠。材料稳定 ID 另存，不要求每个可见文件先成为材料。

拖入明确默认目标，默认复制并保留原文件；重名询问或给出可撤销方案。浏览 UI、读取文件和写文件为不同能力。原型只模拟名称加入，不执行复制。

阅读目标：Markdown、PDF、图片、Word。连续滚动，精简工具栏；仅保留回到列表、讨论此文件、必要的打开原文件。Markdown 可沿用现有渲染；PDF.js 连续页与按需画布；图片原生 viewer；DOCX 可复用现有转换，旧 DOC 需单独验证 LibreOffice → PDF 能力。Excel 仅列出并允许外部打开。

DSH 现有 documentpreview 已有 Markdown / 图片 / PDF / Office 路线，但它通过 DSH Session 文件地址读取。Logseq 材料可能不在 session cwd 下，不能伪造原生 file 地址绕过路径边界。先使用 Logseq 资源地址与 bridge 字节读取，只有完整符合原生 workspace 授权条件时才委托原生预览。可复用 renderer 实现不等于资源授权可以复用。

Word 转换引擎未安装、字体不足、文件损坏、大小超限都就地说明并提供原文件入口。用户看到文件不代表模型读懂其内容：PDF 文本提取、图片视觉输入、Word 文本结构分别适配，注明页码/来源/版本/截断；按需读取，不把全部二进制塞入提示词。

## 会话与全貌

当前会话只携带当前工作已保存正文、指导、必要材料索引和明确选择的片段；不发送整个 Graph。点“讨论此文件”创建指向工作/文件/版本的引用，由现有受控读取工具取内容。原型模拟这个引用，不连接真实模型。

全貌分析使用独立的统筹会话：按显式选择的对象集合、期限/等待事实和必要摘要读取；进入深层正文再次检查该工作读取能力。AI 可以解释与提议，正式归属/完成状态仍走既有治理路径。

状态分属两处：DSH 保存会话绑定引用与面板/滚动布局；Logseq 保存阅读方案、材料身份与原文。UI 标签/排序不成为原文必填字段。原型保存的是本地演示选择，不保存真实路径、密钥或聊天记录。

## 交付顺序与验收

1. 本次：feature 分支、项目内设计、可交互原型、保留原生 host 验证适配器。
2. 原生挂载：构建客户端 bundle，注册单工作 tab，Remote 只读 bridge，会话握手与清理。
3. 文件：实际列表、来源目录、受控字节读取、多格式预览、明确文件引用；拖入接入真实写入授权。
4. 全貌：合并正式对象/自然工作索引，验证跨 Graph 过滤、去重、失联、分页、未知字段和索引覆盖范围。
5. 模型：上下文预算、取消、刷新竞态、阅读方案 UI；再接可审阅写回。

原生宿主研究已验证 Tools、SystemPrompt、AgentLoop 及真实 companion 路径，但使用合成 Logseq SDK 和脚本模型，不能替代正式桌面 UI + 真实模型的最终验收。原型本次检查交互、明暗主题与窄屏；没有声称已完成步骤 2–5。

参考：
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/modules/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-slots/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-sidebar-right/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-sidebar-files/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-sidebar-documentpreview/README.md
