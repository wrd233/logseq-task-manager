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
- 正式状态补证窗口：754×720；
- 系统状态：可以正常使用；未发现未完成修改或正文连接冲突；无需操作。

截图：

- `current-ui/screenshots/p1-now-frontstage-continue-dark-standard-3d63d5a.png`
- `current-ui/screenshots/p1-now-frontstage-continue-dark-narrow-3d63d5a.png`
- `current-ui/screenshots/p1-now-frontstage-needs-review-dark-754x720-3d63d5a.png`
- `current-ui/screenshots/p1-now-frontstage-keep-waiting-dark-754x720-3d63d5a.png`
- `current-ui/screenshots/p1-now-frontstage-restored-healthy-dark-754x720-3d63d5a.png`

真实首屏显示一个 Focus Task（“来自当前关注”）和前 4 个普通推进项；其余 8 项保持一个
折叠入口。标准宽度和窄栏都只显示一个主操作，依据和低频动作默认折叠。

## 正式状态补证

同一精确构建中复用已有测试 Task
“P2-G Rebind 纠错候选（缺陷证据，已修复）”，全部操作均通过 Block 右键菜单、
Condition Controller 和 Local Service：

1. Actionable Task 临时加入 Focus；
2. 设为 Blocked，填写“P1 Now 需要回看代表验证；完成后立即恢复”；
3. Now 只在“需要回看”显示一次；此前非 Focus Blocked 不进入前台，证明低噪声边界；
4. 恢复 Actionable；
5. 设为 Paused，填写“P1 Now 保持等待代表验证；完成后立即恢复”和未来 reviewAt；
6. Now 只在“保持等待”显示一次；
7. 恢复 Actionable并移出临时 Focus；
8. 系统状态显示没有未完成修改或正文连接冲突、无需操作。

因此：

- 三段分类：AUTOMATED PASS；
- “继续处理”：DESKTOP VERIFIED，标准宽度 + 窄栏；
- “需要回看”：DESKTOP VERIFIED，Focus Blocked 代表链；
- “保持等待”：DESKTOP VERIFIED，Focus Paused 代表链；
- 非 Focus Blocked 保持安静：DESKTOP VERIFIED；
- 没有直接操作 SQLite、没有静态原型、没有遗留测试 Condition/Focus。

## 复杂度

- 新增正式状态：0；
- 新增 Runtime：0；
- 新增 Recovery 分支：0；
- 新增 Attention 类型：0；
- 新增 Skill/Prompt/Validator：0；
- Provider 调用：0；
- Partial 累计净变化：-3；
- P1-C 与完整 Goal：仍为 IN_PROGRESS。
