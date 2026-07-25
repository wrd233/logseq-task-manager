# 交互优化验收报告

> 当前状态：`IN_PROGRESS`
> 本文件只登记已经有对应代码、自动化和适用运行证据的结果。设计或计划不会标成完成。
> `base_v2_status=IMPLEMENTATION_COMPLETE` 与 `ux_productization_goal=IN_PROGRESS` 是不同层级；
> `overall_goal=IN_PROGRESS`。

## 1. 阶段结论

| 阶段 | 状态 | 自动化 | Desktop | 结论 |
|---|---|---|---|---|
| Baseline | DONE | 根级 PASS | 复用 3 张当前 UX 基线截图，不代表新实现 | 可开始 P0 |
| P0 | IN_PROGRESS_DESKTOP_GATES | P0-A/P0-B/P0-C/P0-D/P0-E/P0-F/P0-G/P0-I + P0-H lifecycle + P0-J/P0-K/普通 Block route automated PASS | Focus/Condition/LOW apply/Page route/four-nav/toolbar/recent changes/system status/hidden reload auto recovery/Logseq quit owned shutdown PASS；Graph switch/J/K host Gate OPEN | 不得宣布 P0 完成 |
| P1 | IN_PROGRESS_PARTIAL_UI | P1-A/B runtime shadow + P1-C dynamic Now count-only runtime + P1-D status consumers + P1-E default-off Block marker prototype + P1-F Project reentry/Page Head + P1-G unified UX/真实 Provider + P1-H session disposition/噪声汇总真实 Service Gate | Block marker/Page Head/LLM UX/反馈 Desktop 未验；Attention 仍无用户显现；跨会话 dashboard 未决 | 不得开放信号显示或 marker 默认值 |
| P2 | IN_PROGRESS_P2_AB_DONE_P2C_ALL_SOURCES_DONE_VISUAL_GATES_OPEN | P2-A/B 完整自动链 PASS；P2-C 三来源用户入口、Grill/Preview/HIGH Review、Proposal-bound create、Recovery、inverse Undo 与 invalid Grill 422 PASS | P2-A/B 隔离链 PASS；P2-C Blank、Page 两种关系和 MiniProject 演化均真实 DeepSeek→Review→create→reload/restart→Undo→健康 PASS；MiniProject Undo 返回来源根 Block | P2-A/B 与 P2-C 三来源功能矩阵 DONE；P2-C Light/窄栏视觉 Gate、P2-D～G OPEN |
| Final Release | NOT_STARTED | — | — | — |

## 2. P0 验收

- [x] 主导航只有现在、待我确认、项目、更多；Project/Objects 与维护能力均有二级可达证据
- [ ] Block/Page 就近入口；Block Focus/Condition、普通 Block 精确 UUID 内容路由与 Page
  普通/Project/Journal 路由已完成自动 Gate，普通 Block、Query/引用现场仍待 Desktop 验证
- [ ] 高频动作 1—2 个明确决定；
- [x] 暂时做不了统一入口；三种意图、最小字段和版本保护 Undo 已通过
- [x] 低风险一次接受并应用；LOW 单组单 Block CREATE/REWRITE 自动覆盖，真实 Desktop REWRITE 通过
- [ ] accepted-not-applied 不静默；
- [ ] 成功/失败/PENDING/Recovery 清楚；
- [x] 即时 Undo 与最近修改可发现；同一 Commit identity、跨 reload 长期入口与真实逆向
  Commit/Graph 恢复已验证
- [x] 工具栏只表示需要介入；安静态、连接风险数字与诊断路由已 Desktop 验证，
  `RECOVERY_REQUIRED ↻` 仅自动验证
- [x] Service 日常无需终端；真实 LaunchAgent 安装、READY、更新、租约启动/结束与 crash recovery 通过
- [x] 隐藏 Plugin reload 不要求先打开面板；non-blocking bootstrap 与宿主 ready 事件自动取得
  精确 Graph identity，新 lease 在 25 秒观察窗内保持，首次打开直接 READY
- [x] Logseq 退出安全结束 owned Service；自动 unload/TTL/owner-PID 与真实 Desktop quit 后
  租约窗口内 owned Service 结束、Launcher 保留均通过
- [x] 用户层系统状态；READY/协议/Graph/Pending/Recovery/Anchor/正文核对自动覆盖，
  真实 Desktop 注意状态与 Service unavailable 受限状态通过，技术诊断默认折叠；
- [ ] 完成后回业务现场；session-only Block/Page origin route 自动 Gate PASS，真实
  main/sidebar/Query/reference Gate 仍开放；
