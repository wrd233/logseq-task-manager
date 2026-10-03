# 阶段记录与原位审阅合入 main

2026-10-03。用户授权将 `codex/stage-workbench` 整合到 main 并提交。本轮仅完成本地 main 整合，没有推送、PR、部署或生产 Graph 操作。

## 明确起点和范围

| 项目 | 本轮核验值 |
| --- | --- |
| origin | `https://github.com/wrd233/logseq-task-manager.git` |
| fetch 后远端 main | `acb1f4a3adb5d7122632245f0c2456853d4f6897` |
| 阶段交付 | `832d632599106b67a5301f5bd1accb0855050e3c` |
| 整合前本地 main | `1298ac2937ac18daf82d38f852e0f93a44f32dc9`，干净且落后远端 |
| 整合分支 | `codex/merge-stage-workbench-main`，从本次 fetch 的远端 SHA 建立独立工作树 |
| 工具链 | Node 20.20.2 / npm 10.8.2；符合 package.json，不修改系统默认运行时 |

配置远端未改变。直连 fetch 的 TLS 失败后，按现有代理配置使用 HTTP/1.1 成功 fetch；失败时没有把缓存 remote ref 当成新起点。已核验适用路径没有 AGENTS.md。没有清理、切换、安装或提交其他功能工作树；保留 `codex/stage-workbench` 的完整交付历史。

阶段交付已包含本次远端 main。采用 `--no-ff` 合并保留正式整合节点，无文本冲突；新增整合文档之前，合并 tree 与交付 tree 完全一致，均为 `e81495b0c9c84bc10ce38a45e4b2c60ea1a3c73a`。相对阶段交付，最终差异仅增加本记录和整合 README 入口；产品源码及测试不改写。本地 main 在核验仍然干净且 HEAD 未变化后，以 `--ff-only` 更新到完成验证的整合提交。最终提交 SHA 由 `git log -1 main` 查询。

## 接线和保护

组合根保留 workspace、content、stages、work-view、materials 和任务运行时各自的 install/dispose。阶段的实时来源消费 workspace 内部 live-source port，编辑继续使用 content 专用保护、真实 parent、版本与原生编辑 guard。content Journal 的 history 仅读取真实事实，不重放正文。WorkView 通过自有 ReviewPort 消费描述，lens 与审阅保持独立生命周期。

公开阶段程序入口提供 begin/read/submit/checkpoint/history/reconcile/activate/resolveCandidate，不暴露用户认可、actor 或自证授权。认可留在真实本地 UI/命令入口并绑定实际展示的不可变 revision/hash。材料 ID 与真实版本来自现有材料服务；二进制没有字节保留时不承诺恢复。阶段存储以插件私有 FileStorage 为唯一权威。

共享源码变动限于 content executor/installer、work-view controller/renderer/review-port、workspace context-service/install、Desktop 文件桥和 index.ts。没有 Kernel、SQLite、CLI、正式任务状态、依赖或 lockfile 变动。其他未发布功能分支没有纳入此次整合；外部 agent bridge 仍需明确的交付版本及正式 adapter 联调。

产品行为和模块职责沿用[设计](../design/stage-workbench-design.md)、[架构](../architecture/stage-workbench-architecture.md)、[交接](../implementation/stage-workbench-handoff.md)，本文件只记录合入 main 的证据。

## 验证与边界

验证在独立整合工作树完成。自身 node_modules、npm cache、dist 和日志独立保存于该工作树；测试夹具使用各测试创建的唯一临时目录，没有可写符号链接共享产物。日志位于 `tmp/stage-integration/`，不提交环境产物或 token。

首次完整 check 在 Console HTTP 测试的 `/console/` 得到 404：新工作树尚无该现有测试明确依赖的 `apps/kernel-console/dist/index.html`。保留 `full-check-initial.log`；核验实际 server/test/build 命令后，仅运行已有 Console build，单项回归通过，再完整执行 check。没有改源码、调整断言、跳测试或降门禁。冷工作树需先构建 Console，再执行现有 check 顺序。

| 检查 | 实际结果与日志 |
| --- | --- |
| 独立依赖安装 | npm ci 退出码 0；`npm-ci.log`；lockfile 未变 |
| Console 先置构建及失败项回归 | build 退出码 0，测试 1/1；`console-build.log`、`console-regression.log` |
| 最终完整 npm run check | 退出码 0；`full-check.log` |
| 全仓业务测试 | 511/511，含插件 283/283；0 fail、0 skip |
| Sandbox harness / 依赖边界 | 5/5、12/12，Dependency boundaries verified |
| requirements、全仓 typecheck/lint、构建及二进制验证、Taste | 全部通过；Taste PASS，未自动激活候选 |
| 最后文档更新 | 另执行 docs:requirements 和 git diff --check |

原交付的 macOS 隔离 Desktop 证据继续适用于完全相同的产品源码：实际键入、正文/建议写回、精确认可、认可后人工编辑、历史回看、聚焦全部/返回、材料往返、目录暂不可用、重启和停止自身 Kernel 后的阅读与认可。此次 main 整合没有再次启动 Desktop，未将自动化测试称为新的原生输入验收。

真实中文 IME、系统剪贴板/Undo、原生键盘选择/快捷认可、真实双 Graph/外部进程竞争、断电、长期使用、其他 OS 和外部 transport 的未验范围保持；具体限制与失败证据见交接。合入 main 不自动开放这些能力，也不触发产品阶段、Git 编排或任务状态改变。
