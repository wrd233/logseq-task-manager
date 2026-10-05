# 原生编辑与长篇阅读 main 整合证据

这些文件来自 `6f818cf` 的整合代码，使用独立依赖、构建、Graph、home/profile 和克隆 Logseq 0.10.15。此前功能分支的截图另存于 `../native-editor-reading/`，不能代替本轮复验。

- [全仓门禁](check.log)：668 项 workspace 测试（插件 434）、5 项 sandbox、12 项 boundary，总计 685，通过；类型、lint、构建、二进制、依赖边界及 Taste 通过。
- [定向回归](targeted.log)：原生报告、工作界面、全文报告、受控写回及历史审阅，76/76。
- [实机数据](desktop-evidence.json)：97 个来源片段；第 48 段真实原生输入、继续写作、工作选项、显示原生页面，均保留同一输入、68–72 选区和焦点；返回仍是同一 UUID、scrollTop 3672、相对偏移 -0.21875px。宿主 readback 包含实际键入的 ASCII probe。
- [并排输入](wide-native-input.png)、[返回阅读](reading-return.png)：Computer Use 获取的实际窗口 PNG，直接复制原文件，未编辑图像。
- [计数与加载哈希](verification.json)：实际加载和落盘的 index.js 均为 1,017,944 bytes，SHA-256 相同。

本轮没有重做物理窄窗／多 Graph、系统 Undo／跨应用剪贴板旅程；完整人工中文 IME 和系统文件拖放仍未验。原功能分支验收与本轮整合验收按各自时间点保留。
