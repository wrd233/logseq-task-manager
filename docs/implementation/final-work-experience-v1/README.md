# Final Work Experience Integration v1

2026-11-07，最终整合分支 `codex/final-work-experience-v1`。只推送此分支，等待审查后再决定是否合并 main。由 Codex 单独执行，没有子代理或外部模型任务。

## Git 基线与整合

最后一次 `git fetch origin` 后，`origin/main` 仍为 `4acc2699a5740e54b6875b30ad3052a8aa89d625`。从该提交建立独立受管 Worktree：`/Users/wangrundong/.codex/worktrees/final-work-experience-v1/任务管理中心-logseq插件`。

真实 DAG 的依赖链为：

```text
main 4acc2699
  → 12d694d7  Structure History UX + Goal 3（含 81fc28a4）
  → 0037c8f3  Planner 整合（含 39225770、c655682f）
  → 526f2a16  Work Context & Structure Core v1
  → ee3798d9  最近兼容 Session 恢复修复
  → 8d3a5f31  Unified Work Experience UX 源码
  → 4b53591a  UX 验收文档
  → 本轮必要修复与最终验收记录
```

`merge-base(origin/main, origin/codex/unified-work-experience-ux-v1)` 就是 main。执行一次 `merge --ff-only` 纳入完整最终分支，没有冲突，没有重复合并祖先，没有 cherry-pick。三个原开发分支保持原 HEAD。原 main 工作目录的未提交改动未参与整合。

## 保留能力与本轮修复

保留原生 Session、WorkRef、工作上下文恢复、Goal 3 定向只读来源路由、Reader 层级/引用、Companion 自动恢复、实时工作结构、Structure History、Git Work Evidence、Planner 当前时段/固定/灵活安排与工作导航。没有新增数据库、框架、Workspace/RuntimeContext，或重写既有模块。

本轮只作以下修复：

1. **后台页面复用**：原前端 650ms 定时轮询改为现有认证 RPC 的长等待请求。服务端最长等待 20 秒，收到 offer 即认领返回；前端随后续接请求。失败时才延后重试，销毁时取消请求。沿用现有票据、认领竞争和系统兜底，不引入窗口管理或跨页选主。浏览器节流定时器不再是正常认领路径的依赖。
2. **工作定位保留**：按原生 Session id 在 `sessionStorage` 保存当前工作对象 UUID。刷新恢复后仍经既有 `currentStructure` 核验范围；对象消失或解除关联时清除位置。不会保存或恢复读写授权。Planner 即使定位到已聚焦的同一对象，也会从 Reader 切回结构。
3. **Reader 引用映射**：表格按真实行和单元格定位，跳过对齐分隔行，避免相同文字、短横线误落到别的行；修正行内代码起点重复加偏移。对 Marked 已规范化而无法精确匹配的转义管道单元格不猜测位置，提示使用整块引用。
4. **浅色显示**：当前结构、Reader、Planner、历史和 Git 回顾均使用现有主题能力，实机浅色走查通过，无需额外主题兼容层。

## 工程检查

最终代码实际执行：

- DSH 测试 **77/77**（原 73 项 + 长等待认领/取消、会话定位存储、两项真实 Markdown 渲染映射回归）。
- Logseq `workspace-integration`、`workspace-reading`、`agent-workspace-entry` **18/18**。
- CLI `workspace-read-target` **2/2**。
- 上述合并运行 **97/97**，没有跳过或失败，约 44 秒。
- Logseq 与 CLI TypeScript 检查通过。
- DSH 源码/测试与改动 CLI 文件 ESLint 通过；`git diff --check` 通过。
- DSH 和 Logseq 生产构建通过。

本机默认 Node 25 的动态库缺失，验证使用项目支持的 Node **20.20.2**，DSH 使用其已安装的 Node 24 运行时。没有修改系统 Node 安装。未运行全仓庞大矩阵。

## 本轮真实宿主统一走查

