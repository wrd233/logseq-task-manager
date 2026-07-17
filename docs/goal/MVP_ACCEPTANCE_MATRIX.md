# MVP Acceptance Matrix

> `AUTOMATED_PASS / DESKTOP_PENDING` 不是最终通过。只有对应集中 Desktop 步骤记录为 PASS 后，才可升级为 `PASS`。

| ID | Gate | Automated evidence | Desktop evidence | Rule refs | Status | Known limitation |
|---|---|---|---|---|---|---|
| TST-MVP-001 | Capture | `application.test.ts` current-block capture；raw text/source/method | RT-MVP-002 | CAP-IN-001/002、SEM-CAP-001 | AUTOMATED_PASS / DESKTOP_PENDING | SDK current-block shape 待实机 |
| TST-MVP-002 | Independent Object | Domain/Application tests；状态不写正文属性 | RT-MVP-002 | PRI-009、SEM-COMMON-001、PLG-UI-001 | AUTOMATED_PASS / DESKTOP_PENDING | FileStorage reload 待实机 |
| TST-MVP-003 | Anchor | Adapter hash/UUID/missing tests；object_id 独立 | RT-MVP-003 | MAP-ANC-001/002、MAP-PAGE-002 | AUTOMATED_PASS / DESKTOP_PENDING | UUID move/delete/undo 必须实测 |
| TST-MVP-004 | Three-axis State | ACTIVE + WAITING + REVIEW_DUE 单测 | RT-MVP-002 | LIF-BASE-001、LIF-COND-001、LIF-SIG-001 | AUTOMATED_PASS / DESKTOP_PENDING | UI prompt 交互待实机 |
| TST-MVP-005 | Partial Acceptance | rewrite/create 接受，move/owner 拒绝；128 组合性质测试 | RT-MVP-002 | PRI-006、COM-OP-001/002、REV-PART-001..004 | AUTOMATED_PASS / DESKTOP_PENDING | move 高影响路径故意 Feature Flag |
| TST-MVP-006 | Audit and Undo | before/after、Domain failure compensation、Undo conflict tests | RT-MVP-002 | AUD-EVT-001、AUD-RBK-001、COM-ATM-001 | AUTOMATED_PASS / DESKTOP_PENDING | 真实 Logseq 二次编辑冲突待实机 |
| TST-MVP-007 | Now Work | `projectNowWork` + UI tests；无完整 history | RT-MVP-002 | VIEW-BASE-001/002、TXT-DEN-001 | AUTOMATED_PASS / DESKTOP_PENDING | 视觉密度/主题待实机 |
| TST-MVP-008 | Re-entry | Project 定位、当前状态、最近三项、恢复动作、最多三入口 | RT-MVP-002 | VIEW-RE-001、DISC-002 | AUTOMATED_PASS / DESKTOP_PENDING | 真实项目内容待 Pilot |
| TST-MVP-009 | Export and Restore | JSON/JSONL/Markdown/checksum；临时 filesystem Store 实际恢复 | RT-MVP-004 | SYN-REC-001、INF-OWN-004 | AUTOMATED_PASS / DESKTOP_PENDING | 下载和 FileStorage reload 待实机 |
| TST-MVP-010 | No-Agent Degradation | NoAgentProvider + UI；手工捕获/正式化/状态/视图/恢复 | RT-MVP-001/002 | AGT-AUTH-001、PRI-010 | AUTOMATED_PASS / DESKTOP_PENDING | 设置持久化待实机 |

## Release Gates

- [x] 145 条稳定规则全部登记；适用规则有实现/测试/人工项，非目标有 ADR-0004
- [x] High 操作默认不接受且需单独确认
- [x] 128 组部分接受组合通过（要求至少 100）
- [x] 临时 Store 备份恢复演练通过
- [x] renderer 不把内部属性写入正文
- [x] 无已知 silent overwrite；hash/version/Graph 冲突停写
- [ ] Consolidated Desktop acceptance complete
- [ ] Pilot complete
- [ ] MVP_SUCCESS root clean gate
- [x] No remote / no push
