# PILOT-2026W31-A 观察记录

## 证据口径

| 字段 | 值 |
|---|---|
| runtime commit | Day 1—3 `bc79ffd1ce6a`;当前精确构建 `42e6a91309ba` |
| Logseq | `0.10.15` |
| Graph | File Graph `logseq` |
| 主题 / 尺寸 | host Light / 约 1000×720 |
| 数据 | 当前测试 Graph 的真实 Page、Block 和正式 V2 对象 |
| Provider | 已配置的真实 DeepSeek；Key、原始响应和完整正文不落本目录 |

## Baseline

| 截图 | 用户目标 | 主结论 | 下一步 | 状态 |
|---|---|---|---|---|
| `screenshots/baseline-recovery-snapshot-current-light-bc79ffd.jpg` | 开始连续 Pilot 前建立恢复点 | 快照已创建并验证；初始 Pending/Recovery/Conflict 为 0 | 逐日输入而非一次导入 | CURRENT |

## Day 1：大量现场捕获

自然输入覆盖硬件告警、听云端口、活动稿、Zabbix、RHCSA、APM 和 Graylog 普通研究笔记。
普通输入保留自由正文；只有显式 TODO 经用户选中并发起“分析当前内容”。

| 截图 | 用户目标 | 主结论 | 下一步 | 状态 |
|---|---|---|---|---|
| `screenshots/day-01-capture-worksite-current-light-bc79ffd.jpg` | 在 Journal 风格页面连续捕获 | 普通笔记与一个显式 TODO 共存 | 检查 Now 是否被全部纳入 | CURRENT |
| `screenshots/day-01-now-after-capture-current-light-bc79ffd.jpg` | 观察捕获后的 Now | 普通笔记没有自动成为正式事项 | 用户选择真正要治理的 TODO | CURRENT |
| `screenshots/day-01-selected-todo-provider-review-current-light-bc79ffd.jpg` | 用真实 Provider 理解选中 TODO | 生成一项可审阅 Task；零正式写入 | 审阅方案 | CURRENT |
| `screenshots/day-01-task-applied-current-light-bc79ffd.jpg` | 正式应用 | Task 已经 Service/Commit 写入 | 返回现场；可撤销文案需核对 | CURRENT |
| `screenshots/day-01-now-after-reload-current-light-bc79ffd.jpg` | reload 后验证连续性 | 正式 Task 回到 Now；普通笔记仍未灌入 | Day 2 补充与纠正 | CURRENT |

观察：

- 实际步骤数：选中来源后约 5 个用户动作，应用阶段包含三次相近确认。
- 主操作：Review 前清楚；应用阶段相近动作重复。
- 噪声：Now 没有因 7 条捕获形成列表爆炸。
- 安全：正式写入 1；Provider 失败/Validator rejection 0。

## Day 2：补充、重复与纠正

新材料明确 `83/84` 是听云服务器而非安装探针的业务机器，并区分 Graylog 与 Zabbix。
用户从“最近修改与恢复”精确 Undo 前一 Task，修改恢复的 TODO，再次使用真实 Provider
和正式链创建纠正后的 Task。

| 截图 | 用户目标 | 主结论 | 下一步 | 状态 |
|---|---|---|---|---|
| `screenshots/day-02-corrections-worksite-current-light-bc79ffd.jpg` | 继续自然记录并纠正事实 | 原始材料保留，纠正以新证据出现 | 修正正式 Task | CURRENT |
| `screenshots/day-02-corrected-task-applied-current-light-bc79ffd.jpg` | 应用纠正后的 Task | 旧错误 Task 已 Undo；新 Task 表达源地址清单和端口权限 | reload 读回 | CURRENT |

观察：

- 数据安全通过：旧错误 Task 不再存在，恢复的来源正文可编辑，纠正 Task 重新正式提交。
- 心智负担高：需要打开历史、辨认 Commit、Undo、改来源，再走完整 Review。
- 工程词泄漏：“最近修改与恢复”默认出现 SQLite/Local Service 与长历史卡。
- 不升级 Skill：失败根因是输入事实后来被用户纠正，不是可泛化 Prompt 缺陷。

## Day 3：等待、阻塞与无日期

自然输入覆盖网络组等待、业务负责人等待、iBMC 测试机等待、Graylog 暂停、RHCSA
不确定计划、活动稿完成。本次先关闭一个代表性 Waiting 子链。

