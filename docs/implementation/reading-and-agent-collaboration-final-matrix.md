# 阅读与 Agent 协作：最终本地验收矩阵

2026-10-10，本轮 B 实施与 A 合入的本地交付完成。结论限定于下列真实隔离验收，不是生产迁移、完整备份恢复或安全降级认证。

## 交付身份

- 分支：`codex/reading-and-agent-collaboration`，最终证据/指南提交由本分支 Git HEAD 定位。
- 共同 BASE：`5b05d156cc03b37956d6f77de2d10213a6cb58e3`。
- A 完整交付：`d0c38706b79c63f6f5b15e16286e1c49d28736ff`；本分支合入提交：`a5e0888c9d512045bf6805437517f4db67b44b67`。
- 当前 ZIP 应用源码：`16d2a420fc96d2a7420fb474436a18813b7a46c2`，不是后续仅增加证据/指南的提交。
- [可加载 ZIP](assets/simple-start-reading/task-copilot-workbench.zip)：SHA-256 `fd479b84940e1247b0176708e6097320b7c165016cf868c20a12ff94702dca51`。
- 安装实例：`/Users/wangrundong/Library/Caches/task-copilot-package-acceptance/integrated-focus-final`，仓库外、专用 Graph/profile/材料/通道。615 个 dist 资源逐项符合 clean build identity。
- macOS 15.1 ARM64、Logseq Desktop 0.10.15；协作 Node 20.20.2。只读观测使用 Node 24。没有 SDK、IPC、FileIO 或 Lab 注入。
- `npm run check` 全量 800 项通过，零失败/跳过/取消：`tmp/material-tab-focus-check.log`。实际 `npm run package:plugin` 生成记录：`tmp/material-tab-focus-package.log`。随后只改验收脚本和文档，新增脚本已通过 ESLint；不把脚本提交当成新的应用构建。

## 六项实施核对

| 要求 | 本轮实际结果与证据 |
| --- | --- |
| 版本化可组合读法 | 101 原始来源、4041 中文字符、四层；两种有效读法。追加与正规正式投影后分别核对103/104来源；Agent 只提交来源安排，原句来自插件。[核心](assets/reading-agent/package-focus-final-core-evidence.json)、[并发](assets/reading-agent/package-focus-final-collaboration-evidence.json) |
| 真实来源集合定位 | 初始25来源映射；最终 Enter 请求/挂载/标记104来源，当时可见5；Escape清除。折叠时只标记1、其余103明确不可挂载；正文选字不触发定位。[初始](assets/reading-agent/package-focus-final-initial-evidence.json)、[交互](assets/reading-agent/package-focus-final-interaction-evidence.json) |
| 带现场去协作 | 当前工作身份、保存来源、版本、材料、请求和指导经实际安装 CLI 读取；已有用户入口保留。真实输入期间导出104保存来源，nativeDraft included=false/editing=true。[输入](assets/reading-agent/package-focus-final-input-evidence.json)、[页面](assets/reading-agent/package-focus-final-page-evidence.json) |
| 一处指导、项目差异 | 共同指导 b24…→73f955616e77…，旧现场辨认失配，两工作重读同新版，各自差异不丢；已有用户 WORKSPACE 不变。[协作](assets/reading-agent/package-focus-final-collaboration-evidence.json) |
| 内聚写作与真实引用 | 做事、两轮讨论、零散记录三条真实 CLI/Graph/文件/Journal 过程；同请求可靠重试不重复。原生追加条件使旧格式提议/读法失效，明确重读后只整理一个行首。[TODO](assets/reading-agent/package-focus-final-todo-evidence.json)、[协作](assets/reading-agent/package-focus-final-collaboration-evidence.json) |
| 独立普通 TODO | 实际本地范围/操作许可，有据新建并完成子步骤，父任务仍 TODO；正文/文件权限不替代 TODO。真实正式标题/受管字段持久 BLOCKED，正式根不在受信 TODO 候选中；冷重启全部写许可撤销。[TODO](assets/reading-agent/package-focus-final-todo-evidence.json)、[正式边界](assets/reading-agent/package-focus-final-formal-evidence.json) |

## 十条跨模块路径

