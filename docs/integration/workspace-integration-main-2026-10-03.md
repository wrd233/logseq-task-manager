# 工作区整合与恢复合入 main

2026-10-03。用户授权将工作区整合合入 main、完成提交，随后明确要求重新核验最新远端 main 并推送。

## 本次基线

| 项目 | 实际核验值 |
| --- | --- |
| origin | `https://github.com/wrd233/logseq-task-manager.git` |
| 初次整合时远端 main | `acb1f4a3adb5d7122632245f0c2456853d4f6897` |
| 用户通知更新后重新 fetch 的远端 main | `6b6ce10053b10a10c49550a2c0e262ec11b9713e`，已包含阶段工作台 |
| 整合前本地 main | `6b6ce10053b10a10c49550a2c0e262ec11b9713e`，干净 |
| 工作区正式交付 | `9b2d5fdff8062bf691829bf22eb400773ee8ecf9`，`codex/workspace-integration` |
| 保留两方历史的合并 | `327e599`，父提交分别为上述本地 main 与工作区交付 |
| 专用整合分支 | `codex/merge-workspace-integration-main` |
| 运行时 | Node 20.20.2 / npm 10.8.2，未改变系统默认运行时 |

在本 session 专用工作树处理重叠改动，保留原功能分支。重新 fetch 的远端 main 与合并第一父提交完全一致，已被本次合并包含；没有丢弃或替换远端提交。主工作树只在核验仍干净且 HEAD 未改变后以 `--ff-only` 更新。发布使用 `origin main:main`；是否完成及最终 SHA 以推送后的 `git rev-parse main` 和 `git ls-remote origin refs/heads/main` 一致性核验为准。

## 兼容阶段工作台的接线

四处冲突位于 workspace-context/install.ts、host/desktop-files.ts、index.ts 与 Desktop 文件回归。保留阶段安装、审阅及卸载，同时使用工作区交付的正式 SDK 来源、材料恢复和旧 namespace 防护。

- `installWorkspaceContext().source.read(scope, valid?)` 经 `WorkspaceContextService.readSource` 读取相同已提交来源；有效性回调默认返回 true，兼容 lenses 单参数读取与 stages 生命周期校验。`source.version(scope)` 保留 Graph、解绑和重新绑定的失效版本。
- 组合根将同一 `sourceReader` 注入 content 专用 adapter，仍保留 protections、children、paths、EditingGuard、范围授权、Journal 及逐项写回核验。
- stages、workspace、content、work-view、materials 均在卸载时释放。移除 namespace 时核对本次实例所有权，旧实例不能删除新实例的能力。
- Desktop mode-less stat 保留安全整数及真实 listdir/ENOTDIR 判断；兼容普通错误对象与跨 realm Error，保留缺失多级目录的祖先确认和不可读路径的失败关闭。

没有依赖/lockfile、Kernel、SQLite 或正式任务状态变更。来源协议、范围和材料恢复说明见[架构](../architecture/workspace-integration-architecture.md)及[原交付交接](../implementation/workspace-integration-handoff.md)；阶段权限和不可变历史见[阶段交接](../implementation/stage-workbench-handoff.md)。原交付中的未合入 main、未推送和测试数量描述对应功能分支交付时点，本记录补充后续整合证据。

## 实际验证

| 检查 | 本次结果 |
| --- | --- |
| 插件 typecheck | PASS；合并测试时 HappyDOM Window 名称与 DOM 类型冲突，改为明确别名后通过 |
| 定向来源、Desktop、阶段、目录与组合根回归 | 44/44，0 fail、0 skip；`tmp/workspace-integration/main-merge-targeted.log` |
| 完整 `npm run check` | 退出码 0；`tmp/workspace-integration/main-merge-check.log` |
| 全仓业务测试 | 518/518，含插件 290/290，0 fail、0 skip |
| Sandbox harness / 依赖边界 | 5/5、12/12；Dependency boundaries verified |
| requirements、全仓 typecheck/lint、构建及二进制核验 | 全部通过 |
| Taste | PASS，KEEP_0.1.0_ACTIVE，没有激活候选 |
| 空白与未解决冲突检查 | PASS |

扩展实际组合根连续回归：绑定目录和授权后，阶段开始快照与 content/lenses/workspace 原文一致；通过 stages.submit 写入后得到 APPLIED_VERIFIED，阶段修订保存相同 blocks 和集合版本；随后材料收纳、副本拒绝、目录搬迁、显式重关联、材料重新定位、卸载和重装恢复继续通过。重启后阶段身份及历史快照不变。tasksEnabled=false、Kernel 离线且网络请求计数为零。

完整检查验证的是本次整合源码；重新 fetch 的最新远端没有带来额外产品差异。日志和构建产物保留在专用工作树忽略目录，不提交到仓库。没有接触生产 Graph 或其他 session 的 Logseq/Kernel 进程。

本次 main 整合未重新运行 Desktop 实机验收；原交付的隔离 Desktop 证据保留为历史验证。中文 IME、系统 Undo、真实双 Graph/外部进程竞争、断电及跨系统限制保持，不将自动化连续回归当作这些场景已经通过。
