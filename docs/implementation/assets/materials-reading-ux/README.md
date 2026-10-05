# 材料阅读交互的实测证据

所有文件来自本轮隔离合成 Graph 和合成材料，没有真实用户笔记。应用为 Darwin x86_64 的 Logseq 0.10.9 私有运行实例；独立 home、profile、Graph、材料目录和调试端口 19351。未启动 Kernel、agent 或 companion。

- `materials-list.png`：2026-10-05 03:12:17 +08:00，真实 Desktop 页面截图，四份已关联原文件、当前工作、拖入区及紧凑行。
- `materials-reading.png`：2026-10-05 03:12:18 +08:00，同一实例的 Markdown 只读阅读和明确编辑入口。
- 两张截图来自 `7a11cfd52d4524c02f85d8a58b5b21baedadafe8` 的构建，1960×1400，没有重绘或修饰。后续 `84b6ca6` 修正原生链接的返回来源和测试等待方式；截图不声称验证该后续修正。
- `desktop-facts.json`：从 SDK、公共插件接口、真实文件读回、材料独立记录及 Journal 中抽取的事实。机器绝对路径替换为 `<sandbox>`，保留真实合成 UUID、请求 ID、状态和正文；没有提交 profile、恢复存储或临时日志。

验证方法分层：列表／正文文件拖入使用 Desktop Chromium `Input.dispatchDragEvent`；初始复制、阅读和改名使用 Chromium 输入事件，并读回系统剪贴板与文件。冲突编辑使用真实 Vditor 的输入事件；恢复后读回原件、草稿副本和历史。重定位表单及最后返回使用 Desktop DOM 动作，外部打开由真实宿主 `openPath` 返回成功。它们均不是 Finder 原生拖放或完整人工鼠标验收。

后续重启实例的 `Page.captureScreenshot` 超时，因此没有冲突／重定位截图，也没有以重绘图替代。默认应用成功回执证明启动请求获宿主接受，不能证明 PDF 窗口已经正确渲染。Finder 拖放、任意原生字位、跨面板系统拖动、真实中文 IME 和完整原生 Undo 的补验步骤见[交接](../../materials-reading-ux-handoff.md)。
