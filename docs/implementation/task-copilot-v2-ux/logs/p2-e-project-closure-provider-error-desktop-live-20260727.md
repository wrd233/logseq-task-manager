# P2-E Project Closure Provider error / Review Desktop Gate

## 结论

本轮关闭 `Project Closure Provider error Desktop` 子 Gate，并根据随后真实 Provider
输出压缩 Review 首屏。P2-E 整体仍为 `PARTIAL`：generation stale 和真正不能自动安全
续跑的 `RECOVERY_REQUIRED` 代表链仍未关闭。

## 当前环境

- branch：`feature/task-copilot-mvp`
- failure UX commit：`77277704d901`
- Review compression commit：`662246a298ac`
- Logseq Desktop：`0.10.15`
- Graph：仓库内专用 File Graph `logseq`
- authority：既有 `tmp/runtime/manual-v2/task-copilot.sqlite`
- viewport：1000×720
- themes：Provider error 为 Light；Review 为 Dark
- Plugin / Launcher / Service：真实运行
- Provider：真实 DeepSeek 配置；故障阶段只临时使用不存在的 model 名称，随后恢复
  `deepseek-v4-flash`

API Key、Keychain reference、token、正文全文和响应全文均未进入仓库、截图或普通日志。

## 操作链

### 1. 受控 Provider error

1. 保持同一 Graph、database authority 和 Keychain secret reference；
2. 只把测试 runtime 的 model 临时设为不存在的名称并重启同一 Launcher；
3. 从 Project Closure 用户判断页提交既有测试材料；
4. 等待真实 Provider 路径返回错误；
5. 检查输入、用户结论、唯一动作和 SQLite；
6. 恢复 `deepseek-v4-flash`，再次确认同一 authority。

用户层结果：

- “这次关闭方案没有整理完成”；
- “项目和正文没有变化”；
- 用户逐项判断仍在 session 中；
- 唯一主操作是“重新整理关闭方案”；
- Provider、Proposal、Commit、HTTP 或 model 名称没有出现在普通错误态。

正式读回：

- Project `P0 Page Route Gate 20260723`：`OPEN v21`
- Proposal：仍为 13
- SemanticCommit：`COMPLETED 14 / UNDONE 12`
- `PENDING / RECOVERY_REQUIRED`：0

因此该错误是零正式写入，且没有留下半成品或第二恢复状态。

### 2. 恢复真实 Provider

恢复 `deepseek-v4-flash` 后，对同一判断重新提交：

- 新 Proposal：`READY`
- source：`deepseek / deepseek-v4-flash`
- Skill：`design-project@1.3.0`
- Prompt bundle：`8468006e`
- Validator：第一次接受
- Validator rejection：0
- Provider retry：0
- 正式 Project：仍为 `OPEN v21`
- SemanticCommit：没有新增 `PENDING / RECOVERY_REQUIRED`

本次真实输出事实边界正确，但 `finalPreview` 过长，在 Review 首屏重复了实际结果、关键
Decision、遗留、未来摘要和未完成目标，用户必须阅读一整段模型报告才能定位当前判断。

### 3. Review 首屏压缩

`662246a298ac` 没有修改 Context、Prompt、Skill、Validator 或写入合同。Review 从已经通过
Validator 的结构化 Closure 结果生成：

- 一句“将结束这个项目，并保存结果：……”；
- 未完成目标数量；
- 本次会改变的两项；
- 本次不会改变的两项；
- 唯一“审阅方案”主操作；
- “尚未修改正式内容”的明确结论。

完整模型说明仍位于同一 Proposal 的“查看完整依据”，没有删除事实、审计或来源。为了让
Logseq 丢弃同版本 iframe 缓存，Desktop Gate 使用 Plugin 关闭/启用，而不是把缓存旧界面
误登记为当前证据。

## 自动证据

- `@task-copilot/logseq-plugin`：339/339 PASS，0 skipped
- 根级 `./scripts/check.sh`：PASS
- stable rules：145
- build / package / bootstrap / dist integrity：PASS
- recovery rehearsal：`differences=[]`
- repository boundary：PASS

依赖审计仍报告既有 4 项依赖漏洞（3 high、1 critical）；本轮没有执行会改变依赖树的
自动修复，也没有把它们误写成本 Slice 新增问题。

## Desktop 证据

| 文件 | 状态 | commit | 结论 |
|---|---|---|---|
| `current-ui/screenshots/p2-e-closure-provider-error-current-light-7727770.png` | CURRENT | `77277704d901` | 失败零写入、输入保留、一个重试动作 |
| `current-ui/screenshots/p2-e-closure-review-current-dark-662246a.png` | CURRENT | `662246a298ac` | 真实 Provider Review 首屏压缩，长依据折叠 |
| `current-ui/screenshots/p2-e-closure-provider-error-superseded-f4acf77.png` | SUPERSEDED | `f4acf77` | 旧错误态暴露 Provider/Proposal 工程词 |

## 复杂度变化

- 新增正式状态：0
- 新增 Runtime：0
- 新增 Skill / Prompt / Validator：0
- 新增恢复分支：0
- 新增写入权威：0
- 新增 Partial：0
- 关闭 Partial：1（P2-E Provider error Desktop）

错误翻译继续复用统一 generation result；Review 压缩继续复用同一结构化 Proposal，没有
建立平行 LLM 小系统或前台状态机。

## 仍开放

1. generation stale 的当前 Desktop 证据；
2. 真正不能自动安全续跑的 `RECOVERY_REQUIRED → 原 Commit resume → reload`；
3. Closure 其余集中视觉组合不扩张为笛卡尔积，只在上述高风险链需要时取代表证据。
