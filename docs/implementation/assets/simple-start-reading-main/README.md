# 最新 main 安装包与整合证据

2026-10-05。此目录对应一键阅读与最新原生编辑成果合并后的版本；原分支 [e5eca05 证据](../simple-start-reading/README.md)保留其构建身份，未覆盖。

## 安装与构建身份

- [安装 ZIP](task-copilot-workbench.zip)，解压后在 Logseq 插件页加载 `task-copilot-workbench`；[最短说明](../../../user-guide/simple-start-reading.md)。
- 构建提交：`f39c4ee2ca31bca88e6a8d5d4e255172b6ef95c8`，干净工作树；[逐文件身份](build-identity.json)。
- ZIP：6,231,309 字节，428 个文件；[SHA-256](task-copilot-workbench.zip.sha256)：`8be603e203a8354f1e65e5456e0a6ec325fc1bcb50f6a6f1eee517c32518c18b`。
- 两次打包逐字节一致，仓库外解压的所有运行文件均匹配；[包装校验](package-proof.json)、[首次打包日志](package.log)、[重复打包日志](reproducibility.log)。包内没有 node_modules、源码映射、Graph、profile、私有状态或凭据。
- 实际 Desktop 执行 `dist/index.js` 的 SHA-256：`a5ad73efb8279054ccd79e83e04074bc727a2ae34d3ea03c935ff724911c7f33`，与 ZIP 相同。基础阅读没有源码 checkout、Node 或服务要求。

复现：检出构建提交，以 Node 20.20.2／npm 10.8.2 执行 `npm ci`、`npm run build`，然后执行 `node apps/logseq-plugin/scripts/package.mjs /实际输出位置/task-copilot-workbench.zip`。Python 3 标准库负责确定性 ZIP；打包后修改文档不会改写包内构建身份。

## 本轮验证

[完整门禁](check.log)与[退出码](check.exit)：`npm run check` 通过，694 项测试，插件 443 项，失败／取消／跳过均为 0；包含类型、lint、需求地图、sandbox、构建、依赖边界与 Taste。[专项回归](targeted.log)及[退出码](targeted.exit)：原生报告和阅读会话 29 项通过。`git diff --check` 通过。

实际宿主为隔离复制的 Logseq Desktop 0.10.9，macOS 15.2 Intel。新 home/profile 中加载仓库外最终 ZIP，插件设置为空，tasksEnabled=false，无自动面板或插件导航，单工具栏；[零配置启动事实](startup-proof.json)。完整整合旅程使用已索引合成 Graph 的自有 profile 副本，未触碰生产实例。该副本同样加载这个最终 ZIP；逐 UUID 正文哈希、父级及深度见[实机事实](desktop-proof.json)，[运行日志](desktop-run.log)。[进程隔离状态](desktop-status.json)记录 Kernel 未启动；本轮没有启动 companion。

| 实机检查 | 结果 |
| --- | --- |
| 标题旁一次阅读 | 98 块、4100 汉字、最大深度 4；每个 UUID 的完整正文／父级／深度一致，阅读前后来源树相等 |
| 原生输入中阅读与保存刷新 | 同一 textarea、草稿、焦点、3–7 选区保持；保存后报告片段哈希匹配宿主；继续输入不重新加载 value |
| 保存前旧读取目标 | 仅同一正在输入 UUID 的只读聚焦 lease 可继续；普通版本解析／写入仍拒绝过期版本，回归同时核验非 block 位置及范围变化保护 |
| 窄窗往返 | 680 像素下实际点工作选项的显示原生页面与返回正文，输入节点／草稿／焦点／选区保持 |
| Project／Area 页面 | 分别 100／2 个实际正文块逐身份匹配；真实 page UUID，block root 为 null |
| 关闭重开及拖动 | 第44条来源 UUID 与偏移一致，3 个后代保持折叠；分隔宽度 384→444 并保存 |
| Desktop 重启 | 实际重启后同一范围、来源锚点／偏移、444 宽度和 3 个折叠后代恢复，无插件导航，单工具栏／单分隔线；[前后事实](restart-proof.json)、[日志](restart-run.log) |

截图：[完整阅读](complete-reading.png)、[原生输入往返](native-input.png)、[窄窗返回](narrow-return.png)、[重启前](before-restart.png)、[重启后](restarted-reading.png)。截图来自自己的 Electron 窗口；点击和输入使用该实例 Input 通道，来源查询使用真实 SDK。没有以浏览器替身证明 Desktop。

## 证据边界

新 profile 初始化既有合成 Graph 时，SDK 来源与页面树曾不稳定；该实例后续旅程未列为通过。全新 profile 只确认最终包加载与零配置启动，完整阅读／往返／重启使用已索引的自有 profile 副本。不能将两者写成同一个全新 profile 的完整旅程。重启验证等待实际折叠和锚点恢复完成，不能仅见到报告 current 就读取尚在恢复中的第一帧。

本轮集中核验两轮功能组合；材料目录、生产启动器和外部 CLI 的完整旅程仍见原构建证据，未声称在此构建重新全验。物理中文 IME、原生 Undo、系统拖放／剪贴板、其他平台及宿主版本仍未实机验收。Input 插入中文文本不等于物理 IME。[原交接的最小复验](../../simple-start-reading-handoff.md#尚未验收与最小复验)保持有效。
