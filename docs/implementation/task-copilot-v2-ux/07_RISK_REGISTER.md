# 风险登记

| ID | 风险 | 触发征兆 | 影响 | 控制 | 状态 |
|---|---|---|---|---|---|
| UX-R01 | “接受并应用”绕过高影响安全边界 | HIGH/Ownership/Closure 进入一键流程 | 静默正式写入 | READY/LOW/唯一单 Block 白名单 + accepted-plan Validator + 服务端重验 + 单一 Commit；自动与 Desktop 通过 | CONTROLLED |
| UX-R02 | accepted-not-applied 静默遗忘 | 工具栏/待我确认无持续入口 | 用户误以为已生效 | LOW 连续提交和 HIGH “已审阅尚未应用”均复用同一 Proposal/Commit 投影；工具栏、待审阅、reload、应用和 Undo 已有 Desktop 证据 | CONTROLLED |
| UX-R03 | Block 右键无法真正动态 | SDK 注册项固定、payload 不稳定 | 菜单膨胀或语义错误 | 两项稳定意图 + 动作时解析已在正式 Block Desktop 通过；继续 Query/引用 Gate | CONTROLLED |
| UX-R04 | Block UI 破坏 Logseq 阅读/编辑 | 大色块、光标遮挡、Query 噪声 | 正文体验退化 | 真实 Logseq `onBlockRendererSlotted` 会替换正文；生产 setting/runtime/CSS 已删除，Marker 首发 OFF，只保留隔离 prototype/harness | CONTROLLED_BOUNDED_HOST_REJECTION |
| UX-R05 | Service productization 误管他人进程 | Plugin 关闭非 owned PID | 数据/其他 Graph 中断 | Launcher 只持有 spawn 返回的 exact child；租约只释放自身；最后租约/TTL/owner-PID 自动停机，自动与真实进程通过 | CONTROLLED |
| UX-R06 | iframe 无法可靠启动 Node | child process API 不存在 | “自动启动”不可实现 | 已以 Desktop/SDK 证据选择独立 loopback Launcher + LaunchAgent；日常无需终端，真实安装通过 | CONTROLLED |
| UX-R07 | descriptor 投放仍需开发者步骤 | filesystem path 被 renderer 拒绝 | 无法取得正式写入 client | 固定私有 key 的文件导入、校验、错误脱敏和 reload 已 Desktop 通过；进程生命周期由 UX-R05/R06/R08 跟踪 | CONTROLLED |
| UX-R08 | Logseq 退出窗口不足 | shutdown 未完成或迟到 | orphan process/PENDING | unload release + lease expiry + owner-PID self-stop + ledger-first Recovery；真实 quit/reopen 已证明 owned Service 停止、descriptor 清理、Launcher 保留和同 authority 恢复 | CONTROLLED |
| UX-R09 | 多 Graph 错配 | Graph switch 后复用旧 DB | 跨 Graph 正式写入 | path hash→显式 mapping；switch 先释放旧租约，unknown Graph fail closed；真实 switch/受限/切回及无参数重装 authority Gate 均通过 | CONTROLLED |
| UX-R10 | attention signal 形成第二 Inbox | 信号长期堆积/需逐条归档 | 新认知负担 | 信号保持 session-only 派生；一对象一主问题、reload 重算、事实失效、later/notRelevant 与 512 容量已通过；不建 SQLite 提醒权威 | CONTROLLED_BOUNDED_PILOT |
| UX-R11 | LLM 提醒噪声 | 频繁弱建议/垃圾下一步 | 信任下降 | 首发只开确定性 `REVIEW_DUE/DUE` Pilot；高噪类型、建议关注与 P2-F 保持 Shadow/OFF，LLM 不能升级强提醒 | CONTROLLED_BOUNDED_PILOT |
| UX-R12 | 状态翻译隐藏关键信息 | 结论过度压缩 | 恢复风险不可见 | P0-I 五问首屏和 P1-D 统一叙述已被 System/Review/Recent Changes/Now/Rebind 消费；技术详情折叠保留，动作仍受 version/target 和恢复资格限制；代表 Desktop 已通过 | CONTROLLED |
| UX-R13 | “现在”退化为所有 OPEN | 首页几十条 | 传统任务列表压力 | 正式 Now 以“继续处理/需要回看/保持等待”纯派生且去重；Focus 全显示，普通项只显示前 4 条并折叠其余；Dynamic Shadow 不替换正式投影 | CONTROLLED |
| UX-R14 | Project current interface 成为第二正文 | 每次编辑都要求更新 | 维护负担/事实冲突 | 只有受验证 Project aggregate 和关键变化 Review；Context Recovery 从正式 facts 重建、session 草稿不成为第二正文；MEDIUM/HIGH 更新和 Undo 已有 Desktop | CONTROLLED |
| UX-R15 | Grill Me 固定问卷 | 每次都问同样字段 | 用户绕开 Project | MiniProject 和 Blank/Page/MiniProject 来源 Project 已用多组真实 DeepSeek 材料验证自适应问题、机器 readiness、零写 Preview 和用户修正；无固定问卷 Runtime | CONTROLLED |
| UX-R16 | 原位重构丢失事实 | 预览与原子操作不完整 | 正文损坏 | 真实 MiniProject 链已证明原 UUID/正文/层级守恒、零丢失 Preview、单一 Commit、divergence Recovery 和 inverse Undo/reload | CONTROLLED |
| UX-R17 | default logs 保存私人正文 | log/Diagnostics 出现 Block 原文 | 隐私泄漏 | P1 shadow/interaction evidence 只含结构字段；Plugin/Service/Diagnostics 严格 allowlist，r8 包与真实 LLM/Desktop 证据已做凭据/正文特征扫描 | CONTROLLED |
| UX-R18 | API Key 进入持久产物 | Key 出现在 Graph/Git/log | 严重凭据泄漏 | Keychain/env reference；全资产 scan | CONTROLLED |
| UX-R19 | 现有用户 dirty 被覆盖 | package/research/Graph 变化丢失 | 用户工作损坏 | 不 reset/stash/format；精确 stage | CONTROLLED |
| UX-R20 | Node 默认 v25 被误当支持 | build/service 用错运行时 | 假运行证据 | 所有 Gate 显式 Node20 PATH | CONTROLLED |
| UX-R21 | `@logseq/libs` 上游漏洞 | audit 2 high/1 critical | release 风险 | ADR-0007 公开例外；未来兼容+Desktop Gate | ACCEPTED |
| UX-R22 | current-status 历史残留误导 | 下一步与 complete 冲突 | 计划漂移 | 历史证据保留时明确标记当时状态；current-status/Progress/Acceptance/Freeze/current-ui 只使用 r8 当前结论，旧包和旧截图降为 SUPERSEDED | CONTROLLED |
| UX-R23 | 只做文档不进入 Slice | 资料完成后停止 | Goal 无产品结果 | Deep Run：资料后立即 P0-A | CONTROLLED |
| UX-R24 | 只做自动测试不做 Desktop | unit PASS 即宣告 | 假完成 | 每 Slice 独立 Desktop status | CONTROLLED |

## 风险优先级

1. 数据安全与可恢复；
2. 正文权威；
3. 用户注意力权威；
4. 操作连续性；
5. 状态理解；
6. 重入质量；
7. 信息密度；
8. 视觉；
9. 功能丰富度。

任一发布否决风险出现时，停止发布但继续所有不依赖该结果的安全工作。
