# 在另一台电脑从同一个提交开始

本轮资料通过已有 `codex/workbench-visual-refresh` 分支交付；实际实施只开 A、B 两条分支。共同起点包含两份 prompt、共同约定、交互参考和最新已验收视觉，不依赖原电脑环境。

## 先获取并固定资料

已有仓库时在仓库内运行 fetch；没有仓库时先 clone。以下相对路径可按电脑实际位置调整，不使用原电脑的绝对路径：

```bash
git clone https://github.com/wrd233/logseq-task-manager.git
cd logseq-task-manager
git fetch origin codex/workbench-visual-refresh
BASE_SHA=$(git rev-parse FETCH_HEAD)
git show "$BASE_SHA:docs/implementation/prompts/2026-10-07-agent-collaboration/README.md"
git show "$BASE_SHA:docs/implementation/prompts/2026-10-07-agent-collaboration/shared-contract.md"
git show -s --format=fuller "$BASE_SHA"
```

仅解析一次，记下完整 BASE_SHA，并把相同值交给两个执行现场。成功 fetch 后的 FETCH_HEAD 是这次明确获取的提交；后续不要用浮动分支名或新的 main 替代它。在不同电脑分别执行时，以用户给出的同一个完整 SHA 为准，核对对象存在。

先核对当前工作树、适用 AGENTS.md 与现有分支。保留未提交/未跟踪文件；不需要切换、重置或清理主工作树。若分支/目标工作树已有合适现场，核对后复用；发生占用使用唯一后缀并记录，不强行覆盖。

## 从这个完整提交建立两条工作树

```bash
git worktree add -b codex/materials-and-preview ../logseq-materials-and-preview "$BASE_SHA"
git worktree add -b codex/reading-and-agent-collaboration ../logseq-reading-and-agent-collaboration "$BASE_SHA"
```

如 A、B 分别在两台电脑执行，各自只建自己那一条；两台电脑使用相同 BASE_SHA。原目录只是存放仓库，不承担第三条实施任务。

启动语可以直接复制，BASE_SHA 填写上面记录的完整值：

```text
A：请读取并实际执行 docs/implementation/prompts/2026-10-07-agent-collaboration/01-materials-and-preview.md，同时读取其共同约定和远端起步。共同 BASE_SHA 为 <完整 SHA>。在独立工作树保留用户已有修改，按 prompt 完成实施、验证、本地提交和交接。
```

```text
B：请读取并实际执行 docs/implementation/prompts/2026-10-07-agent-collaboration/02-reading-and-agent-collaboration.md，同时读取共同约定、远端起步和 A 的边界。共同 BASE_SHA 为 <与 A 相同的完整 SHA>。先完成阅读与协作，再在你的分支合入已交付的 A 完整提交并完成最终联调；不另开整合实施分支。
```

工具链以该提交 package.json 为准；基线为 Node >=20.19 <21、npm 10.8.2。两支依赖、构建、Graph、材料、profile、私有通道状态、端口及进程各自隔离。目标电脑核验实际 Logseq 能力，不能复用原电脑 Lab 路径/端口。

## 交互参考与最后汇合

工作树里的 `docs/implementation/assets/agent-collaboration/logseq-agent-evolution.html` 可用浏览器直接打开。源码、运行依赖与说明随仓库交付；演示只描述合成发展过程，不连接实际 Logseq 或自动执行写回。

A 完成后交付完整 SHA 与 materials-and-preview-handoff.md。若提交在另一台电脑，先按用户授权方式推送/传送 Git 对象，B 成功取得并核对后，在自己的分支合并明确的 A_SHA：

```bash
git merge --no-ff "$A_SHA"
```

这里的 A_SHA 必须是实际取得并核对的完整 A 提交；不是示例字符串或只存在另一台电脑的分支名。B 解决接线/冲突并重新验证安装包。当前资料推送不自动授权未来实现推送、PR、main 或发布；这些按人类后续指令处理。
