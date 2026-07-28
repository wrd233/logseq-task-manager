# Project 失联正文用户语言 Desktop Gate

## 环境

- 分支：`feature/task-copilot-mvp`
- 精确提交：`971c6db268f73464d3237d53b3952b86d9c38e3e`
- Plugin build：`2026-07-28 13:08:20 +0800`
- Logseq：`0.10.15`
- Graph：仓库忽略的专用 File Graph `logseq`
- 主题：Plugin Dark / host Light
- 窗口：1001×720
- 运行：真实 Plugin、Launcher、Local Service

## 操作链

1. 构建精确提交并在 Logseq 中执行 reload；
2. 打开 Task Copilot；
3. 在“现在”中使用纯会话“项目”筛选；
4. 对专用测试 Project 点击“打开项目”；
5. Logseq 无法解析该 Project 的原正文连接，既有 fail-closed 路径阻止继续定位。

## 当前用户结果

- 主结论：原正文连接已不可用；
- 安全边界：没有修改正式事项；
- 唯一下一步：在系统状态中检查并重新连接正文；
- 普通路径没有显示 `Anchor`、对象、运行时、ID、版本或数据库概念；
- 当前筛选、对象状态、正文、Proposal、Commit、Graph 和 SQLite 均未被本次操作改变。

## 证据

- 自动：Plugin 343/343、typecheck/build、根级 `./scripts/check.sh`、145 条稳定规则和恢复演练
  `differences=[]` 通过；
- Desktop accessibility：错误文本与当前用户结果逐字一致，未出现 `Anchor`；
- CURRENT 截图：
  `../current-ui/screenshots/ui-project-missing-source-user-language-current-971c6db.jpg`。

## 有界结论

该 Gate 关闭的是 Project “打开原正文失败”普通路径中的工程术语泄漏。它不改变 Anchor
领域事实、不新增恢复分支、不替代 Rebind，也不把 Project 重入或 P1/P2 其余开放项升级为
DONE。
