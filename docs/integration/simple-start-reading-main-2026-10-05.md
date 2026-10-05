# 一键阅读合入最新 main

2026-10-05，按用户明确指令将 `codex/simple-start-reading` 合入执行时最新 main，并完成普通远端推送。保留已发布的原生编辑／长篇阅读成果；当前使用说明和安装下载见[指南](../user-guide/simple-start-reading.md)。原功能交接的“未推送”属于原分支交付时点。

## 提交与范围

- 本轮成功 fetch 的 main：`1660b542779809d7ea9f7064c24d0b643cc873bc`，包含最新原生编辑往返整合。
- 原一键阅读分支：`e70826dfec141c5a0a5952693a5b0b738a375c77`。
- 合并提交：`fad882781f90133c0b4bc99280f9e59e7cfefedd`，两个父提交分别为上述 main 与功能分支。
- 实机发现的窄窗焦点修复及最终运行包构建提交：`f39c4ee2ca31bca88e6a8d5d4e255172b6ef95c8`。之后只增加文档、安装 ZIP 和证据，不改变运行代码。
- 在本任务自有 worktree 的 `codex/simple-start-reading-main-integration` 整合、核验，再将原 checkout 的 main 快进并普通推送；保留原 checkout 未跟踪的 `docs/implementation/prompts/`。没有强制推送、其他活动工作树取码、生产 Graph 操作、PR 或委派。

## 六处冲突与保护

`work-view/controller.ts` 合并页面只读来源、默认报告、持久化与最新 scopeChanged／导航来源／会话行为；保留关闭、Graph 切换、异步读取和释放归属。`report-controller.ts` 保留每份工作阅读会话、原文对照、显示原生页面、导航 lease 和版本检查，加入已保存来源在原生输入期间刷新、页面森林及跨重启折叠。未提交草稿不进入权威报告。

`host/native-editor.ts` 保留真实路由挂载等待、已有输入复用、失效检查与卸载；返回按钮同时保护 pointerdown 和 mousedown。`host/panel-host.ts` 保留当前 main 的布局生命周期、动态左右侧栏观察与安全视觉让出，接入宿主 document 分隔线与持久宽度，按可用空间缩窄／切换。`workspace/context.ts` 仅释放对应 owner，旧实例不能注销新面板。`docs/integration/README.md` 保留两轮历史并新增当前整合记录。

保存后报告的版本可以在同一 textarea 仍打开时推进。继续该 UUID 的原生输入可更新只读聚焦 lease，仍核验同一 Graph／范围、最新成员身份和可用性；只允许 block 位置。普通 resolve、内容写回、其他 UUID、过期范围、组合输入和历史保护没有放宽。专项回归明确核验旧版本写入解析拒绝及同一输入的只读往返。

最新 main 的 compact 布局使用 visibility:hidden 隐藏原生正文，实机发现它会失焦，并使原生输入复用不可用。最终提交在全局样式和面板所属样式中改为 opacity 覆盖并关闭指针命中，使已有输入仍保持焦点；面板切回原生后恢复正常显示。回归核验窄窗返回和组合输入恢复后的 textarea 不受 visibility:hidden 影响，实机点菜单／返回核验同一节点、草稿、焦点与选区。

## 验证与交付

最终代码 `npm run check` 完整通过：694 项测试（插件 443），0 失败／取消／跳过，构建及其他规定门禁均通过；专项 29 项通过，`git diff --check` 通过。旧“原生输入时冻结已保存报告”的断言调整为本次明确要求的自动保存刷新，并保留未提交草稿隔离、旧读取快照不变和输入节点／焦点／选区断言。固定 60ms 的输入准备等待改为等待真正目标 textarea 就绪，没有跳过或降低内容保护断言。

[最终安装包](../implementation/assets/simple-start-reading-main/task-copilot-workbench.zip)来自干净 `f39c4ee2ca31bca88e6a8d5d4e255172b6ef95c8`；SHA-256 为 `8be603e203a8354f1e65e5456e0a6ec325fc1bcb50f6a6f1eee517c32518c18b`，两次 ZIP 逐字节一致，实际运行 bundle 哈希与包一致。当前包不会覆盖[原构建证据](../implementation/assets/simple-start-reading/README.md)。新 home/profile 零配置启动通过；完整整合旅程在已索引合成 Graph 的自有 profile 副本通过，包括 98 块逐 UUID 完整覆盖、保存刷新、同一输入／选区、680 像素窄窗菜单往返、Project／Area 森林、关闭重开、拖动及实际重启锚点／折叠／宽度恢复。

[本轮证据索引](../implementation/assets/simple-start-reading-main/README.md)明确两种 profile 的验证范围：新 profile 导入既有 Graph 时页面树不稳定，未将其完整旅程写为通过。材料／外部 CLI 完整旅程仍对应原包；物理 IME、Undo、系统拖放／剪贴板及其他平台继续未验。所有自有 Desktop 进程收尾停止，其他实例与生产资料保留。
