# Agent 工作区合入最新 main

2026-10-03。用户在独立交付完成后明确授权「合并到最新的 main 并完成到远端的推送」。本记录补充功能分支交付时点的状态；产品与接口见 [设计](../design/agent-workspace-design.md)、[架构](../architecture/agent-workspace-architecture.md)、[实施交接](../implementation/agent-workspace-handoff.md)。

## 起点与整合

| 项目 | 核验结果 |
| --- | --- |
| origin | `https://github.com/wrd233/logseq-task-manager.git` |
| 独立功能交付 | `a16fc5ac13a0f939c843080e5b1878a896fd5ccd`，`codex/agent-workspace` |
| 发布时 fetch 的远端 main | `07008fca018eb7391408e52d6bdb8b868a56fcf1` |
| 远端已发布能力 | workspace-context、workspace-integration、stage-workbench |
| 保存双方历史的合并 | `256ed1a1b07afdd2312e4d6f42198d4a81c7c9cd` |
| 正式阶段薄适配 | `9395bfa` |
| 本 session 独立工作树 | `/Users/mac/Downloads/work/logseq-agent-workspace-20261002` |
| 最终 main 整合分支 | `codex/merge-agent-workspace-main` |
| 环境 | macOS Darwin 24.2 x86_64，工作树内 Node 20.20.2 / npm 10.8.2 |

origin、HEAD、工作树、适用 AGENTS.md、状态与工具链再次核验。未在原 main checkout 或他人的工作树执行安装、切换、stash/reset/clean/commit；其活动文件不参与整合。功能分支保存整合成果后，从已核验远端 main 在本 session 工作树建立发布分支，以 `--no-ff` 合入功能分支，保留远端 main 为第一父历史。最后提交树应与已经验证的功能树相同。

三处冲突位于 `index.ts`、`features/content-writeback/installer.ts`、`workspace/context-service.ts`。组合根保留 agent/stages/workspace/content/work/materials 的安装与释放、正式 sourceReader 及旧实例 namespace 所有权校验。content 同时保留本地用户 UI 的私有回调与 agent installer 的真实 lease；这些端口均未发布到公共 content namespace。工作区保留 observeScope、sourceVersion、readSource，各自用途不混为授权。

## 正式阶段接入

此次最新 main 已提供正式阶段 API，外部桥只消费其 `read/submit`。空的 stage read 输入通过正式 history 查当前阶段；没有当前阶段诚实返回 `STAGE_CURRENT_UNAVAILABLE`，不会为了读取自动创建阶段。明确 stageId 可读取同一工作历史。

stage submit 接受现有阶段模块拥有的闭合输入，核验 scope 与本地连接绑定一致；patch 的 ID 采用原 content 路由的客户端命名空间，实际写入、Journal、逐项结果、阶段修订与异常均来自正式 provider。content result 可以查询同一外部 patch ID；重复 submit 不重复写入或产生额外修订。metadata.stageId/runId 不作为作者或范围证明。

外部没有 begin、认可、任意 actor/facts 或阶段存储 API。认可只在原阶段 UI 私有本地用户路径；CLI 不导入阶段 controller，agent 不复制 Stage schema/store/renderer/composer。缺少 provider 时原 unavailable 分支保留，基础读取、文件、材料、聚焦和正文维护仍独立可用。

## 本次验证

| 验证 | 实际结果 |
| --- | --- |
| 三方冲突解决后的定向回归 | 29/29，0 fail、0 skip；`tmp/agent-workspace/main-merge-targeted.log` |
| 新阶段适配插件 typecheck | PASS |
| 独立外部 CLI 阶段连续回归 | PASS；`main-stage-external.log`；真实 CLI 子进程经过 HTTP、实际 installer、正式 StageStore/content Journal，DOM/合成 SDK 夹具 |
| 完整 `npm run check` | PASS，退出码 0；`main-publish-check.log` |
| 全仓测试合计 | 542/542，0 fail、0 skip；其中插件 291/291、CLI 17/17、service 29/29，含 sandbox 5/5 与边界 12/12 |
| requirements、typecheck、lint、构建及二进制 smoke | 全部通过 |
| 依赖边界与 Taste | PASS；KEEP_0.1.0_ACTIVE，没有激活候选 |
| 合并后真实 Desktop | 11/11 组，Logseq 0.10.9 / SDK 0.3.4，tasksEnabled=false、Kernel 未启动；`desktop-main-acceptance.log`、`desktop-main-facts.json`、`desktop-main-focus.png` |

真实 Desktop 是本 worktree 既有隔离 app/profile/Graph，PID 75704、companion PID 75703，CDP `127.0.0.1:19339`。连接前再次核验完整 PID 命令、app/profile 路径和 page URL；没有连接其他实例。最终合并代码已构建并加载。验收包含实际刷新/hash/缓存、直接文本与二进制、材料 capture/save/权限、正文写入/Journal/冲突/双客户端/幂等、TODO/正式字段/实际编辑态、完整块聚焦与材料返回/新问题/晚到/来源变化、显式会话、正式阶段 read/submit/原作者事实/重复查询、停止连接保留本地工作台、插件卸载重载和重新允许。

Stage 的开始是隔离测试夹具在插件本地正式 API 中建立；每次外部能力调用仍由真正独立的构建 CLI 进程发出，生产链为私有 HTTP companion 与已认证插件 poll。CDP 仅用于本地夹具、已注册允许/停止命令和 DOM/SDK 断言，没有成为生产 transport。驱动初次把浏览器宿主 realm 的对象直接交给严格本地 API，得到 INVALID_OBJECT；改为在插件 realm 构造夹具输入后完整复验通过，没有放宽生产输入校验。

未新增原生输入提交、中文 IME、系统粘贴/Undo、双 Graph 实机竞态、断电、长期多进程压力或 Windows/Linux Desktop 验收；原交付的环境与 TOCTOU/CAS 限制继续成立。本次不启动 Kernel、不部署、不改生产 Graph、不创建 PR。数据、证据与工作树保留，只释放本 session 身份核验过的进程。

## 发布核验

发布前再次 fetch/核验 origin/main，确认最终 HEAD 包含最新远端及完整功能交付。使用普通 fast-forward push `HEAD:refs/heads/main`，不 force；若远端推进则保留其历史、重新整合和执行必要验证。推送完成以本地最终 HEAD 与 `git ls-remote origin refs/heads/main` 的完整 SHA 相等为准；最终 SHA 由整合提交及交付回复提供。本分支所有代码随后可通过远端 main 获取，不依赖另一 session 的活动文件。
