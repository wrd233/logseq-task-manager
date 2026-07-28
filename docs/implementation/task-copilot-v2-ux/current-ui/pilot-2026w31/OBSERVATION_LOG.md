# PILOT-2026W31-A 观察记录

## 证据口径

| 字段 | 值 |
|---|---|
| runtime commit | `bc79ffd1ce6a091186cc54ee0a32bcb6a1c8b24b` |
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
