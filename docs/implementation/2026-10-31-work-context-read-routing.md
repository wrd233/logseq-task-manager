# Goal 3：独立工作上下文与只读来源路由

分支 `codex/work-context-read-routing-v1`，以远端 Goal 2 `e57c712cb4eb1e0533a6e8536a730ae8a1005fee` 为基线，包含 Goal 1 `76d8eea226141d38a3489acffa2cc6bd5fe18722`。开始时远端 main 为 `018c3368bbe764a55cce466db36c8fcc4da43e37`，两项依赖均未合并，WorkEvidence 已在 main。没有移植其他分支、合并 main 或使用子代理。

## 已实现

Logseq 可以阅读 A，DSH 可以独立读取已明确只读连接的 B。只读 lease 继续受 Graph 生命周期、真实绑定和来源策略约束，解除的是当前阅读面板位置限制；写连接的阅读范围限制仍保留。读取和模型上下文不通过打开 Logseq 阅读视图实现。

`WorkbenchService` 的所有当前工作读取统一附带 `readTarget = {sessionId, workRef, scope, generation}`。目标来自已有 SessionAssociation 和实际 binding；不从当前屏幕或 WorkCatalog 的正文缓存推断。协议保留旧 CLI 调用兼容；新版 DSH 读链路始终发送目标。初始关联通过宿主 status 返回的真实工作身份核验；发现身份只用于导航。

宿主集中复用 `resolveDshTarget`、正式对象核验和页面持久锚点解析，核对实际来源与 WorkRef；Broker 核对实际连接 scope，幂等摘要也包含完整读取目标。来源文本仍由原来的 SourceReader / ContextService / Mirror 与内容 authority 读取，没有另建权限库或 RuntimeContext Service。

DSH 的读取结果、请求、面板和草稿继续按原生 Session 隔离，沿用已有 generation / revision / AbortController。跨工作迟到结果只能更新原 Session；关联改变后结果拒收。Logseq 阅读 A 导致 B 的 presentation view 不可用时，B 从原有精确来源读取返回原文，不借用 A 的读法。原文面板的快捷操作改为读取本工作，不再用 deep link 跳动 Logseq；副本显示最后读取时间。

Logseq 或 companion 离线时，原生会话保持。工作文件侧栏可以直接列举、打开已核验原生 cwd 内的文件；外部关联材料仍需活的来源连接。WorkEvidence 和结构历史使用现有私有记录存储，不再因工作目录暂时缺失而无法浏览已保存记录。原生目录文件读取、历史浏览和模型服务分别失败，不互相充当权限依据。

每次刷新核对 Session cwd 与已登记工作目录。目录元数据仅用于发现不一致，不授予正文读取权限；元数据暂不可读也不阻断已有记录。冲突时保留原 Session 与草稿，拒绝来源/执行目录操作，提供在正确目录新建原生会话。恢复按钮携带发生冲突的目标 Session，即使 DSH 仍显示另一工作也不会新建错工作。新会话只建立导航归属，不复制旧来源绑定或写 grant。

## 使用和权限限制

1. 先在 Logseq 对 B 明确执行“工作台：只读连接此工作”，或通过已有“在 DSH 继续”建立只读入口；再把 Logseq 阅读切回 A。
2. DSH 切到 B 的原生会话，查看原文即可读取 B。若是只有导航归属的新会话，仍需在有效来源连接下关联本会话。
3. companion 重启后使用新 descriptor 重新握手，并由用户再次明确只读连接。旧正文、结构、文件和 TODO 写许可不会恢复。

当前仍是一个显式活连接；没有自动授予多工作正文权限、全 Graph 权限或多个并发写连接。异工作读取不展示另一工作的读法；独立读法编辑、长期自动只读重连策略和其他权限语义保留为后续产品决策。Kernel 不可用时不构造正式身份或状态。

## 主要文件

- `packages/contracts/src/workspace-agent.ts`：可选目标 envelope 的闭合校验；复用 WorkRef 和 scope 校验。
- `apps/task-copilot-cli/src/workspace-server.ts`：目标 scope、幂等与缓存读取核验。
- `apps/logseq-plugin/src/features/agent-workspace/installer.ts`：真实身份集中核验、只读 lease 与阅读 UI 解耦；router / content authority 原有算法继续复用。
- `apps/dsh-plugin/src/service.mjs`：Session 定向读取、目录核验、本地文件降级与记录目录解析。
- `apps/dsh-plugin/src/client.jsx`、`handoff.mjs`、`index.mjs`：独立面板、时间提示、准确的目录冲突恢复；保留原生会话和草稿。
- `structure-history/service.mjs`、`work-evidence/service.mjs`：复用本地项目定位读取已有记录；无数据格式改写。
- 少量现有回归测试与 `workspace-read-target.test.ts`；专用 `scripts/work-context-{desktop,dsh,rpc,proof}.mjs`。

