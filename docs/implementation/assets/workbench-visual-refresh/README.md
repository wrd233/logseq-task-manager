# 视觉刷新证据索引

2026-10-06，实际 Logseq Desktop 0.10.9，macOS 15.2 Intel。所有 PNG 来自本轮隔离 Electron 应用，加载仓库外解压的最终 ZIP；未改图、未使用浏览器替身。设计 HTML 单独列为参考。源码提交 `35b04e82d74ac69d53b02987736d07fad957a0ef`，基线 `131401afc12edd505819b36ed80d1bc15034faa7`。

## 打开与安装

- [交互视觉稿](interactive-design.html)：正文、材料、展开菜单、改名、目录、收纳；明暗／窄宽可切换，仅为参考。
- [插件 ZIP](task-copilot-workbench.zip)，[校验文件](task-copilot-workbench.zip.sha256)：解压后在 Logseq 开发者模式加载其中的文件夹。
- [完整交接与未验步骤](../../workbench-visual-refresh-handoff.md)、[当前中文手册](../../../user-guide/workbench-usage.md)。

## 实机画面

| 画面 | 证据 |
| --- | --- |
| 102 来源全文、来源工作标题、局部思考／目标 | [浅色](long-report-light.png)、[深色长文中段](long-report-dark.png)、[680px 窄窗](long-report-narrow-light.png) |
| 真实材料列表、长文件名 | [浅色](materials-light.png)、[深色](materials-dark.png) |
| 文件覆盖菜单、不推开列表 | [浅色](menu-light.png)、[窄窗深色](menu-narrow-dark.png) |
| 行内名称编辑、保存／取消、错误保留草稿 | [编辑](rename-dark.png)、[失败](rename-failure-dark.png) |
| 复制失败就地重试 | [失败注入](copy-failure-light.png) |
| 默认目录、完整路径按需展开、覆盖更多菜单 | [目录](folders-dark.png)、[菜单](folder-menu-dark.png)、[窄窗](folders-narrow-dark.png) |
| 原生保存后完整新句出现在报告 | [保存](native-save-dark.png) |
| 宿主收纳确认，中途主题切换 | [深色](capture-dark.png)、[浅色](capture-light.png) |
| 材料已完整保存，宿主位置变化时保留当前内容 | [继续入口](capture-continuation-light.png) |
| 原结构、Area 实际页面与只读历史 | [原结构](original-structure-light.png)、[页面](area-page-light.png)、[历史](history-light.png) |

宽窗口实测 1440px，紧凑窗口 680px；系统可用高度为 717px，PNG 为 Retina 双倍分辨率。画面内左侧原生页面仍保留写作标记，右侧是显示投影；宿主整体未被重做。

## 可核对记录

| 文件 | 内容与边界 |
| --- | --- |
| [source-audit.json](source-audit.json) | 每个来源 raw、父级／深度、展示全文、版本与消去字符偏移；冻结预期逐条匹配 102 个来源。块 40 的 Markdown 导入 UUID 差异显式记录，没有伪造可写身份。 |
| [reading-proof.json](reading-proof.json) | 材料往返前后滚动均为 480px，宽面板无横向溢出，根由映射工作标题承载。 |
| [materials-proof.json](materials-proof.json) | 覆盖菜单边界、列表稳定、Escape 焦点、copy 成功／失败重试、行内错误与取消、真实改名文件内容和 ID、目录及窄窗。 |
| [native-proof.json](native-proof.json) | 真实 textarea 节点、草稿、选区与焦点保持，保存更新；2,560 字 native paste 后取消保留原文；宿主确认主题中途切换。 |
| [capture-save-proof.json](capture-save-proof.json) | 2,730 字文件逐字保存，宿主位置变化的继续入口和当前原生内容保持；`preciseReplacement:false`，不作为正常自动替换通过证据。 |
| [boundary-proof.json](boundary-proof.json) | 原结构 102 块；Project／Area 真 page 身份与实际来源块；历史只读、102 raw 版本、零代用户认可；快速工作切换最后仍在原工作。 |
| [reload-package-proof.json](reload-package-proof.json) | 实际应用页面重载后单 iframe、单公共样式和所属布局、无遗留菜单／收纳；再次核对全 102 来源；实际加载 JS hash、仓库外解压 428 文件 hash 和窄窗。 |
| [package-proof.json](package-proof.json) | 打包干净源码身份、全部 428 文件 SHA-256、仓库外安装位置。 |
| [cleanup-proof.json](cleanup-proof.json) | 停止前 PID／app／profile 所有权核对，停止后进程和调试端口关闭；没有停止生产或其他实验进程。 |
| [checks.txt](checks.txt) | `npm run check` 最终完整输出：707 个测试及类型、lint、构建、文档、边界与 taste 通过。 |

实机回归通过内容和未验项分别记录。组合事件、DOM 点击及 CDP 输入不等于物理中文输入法、Undo、Finder 拖放或系统目录多选。复制的实际 Electron clipboard 读回匹配，但独立 shell `pbpaste` 不一致，跨应用物理粘贴未完成。确认框 native paste 使用自有 lab IPC 调用 Electron 实际 clipboard／`webContents.paste`；正常精确范围自动替换未完成 Desktop 验收。

## 复现与隔离

专用工作树：`/Users/mac/.codex/worktrees/workbench-visual-refresh/logseq-task-manager`。Graph、HOME 和 profile 位于该树 `tmp/logseq-sandbox/`；合成材料和本轮 CDP runner 位于 `tmp/visual-refresh/`。ZIP 解压位置：`/Users/mac/.codex/workbench-labs/visual-refresh-01a10fad/package/task-copilot-workbench`。原始 fixture 与冻结预期位于仓库 `apps/logseq-plugin/tests/fixtures/visual-refresh*`。

复现时使用 `scripts/logseq-sandbox.mjs` 复制自己的 Logseq 应用，按交接准备合成 Graph；保留其隔离 bootstrap，加载 ZIP 的仓库外文件夹。运行前核对当前 Graph、自有 PID／profile 和空闲端口。脚本中的测试 UUID／材料 ID 对应本轮 Graph，重新导入时需从真实来源重新核对，不能将 ID 常量当权威。

隔离 bootstrap 禁用系统外链、自动更新、协议注册，并替代目录选择为本轮 Graph；不能据此声称默认应用打开、Finder 拖放或 OS picker 验收。未启动 Kernel、外部 agent 或正式任务；仅停止本轮自己的 Desktop 进程，保留复现文件。
