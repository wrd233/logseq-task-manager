# P1 Now 前台分区 Desktop Gate（2026-07-29）

## 结论

`3d63d5aee0a7f2e2fe66d4352366a2d35b9d6c34` 在不启用 Dynamic Now Shadow、
不改变 Service 排序和不新增状态的前提下，把既有正式 Now 收敛为：

1. 继续处理；
2. 需要回看；
3. 保持等待。

同一对象只出现一次；用户 Focus 明确标为“来自当前关注”且不会被普通 4 项首屏上限折叠。
普通推进项仍保留原排序、完整可达和单一折叠入口。

## 自动证据

- `projectNowFrontstageSections`：5/5 PASS；
- Plugin：366/366 PASS，0 failed，0 skipped；
- Plugin typecheck/build：PASS；
- `./scripts/check.sh`（Node 20.20.2）：PASS；
- Focus/next/waitingReview 去重；
- ACTIONABLE、过期 due、BLOCKED、到期/未来 WAITING/PAUSED 分区；
- 6 个明确 Focus 全部在首屏，6 个普通 next 只折叠后 2 个。

## Desktop 证据

- Logseq：0.10.15；
- Graph：File Graph `logseq` 测试环境；
- branch：`feature/task-copilot-mvp`；
- commit：`3d63d5aee0a7f2e2fe66d4352366a2d35b9d6c34`；
- 构建：commit 后重新执行 Plugin build；
- reload：More → Plugins → Task Copilot → 重载；
- 主题：Logseq host shell light / Plugin dark；
- 标准宽度：1001×720；
- 窄栏：733×720；
- 系统状态：可以正常使用；未发现未完成修改或正文连接冲突；无需操作。

截图：

- `current-ui/screenshots/p1-now-frontstage-continue-dark-standard-3d63d5a.png`
- `current-ui/screenshots/p1-now-frontstage-continue-dark-narrow-3d63d5a.png`

真实首屏显示一个 Focus Task（“来自当前关注”）和前 4 个普通推进项；其余 8 项保持一个
折叠入口。标准宽度和窄栏都只显示一个主操作，依据和低频动作默认折叠。

## 有界未覆盖

当前正式 Graph 的 `/now-work` 为 Waiting 0，未自然产生“需要回看 / 保持等待”区域。
通过正常 Condition 表单构造未来 Waiting 时，Computer Use 无法可靠写入 Logseq 原生
datetime-local 控件；在“保存状态”前取消，正式状态、Proposal、Commit、Recovery 与
正文写入均为 0。因此：

- 三段分类：AUTOMATED PASS；
- “继续处理”：DESKTOP VERIFIED，标准宽度 + 窄栏；
- “需要回看 / 保持等待”：DESKTOP OPEN，等待已有正式场景出现时补代表 Gate；
- 不使用 Unicode 注入、SQLite 改写或静态原型伪造证据。

## 复杂度

- 新增正式状态：0；
- 新增 Runtime：0；
- 新增 Recovery 分支：0；
- 新增 Attention 类型：0；
- 新增 Skill/Prompt/Validator：0；
- Provider 调用：0；
- Partial 净变化：-1；
- P1-C 与完整 Goal：仍为 IN_PROGRESS。
