# Task Copilot V2 交互优化：实施路线图

> 原则：先完成可独立验收的纵向 Slice；每个 Slice 都必须更新状态、运行相应测试、执行根级检查、取得适用的真实 Desktop 证据并创建本地 commit。不得用自动测试代替 Desktop 交互验收。

## 1. Gate 顺序

```text
Baseline Gate
  → P0 Daily Route Gate
  → P0 Productized Runtime Gate
  → P1 Shadow Signal Gate
  → P1 Copilot Presentation Gate
  → P2 Complex Object Collaboration Gate
  → Consolidated Acceptance / Release Gate
```

P0 未达到验收前，不开放用户可见的推断型注意力信号；P1 先影子模式，P2 最后进入复杂结构治理。

## 2. P0：日常链路和产品化

| Slice | 用户问题 | 范围 | 主要依赖 | 自动 Gate | Desktop Gate |
|---|---|---|---|---|---|
| P0-A | 我能否从当前 Block 直接关注/打开事项？ | Block 右键：Focus、打开正文、处理内容；origin route；轻反馈 | SDK context menu、Now Work Focus、Anchor | registration/controller tests；typecheck | 原 Block、正式/普通 Block、Query/引用、反馈与返回 |
| P0-B | 暂时做不了时为何要填多个工程字段？ | 统一入口，路由 WAITING/BLOCKED/PAUSED；必要字段；成功留在原地 | `changeCondition` | pure routing + controller tests | 三类状态、失败、重复提交、Focus 不自动改变 |
| P0-C | 低风险建议为何接受后还要找 Commit？ | LOW 白名单“接受并应用”；防重复；结果三态；即时 Undo | Proposal/revalidate/Commit/Undo | orchestration state machine + fault tests | success/failure/stale/PENDING/Undo |
| P0-D | 我从当前 Page 应该去哪里？ | Page 菜单、当前页整理、正式事项、建立 Project | Page API、Candidate、Project create | route tests | 普通 Page/Project Page/Journal/右侧栏 |
| P0-E | 为什么首页有六个工程工作区？ | 现在/待我确认/项目/更多；用户文案；高级能力可达 | UI renderer/query | ViewModel/UI tests | Light/Dark、窄面板、键盘、所有旧能力仍可达 |
| P0-F | 工具栏数字究竟表示什么？ | intervention summary、badge、恢复 `↻` 优先 | Proposal/Commit/reviewAt/Doctor | merge/priority tests | 无信号/数量/恢复风险/点击路由 |
| P0-G | 操作完成后怎样确认与撤销？ | action result、最近修改、用户层 Audit projection | Audit/Receipt/Commit | projection tests | Toast、最近修改、不可 Undo 原因 |
| P0-H | 为什么正常使用还要终端？ | Service launcher/发现/安全结束 spike + 最小产品化 | Node20 Service、descriptor、Graph identity | process/fault/protocol tests | Logseq 打开/退出、重启、失败、Graph 切换 |
| P0-I | Diagnostics 为什么先展示 PID/协议？ | 系统状态结论层 + 技术诊断二级层 | Doctor/restricted | translation tests | READY/Provider disabled/Service down/Graph mismatch/Recovery |
| P0-J | 创建常用对象为什么只能记英文命令？ | 中文 slash、三个可配置快捷命令 | parser/command registration | registration tests | 斜杠菜单/命令面板/自定义 binding |

P0 完成条件：

- 高频现场动作只需 1—2 个明确决定；
- 主导航只有四个稳定入口；
- 低风险 `ACCEPTED` 不长期静默；
- 用户总能知道是否应用、原文是否安全、从哪里继续；
- 日常启动/结束无需终端；
- 所有高影响安全边界仍在；
- 根级检查与本轮受影响 Desktop 场景通过。

## 3. P1：注意力和 Copilot 感

