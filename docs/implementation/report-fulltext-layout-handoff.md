# 长篇报告实施交接

日期：2026-10-05。完成真实 WorkView 的长篇报告正文、上下文保护和历史组合。后来用户明确授权“合并进入最新的 main 并推送至远端”，最终集成与门禁记录见 [main 整合记录](../integration/report-fulltext-layout-main-2026-10-05.md)。

## 起点、提交与隔离

实现固定 BASE：`8529212296f0b65fb78ef7ccd2a2102474d9310a`，启动时已验证属于已发布 origin/main。

分支：`codex/report-fulltext-layout`；本轮独立工作树：`/Users/wangrundong/.codex/worktrees/report-fulltext-layout/任务管理中心-logseq插件`。

| 提交 | 范围 |
| --- | --- |
| `54bcdcf0a1b2730af6c551101fb9ed4daf79b1dd` | 完整来源树、分组、正文 helper、样式和合成长篇 fixture |
| `69927cbcabbc881d14e5d1fba172544836af25c8` | 最小 renderer/controller 接线与长篇真实组件/历史回归；功能 HEAD |
| `6ecbf8d1e75cba521debe8d68810dd3af1fa12f9` | 本文、设计、架构、截图和逐源证据；实现分支 HEAD |
| `77d822c28f8bd33af8881687d746311d7292b8c8` | 与最新远端 main 的合并；完整门禁验证的代码 HEAD |

使用 Node 20.20.2、npm 10.8.2；依赖与 dist 均位于自己的工作树。Graph、材料、Logseq home/profile/storage、companion 状态与 descriptor 分别位于本工作树的 `tmp/logseq-sandbox`。运行的是自己的 Logseq 0.10.15 副本，SDK 0.3.4，唯一 bundle ID `com.taskcopilot.logseq.fulltextlab`、端口 19341、进程 68381。Kernel 未启动、agent 未连接，合成工作使用 tasksEnabled=false。

隔离 profile 的初始 `preferences.theme` 被公共 prepare 写成字符串，造成 SDK 激活偏好时失败；仅移除本地隔离 profile 的该字段后 SDK 正常连接。没有为测试修改共享启动脚本或生产配置。

自己的运行实例已由 identity-checked sandbox stop 停止。读取生产 Graph/config 的前后 hash：3,540 文件，changed/missing/added 均为 0；仅提交统计，生产文件名与内容留在忽略目录。

## 样例与逐源核对

`tests/fixtures/report-longform.ts` 含 93 来源＝根标题＋92 正文，4,217 个汉字，最大深度 4，两个事务和一个子 MiniProject。含普通正文、未知标记、重复句、局部 TODO、多行说明、代码、表格、引文、枚举与同材料三种手写引用。

真实材料登记产生一条额外引用，Desktop 合计 94 来源。materialId 为 `9a0aec85-78db-4e92-a38c-72008cafba59`，合成文件始终留在隔离 materials 目录。既有手写别名没有随显示名改写。

Logseq 为编号 40 的枚举块分配了 `6ac29e3a-e576-4027-834b-4f0dabee1c63`，不同于 fixture 里的示例 ID；对应表明确记录两者，不强制重写宿主身份。新增材料引用 UUID 为 `6ac29f74-5c92-4d71-a56d-c24756f59dcc`。

| 证据 | 实际结论 |
| --- | --- |
| [desktop-coverage.json](assets/report-fulltext-layout/desktop-coverage.json) | 修改前 93/93 核心来源的独立完整 expectedText、真实 UUID、sourceId、raw SHA、结构版本与可见正文全部对应 |
| [desktop-final.json](assets/report-fulltext-layout/desktop-final.json) | 修改后全部 94/94 对应；只修改中间 UUID 46，其余 93 raw 来源与结构不变；最终加载脚本 hash 与本地构建一致 |
| [desktop-history.json](assets/report-fulltext-layout/desktop-history.json) | 历史的 93/93 核心原句仍对应；总计 94 行，当前报告标题/映射为 0；修订与认可事件完全相同且 envelope hash 有效 |
| [desktop-material.json](assets/report-fulltext-layout/desktop-material.json) | 实际点击长别名打开真实登记文件，返回工作后正文、来源集合/结构版本与滚动位置 3796 均一致，恢复 full 94/94 |
| [desktop-copy.json](assets/report-fulltext-layout/desktop-copy.json) | 普通双击形成“。”选区，真实 Cmd+C 产生未被 preventDefault 的 copy 事件，没有进入原生编辑 |

文字比较只去除 Markdown 段落、列表、表格布局带来的空白，逐 UUID 比较完整的独立预期文字；没有只比较条数或关键词。raw 的完整 hash 单独核对，不用 DOM 清理后的文字算版本。默认全文的 computed style 显示无 line-clamp、无 max-height 截断。

## 回归与门禁