| 路径 | 实测结果 | 当前包证据 |
| --- | --- | --- |
| 文件系统 → 材料区 | 无 Agent 时外部新文件自动出现；两根同名身份不同、两层进入/返回 | [核心](assets/reading-agent/package-focus-final-core-evidence.json) |
| Agent 产物 → 引用 → 笔记 | 同一服务 ID、完整 reference，续接同落点；子任务及讨论请求重试不重复 | [TODO](assets/reading-agent/package-focus-final-todo-evidence.json)、[协作](assets/reading-agent/package-focus-final-collaboration-evidence.json) |
| 原生/正文引用 → 预览 → 窗口 | 下方五类格式矩阵；24 原件字节保持、ID/版本一致 | [核心](assets/reading-agent/package-focus-final-core-evidence.json) |
| 两读法 ↔ 原结构 | 103来源完整、版本齐全；连续/对照实际0/4标题，原结构103行最窄文字列223px | [协作](assets/reading-agent/package-focus-final-collaboration-evidence.json) |
| 正文/标题 | 实际原生来源定位、Enter/Escape、折叠反馈；选字和材料引用不误定位 | [初始](assets/reading-agent/package-focus-final-initial-evidence.json)、[交互](assets/reading-agent/package-focus-final-interaction-evidence.json) |
| 同时写原文 | 两次实际追加条件使旧提议/方案拒绝；重读后条件保持；原生节点及9–21选区保持 | [协作](assets/reading-agent/package-focus-final-collaboration-evidence.json)、[输入](assets/reading-agent/package-focus-final-input-evidence.json) |
| TODO/正式对象 | 两个普通 UI 注册对象均 OPEN；AGENT 正式推进 VERIFIED；自然正文保护3次、范围外 TODO 拒绝2次；只读恢复查询同 Journal | [正式边界](assets/reading-agent/package-focus-final-formal-evidence.json) |
| 共同指导 | 一处明确保存、两工作实际重读、各项目差异保持、旧版本可辨 | [协作](assets/reading-agent/package-focus-final-collaboration-evidence.json) |
| 改名/失联/切换 | 正常改名同 ID/字节；受控失联拒绝旧读法，原路径恢复同引用；工作/Graph切换和正常禁用释放窗口/blob/PDF worker | [目录](assets/reading-agent/package-focus-final-directory-evidence.json)、[生命周期](assets/reading-agent/package-focus-final-lifecycle-evidence.json) |
| 仓库外安装 | 同 ZIP 615资源核对；包内真实可执行启动器生成新通道，正常 UI 只读重连104来源 | [核心](assets/reading-agent/package-focus-final-core-evidence.json)、[启动器](assets/reading-agent/package-focus-final-launcher-evidence.json) |

## 五类格式矩阵

以下每类均实际从目录、原生稳定引用、阅读正文引用打开，并核对独立窗口的同 ID/SHA。使用同一当前 ZIP，未复用旧 c20 包的通过记录。

| 格式 | 实际材料 ID | 可见内容 |
| --- | --- | --- |
| Markdown | `de82d866-0bb0-4374-a915-9af55892f4f2` | 中文特殊文件名完整 reference、表格、代码、本地图片 |
| DOCX | `7a52c26b-c6a2-4447-8d74-63ecbf6b73a4` | 标题、列表、表格、图片；不宣称 Word 分页一致 |
| PDF | `04277240-93e3-4d22-bd76-0b1a538bae5a` | 中文文本第1页、扫描第2页，实际翻页及独立窗口 |
| XLSX | `1d775330-b64d-40c9-9e1e-168cd60676f2` | 合并区域、两张工作表，第2张101–200/351行；缺缓存公式明确提示，未计算公式 |
| PNG | `22ca6f7b-890c-436a-b1c0-9c31944b4573` | 720×320 图像；独立窗口和系统窗口菜单移动/调整尺寸 |

## 实测限制与生产判断

本轮完成可控试用闭环，不能据此把插件定为成熟生产插件。原生产审计中的默认 Fake executor 自动正式化、schema v23/CLI v22 备份恢复不一致、stock host 路径/符号链接与普通 IO 竞态、CLI PID 复用和本地收纳保护边界没有在本轮全部修复。重要生产 Graph 暂不建议启用正式写入、迁移或降级恢复；可在独立副本试用阅读与已核验协作。

升级不是无副作用保证：新私有散列记录可以兼容读取旧短记录，但旧版本可能继续读取旧当前事项/请求指针。旧版恢复 schema 和完整 Kernel 数据的安全降级未验收，不能以保留旧安装包代替数据恢复方案。

已知边界：

- 恢复目录的“继续只读同步”仍会过滤部分特殊文件名，列表明确 partial；首次 Finder 原生复制/粘贴读取实际24原件。不宣称任意外部改名/替换物理身份追踪，stock host identity 为 null。
- 原生折叠/展开会保存 collapsed 元数据并可能改变宿主序列化字节；只读定位前后那一对来源/Graph保持，不能把完整人工折叠往返说成字节不变。
- 原生输入证据使用已保存文字；物理中文 IME、未提交草稿、系统 Undo、原剪贴板完整恢复、任意拖放仍未验证。标题选字期间的零请求尝试不记定位通过；之后独立真实键盘焦点验收通过。
- 第一次紧接正式投影的重试断言失败，缺少该次细项，原因不确定；稳定后完整重试返回同提交、对象和Graph保持。未将第一次失败删去或改称成功。
- 系统菜单已实际移动/调整独立窗口，任意自由拖动未证明。资源对均同PID/宿主target；监听数量和PDF worker减少不等于全部定时器或长期无泄漏。
- 启动器从包内可执行文件运行，显式自有 state-dir 和 Node20 PATH；没有把这个结果称为 Finder 双击或默认用户环境通过。
- Kernel 是从本仓库普通源码启动的独立隔离服务，未打包为独立 Kernel 发布。Windows/Linux、其他宿主、真实断电、生产备份还原、依赖风险消除均未验证。

指南：[装好后直接阅读](../user-guide/simple-start-reading.md)、[工作台日常使用](../user-guide/workbench-usage.md)。历次失败与旧版本证据继续保存在[完整交接](reading-and-agent-collaboration-handoff.md)，本矩阵只引用当前 fd479b84… 包事实。
