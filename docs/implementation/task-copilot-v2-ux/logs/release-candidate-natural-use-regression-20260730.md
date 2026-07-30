# Release Candidate 自然使用回归（2026-07-30）

## 基线

- branch：`feature/task-copilot-mvp`
- code/build commit：`ae9c6d7`
- Logseq Desktop：`0.10.15` File Graph `logseq`
- 宿主/插件主题：host Light / Plugin Dark
- viewport：1000×720
- 测试批次：`RC-PILOT-20260730-B`
- 测试 Page：`R. 20260730`
- 开始前：Service `READY`、objects `14`、Doctor `PASS`、Commit healthy `0`

测试 Page 与普通测试正文保留，用于复现自然 Block 正式化；其余正式 Task 已通过产品 Undo
撤销。Computer Use 的直接文本输入无法可靠提交中文字符，因此本次用自然英文业务句子完成
同一产品链。该限制属于自动化输入工具，不是 P0-J 已验证的 Logseq 原生中文 IME 回归。

## 真实 Provider 与正式链

1. 在普通 Logseq Block 记录网络源地址确认任务和一条不应正式化的 Graylog 背景；
2. 从 command palette 执行“Task Copilot：处理当前 Block”；
3. 真实 DeepSeek 读取有界 Block 上下文，生成一条用户可读 Task 方案；
4. Review 明确分开“审阅方案”和“确认应用”，最终确认前正文与正式对象均不变化；
5. 正式应用只修改目标 Block 并创建一个 Task，objects `14→15`；
6. Plugin Manager reload 后，Task 出现在“现在”，正式投影保持；
7. 从“最近修改”执行既有 inverse Undo，来源 Block 恢复原文，objects `15→14`；
8. 再次 reload 后 Service `READY`、Doctor `PASS`、Commit healthy `0`。

本次真实 Provider 调用 `1` 次；观察到的 Validator rejection、retry、abstention 为
`0 / 0 / 0`。API Key、原始 Provider 响应和测试正文均未进入截图、普通日志或仓库证据。

## 发现并关闭的 Release Candidate 回归

首次 reload 后，已完成的“最近修改”卡片同时显示“查看”和“撤销”。“查看”只跳到折叠
历史，顶部又泄漏“最终 Commit”和内部对象 ID；该动作既不提供新的用户价值，也让用户误以为
仍需处理一次内部流程。

`ae9c6d7` 以先红后绿回归修复：

- 已完成、失败和已撤销卡片不再生成冗余 `recent-change-review`；
- 只有真正 `PENDING` / `RECOVERY_REQUIRED` 的同一账本保留“继续”或“恢复”；
- LOW 与普通 Block 正式化的完成、stale、失败反馈改为用户语言，不显示 Proposal、Commit、
  Object ID 或 Domain 枚举；
- reload 后真实 Desktop 证明已完成卡只剩一个当前可用主操作“撤销”；
- Undo 后卡片只显示“这次修改已经撤销”，不再提供无效“查看”。

自动证据：focused tests 先红后绿；Plugin `378/378`、typecheck/build PASS；根级
`./scripts/check.sh` PASS，145 条稳定规则与 recovery rehearsal PASS。

## CURRENT 截图

| 文件 | 场景 | 主结论 |
|---|---|---|
| `current-ui/screenshots/rc-natural-use-recent-change-current-ae9c6d7.jpeg` | 当前构建 reload 后打开“最近修改” | 已完成卡只保留“撤销”，不再泄漏内部 ID/Commit |
| `current-ui/screenshots/rc-natural-use-undo-current-ae9c6d7.jpeg` | 确认 inverse Undo 后 | 明确已撤销；正文和正式对象回到基线 |

## Release 产物与复杂度

- 当前包：`tmp/releases/task-copilot-v2-0.1.0-ae9c6d7-r3.zip`
- SHA-256：`2efdbdd78621d159718fbc1e666c384b25d4b878d5f07112b2643dfa0b6e52c4`
- `task-copilot-v2-0.1.0-ae9c6d7.zip` 与 `-r2.zip` 分别是 Runbook 语义修正前、最终根级检查
  重新生成 bundle 前的本地 superseded 包，不作为当前交付物；
- `unzip -t`：PASS；包内 Plugin `index.js` SHA 与当前 build 一致；Launcher installer 与
  已验证的 Freeze payload 一致。
- 真正零参数 install 返回 `LAUNCHER_INSTALL_ARGUMENTS_INVALID` 且零配置变化；从解压包提供
  `--graph-path` / `--graph-id`、省略 `--database` 后返回 `INSTALLED`。graphKey 与
  `tmp/runtime/manual-v2/task-copilot.sqlite` 前后不变，安装态 Launcher/Service hash 与
  payload 一致；Logseq 真实 reload 后 Service `READY · objects 14`、Doctor `PASS`。
- 新增正式状态、Runtime、Recovery 分支、Skill/Prompt/Validator 版本：均为 `0`；
- 新增长期 Partial：`0`；发现并在同轮关闭一个 RC UX 回归，Partial 净变化 `0`；
- Final Release 仍为 `RELEASE_CANDIDATE_READY`，完整长期 Goal 仍为 `IN_PROGRESS`。