| 截图 | 用户目标 | 主结论 | 下一步 | 状态 |
|---|---|---|---|---|
| `screenshots/day-03-waiting-now-current-light-bc79ffd.jpg` | 把端口 Task 设为等待网络组 | Task 不再出现在“继续处理” | 等待 reviewAt 或回复 | CURRENT |
| `screenshots/day-03-waiting-after-reload-current-light-bc79ffd.jpg` | reload 后验证等待连续性 | WAITING 与 reviewAt 正式读回，Now 仍不制造行动噪声 | 完成 Day 3 其他代表行为 | CURRENT |

正式读回摘要：

- `condition=WAITING`
- `waitingFor=网络组`
- `expectedResult=确认业务机器到听云服务器的端口权限`
- `reviewAt=2026-07-29T02:00:00.000Z`
- object version `3`

观察：

- 正向：Waiting 不再冒充当前可行动项；reload 后正式状态保持。
- 缺口：没有低打扰的“保持等待”分区，用户无法在 Now 中确认系统仍记得它。
- 未完成：安装账号 Waiting、Graylog Paused、724 DONE、RHCSA Focus/reviewAt。

## 轻量指标（截至 Day 3）

| 指标 | 结果 |
|---|---:|
| 自然输入 | 20 条 |
| 正式 Task | 1 个当前有效；历史错误版本已 Undo |
| 真实 Provider | 2 次 |
| Validator rejection / retry | 0 / 0 |
| Attention 前台展示 | 0 |
| disposition / cooldown | 尚未进入 Day 8，不提前宣称 |
| 新正式状态 / Runtime / Recovery 分支 | 0 / 0 / 0 |
| 新 Skill / Prompt / Validator | 0 / 0 / 0 |

## Day 4：形成 MiniProject 与 Project

先把自然输入扩成听云探针部署子树和 Graylog 项目意图，没有一次导入规范化对象。
听云材料经真实 DeepSeek 5 次自适应 Grill 后形成 MiniProject；已有材料已经覆盖当前
结构时，最终预览诚实返回“无需修改”，没有为了完成流程制造 Proposal。

Graylog Page 来源因测试页超过 16 Block 的有界读取预算而在 Provider 前 fail-closed。
真实失败证明旧界面误称“讨论失败”并给出必然再次失败的 Retry。`42e6a91` 将这两类
确定性错误改为范围解释，并为非重试错误隐藏 Retry；没有放宽 Page 读取边界。

随后从 Blank 来源运行完整 Project 创建：6 次自适应 Grill + 1 次最终预览、HIGH Review、
正式创建、reload、进入新 Project Page、最近修改、Undo、再次 reload 与健康检查。
Blank 没有虚构来源；原测试 Page 和听云 MiniProject 都保留。Undo 后 Graylog Project
和本次拥有的空 Project Page 均消失。