## 验证

最终合计 859 项 workspace 测试通过，其中 Logseq 571 项完整回归通过（并另用并发 2 完整通过），最终 DSH 51 项通过。类型检查、lint、构建及产物核验、12 项依赖边界检查、5 项隔离启动器检查、需求映射和 taste 评估通过。初次忽略安装脚本导致 SQLite 原生依赖缺失，补建后完整回归通过；未用放宽断言隐藏失败。

安装版 DSH 0.2.1-rc.2 SDK 的 8 项 host proof 通过，使用生产插件/HTTP companion、合成 Logseq SDK 与脚本模型，和真实宿主验收分开记录。见 [validation.json](evidence/work-context-2026-10-31/validation.json) 与 [sdk-host-proof.json](evidence/work-context-2026-10-31/sdk-host-proof.json)。

真实验收使用 macOS Logseq 0.10.15 独立副本、专用真实 Graph、DSH 0.2.1-rc.2 原生 standard preset、独立 HOME/DSH_HOME、companion 和端口 19433 / 3093。没有替换 Graph SDK、注入来源能力或模拟搜索 UI。观察见 [ui-observations.json](evidence/work-context-2026-10-31/ui-observations.json)。

| 路径 | 结果与证据 |
| --- | --- |
| Logseq A、DSH B，直接读 B | 两端原生 UI 分别显示 `A_ONLY_731`、`B_ONLY_942`；生产读取返回 B、不含 A。[online.json](evidence/work-context-2026-10-31/online.json) |
| B 延迟后切 A、再回 B | 只暂停本 Goal 的 companion 制造延迟；A 仍是自己的未关联面板与草稿；回 B 仍是原 Session 和草稿。[连接完成记录](evidence/work-context-2026-10-31/delayed-read-connection-facts.json)与 UI 观察 |
| 离线已有会话、文件、证据和历史 | 只停止本 Goal 的 Logseq/companion。原生 B 消息保存；文件仍列出，WorkEvidence 已保存 Diff 可看，Git 历史有实际记录。[offline.json](evidence/work-context-2026-10-31/offline.json) |
| 工作目录暂时缺失 | 临时重命名本 Goal 工作目录，WorkEvidence 和已保存历史仍可读取，文件操作明确失败；随后恢复原目录。[directory-missing.json](evidence/work-context-2026-10-31/directory-missing.json) |
| 重启和旧写授权 | 先明确授予 B 正文写权限，停止后新 companion instance 改变；旧连接拒绝，显式只读重连后正文/文件/TODO 写许可全关闭。[old-grant.json](evidence/work-context-2026-10-31/old-grant.json)、[before-reconnect.json](evidence/work-context-2026-10-31/before-reconnect.json)、[recovered.json](evidence/work-context-2026-10-31/recovered.json) |
| 错工作、错 Graph、范围外来源 | 真实请求分别拒绝为 `WORK_REF_MISMATCH`、`SCOPE_MISMATCH`、`SOURCE_OUTSIDE_SCOPE`，没有返回其他工作正文。见 online.json |
| 原生 cwd 与后来登记目录不同 | 实际 A 旧会话 cwd 保留 general；显式错误提示后新建 A 正确目录会话，原 A/B 不被重绑。新会话读取仍为 `SESSION_NOT_BOUND`，没有复制来源授权。[cwd-recovery.json](evidence/work-context-2026-10-31/cwd-recovery.json) |
| 模型不可用 | 外部模型传输在专用宿主中刻意阻断；原生聊天消息、文件、WorkEvidence 和历史仍可使用。未宣称真实模型回复质量或个人 Graph 长期使用验收。 |

隔离启动器只管理本 Goal 且核对 PID 与命令行；不会停止其他 Goal 服务。验收状态留在忽略目录 `tmp/work-context-desktop`，证据不含 descriptor 凭据、聊天账号信息或私人 Graph 内容。

交付前已停止本 Goal 的 Logseq、companion 和 DSH 进程；保留独立 Graph、原生会话与私有状态供复验。最终再次 fetch 后，main / Goal 1 / Goal 2 的远端 HEAD 与开始时相同。
