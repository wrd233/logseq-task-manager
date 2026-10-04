# 原文整理与真实块移动整合到 main

2026-10-04。用户在功能交付后明确授权合入最新 main 并推送。本记录补充[功能交接](../implementation/content-writeback-organize-handoff.md)的本地交付时点；实际协议、权限和恢复见[设计](../design/content-writeback-organize-design.md)、[架构](../architecture/content-writeback-organize-architecture.md)。

## 提交与环境

| 项目 | 核验值 |
| --- | --- |
| origin | `https://github.com/wrd233/logseq-task-manager.git` |
| 原功能共同基线 | `e666e7be1367e97dabf5f787c7dcb944ac70e815` |
| 本次成功 fetch 的远端 main | `72115bb475c6dc19bf51221395e2b92a356b20e2` |
| 保留的功能分支 | `codex/content-writeback-organize`，`a8a7c9180696c4cb31326df2bc3c7aefc4c284a0` |
| 独立整合分支 | `codex/merge-content-writeback-organize-main` |
| 双亲合并提交 | `c2e6e40fbcec442a83a15da242694f37b30d2d2a` |
| 独立工作树 | `/Users/wangrundong/.codex/worktrees/merge-content-writeback-organize-main/任务管理中心-logseq插件` |
| 工具链 | Node 20.20.2、npm 10.8.2；macOS 15.1 arm64 |

双亲合并以本次 fetch 的 main 为第一父提交、完整六提交功能交付为第二父提交，保留功能历史。最终远端 SHA 包含本记录提交，以交付回复与实际远端核验为准。

## 冲突处理与共享接线

唯一文本冲突在 `content-writeback/protection.ts`。main 的 `canonical-writing.hasFormalAnchorSyntax` 已包含 `[事务]`、`[任务]` 和 MiniProject 等保守语法事实，功能分支增加的事务保护与它一致，因此沿用 main 的统一解析 owner；没有恢复分支中的重复正则或把标记识别当作权限。

`work-view/renderer.ts` 自动合并，保留已发布的报告分组、来源映射和原生往返，增加现有阶段详情里的旧／新位置。`content-writeback.test.ts` 同时保留 main 的事务离线／正式保护和功能分支的 schema 协商回归。

main 相对共同基线更新、而功能分支没有修改的 38 个路径在合并提交中逐字节保持原样，包括统一来源、原生编辑／panel、组合根、canonical-writing 和材料恢复测试。随后只在 integration README 增加本记录索引。共享修改沿用功能分支的独立提交：content／agent installer、router、CLI 帮助、stage recorder/store/diff/review、work-view 的窄审阅描述及位置展示；没有改 Kernel schema、材料 store、source protocol/provider、依赖或 lockfile。

额外增加 `tests/content-organize-report.test.ts`，通过真实 content／stage 安装入口和报告 API 验证组合：展示分组顺序与真实 SDK 子块顺序不同，来源映射仍给出正确 UUID；编辑中的子块阻止移动；移动保留原文、子树和来源身份并产生阶段结构事实；旧报告落点失效；人工再移动标为来源未知，已认可历史与同键重试均不恢复旧位置。宿主为 DOM／SDK 替身，不冒充 Desktop。

## 已交付范围与剩余接线

生产 workspace CLI 沿用私有 companion／router，状态协商 schema 2、move-block 及当前结构授权。原来的文字许可仍只允许文字操作，明确本地“允许 agent 润色并整理此工作原块”才授予范围内结构维护。v1 文本／insert-child、旧 Journal 与阶段历史继续可读。未知移动只查询核验，不盲目重放；后来人工移动不会被原请求撤销。

报告标题继续只在展示层，不能成为移动目标或写回正文。普通 TODO 移动保留文本与状态，正式对象／managed 子树／对象归属和原生编辑边界继续成立。SDK 不提供跨程序 CAS 或跨块事务。

01 原生报告和 04 标签兼容已实际接入本次 main；02 的文件改名、跟随名称证据和材料拖放编排仍待其已提交版本接入。它应在可信登记范围内复用现有版本化文本操作，不复制 executor 或扩大授权。整套使用手册／PDF未在本次合并重写。

## 本次验证

依赖、dist、临时日志和存储均在独立整合工作树，先 `npm ci`、`npm run build`，再运行针对性检查与仓库完整门禁。

| 检查 | 最终结果 |
| --- | --- |
| content／organize、生产 CLI entry、stage／review、报告／原生 UI、事务兼容、workbench 与材料相关的 11 个测试文件 | 155／155，0 fail／skip／cancel |
| 新增报告与原块移动组合回归 | 1／1；也纳入完整门禁 |
| `npm run check` | exit 0；需求图、全部类型／lint、测试、构建／二进制及 taste 通过 |
| 工作区业务测试 | 597／597，其中插件 363／363 |
| sandbox 脚本测试 | 5／5 |
| 边界测试与实际扫描 | 12／12；Dependency boundaries verified |
| 总测试数 | 614／614，0 fail／skip／cancel |
| taste | PASS，KEEP_0.1.0_ACTIVE，未激活候选 |
| 合并与空白 | 无未解决冲突；`git diff --check` 通过 |

首次完整门禁在新增组合测试的 TypeScript 检查停止：断言已将成功分支收窄，后面的重复失败分支变成 never。删除该冗余分支后重新执行完整门禁通过；初次日志保留为 `initial-typecheck.log`。没有修改产品行为、放宽断言或跳过检查。

原始日志在本工作树忽略目录 `tmp/content-organize-main/`：`full-check.log`、`verification.json`、`targeted.log`、`report-combination.log`、`preservation.json`，以及安装／前置构建记录。功能分支已有独立生产 CLI 进程、隔离 Logseq 0.10.15 实机移动、阶段、冲突、重载／冷启动和同键历史查询证据，具体范围及路径见原功能交接。本次没有重新启动 Desktop，原构建证据不冒充合并构建的重新实机验收。

持续未结束的原生草稿遇到独立 CLI、真实中文 IME／Undo、DB Graph／其他 OS、Desktop 在 SDK 移动途中切换 Graph 继续未验；对应逻辑保护已有回归。最小实机复验步骤沿用功能交接，不将模拟 composition、SDK 定义或截图升级为实机通过。

## 发布核验

推送前重新 fetch，核验最新远端 main 被整合包含；仅在原 main checkout 仍干净且属于正确分支时 fast-forward。发布使用普通 `git push origin main:main`，遵守现有 pre-push 钩子，不强制覆盖、不绕过钩子、不更改全局代理。

推送后比对远端 `refs/heads/main`、本地 main 和整合 HEAD；保留功能及整合工作树和自有证据。
