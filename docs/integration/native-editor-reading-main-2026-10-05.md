# 原生编辑与长篇阅读合入最新 main

用户授权将 `codex/native-editor-reading` 合入最新 main 并推送。整合在新的独立工作树完成，保留最新 main 的全文报告、材料阅读／导入／改名、协作审阅和工作级界面。原本地 main 未用作过期的合并起点。

## 版本与合并

| 项目 | SHA |
| --- | --- |
| 固定功能开发 BASE | `8529212296f0b65fb78ef7ccd2a2102474d9310a` |
| 功能交付 HEAD | `d779bc54c5a3650a03a65eb5fdbe934af9444e86` |
| 整合前最新 origin/main | `dd081c9cc63fc91b4d62743141842c303128c4a2` |
| 产品、冲突解决和回归的双亲合并提交 | `6f818cf0663d22405eda4f5250840e977f2eb7fa` |

整合分支 `codex/merge-native-editor-reading-main`；独立工作树 `/Users/wangrundong/.codex/worktrees/merge-native-editor-reading-main/任务管理中心-logseq插件`。原 main 起点为 `f0bfe2edff50ca6657bcf491209afa4b715df6b9`，比最新远端落后 16 个提交；正常合并保留这些更新和四个功能分支提交。

六个文件存在冲突，按现有行为组合解决：

- controller 保留 main 的 WorkViewShell、正文／材料导航、协作入口和权限 owner，消费 report 的 scopeChanged、restoreReading 与 navigationSource。兼容现有 initialReadingMode 和功能分支 readingMode，生产默认仍为完整 report。
- renderer 保留 main 的完整 Markdown 排版、来源顺序、覆盖标识、review/text-diff 及明确 Alt+双击入口；普通双击和文本选取不触发原生路由。增加 UUID／祖先书签恢复与原文对照的输入保护，不整体替换新版 renderer。
- report-controller 保留会话中用户显式折叠、真实工作身份和阅读锚点；切换结构模式不清空用户折叠意图。当前原生输入仅复用同一 DOM，不重灌 value 或重走路由；来源、成员、版本、Graph、lifetime 和历史保护继续成立。
- fixture 同时兼容旧结构测试和明确请求生产默认的完整阅读测试。原生 UI 测试使用“编辑原文”的明确动作；历史 raw 回归明确进入 report，并保留历史数据和当前 source/version 断言。
- 受控正文恢复测试保留最新 main 对实际持久重试、complete 和 APPLIED_VERIFIED 的较强断言，没有退回只等待一次宿主移动。

## 共享界面与输入保护

“在 Logseq 写作／继续原生输入”接入现有工作级主按钮；“显示原生页面”放进工作选项，没有增加常驻模式栏。主按钮、菜单触发器和该视图动作提供 pointer guard。WorkShellAction 的可选 preserveInputFocus 只用于这条视图动作，其他菜单继续沿用原键盘焦点返回行为。

首轮实机发现菜单收起后，真实原生 textarea 和选区虽保留，焦点却可能留在 iframe。showNative 现在在 scope／历史／可见性重检后复用已存在的原生输入恢复焦点，不定位新块、不刷新正文、不改变 value 或选区，也不在组合态盲目恢复焦点。回归会主动把焦点放到菜单项，再检查同一输入和选区。进入／退出原生视图同时通知共享界面，在恢复阅读锚点前更新按钮状态。

来源刷新沿用现有 provider，正文输入／组合中延期；历史对照去掉当前版本身份，旧目标不能导航到当前原文。最新材料消费者与协作连接接线未被替换，原生任意光标拖放的支持范围没有扩展。

## 门禁与实际宿主复验

本轮工具链为 Node 20.20.2、npm 10.8.2；Darwin 24.1.0 / arm64。冷工作树独立 npm ci，并先生成 Console dist，再运行全仓门禁。

| 检查 | 结果 |
| --- | --- |
| 定向回归 | 76/76，失败、取消、跳过均 0 |
| workspace 测试 | 668/668，其中插件 434/434 |
| sandbox／boundary | 5/5、12/12 |
| 总测试 | 685/685，失败、取消、跳过均 0 |
| 需求生成、类型、lint | 通过 |
| 构建、二进制、依赖边界、Taste | 通过；保留原 active，不自动激活 |
| git diff --check | 通过 |

最终 `npm run check` exit 0；[完整日志及结构化证据](../implementation/assets/native-editor-reading-main/README.md)属于本次整合，不混用功能分支的 646 项验收。

真正宿主为独立克隆 Logseq 0.10.15、SDK 0.3.4，使用新的合成 Graph/profile，tasksEnabled=false，Kernel 未启动。97 个片段的合成工作中，公开 report 入口按真实来源目标进入第 48 段；Computer Use 的系统按键在真实 textarea 输入 ASCII probe 并选中 68–72。实际点击共享主按钮、打开工作选项、选择“显示原生页面”，同一 DOM、value、选区和原生焦点保持。Escape 结束后，公开 resume 入口恢复同一来源 UUID、scrollTop 3672、顶部相对偏移 -0.21875px；报告为 current，宿主 readback 包含 probe。

实际加载 bundle 与门禁落盘 index.js 字节一致：1,017,944 bytes，SHA-256 `b6a3cc98cf9657fe6b3e0e302f5ee9bfbc34d0acf1b6e64014245a9713362498`。[并排输入](../implementation/assets/native-editor-reading-main/wide-native-input.png)和[返回阅读](../implementation/assets/native-editor-reading-main/reading-return.png)是未经修改的真实窗口截图。结束后关闭自己的连接，并按 app/profile 身份检查停止仅本任务的 Desktop；生产 Graph 和其他进程未参与。

完整人工中文 IME、系统文件拖放仍未验；本轮没有重做物理窄窗／多 Graph、系统 Undo／跨应用剪贴板的完整旅程。这些边界和此前功能分支事实见[原功能交接](../implementation/native-editor-reading-handoff.md)，旧截图仍保留其原时点。

## 当前操作路径与发布

[使用手册](../user-guide/workbench-usage.md)同步正文对照、明确原生编辑、继续输入和原生页面入口；设计、架构与功能交接保留原基线并链接本次整合。最终发布采用主 checkout 快进及批准的 origin main:main 普通推送，不 force、不绕过 hook；文档提交之后的最终发布 SHA 以 main 与实时 origin/main 比较结果为准。
