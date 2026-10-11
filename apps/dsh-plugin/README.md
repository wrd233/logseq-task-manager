# DSH × Logseq 工作台

本目录保存 DSH 插件的设计、交互原型和宿主接入验证代码。开发分支：`feature/dsh-logseq-workbench`。

**当前状态：设计原型，不是已经安装到 DSH 的正式 UI 插件。** 原型使用合成数据、本地状态和模拟会话；不会上传文件、修改笔记或调用模型。已有宿主验证代码仍属于研究适配器，需要完成会话绑定、上下文预算、客户端打包和真实桌面验收后才能作为正式插件启用。

- `prototype/chat-first.html`：当前设计；DSH 对话居中、左侧工作摘要、右侧文件列表及外部打开示意。
- `prototype/chat-first-preview.html`：当前设计的独立浏览器预览。
- `prototype/workbench.html` / `prototype/preview.html`：先前阅读优先设计，保留作对照。
- `research/native-host-adapter.mjs`：已验证的 DSH 原生 Tools / SystemPrompt 接入方式；传输由调用者注入，没有个人配置和密钥。
- `research/probe.mjs`：原生宿主验证程序，使用真实 companion、合成 Logseq SDK 和脚本模型，覆盖读取、刷新、阅读方案归属、拒绝未授权写入、Graph 失效和卸载。
- `design.md`：真实接口、缺口、身份和交互约束、交付顺序。

预览：在项目根运行 `python3 -m http.server 4179 --bind 127.0.0.1`，访问 `http://127.0.0.1:4179/apps/dsh-plugin/prototype/chat-first-preview.html`。

独立预览由 visualize 的预览工具生成；当前可编辑源为 `chat-first.html`。当前不加入根构建流程，不给现有 Logseq 插件增加运行时依赖。

研究验证：在项目根目录、Node 22.19+、DSH 0.2.0-rc.2 环境运行 `node --import tsx apps/dsh-plugin/research/probe.mjs`。默认从 npm 全局目录查找 DSH；可用 `DSH_PACKAGE_ROOT` 指定其包目录。验证创建并清理独立临时工作目录，不使用真实 Graph，不访问远端模型；报告写入忽略目录 `tmp/dsh-research/`。安装依赖仍沿用本项目规定的 Node 版本，DSH 验证使用其所需的独立运行时。

当前对话优先原型验收：会话切换同步原文摘要、文件列表及轨迹；段落/文件引用、模拟发送、引用清理、左右侧栏收起已通过浏览器检查。检查了明暗主题、1024/736/360/320 宽度及控制台错误；当前样例不接真实应用或模型。

先前阅读优先原型已检查正文/Agent 编排切换、文件引用、跨工作浏览与独立会话。其拖入文件名、目录分组和引用状态经合成 DOM 验证；当时 IAB 文件选择器未返回 chooser 事件，未声称完成真实桌面拖入或上传验收。