原版反例已复现：普通解释子树被分散，代码中的字面 `id::` 被旧属性清理删掉。修正后历史完整正文回归又复现了相同的代码行丢失，已把 helper 接入历史渲染并增加模式签名。保留反例日志与通过日志，见证据目录。

针对性回归 40/40 通过、0 失败/跳过，命令如下（PATH 使用上述 Node 20）：

```sh
./node_modules/.bin/tsx --test \
  apps/logseq-plugin/tests/native-report.test.ts \
  apps/logseq-plugin/tests/report-fulltext-layout.test.ts \
  apps/logseq-plugin/tests/integration/native-report-ui.test.mjs \
  apps/logseq-plugin/tests/integration/report-fulltext-ui.test.mjs \
  apps/logseq-plugin/tests/stage-review.test.ts \
  apps/logseq-plugin/tests/material-drop-rename-ui.test.ts \
  apps/logseq-plugin/tests/content-organize-report.test.ts
```

覆盖逐源全文、完整子树与对象、普通子级顺序、未知项左右邻接、折叠/聚焦恢复、材料钩子、真实 WorkView 历史 overlay、raw 版本、稳定节点、无关选区/菜单焦点及既有导航/写回/阶段限制。普通双击的新行为有独立回归；原生版本保护用显式 Alt＋双击继续验证。

最终集成树的 `npm run check` 与 `git diff --check` 均通过。完整检查含 624 workspace、5 sandbox、12 boundary，共 641 项，0 失败/跳过/取消；类型、lint、需求图、build/binaries、依赖边界及 taste eval 均通过。实际退出码、分项计数和构建 hash 见 [verification.json](assets/report-fulltext-layout/verification.json) 与 [完整日志](assets/report-fulltext-layout/full-check-integrated.txt)，不是历史修正前的完整检查结果。

## 真实 Desktop 与截图

UI 通过 Computer Use 的 Sky 操作自己的应用；CDP 仅用于合成 fixture 的现有 API 初始化、来源/DOM 读取和加载脚本 hash 核对。没有用模拟 dblclick、合成键盘事件或直接给 textarea.value 赋值来代替真实编辑。

中间块通过条目菜单“编辑原文”进入实际 UUID 对应输入框，Sky 输入中文后 Escape 结束，再点击“返回报告”。该块新增中文一句；真实结构与其他 93 个来源不变，94 个行节点全部保留，滚动 3866→3866。原生返回的选区为空；不宣称它保持了此前的 Desktop 选区。

已保存阶段包含 1 个修订、1 次本地用户认可。当前块修改之后，真实历史回看仍显示旧原句与代码字面行，当前分组不改排历史。插件重载撤销 namespace 的正文授权后，`stages.history()` 按保护返回 AUTHORIZATION_REQUIRED；通过真实本地 UI 读取历史，并直接只读校验自己存储中的已保存事件，没有绕过授权。

| 截图 | 用途 |
| --- | --- |
| [compact-dark-host.png](assets/report-fulltext-layout/compact-dark-host.png) | 980×700 紧凑暗宿主，全文与四层说明 |
| [wide-dark-host.png](assets/report-fulltext-layout/wide-dark-host.png) | 1440×813 宽暗宿主、较窄的停靠正文 |
| [wide-light.png](assets/report-fulltext-layout/wide-light.png) | 宽明宿主下长文件名与深层正文 |
| [wide-code-table.png](assets/report-fulltext-layout/wide-code-table.png) | 代码的原始 `id::` 行、表格与后续文字 |
| [native-middle-input.png](assets/report-fulltext-layout/native-middle-input.png) | 真实中间 UUID 原生输入 |
| [native-middle-return.png](assets/report-fulltext-layout/native-middle-return.png) | 原生提交后返回报告，新中文原句出现 |
| [historical-readonly.png](assets/report-fulltext-layout/historical-readonly.png) | 已认可历史回看与只读状态 |
| [material-open.png](assets/report-fulltext-layout/material-open.png) | 真实材料登记文件与只读阅读 |

截图只证明当前 viewport 的可读性，完整覆盖由逐源记录独立证明。宿主明暗切换并未把 iframe 报告背景同步成暗色，报告在暗宿主中仍用浅色底。窗口/正文两种宽度已检查，不把截图裁切当成另一种布局。

## 未验边界

物理中文输入法 composition、系统 Undo、跨应用剪贴板内容、真实 OS 文件拖放/重命名以及多个生产 Graph 的 Desktop 切换未验。相关来源、材料落点与生命周期保护有自动化回归，但不冒充这些实际系统动作已通过。没有连接 agent，因此本轮验证的是无 agent 时完整阅读与已有本地组合，不声称新增外部 agent 传输或语义选择。

正式手册、PDF 和共同索引未在此分支改动。设计与接口分别见 [设计](../design/report-fulltext-layout-design.md)、[架构](../architecture/report-fulltext-layout-architecture.md)。
