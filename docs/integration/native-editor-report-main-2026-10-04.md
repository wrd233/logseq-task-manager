# 原生编辑与报告视图整合到 main

2026-10-04。用户在功能交付后明确授权合入最新 main 并推送。本记录补充 [功能交接](../implementation/native-editor-report-handoff.md) 的本地交付时点；产品与端口见 [设计](../design/native-editor-report-design.md)、[实际架构](../architecture/native-editor-report-architecture.md)。

## 提交与环境

| 项目 | 核验值 |
| --- | --- |
| origin | `https://github.com/wrd233/logseq-task-manager.git` |
| 原功能共同基线 | `e666e7be1367e97dabf5f787c7dcb944ac70e815` |
| 本次成功 fetch 的远端 main | `9b7f148c2615d989a1ef0aa251ffc237c38edd93` |
| 保留的功能分支 | `codex/view-lenses-native-report`，`da0f0bd89caade7a6628a230d35de7e97e1f4649` |
| 独立整合分支 | `codex/merge-native-report-main` |
| 双亲合并提交 | `61f3ca1239195c00a690413ec7e03234e943e364` |
| 独立工作树 | `/Users/wangrundong/.codex/worktrees/merge-native-report-main/任务管理中心-logseq插件` |
| 工具链 | Node 20.20.2、npm 10.8.2；macOS arm64 |

合并第一父提交为本次 fetch 的远端 main，第二父提交为完整四提交功能交付。没有冲突，没有改写功能分支历史；核验 main 自原共同基线更新的 16 个文件在合并树中全部保持不变。未读取其他活动工作树的未提交实现。

main 新增的事务／任务书写兼容和材料恢复测试修复一起保留。报告继续通过已有 `workObject` 消费 canonical-writing 的同一识别 owner，保留 `[事务]` 写法、完整来源与真实对象边界，没有新建另一套正式识别或放宽正文写权限。

## 共享接线与整合范围

宿主原生编辑及 panel 暴露、报告功能、`index.ts` 单行 report 注册／组合回归和文档证据分别沿用功能分支的四个不可变提交：

- `81c0c8cb5132ab9bb1f5b61c08f52d127330db81`：宿主与 panel。
- `4e09677ea8b461bc58a7b73b4e7a0502fab78bd8`：报告、映射、导航及自身测试。
- `e71f376d55df9cbd26e74ad59766488d2063545b`：共享入口、workbench 与 stage 回归。
- `da0f0bd89caade7a6628a230d35de7e97e1f4649`：设计、架构、交接及合成 Desktop 证据。

本次合并没有增加依赖或改变 lockfile、Kernel／SQLite schema、source 协议、材料 store、写回 executor 或 agent transport。整套手册／PDF未重写。02 材料导入／引用拖放／改名与 03 新整理能力没有从未提交实现接入；后续依据其已发布版本整合。

## 本次检查

在整合工作树单独执行 `npm ci`，按仓库说明先 `npm run build` 再验证；没有共享可写 node_modules、dist 或运行存储，也没有在原 main checkout 安装或构建。

| 检查 | 最终结果 |
| --- | --- |
| 报告、原生 UI 适配、workbench、stage、canonical、writing entry、focus、材料恢复八个相关测试文件 | 68／68，0 fail／skip／cancel |
| `npm run check` | exit 0；需求图、全部类型／lint、测试、构建／产物与 taste 通过 |
| 工作区业务测试 | 565／565，其中插件 331／331 |
| sandbox 脚本测试 | 5／5 |
| 边界测试与实际扫描 | 12／12；Dependency boundaries verified |
| 总测试数 | 582／582，0 fail／skip／cancel |
| taste | PASS，KEEP_0.1.0_ACTIVE，未激活候选 |
| 合并与空白 | 无未解决冲突；`git diff --check` 通过 |

完整日志及结构化计数位于本工作树忽略目录 `tmp/native-report-main/full-check.log`、`verification.json`，定向记录为 `targeted.log`；安装与前置构建日志一并保留。

本次未重新启动 Desktop。功能分支的真实 Logseq 输入、宽窄窗、材料往返、稳定位置与不可变历史证据仍按原构建标识保存；这些截图不冒充合并构建的重新实机验收。物理 IME、系统 Undo／跨应用剪贴板、任意原生拖放／精确光标、触摸及其他 OS 等未验范围继续见功能交接。

## 发布核验

发布采用仓库允许的普通 `git push origin main:main`，不强制覆盖、不绕过 pre-push 钩子、不更改全局代理。推送前重新 fetch，确认当前远端 main 被交付包含；本地 main 仅在分支与工作树状态核验后 fast-forward 到已检查的整合交付。

推送结果按远端 `refs/heads/main` 与本地 main／整合 HEAD 的 SHA 比对确认；若远端继续前进，先保留并整合其更新，再检查后重试。最终发布 SHA 以该核验及交付回复为准，而不是原功能 HEAD 或旧 main。
