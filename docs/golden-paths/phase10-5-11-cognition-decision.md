# Golden Path：Context-aware DeepSeek Cognition 与 Natural-language USER Authorization

> 状态：2026-08-15。自动化测试与 DeepSeek 真模型 smoke 通过；真实 Logseq 联合链使用上一轮 CDP 工具与当前 API。

## 链 A：Context → Cognition → Evidence → Commit / Issue

1. 多块自然材料建立 Context Association；
2. MaintenanceCoordinator 构造 bounded Context Pack（F0 formal state、S0 source delta、C1..Cn associations）；
3. CognitionExecutor（fake 或 DeepSeek）返回 typed judgment，只能引用 host handles；
4. Host 校验 handles，只 freeze selected refs；
5. CONFIRMED_CHANGE 经 narrow proposal → `apply*Formal` → Projection Obligation；
   UNKNOWN/CONFLICT/BOUNDARY_CANDIDATE 落 dimension-scoped Governance Issue，coverage 仍 clear。

DeepSeek real results：
- DS1 `CONFIRMED_CHANGE/current_focus`，supporting handles `S0,C1`；
- DS2 conflict `CONFLICT/engagement`，conflicting handles `C1,C2`；
- DS4 prompt-injection source → `NO_CHANGE`，host 权限边界拒绝任何越权 mutation。

## 链 B：Decision Package → USER utterance → UserDecision → Formal Commit

1. `createDecisionPackage` 呈现一个 precise candidate（带 `presentationRevision`）；
2. 用户在真实 Logseq Plugin 中回复精确白名单短确认；
3. Plugin 用独立 `userChannelToken` 创建 `TrustedUserEvent`；
4. `compileUserDecision({ trustedUserEventId })` → `AUTHORIZED_DECISION`（唯一 package/candidate、版本 fresh、revision 匹配、event PENDING）；
5. `executeUserDecision` → `actor=USER`、`commitFormal`、immutable `UserDecision`、Projection Obligation。

Fault policy：引用他人说法 / 历史语气 / 多 package / 版本 stale / event 重放 / revision 不匹配全部无 mutation。详细 Phase 11.5 硬化证据见 [`phase11-5-user-authorization-hardening.md`](phase11-5-user-authorization-hardening.md)。