- [ ] Light/Dark/窄栏/Query/引用；
- [ ] 自动与 Desktop 证据齐全。

## 3. P1 验收

- [ ] attention signal 派生且可失效；
- [ ] 影子模式通过；
- [ ] 规则决定强显现；
- [ ] 一对象一主问题；
- [ ] “现在”不显示所有 OPEN；
- [ ] 状态叙述先结论；
- [ ] 信息不足时承认不知道；
- [ ] 下一动作资格有效；
- [ ] Block 标记不干扰阅读/编辑；
- [ ] Project/Task 重入有效；
- [ ] LLM 输出事实/推断/未知分离；机器 fact/action/provenance/risk/review 契约、
  server-owned Project recovery、Plugin 分区显示/只读动作重验自动 PASS；真实
  LaunchAgent→Context Package→DeepSeek→Validator 已 PASS 且零正式写入，Desktop OPEN；
- [x] 默认日志不含完整正文；P1-H 专用事件、Plugin StructuredLogger/Runtime Diagnostics
  与 Service daemon output 已用 strict allowlist 排除正文、Prompt、原始响应、路径与异常
  message/stack/cause；CLI 为主动前台反馈，live/golden 为默认关闭研究 Gate；
- [x] session disposition 可撤回且不扩大权限；五种反馈、版本汇总、opaque handle 脱敏、
  `DO_NOT_REPEAT` Provider 前抑制与零正式写入已通过自动及真实 DeepSeek/Service Gate；
- [ ] 噪声指标可接受。

## 4. P2 验收

- [x] MiniProject Grill Me 当前纵向 Slice 非模板化；真实 DeepSeek 四轮按 boundary/outcome/
  completion/material disposition 自适应收敛，Validator rejection 可安全重试，5/5 canonical
  材料进入最终阅读预览并完成正式链；跨场景质量继续纳入后续验收；
- [x] Project 所有创建入口经过自适应 Grill Me；Blank/Page/MiniProject creation subject、
  source evidence 边界及 internal closure/current interface readiness、Preview 与
  server-owned 单组 HIGH Proposal/Review 自动合同 PASS；Blank 真实 Provider turn/preview
  和完整正式 Desktop 链 PASS；Page preserve/dedicated 真实 Provider 与正式 Desktop 链
  bounded PASS；Page reuse 也完成真实 Provider 与正式 Desktop 链；MiniProject 真实
  Provider、来源关系、HIGH Review/Commit/reload/Undo/来源返回均已闭环；
- [x] 原位重构当前纵向 Slice 零丢失；原 UUID/正文守恒、0 delete、Undo 后父级与顺序恢复；
- [x] 原位结构宿主能力有界通过；同一会话内 custom UUID、语义正文与 A/B/C 顺序经过
  move-first-child/restore-after-sibling 保持，Page runtime UUID 跨 reload 限制已明确转入 Rebind；
- [x] 预览为最终阅读效果；identity property 已从 canonical 用户材料剥离；
- [x] 当前纵向 Slice 一次 Commit + Undo；8-step forward/inverse、真实 divergence Recovery、
  reload、recent-changes 折叠和返回根 Block Desktop PASS；
- [ ] Closure 从证据起草；
- [ ] 跨对象候选有证据和数量上限；
- [ ] LLM 不改变 Ownership/Focus；
- [ ] Recovery 继续原 Commit；
- [ ] Rebind 不展示 UUID 列表；
- [ ] Restore/Migration 复用唯一安全链；
- [ ] 高影响流程全部可恢复。

P2-C 专项证据：Application `155/155`、Local Service `133/133`、Plugin `271/271` 与根级
`./scripts/check.sh` PASS。Blank 已验证
properties Block、PENDING/Recovery、专用 Undo、Page name 删除与 reload 健康。Page
preserve/dedicated 又验证三段来源正文守恒、完整 restart identity 漂移、Service 账本 +
metadata-only 精确重绑、inverse Undo 与冷启动 reconciliation 收敛。CURRENT 截图
`p2-c-18`～`p2-c-20` 对应 `913bbda4528f`。Page reuse 又验证零 Page write、restart 与
Undo 前后 Page/Block 逐字段相同，CURRENT 截图 `p2-c-21`～`p2-c-24`；`p2-c-01`～
`p2-c-17` 均按 commit 一致性登记为 HISTORICAL/SUPERSEDED，不作为当前 UI 权威。
MiniProject 演化使用 `project-creation-modeling@1.5.0` 验证来源 Object/Anchor/子树边界、
五项 `LINK_AS_SOURCE`、HIGH Review、专用 Page 创建、reload 重入和 inverse Undo。来源
UUID/正文/顺序守恒，目标 Project/Anchor/专用 Page 撤销；`p2-c-38`/`p2-c-39` 对应
`7a7492a407ed`，证明精确返回原根 Block及再次 reload 后 READY、`0/0/0`。旧的 Journal
返回截图已标为 SUPERSEDED。Light/窄栏仍属 P2-C/最终集中视觉 Gate，不能据此宣布 P2 完成。

