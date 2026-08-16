# Phase 16B — Governance Boundary Repair & Daily UX Golden Path

> 状态：2026-08-16 实机验证
> 实机：Logseq Desktop 0.10.15 + `/tmp/tc-demo` Kernel + repo `logseq/` 测试 Graph

## GP16B-1：Trusted USER boundary（修复后）

1. External CLI Agent（只有 bearer token）尝试 prepare/commit USER-actor operation → `TRUSTED_USER_CHANNEL_REQUIRED`。
2. Plugin（graph-adapter descriptor 含 userChannelToken）执行同一 operation → 成功。
3. `POST /v1/ownerships` → 404；ownership 只能通过 `ASSIGN_PARENT` DecisionPackage + Plugin Trusted USER Channel 执行。
4. MiniProject Governance 的 `UPDATE_WORK_INTENT` Agent Proposal → `PACKAGED` DecisionPackage；Plugin 点「确认」后 Commit actor=USER。

证据：`packages/test-support/tests/phase16b-governance-repair.test.ts`。

## GP16B-2：Morning re-entry / cognitive baseline

1. 打开「现在」；若用户从未看过，只出现有现实理由的 0–3 个 context。
2. 用户点「打开原文」→ Plugin 记录 `UserReadBaseline`。
3. 之后只有新 semantic commit / waiting resurfacing / 未对齐 source 才重新进入 Now。
4. quiet WAITING、bare currentFocus、package-only object 不进入 Now。

证据：`packages/test-support/tests/phase16b-cognitive-baseline.test.ts`；实机 `/tmp/tc-phase16b-ux/daily-sim.json`（evening Now 只 resurface 一条刚变化对象）。

## GP16B-3：Confirmation card → direct decision

1. 卡片显示 operation-specific impact（用户语言）。
2. 点「确认」直接绑定当前 package 创建 TrustedUserEvent（不输入 Package ID）。
3. 点「暂不」把 package 置为 REJECTED，不改候选/Taste。
4. candidate revision 变 stale 时卡片 `status=STALE`，按钮禁用。

## GP16B-4：Object conversation（real DSH）

1. `task-copilot object context <id>` 返回 bounded pack（≤6 context refs with snippet、≤3 issues、≤3 packages、Project child frontier ≤3）。
2. External Agent 恢复现实后给建议；低风险 current_focus / engagement 通过 Proposal apply。
3. boundary 变化只生成 DecisionPackage，用户在「待我确认」拍板。
4. Decision 执行后重新 `object context` 可看到 formalVersion 变化，无需 transcript。

实机证据：`/tmp/tc-phase16b-ux/afternoon-reply.json`（WAITING → ACTIONABLE 完整链）、`/tmp/tc-phase16b-ux/conversation-eval.json`（DeepSeek 18-scenario evaluation）。

## GP16B-5：UI real desktop iterations

- V1：full-screen modal；Now 4 张重复卡；WorkMap enum 泄漏；小窗口信息重复。
- V2/V3：右侧 side panel（min(430px, 52vw)）；Now cap 3 + attention weight；卡片只显示 reality / whyNow / continue；Confirmation 直接「确认 / 暂不」；WorkMap 弱中文类型标签；小窗口 960×640 可用。
- Screenshots：`/tmp/tc-phase16b-ux/ui/{now,confirm,workmap,more,small-window}-v*.png`（不入 Git）。
