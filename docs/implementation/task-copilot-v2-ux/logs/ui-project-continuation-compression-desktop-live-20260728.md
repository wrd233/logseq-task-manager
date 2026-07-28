# Project 继续工作首屏压缩 Desktop Gate

## 环境

- 分支：`feature/task-copilot-mvp`
- 精确提交：`b605e18c21cebead4567b5f80ec9263b73c9bbfa`
- Plugin build：`2026-07-28 13:18:06 +0800`
- Logseq：`0.10.15`
- Graph：仓库忽略的专用 File Graph `logseq`
- 主题：Plugin Dark / host Light
- 窗口：1001×720、726×720
- 运行：真实 Plugin、Launcher、Local Service

## 操作链

1. 构建精确提交并在 Logseq 中 reload；
2. 打开 Task Copilot；
3. 进入“项目 → 继续项目”；
4. 观察标准宽度下的主结论、主操作、Copilot 次操作和渐进披露；
5. 把窗口缩到 726 px，复核同一信息层级与所有入口可达；
6. 把窗口恢复到原宽度。

## 当前用户结果

- 页面目标从“项目重入”改为“继续项目”；
- 删除“同一正式投影”“不保存第二摘要”和“每个 Project”等实现说明；
- 首屏从四个并列按钮收敛为：
  - 主操作“打开当前项目”；
  - 次操作“帮我恢复上下文”；
  - “更多操作”折叠调整项目、加入当前关注和其他进入点；
- 完整事实继续保留在“查看依据”；
- Context Recovery 使用蓝色信息语义，不再与绿色完成/安全语义混用；
- 没有调用 Provider，没有 Proposal、Commit、Graph 或 SQLite 正式写入。

## 证据

- 自动：Plugin 343/343、typecheck/build、根级 `./scripts/check.sh`、145 条稳定规则和恢复演练
  `differences=[]` 通过；
- Desktop accessibility：标准与窄栏均只暴露一个主操作、一个 Context Recovery 次操作和
  两个折叠入口；
- CURRENT 截图：
  - `../current-ui/screenshots/ui-project-continuation-compressed-current-b605e18.jpg`
  - `../current-ui/screenshots/ui-project-continuation-compressed-current-narrow-b605e18.jpg`

## 有界结论

该 Gate 关闭 Project 默认首屏的按钮墙、工程说明和 AI/成功颜色混用。它不改变 Project
投影、Context Package、Skill、Validator、Proposal、Commit、Recovery 或任何正式状态，也
不把 P1/P2 的其余开放项升级为 DONE。