| Slice | 用户问题 | 范围 | 依赖 | 验收重点 |
|---|---|---|---|---|
| P1-A | 系统能否先在后台判断而不打扰？ | attention signal pure model + shadow repository/telemetry | P0 intervention summary | 不展示、不改正式状态、不存完整正文 |
| P1-B | 哪些事实值得变成一个主问题？ | deterministic detectors、merge、priority、invalidation、cooldown | due/reviewAt/Commit/Anchor/Doctor | 一对象一主问题，恢复风险最高 |
| P1-C | “现在”能否只交接注意力？ | 继续处理/需要回看/保持等待 + 动态建议 | P1-A/B | 不显示所有 OPEN，噪声指标可量化 |
| P1-D | 状态能否先讲结论？ | status narration ViewModel、依据/未知/next-action eligibility | Condition/Project/Audit | 不纵向列参数，不知道是合法输出 |
| P1-E | 正文能否轻量显示关键状态？ | Block UI prototype + feature flag | renderer slot | 主题、编辑态、Query、引用、性能、关闭后干净 |
| P1-F | 回到 Project 能否立即继续？ | Project top reentry strip + Task light resume | schema v12/Anchor | 同一投影、上下文不足不猜 |
| P1-G | LLM 能否提高叙述而不扩大权限？ | unified UX output + context-recovery Skill | Provider/Validator | facts/inferences/unknowns 分离、Proposal-only |
| P1-H | 怎样知道建议是否越来越好？ | interaction log/version/noise dashboard | shadow mode | 默认不存正文、版本可追溯 |

P1 开放顺序：

1. reviewAt / due / accepted-not-applied；
2. blocker 变化；
3. 等待过久；
4. Project 静默；
5. LLM 跨对象判断。

## 4. P2：复杂对象治理

| Slice | 用户问题 | 范围 | 依赖 | 验收重点 |
|---|---|---|---|---|
| P2-A | MiniProject 能否通过真实分歧建模？ | MiniProject Grill Me Skill | P1 UX output/logging | 非固定问卷、自适应长度、明确停止条件 |
| P2-B | 能否原位重构而不丢事实？ | 多 Block preview/semantic groups/one Commit/Undo | P2-A、Commit scope prototype | 零丢失、无法归类安全去向、回根 Block |
| P2-C | Project 创建能否先澄清边界？ | all-entry Grill Me + existing atomic create | P2-A、Project create | 材料充分时一轮，仍保持页面/对象原子性 |
| P2-D | Project 结构操作能否按影响给摩擦？ | light/medium/heavy router | current interface/Ownership/Closure | 不把 Ownership/Closure 错降级 |
| P2-E | Closure 能否从证据开始？ | evidence draft/preview/legacy disposition | existing Closure paths | 不从空表、不杜撰成果 |
| P2-F | 跨对象观察能否只给少量高质量候选？ | shadow → review candidates | signals/Context Package/LLM | 有证据、标推断、不自动 Ownership |
| P2-G | 恢复与维护能否像产品流程？ | Recovery/Rebind/Restore/Migration wizards | P0-H/I | 只包装现有 ledger/API，不新增第二恢复器 |

## 5. 每个 Slice 的固定闭环

1. 写清用户问题、影响面、恢复边界和完成后路由；
2. 在预先约定 seam 写失败测试；
3. 实现最小纵向变化；
4. 运行单测、typecheck、相关集成；
5. 执行 `./scripts/check.sh`；
6. 更新本目录的映射、进度、风险、验收与证据；
7. 用隔离测试 Graph 完成真实 Desktop Gate；
8. 检查截图不含密钥、路径或私人正文；
9. 创建本地 commit；
10. 继续下一项安全、独立的实质工作。

## 6. 不可跨越的边界

- 不创建 V1/V2 双模式或双写；
- 不让 UI 直接写 SQLite；
- 不让 Agent/LLM 直接 Commit；
- 不把 attention signal 变成正式 Task 或第二 Inbox；
- 不为前台一键绕过 Proposal/Validator/SemanticCommit/Audit/Undo/Recovery；
- 不把 Project aggregate 拆成平行权威；
- 不自动改变 Focus；
- 不扫描整个 Graph 作为日常刷新；
- 不把用户提供的 API Key 写入任何持久产物；
- 不扩展移动端、多人、团队、云同步或独立 Web App。
