# 事务／任务书写兼容整合到 main

2026-10-04。用户在功能分支交付后明确授权合入 main 并推送远端。本记录补充原交接的“本地交付未推送”时点；产品行为、接口与 Desktop 证据见 [设计](../design/writing-compatibility-design.md)、[架构](../architecture/writing-compatibility-architecture.md) 和 [原交接](../implementation/writing-compatibility-handoff.md)。

## 实际提交与环境

| 项目 | 核验值 |
| --- | --- |
| origin | `https://github.com/wrd233/logseq-task-manager.git` |
| 最新远端 main／共同基线 | `e666e7be1367e97dabf5f787c7dcb944ac70e815` |
| 保留的功能分支 | `codex/writing-compatibility`，`1ad1662f363b407ab55e26c6e98afc7968abec16` |
| 独立整合分支 | `codex/merge-writing-compatibility-main` |
| 保留双方历史的合并 | `0ebd736485535d35585c98b72d327066187ac736` |
| 材料测试时序修复 | `f0979469e0e1f70b126094ea486a0dea5168c272` |
| 运行时 | worktree 私有 Node 20.19.5／npm 10.8.2；Darwin x86_64 |

合并的第一父提交是经 fetch 核验的远端 main，第二父提交是上述功能交付；合并无冲突，合并树与功能交付树完全一致。没有重写功能分支历史，没有读取其他 session 的未提交实现。依赖、构建、测试及日志继续限定在本 chat 的独立 worktree；系统运行时未变。

推送使用普通 `HEAD:main`，不强制覆盖远端。发布前重新 fetch 并核对 origin/main 被整合分支包含；推送后核验远端 `refs/heads/main` 与交付 HEAD 完全一致。最终发布 SHA 以该核验及 `git rev-parse origin/main` 为准。

原 main checkout 仅有未跟踪 `docs/implementation/prompts/`。本轮不暂存或提交这些文件；更新本地 main 使用已核验提交的 fast-forward，前置核对当前分支、HEAD、跟踪文件状态及目标树没有该未跟踪目录的路径冲突，不 pull／switch／reset／clean。

## 范围与共享接线

两种 `[任务]`／`[事务]` 标签对应同一 TASK，明确正式操作保留标签与完整多行来源。MiniProject 继续为块，Project／Area 继续为页面。标签本身不创建正式身份或放宽权限。

共享适配为 canonical-writing、task-center controller、graph-adapter、work-view focus、content-writeback protection；注册命令、真实来源读取、UUID 导航和保护均消费同一 canonical owner。没有改 panel、source provider、材料 store、Kernel／SQLite schema、stage 或 agent transport。

第一次整合全仓检查中，材料恢复测试在固定 40ms 后读取 pending 记录，异步保存还没有登记 materialId。该测试单独运行通过；经源码核验，这是测试等待条件的问题。`f097946` 只把该测试改为等待可见的“继续保存收纳”入口，并在继续保存后等待该入口消失，断言仍核对原文、稳定 ID、ready 状态及只有一个文件。材料功能代码未改变。

## 本次验证

- 材料完整定向文件：12/12，0 fail、0 skip；`tmp/writing-compatibility-runtime/main-material-final.log`。
- 最终完整门禁：`npm run check` 退出码 0，563/563、0 fail、0 skip；插件 312/312，Sandbox 5/5，边界 12/12。requirements、全仓 typecheck／lint、构建与二进制核验、依赖边界均通过；Taste PASS、KEEP_0.1.0_ACTIVE，未激活候选。
- 空白检查：`git diff --check` 通过；无未解决合并冲突。

最终完整日志为 `tmp/writing-compatibility-runtime/main-integration-check-final.log`。最初失败日志 `main-integration-check.log` 保留，不把第一次运行报告为通过。

本轮没有重新启动 Desktop：功能交付的真实宿主证据与未验范围保持，包括宿主重排属性行、CDP 输入不等同于中文 IME／系统 Undo、重载后的离线输入和截图未完成。整合后额外变更只有上述测试及本整合记录；不宣称增加实机验收范围。

01／03 接入 canonical 标题与保护时使用 main 已提交版本；02 材料测试有一处等待条件改动，材料接口及存储未变。整套使用手册／PDF 留给四分支最终整合统一更新。
