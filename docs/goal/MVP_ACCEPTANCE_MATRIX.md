# MVP Acceptance Matrix

> `AUTOMATED_PASS / DESKTOP_PENDING` 不是最终通过。只有对应集中 Desktop 步骤记录为 PASS 后，才可升级为 `PASS`。

| ID | Gate | Automated evidence | Desktop evidence | Rule refs | Status | Known limitation |
|---|---|---|---|---|---|---|
| TST-MVP-001 | Capture | current-block Capture；真实 page `19` resolver；旧 Capture repair；六动作 delegated click/four-state；No-Agent 手工正式化完整 Commit | RT-MVP-001B/002 | CAP-IN-001/002、SEM-CAP-001 | **PASS** | 无框架级 Desktop 待测项 |
| TST-MVP-002 | Independent Object | Application 发放 128-bit ID；手工正式化/可选主归属同一 Commit；高影响单独确认；Capture RESOLVED；对象抽屉定位 | RT-MVP-001B/002 | PRI-009、PRI-012、SEM-COMMON-001、PLG-UI-001 | **PASS** | 无框架级 Desktop 待测项 |
| TST-MVP-003 | Anchor | Graph-qualified UUID Anchor；page ID/UUID/name/journalDay Resolver；旧缓存审计修复；Block UUID open/missing conflict | RT-MVP-001B/003 | MAP-ANC-001/002、MAP-PAGE-002、SYN-CON-001 | **PASS WITH LIMITATION** | Logseq 0.10.15 删除后 Undo 恢复正文但需显式 rebind 恢复可解析 Anchor |
| TST-MVP-004 | Three-axis State | ACTIVE + WAITING + REVIEW_DUE；Phase/Condition 均经预校验 Proposal/Commit/Undo | RT-MVP-002 | LIF-BASE-001、LIF-COND-001、LIF-SIG-001 | **PASS** | 交互已全部改为插件内表单 |
| TST-MVP-005 | Partial Acceptance | 可读 diff/影响预览；风险重算；高影响确认；128 组合性质测试 | RT-MVP-002 | PRI-006、COM-OP-001/002、REV-PART-001..005 | **PASS** | `move_content` 高影响路径仍故意 Feature Flag |
| TST-MVP-006 | Audit and Undo | before/after；Undo 先持久化逆向 PENDING；反序补偿、冲突和恢复测试 | RT-MVP-002/003 | AUD-EVT-001、AUD-RBK-001、COM-ATM-001 | **PASS** | 逆向序列化现场缺陷已经确定性回归修复；Anchor Undo 限制见 TST-MVP-003 |
| TST-MVP-007 | Now Work | `projectNowWork` + UI tests；无完整 history | RT-MVP-002 | VIEW-BASE-001/002、TXT-DEN-001 | **PASS** | 未观察到 history 过载 |
| TST-MVP-008 | Re-entry | Project 选择、当前状态、最近三项、未决问题、恢复动作、最多三入口 | RT-MVP-002 | VIEW-RE-001、DISC-002 | **PASS** | 四项 copied-data Pilot 仍需用户代表性内容 |
| TST-MVP-009 | Export and Restore | JSON/JSONL/Markdown/checksum；临时 filesystem Store 实际恢复 | RT-MVP-004 | SYN-REC-001、INF-OWN-004 | **PASS** | 不假设 FileStorage 跟随 Graph 同步 |
| TST-MVP-010 | No-Agent Degradation | NoAgentProvider + inline manual formalization/proposal；所有动作可见反馈；正式变化仍经 Application Command | RT-MVP-001B/002/004 | AGT-AUTH-001、PRI-010 | **PASS** | `none` 设置、reload 和基础系统可用文案已实测 |

## Release Gates

- [x] 145 条稳定规则全部登记；适用规则有实现/测试/人工项，非目标有 ADR-0004
- [x] High 操作默认不接受且需单独确认
- [x] 128 组部分接受组合通过（要求至少 100）
- [x] 临时 Store 备份恢复演练通过
- [x] renderer 不把内部属性写入正文
- [x] 无已知 silent overwrite；hash/version/Graph 冲突停写
- [x] 独立 Standards/Spec 审查结论已关闭，并由 59 项测试覆盖主要修复
- [x] Consolidated Desktop acceptance complete
- [x] RT-BUG-001/002 Desktop regression complete
- [x] Pilot complete：V2 十日代表 Pilot 覆盖 Capture、Task、MiniProject、Project、Waiting、
  Review、Context Recovery、Closure、Undo/Rebind/Graph switch；关键问题已修复或形成明确
  bounded release decision
- [x] MVP_SUCCESS root clean gate：Task Copilot 状态与确定性 lockfile 漂移已独立提交；经用户
  明确授权，Local Service package 已精确恢复到 HEAD，声明为“不提交”的
  `docs/research/` 已加入本地 exclude 且内容保留；`git status --short` clean
- [x] No remote / no push
