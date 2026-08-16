# Closure / Lifecycle Evaluation (EXPERIENCE / EMPIRICAL, non-authoritative)

> 状态：2026-08-19，Phase 13.5 + Outcome/Closure 收口 第一轮 dogfood / eval。
> 环境：Logseq Desktop 0.10.15 + repo `logseq/` Graph + `/tmp/tc-demo` Kernel（真实进程、真实 SQLite、真实 Graph Adapter）。

## DeepSeek closure evaluation

- 13 个注入场景：mini-ready / mini-missing-check / mini-ambiguous / mini-contradiction / mini-no-intent / project-child-blocker / project-kr-supported / project-kr-unknown / project-objective-only / project-no-intent / project-contradiction / project-scope-mismatch / project-stale。
- Primary metric：**falseReadyCount = 0**（没有把任何证据不足场景判成 READY；拿不准的都保守为 UNKNOWN/NOT_READY/CONFLICT）。
- 平均 latency ≈ 14.97s；13 个场景全部通过 DeepSeek Responses API（`deepseek-v4-flash`）真实调用。
- 证据：`/tmp/tc-phase14-closure/closure-eval.json`。

## Fake / deterministic closure evaluation

- Fake / deterministic 路径由测试门禁覆盖：`packages/test-support/tests/phase14-closure.test.ts`（MiniProject UNKNOWN→NOT_READY→READY、Project READY→USER Complete、stale closure package fail closed）与 `phase5-task-closure.test.ts`（governed parent closure）。
- Domain 层直接断言 generalized Complete/Cancel/Reopen/Amend（`packages/domain/tests/domain.test.ts`）。

## 真实 trusted USER lifecycle dogfood

在真实 `/tmp/tc-demo` Kernel 上执行：

1. 裸 bearer 直接 POST `/v1/user-events` → **401 TRUSTED_USER_CHANNEL_REQUIRED**。
2. `法务探针验证`（MiniProject，无 child）经 `COMPLETE_WORK_OBJECT` Decision Package + trusted USER channel「确认」→ **EXECUTED**；Closure Record `69c6d96f…`。
3. 同一对象经 `REOPEN_WORK_OBJECT` Decision Package → **EXECUTED**；对象回到 OPEN@v5；Reopen Record `f37ad70d…`；Completion 历史保留。
4. `海丝项目`（Project，有 OPEN children）创建 COMPLETE package 并 USER 授权执行 → 执行被拒（**PARENT_HAS_OPEN_CHILDREN**）；Project 保持 OPEN，无 cascade；package 已 defer。
5. WorkMap 树未变（1 Project → 2 MiniProject，其中 1 个下挂 1 Task）；projection backlog 回到 0。
6. Now 面板只出现一条 `法务探针验证`，语义变化合并为「已完成；已重新打开」，无重复卡片。

证据：`/tmp/tc-phase14-closure/lifecycle-dogfood.json`（9 项 assertion 全 true）。

## 真实 multi-process / source-during-run soak

- 第二实例指向同一 state dir（`TASK_COPILOT_STATE_DIR=/tmp/tc-demo`）→ exit 1，输出 `KERNEL_INSTANCE_ALREADY_RUNNING`，fail fast，未覆盖 descriptor。
- 4 个真实对象（Project + 2 MiniProject + Task）：每个对象先 enqueue source-change，等到该 job 处于 RUNNING 时再注入第二条 source-change → 旧 RUNNING job 全部结束为 **STALE + lastOutcome=SUPERSEDED + SUPERSEDED_BY_NEWER_JOB**，新 job 继续 DONE（NO_CHANGE / CONFLICT）。
- 之后 queue drain、`runtimeStatus` 回 HEALTHY。
- 证据：`/tmp/tc-phase135-runtime/real-soak.json`。

## UI screenshots（OS-level capture）

- `closure-now.png`：Now 只出现一条收口相关变化，已合并为「已完成；已重新打开」。
- `closure-miniproject-object.png`：MiniProject Object Surface 的结束评估（UNKNOWN → 阻塞原因「这个子项目的最终结果还没有写清」），无百分比/分数。
- `closure-project-object.png`：Project Object Surface（目标 / 阶段 / 结果边界 / 还不能结束 + OPEN child blockers）。
- `closure-confirmation.png`：待我确认（无边界决定时安静空态）。
- `closure-more.png`：系统健康（一切正常，后台维护中）。
- `closure-workmap.png`：项目层级树。
- 证据目录：`/tmp/tc-phase14-ux/ui/`（含 `evidence.json` 面板文本快照）。

### CDP capture lesson

- 该 Logseq Electron 页面 target 的 `Page.captureScreenshot` 会永久挂起（png/jpeg/fromSurface 变体都试过）；`Runtime.evaluate` 正常。
- 可靠替代：用 `CGWindowListCopyWindowInfo` 找到 Logseq 主窗口 `kCGWindowNumber`，再 `screencapture -x -l <windowId>`。本机 helper 为 `/tmp/winlist_all`（C + CoreGraphics，临时工具，不入 Git）。
- 截图脚本：repo `tmp/phase14-ui-screenshots.mts`（tmp 不入 Git）。

## Findings

1. Derived closure assessment 的 UI 信息密度足够：blocker 用一句自然语言说清“为什么还不能结束”，没有引入 percentage / score。
2. 真实 parent closure 拒绝路径和测试一致：失败发生在 execute 阶段、formal state 零变化。
3. RUNNING supersession 在真实多进程下可稳定复现：4/4 旧 RUNNING job 都是 STALE/SUPERSEDED，没有假 completion error。
4. 第二实例 fail fast 解决了此前“多实例抢 queue → 假 GRAPH_ADAPTER_OFFLINE”的真实故障源。
5. 唯一不诚实风险点：object 刚 close 又 reopen 后，Now 的「已完成；已重新打开」是真实历史变化，不是闭环卡；Confirmation 保持空态。

## Next dogfood

- 让 `法务探针验证` 走完真实收敛：写清 desiredOutcome + completionChecks → Frozen Evidence → READY → UI 结束按钮一次点击完成，而不是脚本直连 API。
- 长周期观察 Reopen 之后 assessment 是否稳定重新推导，以及 closed re-entry 的「已完成」视图在日常使用中的信息量。
