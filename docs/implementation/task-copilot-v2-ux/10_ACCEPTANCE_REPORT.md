# 交互优化验收报告

> 当前状态：`PARTIAL`
> 本文件只登记已经有对应代码、自动化和适用运行证据的结果。设计或计划不会标成完成。

## 1. 阶段结论

| 阶段 | 状态 | 自动化 | Desktop | 结论 |
|---|---|---|---|---|
| Baseline | DONE | 根级 PASS | 复用 3 张当前 UX 基线截图，不代表新实现 | 可开始 P0 |
| P0 | IN_PROGRESS | P0-A/P0-B/P0-C/P0-D/P0-E/P0-F/P0-G/P0-I + P0-H code/process + P0-J/P0-K/普通 Block route automated PASS | Focus/Condition/LOW apply/Page route/four-nav/toolbar/recent changes/system status/handshake PASS；P0-H/J/K/Desktop host Gate OPEN | 不得宣布 P0 完成 |
| P1 | IN_PROGRESS_SHADOW_ONLY | P1-A/B pure model、detector、bounded repository 与 Plugin session runtime automated PASS | 无用户可见 / 无 Desktop telemetry 声明 | 不得开放信号显示 |
| P2 | NOT_STARTED | — | — | — |
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
- [ ] Logseq 退出安全结束 owned Service；自动 unload/TTL/owner-PID 与真实进程 Gate 通过，
  仍缺本轮真实 Desktop quit 证据
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
- [ ] LLM 输出事实/推断/未知分离；
- [ ] 默认日志不含完整正文；
- [ ] 噪声指标可接受。

## 4. P2 验收

- [ ] MiniProject Grill Me 非模板化；
- [ ] Project 所有创建入口经过自适应 Grill Me；
- [ ] 原位重构零丢失；
- [ ] 预览为最终阅读效果；
- [ ] 一次 Commit + Undo；
- [ ] Closure 从证据起草；
- [ ] 跨对象候选有证据和数量上限；
- [ ] LLM 不改变 Ownership/Focus；
- [ ] Recovery 继续原 Commit；
- [ ] Rebind 不展示 UUID 列表；
- [ ] Restore/Migration 复用唯一安全链；
- [ ] 高影响流程全部可恢复。

## 5. 操作距离指标

| 场景 | 基线 | 目标 | 实测 |
|---|---:|---:|---:|
| Block 加 Focus | 离开正文→Now Work→找对象→操作 | 1 个现场动作 | 自动 + Desktop PASS；右键一次，原地反馈与读回一致 |
| 暂时做不了 | Now Work→状态表单→选择字段 | 2 个决定 | Desktop PASS：Block 右键→三选一→最小字段；保存后回原 Block |
| 普通 Block 整理 | 当前页 Candidate→Review→接受→Commit | 现场建议 + 1 次接受应用 | 右键“处理这条内容”按精确 UUID 进入既有 Provider→Proposal，自动 Gate PASS；LOW 单击应用/Undo Desktop PASS；普通/Query/引用现场入口仍待 Desktop |
| 打开正文 | Now Work/Project 找卡片 | 1 个动作 | 待测 |
| Project 重入 | 独立重入 workspace | Page 顶部 1 个动作 | Desktop PASS：Project Page menu 一次进入三项路由；current-interface 复用 HIGH Proposal |
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
