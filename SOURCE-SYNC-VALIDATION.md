# Agent 重排与原文同步实机验证 · 2026-09-10

## 本轮实现

沿用同一份 UUID/depth 视图布局。`work-view.mjs` 提供 read、op、sync-preview、sync-apply 四个入口，Codex 与 DeepSeek Harness 共用本地 relay，不新增 MCP 或对象数据库。操作说明见 AGENT-WORK-VIEW.md。

同步仅使用 SDK moveBlock：视图顺序成为兄弟顺序，视图缩进成为父子结构。根不移动，正文不重写。合成对象实测 native `{children:true,before:false}` 把条目放为第一个子块；其后按前一兄弟放置。目标按前序处理，因此能先提升旧子块、再把旧父块放到其下。

已接受的单张小报告卡片排版继续保留。同步不复制 CSS、字号、标签外观或折叠状态到 Logseq。

## 已获得的事实

- 构建及 25 个自动化用例通过；覆盖既有聚焦行为、重排、UUID 稳定性，以及新增原文同步的陈旧预览、成员/root 校验、部分失败与父子反转。
- 在真实 Logseq 0.10.15 的实验 Graph 新建 5 块合成对象，原始想法下含注释。首次同步把现状/TODO 提前；随后把注释提升为父、旧想法放到其下。SDK 读回顺序/深度与目标完全一致，全部 UUID 和 content 精确相同。
- 重复同步返回 applied=[]；改变布局后应用旧计划被拒绝。原生编辑未退出时被实际拒绝，Escape 结束编辑后可预览。
- 真正运行了已安装的 `dsh --profile headless`。它读取说明、自行调用 read/reorder/read、生成并阅读预览，再 sync-apply/read，成功把合成 TODO 移到根下第一条。原生 sourceParent/sourceDepth 随后验证正确。没有修改 DSH 配置。
- DSH 完成后，用鼠标把现状拖到视图顶部成功；再次预览显示布局改变、原文 source 签名未变。Agent 与鼠标共用布局成立。
- 回到“佛渡技术规格书的撰写”，33 块的正文（去除 id:: 元数据）与原先快照一致，原文顺序和深度一致，本轮仅生成同步预览，未应用真实对象。较早快照与当前根块存在 id:: 属性差异，故不宣称整份 Graph 文件字节不变。

本地证据在 evidence/source-sync/：plan.json、verified.json、dsh-result.txt、after-dsh-plan.json、after-mouse.json、fodu-preview-only.json。包含笔记正文，不提交。

## 边界与判断

显式同步是内容组织操作，不是渲染样式导出。父子变化会改变原文上下文及依赖层级的查询，Agent 应按用户意图判断哪些视图排列适合落回原文。

预览绑定 graph/root、完整成员、正文/原始顺序和目标布局；源或布局改变即重新预览。同步期间阻止本插件的其他命令、自动聚焦与鼠标布局操作，避免自相冲突；外部编辑在步骤间核对。仍不能提供跨多次 Logseq moveBlock 的原子事务；中途错误报告 partial/applied，先核对再恢复，不自动反向写回。

还值得验证的少数问题：长对象同步时的原生撤销体验；跨设备/外部同步恰好撞上移块；用户习惯哪些临时工作排列应保留在视图、哪些应成为原始记录结构。当前不必引入完整 Work AST。
