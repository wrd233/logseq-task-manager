# 决定与缺口日志

## 已冻结决定

| ID | 决定 | 来源 | 实施影响 |
|---|---|---|---|
| UX-D001 | Logseq 是工作现场，Task Copilot 管理注意力和连续性 | 设计文档 | 不建设第二正文/独立 Web 工作台 |
| UX-D002 | 主导航为现在、待我确认、项目、更多 | 设计文档 | Audit/Recovery/Diagnostics 降级但仍可达 |
| UX-D003 | Focus 由用户权威控制 | 设计文档 + V2 Domain | Signal/LLM 只能建议 |
| UX-D004 | 低风险可一次“接受并应用”，底层安全链不压缩 | 设计文档 | 只做 orchestration，不新增直接写路径 |
| UX-D005 | Project 所有创建入口都经过自适应 Grill Me | 设计文档 | P2 修改现有直接创建前置，但保留原子 create |
| UX-D006 | attention signal 是派生运行数据 | 设计文档 | 不成为正式对象/生命周期 |
| UX-D007 | Service 第一阶段默认随 Logseq 停止 | 设计文档 | P0 必须定义 owned process 与安全 shutdown |
| UX-D008 | 本轮只做 Desktop | 设计文档 | 不为移动端削弱桌面交互 |
| UX-D009 | V2 取代 V1、SQLite 唯一正式权威 | ADR | 不重开双写/双模式 |
| UX-D010 | Project current interface 是 schema v12 单 aggregate | ADR-0006 | 不新增 Project side tables |
| UX-D011 | LLM 只生成 Proposal | 现有架构 + 设计 | 不扩大写入权 |

## 代码已回答的缺口

| 问题 | 结论 | 证据 |
|---|---|---|
| 正式 Plugin 路径 | `apps/task-copilot-logseq-plugin/`，Load unpacked 选根目录 | Plugin README/package |
| UI 技术 | Vanilla TS renderer + event delegation | ADR-0003、`ui.ts` |
| Block 右键 API | 类型存在，当前未注册 | `@logseq/libs` d.ts、bootstrap |
| Page 菜单 API | 类型存在，当前未注册 | `@logseq/libs` d.ts、bootstrap |
| 快捷/斜杠现状 | 5 个 command palette；1 个 slash open | `bootstrap-shell.ts` |
| Service 生命周期 | 独立 Node20 进程；SIGINT/SIGTERM safe close；Plugin 不启动/停止 | `main.ts`、`beforeunload` |
| descriptor | Service filesystem descriptor；Plugin private storage/Electron reader | runner、service-connection |
| accepted-not-applied | Proposal ACCEPTED 可持久，最终 Commit 独立 | Review/Commit code |
| Undo | inverse SemanticCommit；后续变化拒绝覆盖 | ADR-0005、Commit code |
| Graph identity | Graph-bound SQLite + descriptor/client/protocol revalidation | persistence/service |
| Provider | DeepSeek runtime explicit config、Keychain/env ref、structured Proposal | Provider code/docs |

## 需要原型/运行验证的缺口

| ID | 问题 | 验证方法 | 不得先假设 |
|---|---|---|---|
| UX-G001 | context menu 的实际排序、分组与 Query/引用 payload | isolated Desktop prototype | 正式 Block 的四项菜单排序、UUID、Focus 与 Condition 动作已通过；Query/引用仍待验收 |
| UX-G002 | Page menu 对 Journal/namespace/Project Page 的 payload | Desktop probe | CONTROLLED：普通 Page、Project Page、Journal 主 Page 已按 UUID/Anchor 重验通过；Logseq 0.10.15 的 right-sidebar `…` 不暴露 Plugin Page menu item，secondary payload 仅自动覆盖；namespace 待专用样本 |
| UX-G003 | Block renderer slot 的布局/性能 | test page + Light/Dark/100 blocks | 不先全局上线 |
| UX-G004 | Plugin 能否启动 Node20 child process | isolated capability spike | 不用 shell 拼接硬做 |
| UX-G005 | descriptor 写入 private FileStorage 的产品通道 | real Desktop | DONE：本地文件读取后校验，只写固定私有 key；设置不含 token/path；reload 自动 READY |
| UX-G006 | Logseq exit shutdown 时间窗口 | process + Desktop fault Gate | beforeunload 不等于可等待任意时长 |
| UX-G007 | 多 Block SemanticCommit scope 是否足以原位重构 | application prototype | 不先扩 Schema/恢复器 |
| UX-G008 | attention signal 持久化位置 | SQLite derivative vs cache spike | 不建第二正式权威 |
| UX-G009 | unified UX output 是否需要持久化 | LLM/Application contract spike | 不把 Provider 类型放进 Domain |

## 当前冲突

### UX-C001：设计要求 Service 自动可用，当前只能终端启动

分类：`SERVICE_PRODUCTIZATION`

推荐：先验证 Plugin-owned process 能力；若 Logseq iframe 无法可靠启动 Node，采用独立受控 launcher，而不是在 UI 声称自动。无论方案如何，都必须有 ownership token、Graph binding、safe shutdown、crash recovery 和 descriptor private handshake。

2026-07-23 实证补充：独立 Service 与 CLI READY，但插件设置接收安全的 filesystem descriptor
路径后返回 `SERVICE_DESCRIPTOR_PATH_INVALID`。P0-H 已新增文件选择→校验→固定私有 FileStorage
key→直接 refresh 的产品通道；真实 Desktop 导入和 reload 均 READY，token 未进入设置、Graph、
日志或截图。此项只解决 handshake，外部 Service 的启动、ownership、退出和崩溃恢复仍未解决。

### UX-C002：设计要求约四项动态 Block 菜单，SDK 注册项固定

分类：`UI_ORCHESTRATION`

推荐：保持少量稳定“意图入口”，动作执行时解析 Block 是正式对象还是普通内容，并打开紧凑二级操作；先通过 Desktop 证明认知负担和位置稳定性。若需要真正动态菜单，再做最小 SDK spike，不复制状态机。

### UX-C003：设计要求低风险一次应用，当前 Review 与 Commit 两阶段

分类：`UI_ORCHESTRATION`

推荐：仅把 LOW 白名单的 review/revalidate/commit 编排在一个连续组件中；状态、ledger、恢复与 Undo 不合并。高影响保持独立最终确认。

2026-07-23 结论：`RESOLVED_FOR_P0`。新增编排层严格限制 READY、唯一独立 LOW 组、单 Block
`CREATE_OBJECT`/受约束 `REWRITE_BLOCK`，并在 accepted-plan Validator 后继续调用既有
Review、Graph/版本重验、SemanticCommit 和 Undo。真实 Desktop 已证明按钮 busy 禁用、
APPLIED 后 Undo 和最终 SQLite/Graph 恢复；transport 不确定自动测试证明只请求一次且要求刷新。
HIGH、Ownership、Closure、Lifecycle、Project structure、批量与跨对象修改仍保持原专用流程。

## 尚不需要用户决定

当前所有首批 P0 选择都可由设计文档、代码与原型回答。没有需要立即向用户提出的产品语义问题。