| 截图 | 用户目标 | 主结论 | 下一步 | 状态 |
|---|---|---|---|---|
| `screenshots/day-04-project-material-current-light-bc79ffd.jpg` | 在自然材料中形成两类治理意图 | 原始正文仍可读，听云子树与 Graylog 意图共存 | 先验证 MiniProject | CURRENT_AT_BC79FFD |
| `screenshots/day-04-mini-project-no-change-preview-current-light-bc79ffd.jpg` | 真实 Grill 后审阅 MiniProject | 系统认为当前结构无需正式变化，零 Proposal | 转入 Project 创建 | CURRENT_AT_BC79FFD |
| `screenshots/day-04-project-page-too-large-defect-historical-light-bc79ffd.jpg` | 从较长 Page 发起 Project 创建 | 旧 UI 把确定性来源预算误称为讨论失败 | 由 `42e6a91` 自动合同替代 | HISTORICAL_DEFECT |
| `screenshots/day-04-project-grill-ready-source-equivalent-light-runtime-fbd14eb.jpg` | 完成 Blank 自适应 Grill | readiness 达成；用户纠正了无依据量化与流程建议 | 生成最终阅读预览 | HISTORICAL_SOURCE_EQUIVALENT |
| `screenshots/day-04-project-preview-source-equivalent-light-runtime-fbd14eb.jpg` | 审阅最终阅读效果 | 影响/不影响边界存在，但理解句过长且标点重复 | 进入 HIGH Review | HISTORICAL_SOURCE_EQUIVALENT |
| `screenshots/day-04-project-high-review-source-equivalent-light-runtime-fbd14eb.jpg` | 审阅正式影响 | 首屏明确创建 Project/Page、原文保留与尚未应用 | 确认应用 | HISTORICAL_SOURCE_EQUIVALENT |
| `screenshots/day-04-project-created-source-equivalent-light-runtime-fbd14eb.jpg` | 查看创建结果 | 正式 Project 和 Page 已创建；结果墙与 Undo 资格矛盾 | reload | HISTORICAL_SOURCE_EQUIVALENT |
| `screenshots/day-04-project-after-reload-source-equivalent-light-runtime-fbd14eb.jpg` | reload 后重入 | Project Page 和页面内继续入口保持 | 执行 Undo | HISTORICAL_SOURCE_EQUIVALENT |
| `screenshots/day-04-project-undo-source-equivalent-light-runtime-fbd14eb.jpg` | 撤销 Project 创建 | Project/Page 已撤销，来源保留；成功消息泄漏工程词 | reload 核对 | HISTORICAL_SOURCE_EQUIVALENT |
| `screenshots/day-04-project-undo-reload-absence-source-equivalent-light-runtime-fbd14eb.jpg` | reload 后检查项目列表 | Graylog Project 不再存在 | 精确构建健康复核 | HISTORICAL_SOURCE_EQUIVALENT |
| `screenshots/day-04-project-undo-reload-health-current-light-42e6a91.jpg` | 用真正内嵌 `42e6a91309ba` 的产物重载 | 系统正常；0/0/0；explicit sync clean | 关闭 UX 矛盾后重建 Day 5 Project | CURRENT |
| `screenshots/day-04-undo-guidance-current-light-7a0b444.jpg` | 用真正内嵌 `7a0b444821b7` 的产物查看最近修改 | 存在真实撤销入口时明确“可以发起撤销；执行时重新检查”，不再与按钮矛盾 | 重建 Day 5 Project | CURRENT |
| `screenshots/day-04-undo-guidance-health-current-light-7a0b444.jpg` | 同一精确构建展开系统诊断 | Pending/Recovery/Conflict 0/0/0；explicit sync clean | 继续 Day 5 | CURRENT |

观察：

- Grill 是自适应的，但模型推荐曾虚构 7 天/95% 量化门槛和周会/看板流程。用户纠正后
  最终材料没有保留这些建议；没有正式越权写入，也没有 Validator rejection 或 retry。
- Page 来源预算错误是确定性的 Context 边界，不是 Provider error；修复选择解释并改用
  MiniProject/Blank，而不是扩大上下文或增加第二读取器。
- HIGH 首屏比历史版本更清楚，但用户层仍有四个近义确认动作。
- 新 Project Page 能立即给出状态、当前推进和成果；当前状态/成果过长，近期结果和历史墙
  仍然压过主结论。
- Undo 安全链通过；首次普通 reload 曾因
  `EXPLICIT_SYNC_SUBTREE_READ_FAILED` 显示一次 session 级核对风险。重新构建并 reload
  当前精确产物后 clean，证明它不是 Pending/Recovery/Anchor conflict，但该有界子树读取
  失败仍作为 P0 可靠性观察保留。

### Day 4 后续：撤销前台结论收敛

`7a0b444` 没有改变 Application 的保守资格判断或 Undo 安全检查，只在 Plugin 已经有真实
撤销动作时使用与动作一致的用户结论。最新 Logseq Desktop 已证明历史卡不再显示矛盾的
“证据不足”，且精确构建健康。Project 创建 Undo 的成功消息也已自动改为“新建空白页已
移除”或“复用来源页保持原样”，但尚未在新构建上再执行一次真实 Project Undo，因此保持
`AUTOMATED_DONE_DESKTOP_CONFIRMATION_REQUIRED`。

自动证据：Plugin `352/352`、typecheck/build、根级 `./scripts/check.sh` PASS，0 skipped。
新增正式状态、Runtime、Recovery 分支、Skill/Prompt/Validator：`0/0/0/0`。

## 轻量指标（截至 Day 4）

| 指标 | 结果 |
|---|---:|
| 自然输入 | 20+ 条与 Day 4 两组自然子树 |
| 正式对象净变化 | MiniProject +1；Graylog Project 创建后已 Undo，净 0 |
| 真实 Provider | 14 次累计 |
| Validator rejection / retry | 0 / 0 |
| 模型无依据建议 | 2 类（量化门槛、周会/看板） |
| Attention 前台展示 | 0 |
| 新正式状态 / Runtime / Recovery 分支 | 0 / 0 / 0 |
| 新 Skill / Prompt / Validator | 0 / 0 / 0 |