真实 DSH **0.2.1-rc.2**、Logseq Desktop **0.10.9**，使用此前 UX 验收留下的隔离 HOME、profile、合成测试 Graph、独立 companion；加载本轮 Worktree 的构建产物。DSH 端口 50205，Logseq 调试端口 50204，隔离 Chrome 50206。没有 fixture companion、替换 Logseq SDK 或私人 Graph。没有调用外部模型或发送对话。

| 用户路径 | 本轮观察 |
| --- | --- |
| Logseq 进入已有工作 | 原生「在 DSH 继续」恢复原页面/Session；后台约 75 秒后重复进入，DSH 页面仍为一个，显示已恢复反馈，Session 与草稿不变 |
| Reader 层级与正文 | 真实 Logseq 父子层级、任务状态、语义标签、属性、代码、表格在 Reader 中显示 |
| 单块、多处及选段引用 | 表格行内代码选中 `nlin`，草稿收到相同正文；验证范围为 54–58，并保留 sourceId、版本与 A 的 WorkRef；与整块引用一同加入，原草稿完整，未发送 |
| Companion 断开恢复 | 停止独立服务后出现「Logseq 工作服务还没启动」；重新启动后自动恢复原工作、结构与阅读，无需再次关联 |
| 当前结构实时刷新 | 用真实 Logseq Editor 新增 `FINAL_REFRESH_验证实时结构`，结构自动显示；未产生新的结构历史记录 |
| 进入/返回子工作 | 进入「核对网络方案」、面包屑返回；刷新保留子工作位置 |
| Structure History | 打开两个真实存储中的旧 Agent 测试快照；只读、因果时间轴、4 节点/3 处变化正常；API 核对历史正文不含本轮新增的当前正文 |
| Git 变更回顾 | 显示测试仓库已有 README.md 未暂存变化和文件 Diff 入口；与 Logseq 树/历史分开 |
| Planner 当前时段 | 「现在」显示晚间专注、正在进行固定安排与接下来固定事项 |
| 固定/灵活编辑 | 固定结束从 22:45 改为 22:50；灵活计划投入从 45 改为 50 分钟；界面保存后生产 RPC 重读一致；固定行无 draggable |
| Planner 定位工作 | 带引用的固定安排定位到同一会话的「核对网络方案」；已在该对象 Reader 时也切回结构；不新增 Session |
| 主要页面切换与隔离 | 工作、规划、历史、Git 回顾切换正常；新建独立工作 B 只显示 B 正文且草稿为空，返回 A 后原草稿/引用/位置均恢复 |

新工作 B 的入口块仍在编辑时，既有实现明确提示先结束编辑；保存退出后通过块旁的「在 DSH 继续」正常建立工作。保留这一明确提示，没有绕过原文保存检查。

来源路由、草稿保护、只读恢复与写权限边界沿用既有实现及自动回归。现场没有执行正文/文件写授权，也没有通过写入私人 Graph 来验证权限。

五张本轮浅色实机截图见 [screenshots](screenshots/)，包括当前结构、Reader、Planner、历史、Git；图像来自宿主页面截取，没有生成或拼接。精简机器记录见 [acceptance.json](acceptance.json)。

## 可接受的限制与后续

- 当前结构仍只有树；**当前结构图形模式保留为后续小幅增强**，应复用同一投影，不能另造过滤/历史语义。历史树/图保留。
- macOS/浏览器仍控制窗口激活，不能强制置顶。后台计时节流已修复并走查；浏览器彻底冻结/丢弃页面、网络断开时仍可能系统兜底，未承诺所有浏览器/长期休眠场景绝不重复开页。
- 工作定位只在当前浏览器标签页的 Session 存储中保留；不构建跨设备或跨会话深链。
- 转义管道等规范化后无法精确映射的表格选段用整块引用；草稿仍采用引文 + 紧凑身份行，没有自定义引用 chip。
- 历史回看使用以前建立的两个 Agent 测试快照；本轮没有重新录制真实 Stage，也没有验证模型理解质量、触屏/物理拖动、长期运行或私人 Graph。灵活安排的编辑保存已实机通过，拖动沿用原实现及既有检查。

验收结束停止本轮独立进程，保留测试数据供复查。原始开发分支和 main 不改动；最终分支等待用户审查。