## 5. 操作距离指标

| 场景 | 基线 | 目标 | 实测 |
|---|---:|---:|---:|
| Block 加 Focus | 离开正文→Now Work→找对象→操作 | 1 个现场动作 | 自动 + Desktop PASS；右键一次，原地反馈与读回一致 |
| 暂时做不了 | Now Work→状态表单→选择字段 | 2 个决定 | Desktop PASS：Block 右键→三选一→最小字段；保存后回原 Block |
| 普通 Block 整理 | 当前页 Candidate→Review→接受→Commit | 现场建议 + 1 次接受应用 | 右键“处理这条内容”按精确 UUID 进入既有 Provider→Proposal，自动 Gate PASS；LOW 单击应用/Undo Desktop PASS；普通/Query/引用现场入口仍待 Desktop |
| 打开正文 | Now Work/Project 找卡片 | 1 个动作 | 待测 |
| Project 重入 | 独立重入 workspace | Page 顶部 1 个动作 | 既有 Page menu Desktop PASS；新增 main Page Head 单动作仅 automated PASS、Desktop OPEN；current-interface 复用 HIGH Proposal |
| Service 恢复 | 终端 + descriptor + reload | 1 个产品入口 | descriptor 文件一次导入与 reload READY PASS；进程启动/停止待做 |

## 6. 发布否决条件

以下任一出现即不得宣布阶段完成：

- 原文可能静默丢失；
- 失败后用户误以为已应用；
- accepted-not-applied 无持续入口；
- LLM 自动改变 Focus/Ownership；
- context/Block 标记严重干扰正文；
- Service 仍要求日常终端操作；
- Recovery 重复 Commit；
- Graph mismatch 仍可写入；
- 默认日志保存完整正文或 Key；
- Project 创建变固定大问卷；
- “现在”展示所有 OPEN；
- 技术状态机重新进入日常首屏；
- 只有自动测试，没有真实 Desktop 证据。

## 7. 最终交付清单

- [ ] 可运行代码；
- [ ] 自动测试；
- [ ] 真实操作截图；
- [x] 设计到代码映射；
- [x] P0-A 自动测试、真实 Desktop Focus/Undo 与 Local Service 读回证据；
- [x] P0-H descriptor 私有导入、失败边界与 reload READY 证据；
- [x] P0-B 三种 Condition、失败零写入、Focus 不变、Undo 和 reload 证据；
- [x] P0-C LOW 白名单、连续 Review/revalidate/Commit、busy/stale/transport 与真实 Desktop Undo 证据；
- [x] P0-D 普通/Project/Journal Page 路由、UUID/Anchor 重验、Project create/reentry 与
  sidebar 共存证据；
- [x] P0-E 四项主导航、Project/Objects 与 More/Audit/Migration/Diagnostics 可达性及四张
  脱敏 Desktop 截图；
- [x] P0-F 介入计数/噪声排除/Recovery 优先级自动覆盖，以及安静态、正式连接风险 `TC ①`、
  诊断路由和恢复后安静态的两张脱敏 Desktop 截图；
- [x] P0-G 用户层状态翻译、inverse 折叠、专用 Undo 路由、折叠技术详情，以及 LOW 应用→
  即时结果→跨 reload 长期 Undo→Graph/SQLite 恢复的四张脱敏 Desktop 截图；
- [x] P0-I 五个用户问题、Provider 非故障降级、安全优先级、Pending/Recovery 分离和
  默认折叠工程诊断，以及真实 Desktop 注意/停服受限状态的两张脱敏截图；
- [ ] P0/P1/P2 完成报告；
- [ ] 已知限制；
- [ ] 恢复和升级说明；
- [ ] 用户层操作说明；
- [ ] 技术层维护说明；
- [ ] 交互日志与 Skill 版本说明；
- [ ] 未完成项和原因；
- [ ] 后续建议。

最终报告必须分别列出：已真实实现、已自动测试、已 Desktop 验证、仅原型、仅设计、被阻塞、超出范围。
