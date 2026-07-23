# 测试与证据计划

## 1. 证据等级

| 等级 | 含义 | 可支持的声明 |
|---|---|---|
| UNIT | 纯 Domain/Application/ViewModel/Controller | 局部规则成立 |
| INTEGRATION | 真实 Local Service/SQLite/CLI 或 fake Logseq adapter | 跨边界合同成立 |
| PROCESS | 真实独立进程、descriptor、重启、故障 | 生命周期/恢复合同成立 |
| DESKTOP | 当前 commit 的真实 Logseq Desktop 交互 | 用户路径实际可用 |
| LIVE_LLM | 真实 Provider + Schema/Validator + zero-write evidence | 当前模型/配置真实通过 |
| RELEASE | 全量检查、边界、恢复、secret scan、状态文档 | 可发布结论 |

任何 Slice 都必须把自动化和 Desktop 分开登记。HTTP 200、mock、类型存在或历史截图都不能单独升级为当前 Desktop 完成。

## 2. 固定自动化

开发循环：

```bash
PATH=/opt/homebrew/opt/node@20/bin:$PATH npm run typecheck -w @task-copilot/logseq-plugin
PATH=/opt/homebrew/opt/node@20/bin:$PATH npm test -w @task-copilot/logseq-plugin
```

涉及 Service/Application/Domain 时增加相应 workspace 的单文件或全包测试。

每个有意义 Slice：

```bash
PATH=/opt/homebrew/opt/node@20/bin:$PATH ./scripts/check.sh
```

最终还要执行：

- TODO/FIXME/stub/not implemented 搜索；
- skipped/only tests 搜索；
- MUST 规则覆盖；
- export/recovery rehearsal；
- Pending/Recovery check；
- silent overwrite audit；
- secret scan；
- `git diff --check`；
- 外层 Git 状态与 ignored Graph 边界。

## 3. P0 自动测试矩阵

| 场景 | Unit | Integration | Process |
|---|---:|---:|---:|
| Block route 正式/普通/受限 | ✓ | ✓ |  |
| Focus add/remove/Undo/stale | ✓ | ✓ |  |
| WAITING/BLOCKED/PAUSED router | ✓ | ✓ |  |
| LOW accept-and-apply | ✓ | ✓ | ✓ |
| duplicate submit guard | ✓ | ✓ | ✓ |
| accepted-not-applied projection | ✓ | ✓ |  |
| toolbar intervention merge | ✓ | ✓ |  |
| recent changes / Undo availability | ✓ | ✓ |  |
| Service launch/discovery/shutdown | ✓ | ✓ | ✓ |
| Graph switch/mismatch | ✓ | ✓ | ✓ |
| system status translation | ✓ | ✓ | ✓ |
| main navigation/keyboard/focus restore | ✓ |  |  |

## 4. P1 自动测试矩阵

- signal detector golden cases；
- merge priority property tests；
- invalidation/cooldown；
- shadow mode zero-visible/zero-formal-write；
- one-object-one-main-issue；
- next-action eligibility；
- deterministic status narration；
- LLM UX output Schema；
- provenance overwrite；
- bounded context ladder；
- no full text in default logs；
- renderer slot lifecycle/performance harness。

## 5. P2 自动测试矩阵

- Grill Me decision-tree stop conditions；
- no fixed questionnaire regression；
- zero-loss subtree transformation；
- semantic partial-accept dependencies；
- one Commit / inverse Commit；
- Project atomic create after Grill Me；
- evidence-based Closure unknown handling；
- cross-object candidate cap/evidence/zero authority；
- Recovery same-commit continuation；
- Rebind stale/confirmation；
- Restore/Migration existing ledger reuse。

## 6. Desktop 测试 Graph

使用外层 Git 忽略的本地实验 Graph，且所有截图只包含虚构数据。当前已有：

- `TC UX Evidence 20260723` 页面；
- `docs/research/current-ux-evidence/` 中 3 张当前真实截图。

推荐固定数据：

- Task：复核技术规格书；
- Task：等待采购确认最终报价；
- Task：完成测试环境登录验证；
- MiniProject：完成设备托管入场材料；
- Decision：设备采用 A/B 双路供电；
- Output：业务部署说明表；
- Project：示例设备托管项目。

禁止把真实业务页面、用户名、绝对路径、descriptor、PID、token、Key 或终端历史放入截图。

## 7. 每张截图的元数据

必须记录：

- scene；
- precondition；
- action；
- actual result；
- branch；
- commit；
- Logseq version；
- Light/Dark、宽度、Zoom；
- real runtime / prototype；
- related object/commit 只使用脱敏短 ID；
- screenshot ID；
- evidence status。

图片不得伪造；原图与标注图分开，不覆盖。

## 8. 必须覆盖的用户场景

1. 显式 Task 同步；
2. 普通 Block 整理；
3. Focus；
4. due；
5. WAITING；
6. BLOCKED；
7. PAUSED；
8. reviewAt；
9. blocker 完成；
10. Task DONE；
11. Undo；
12. accepted-not-applied；
13. stale；
14. PENDING；
15. RECOVERY_REQUIRED；
16. Anchor missing；
17. MiniProject 原位重构；
18. Project Page 创建；
19. Project 重入；
20. Project current interface 更新；
21. Project Closure；
22. Service 启动失败；
23. 结束 Task Copilot；
24. Logseq 退出；
25. Backup；
26. Restore；
27. Migration；
28. Graph 切换；
29. Provider 不可用；
30. 上下文不足；
31. 后台宽检索；
32. Light/Dark；
33. Query；
34. Block 引用；
35. 长文本；
36. 窄侧栏。

## 9. Live DeepSeek Gate

仅当相关 Prompt/Skill/Provider/UX output 发生变化时重跑。

要求：

- Key 只通过本机 Keychain/env reference；
- 不在命令行参数、shell history、日志或截图出现；
- default-off；
- 先运行 mock/golden/Validator；
- 真实输出只进入 Proposal；
- 前后记录 Graph/Candidate/Proposal/Object/Commit 计数；
- invalid/truncated/timeout 证明 zero write；
- 运行后扫描 Git、Graph、logs、Diagnostics 和报告中的凭据模式。

## 10. 证据登记

本目录 `screenshots/` 和 `logs/` 只登记经过脱敏、可提交的派生证据。当前本地原始 UX 调研仍位于 `docs/research/current-ux-evidence/`，在明确审查前不自动纳入提交。
