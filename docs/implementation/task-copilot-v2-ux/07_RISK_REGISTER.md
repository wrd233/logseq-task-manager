# 风险登记

| ID | 风险 | 触发征兆 | 影响 | 控制 | 状态 |
|---|---|---|---|---|---|
| UX-R01 | “接受并应用”绕过高影响安全边界 | HIGH/Ownership/Closure 进入一键流程 | 静默正式写入 | READY/LOW/唯一单 Block 白名单 + accepted-plan Validator + 服务端重验 + 单一 Commit；自动与 Desktop 通过 | CONTROLLED |
| UX-R02 | accepted-not-applied 静默遗忘 | 工具栏/待我确认无持续入口 | 用户误以为已生效 | 低风险连续提交及错误后的明确刷新/恢复提示已完成；高影响 intervention projection 仍待 P0-E | PARTIAL |
| UX-R03 | Block 右键无法真正动态 | SDK 注册项固定、payload 不稳定 | 菜单膨胀或语义错误 | 两项稳定意图 + 动作时解析已在正式 Block Desktop 通过；继续 Query/引用 Gate | CONTROLLED |
| UX-R04 | Block UI 破坏 Logseq 阅读/编辑 | 大色块、光标遮挡、Query 噪声 | 正文体验退化 | 默认 off 的 exact-UUID slot prototype 已实现五候选、无动作/无正文写入与 100 Block harness；性能/主题/编辑态/Query Desktop Gate 后才可选择并开放 | MITIGATED_PROTOTYPE_OPEN_DESKTOP |
| UX-R05 | Service productization 误管他人进程 | Plugin 关闭非 owned PID | 数据/其他 Graph 中断 | Launcher 只持有 spawn 返回的 exact child；租约只释放自身；最后租约/TTL/owner-PID 自动停机，自动与真实进程通过 | CONTROLLED |
| UX-R06 | iframe 无法可靠启动 Node | child process API 不存在 | “自动启动”不可实现 | 已以 Desktop/SDK 证据选择独立 loopback Launcher + LaunchAgent；日常无需终端，真实安装通过 | CONTROLLED |
| UX-R07 | descriptor 投放仍需开发者步骤 | filesystem path 被 renderer 拒绝 | 无法取得正式写入 client | 固定私有 key 的文件导入、校验、错误脱敏和 reload 已 Desktop 通过；进程生命周期由 UX-R05/R06/R08 跟踪 | CONTROLLED |
| UX-R08 | Logseq 退出窗口不足 | shutdown 未完成或迟到 | orphan process/PENDING | unload release + 15s lease expiry + Service owner-PID self-stop + ledger-first Recovery；crash 真实进程通过，Desktop quit 待验 | MITIGATED |
| UX-R09 | 多 Graph 错配 | Graph switch 后复用旧 DB | 跨 Graph 正式写入 | path hash→显式 mapping；switch 先释放旧租约，unknown Graph fail closed；自动通过，Desktop switch 待验 | MITIGATED |
| UX-R10 | attention signal 形成第二 Inbox | 信号长期堆积/需逐条归档 | 新认知负担 | P1-A Plugin session shadow 已实现派生、自动失效、512 容量、Graph switch clear、cooldown/disposition 与 count-only telemetry；UI/SQLite 未开放 | MITIGATED |
| UX-R11 | LLM 提醒噪声 | 频繁弱建议/垃圾下一步 | 信任下降 | P1-B runtime 第一波只用确定性 facts 并一 subject 一主问题；所有输出仍 SHADOW/NONE；LLM/eligibility 未开放 | MITIGATED |
| UX-R12 | 状态翻译隐藏关键信息 | 结论过度压缩 | 恢复风险不可见 | P0-I 五问首屏已上线；P1-D System/Proposal/Recent Changes/Now/Anchor repair 已消费统一结论/依据/facts/unknown/provenance；Anchor 卡复用既有 Rebind 安全链且不暴露身份，技术状态折叠保留，Object version 与动作 target 必须匹配，Commit/Undo 资格未迁入叙述层；Desktop 待做 | MITIGATED |
| UX-R13 | “现在”退化为所有 OPEN | 首页几十条 | 传统任务列表压力 | P1-C SHADOW 只允许可行动 Focus、确定性回看、Focus 安静等待；普通 OPEN 排除，review/waiting 有界，Focus 不截断；runtime/UI Gate 待做 | MITIGATED |
| UX-R14 | Project current interface 成为第二正文 | 每次编辑都要求更新 | 维护负担/事实冲突 | 正式 aggregate + 自动 facts + 关键变化才确认 | OPEN |
| UX-R15 | Grill Me 固定问卷 | 每次都问同样字段 | 用户绕开 Project | session contract + Service 两轮 route + 真实 DeepSeek 两轮已证明 boundary answer 后转向 outcome；真实 Plugin UI/长期材料差异仍需证明 | MITIGATED_LIVE_PROVIDER_OPEN_UI |
| UX-R16 | 原位重构丢失事实 | 预览与原子操作不完整 | 正文损坏 | zero-loss property test、待判断区、one Commit/Undo | OPEN |
| UX-R17 | default logs 保存私人正文 | log/Diagnostics 出现 Block 原文 | 隐私泄漏 | P1 shadow/interaction evidence 只含结构字段；Plugin diagnostics/export 已移除 message/stack/cause 并阻止任意字段注入；Service daemon output 不含路径或自由文本异常；CLI 前台反馈与默认关闭 research runner 已分层 | MITIGATED_AUTOMATED |
| UX-R18 | API Key 进入持久产物 | Key 出现在 Graph/Git/log | 严重凭据泄漏 | Keychain/env reference；全资产 scan | CONTROLLED |
| UX-R19 | 现有用户 dirty 被覆盖 | package/research/Graph 变化丢失 | 用户工作损坏 | 不 reset/stash/format；精确 stage | CONTROLLED |
| UX-R20 | Node 默认 v25 被误当支持 | build/service 用错运行时 | 假运行证据 | 所有 Gate 显式 Node20 PATH | CONTROLLED |
| UX-R21 | `@logseq/libs` 上游漏洞 | audit 2 high/1 critical | release 风险 | ADR-0007 公开例外；未来兼容+Desktop Gate | ACCEPTED |
| UX-R22 | current-status 历史残留误导 | 下一步与 complete 冲突 | 计划漂移 | 新 Goal 进度另建；更新权威状态时收口 | OPEN |
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
