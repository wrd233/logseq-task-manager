# DSH 结构历史合入 main · 2026-10-26

本轮由用户确认试用后明确要求合入 main。单一 Codex 在独立 worktree 完成，不操作原主工作区的 Capture 本地提交、未提交文件或运行中的试用环境。

## 合并输入

- 远端 main：`77200e6642cbb990bfd5fc3409c9101b0d7d3f8f`。
- 远端 `codex/dsh-history-workbench`：`7c4c506538f6e870378928a814bb43f91f9e69c8`。
- 纳入三个提交：`b1c7c44d`（只读结构历史）、`007b8e82`（DSH 原生工作台）、`7c4c5065`（UI 精简与只读查询）。
- 合并分支：`codex/merge-dsh-history-main`，从远端 main 开始，以非快进合并保留功能开发历史。

自动合并无冲突。合并后的 `apps/`、`packages/`、`scripts/` 与用户试用的功能分支逐字节一致；`docs/product-design/` 与输入 main 一致，没有混入其他分支或改写 main 的 Work Evidence 文档更新。

## 本轮验证

完整检查日志另存本次聊天的本机交付目录，以下保留结果摘要；不提交临时环境、凭据、Graph、依赖或构建产物。

- 仓库运行时 Node 20.20.2，独立 `npm ci`。
- 完整 `npm run check` 通过：需求映射检查、全部工作区类型检查、lint、836 项工作区测试（其中 DSH 37、Logseq 565）、5 项沙盒测试、构建与二进制检查、12 项架构边界测试、Taste 评估均通过。文档生成未产生额外追踪文件差异。
- 首次检查发现新 worktree 尚无 `kernel-console/dist`，既有控制台页面测试返回 404；执行完整构建后重新运行整套检查，没有修改测试或跳过检查。
- DSH 原生宿主回归：Node 24.19.0、已安装 DSH 0.2.1-rc.2，`apps/dsh-plugin/tests/host-proof.mjs` 的 8 项检查通过。使用真实 Cordis、Tools、SystemPrompt、AgentLoop 和 HTTP companion；Logseq 为合成 SDK 夹具、模型为本地脚本模型，没有远端模型请求。脚本输出中的版本字段为旧的硬编码值，实际依赖以本条记录为准。
- 合并差异空白检查通过；原主工作区的 Capture 改动保持原样。

本轮没有重新进行图形界面或真实 Logseq Desktop 验收。图形交互证据沿用同一生产代码树的[精简实施验证](../implementation/2026-10-26-dsh-history-simplified.md)，不把它表述为合并后的新一轮真实 Graph、重启持久性或远端模型验收。
