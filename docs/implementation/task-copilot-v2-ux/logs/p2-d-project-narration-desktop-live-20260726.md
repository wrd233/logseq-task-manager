# P2-D MEDIUM Project 当前摘要真实纵向 Gate

## 结论

状态：`DONE_MEDIUM_VERTICAL_P2D_STILL_IN_PROGRESS`

本 Gate 关闭 P2-D 的 MEDIUM“只压缩当前理解”纵向链，不关闭整个 P2-D、P2 或整体 Goal。
LIGHT 可发现 Undo、HEAVY 多类操作、Light/窄栏和集中宿主 Gate 继续开放。

## 当前运行基线

- branch：`feature/task-copilot-mvp`
- 最终 Plugin commit：`ae239552379863d75a16953fb2e2a621e7dc5eda`
- Prompt/Skill 修复：`eb1ff07424bd`
- 专用 Undo 路由修复：`f6d0429`
- Plugin 构建时间：`2026-07-26T08:22:15+0800`
- Service 构建时间：`2026-07-26T08:22:05+0800`
- Logseq Desktop：`0.10.15`
- Graph：隔离测试 Graph `logseq`
- 主题 / viewport：Dark / `1567×1104`
- Provider：Launcher 安全配置的 `deepseek-v4-flash`；密钥只通过 Keychain 引用读取

截图、报告、仓库和普通日志均未保存 API Key、token 或个人 Graph 正文。

## 用户链

1. 用户从 Project 重入卡点击“调整 Project”；
2. 影响路由把“只压缩当前理解”识别为 MEDIUM；
3. Service 读取当前 Object/version、正式 Project interface 与有界证据，构造 Context Package；
4. 真实 Provider 按 `recover-context@1.2.0` 返回 Unified UX 草稿；
5. Validator 只接受机器提供的 fact/evidence/action 引用，并拒绝机器身份进入前台 prose；
6. Service 物化单组 `UPDATE_PROJECT_NARRATION` Proposal；
7. 用户在“待我确认”中接受，提交前重验，再显式确认正式 Commit；
8. reload 后“现在”从 SQLite 正式投影显示新摘要；
9. 用户从“最近修改与恢复”执行专用 Project interface inverse Commit；
10. 再次 reload 后恢复原摘要，系统健康。

## 真实失败与修复

### Validator 拒绝

前两次真实草稿把 opaque machine identity 带入前台 prose。Validator 返回结构化
`FRONTSTAGE_PROSE`，零 Proposal、零 Graph/SQLite 正式写入。没有放宽 Validator。

`recover-context` 升为 `1.2.0`，明确 UUID、sourceRef、hash、Proposal/Commit/Anchor ID
只能出现在结构引用字段；Service Prompt 同步约束并新增自动测试。第三次真实 Provider
调用通过。

### 长期 Undo 错路由

Commit 和 reload 后，从最近修改点击 Undo 时，旧投影把 `UPDATE_PROJECT_NARRATION`
错误送入通用 Block `REWRITE_BLOCK` inverse，系统安全拒绝且零写入。

`f6d0429` 将 narration 与完整 Project interface 一起路由到现有版本保护的
`project-interface/undo`。自动回归与真实 Desktop 均通过。

### 用户层 Provider 状态

V2 Provider READY 时顶部仍显示旧 V1 `Agent disabled`。`ae23955` 改为：

- Provider 可用：`Copilot 可用 · 建议需审阅`
- Provider 未配置：`Copilot 未配置 · 基础事务系统可用`
- 旧 demo agent 仅作为明确的 Demo 状态保留

## 正式状态证据

- Commit 前：Project v2，原摘要，`currentFocuses = ["明确目标与下一步"]`；
- Commit 后：Project v3，只替换 `currentSummary`；
- Undo 后：Project v4，原摘要恢复；
- Objectives、Deliverables、Work Stages、stage mappings、current focuses 均保持不变；
- Lifecycle 仍为 OPEN，Condition 仍为 ACTIONABLE；
- Graph、位置、Ownership 未改变；
- reload 后 Runtime/Store/Service READY；
- Pending/Recovery/Source Conflict：`0/0/0`。

## 自动证据

- Application：`161/161`
- Local Service：`135/135`
- Plugin：`274/274`
- rule coverage：`145`
- recovery rehearsal：`differences: []`
- 根级 `./scripts/check.sh`：PASS
- 既有上游依赖审计风险保持：3 high、1 critical；本轮未执行破坏性自动修复

## 截图

CURRENT：

- `../current-ui/screenshots/p2-d-05-project-narration-undo-reload-current-dark.png`
- `../current-ui/screenshots/p2-d-06-project-impact-router-current-dark.png`

HISTORICAL / SUPERSEDED 操作链证据：

- `p2-d-02`：真实 MEDIUM Review，但仍显示旧 Provider 状态文案；
- `p2-d-03`：Commit 应用结果，早于专用 Undo 路由修复；
- `p2-d-04`：专用 Undo 成功，早于 Provider 状态文案修复。

状态以 `current-ui/SCREENSHOT_INDEX.md` 为权威。

## LLM 输出质量

有效：

- 能从极少 Project 事实形成比原摘要更具体的重入摘要；
- 明确承认尚无 Objectives、Deliverables 和 Work Stages；
- 没有获得写入、Ownership、Lifecycle 或动作权限。

问题：

- 初始草稿两次泄漏机器身份，说明真实 Provider 需要 Validator 和可版本化 Skill，不能只靠
  Prompt；
- Review 的“理解与逻辑”仍混入一段英文推断，前台语言一致性需要后续质量门；
- 新摘要对一个材料稀少 Project 的信息增量有限，后续样本应覆盖信息充分、矛盾、长 Page、
  已变化与明确“不知道”；
- Review 卡片和最终确认仍偏长，MEDIUM 可以继续压缩但不能跳过正式判断。

## 下一步

1. 完成 P2-D LIGHT Condition/Association 的可发现 Undo 与 reload；
2. 复验一条 HEAVY 完整 Project interface Commit/Undo Desktop 链；
3. 进入 P2-E Closure 证据起草；
4. 在集中 P1 Gate 中验证 Project Context Recovery loading/error/stale/feedback、Light/Dark
   与窄栏，并把语言一致性纳入 Skill 质量指标。
