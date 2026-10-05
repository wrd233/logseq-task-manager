# 材料文件抽屉整合到 main

2026-10-06。用户在功能交付后明确要求合入 main 并推送。原[功能交接](../implementation/materials-drawer-handoff.md)中的“未推送”属于功能分支交付时点；当前行为见[产品设计](../design/materials-module-design.md)和[架构](../architecture/materials-module-architecture.md)。

## 合并范围

fetch 核验的远端 main 为 `94f18edd1cd89f6854fcb8f629abf7982006d3d4`，材料实现为 `77cb5a5`，分支 `codex/materials-reading-ux`。main 已包含在实现历史中，使用 fast-forward 保留完整历史，没有源码冲突或额外共享接线修改。原有正文、Workspace、阶段、任务与协作接口继续使用功能交付中已验证的组合。

当前工作获得专属默认材料位置；支持多目录与默认选择、拖入复制与即时反馈、直接复制链接、原生长文本命名确认、稳定身份及旧链接兼容。没有部署、依赖升级或真实 Graph／材料操作。

## 验证与发布

同一实现提交的 Node 20.20.2／npm 10.8.2 完整 `npm run check` 已通过 702 项：685 个工作区测试（插件 451 项）、5 个 Sandbox、12 个边界，0 失败／跳过；类型、lint、需求生成、构建及 binary probe、依赖扫描和 Taste 均通过。此次快进不改变已验证的实现；补充文档后运行原需求生成脚本、文档链接核对及 `git diff --check`，不将已有检查描述成重新执行完整测试。

隔离 Desktop 的实际拖入、剪贴板、原生粘贴、旧引用与程序接口读回仍按原实现提交取证；此次未重新启动 Desktop。Finder 人工拖放、原生选择器人工操作、真实 IME 与完整 Undo 等边界仍见功能交接。

主 checkout 的未跟踪 `docs/implementation/prompts/` 不暂存、不提交、不清理。推送前再次 fetch，确认远端 main 仍包含在交付历史中，使用普通 `main:main` 推送，不强制覆盖；发布后核对远端 `refs/heads/main` 与本地 main 一致。最终 SHA 包含本记录，以发布核对和交付回复为准。
