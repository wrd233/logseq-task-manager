# Golden Path：Phase 11.5 Trusted USER Authorization Hardening

> 状态：2026-08-15。自动化攻击/fuzz 测试与真实 Logseq Desktop 联合链均通过；证据保存在本机 `/tmp/tc-phase11-real/`。

## 自动化证明

`packages/test-support/tests/phase11-user-decision.test.ts` 覆盖：

1. 唯一 Decision Package + “同意” → `UserDecision`（authorizationRef=event.id）→ `actor=USER` Formal Commit → Projection Obligation；
2. 短确认语 fuzz：`好/好的/好的。/同意/确认/就这样/可以/行/纳入` 全部可授权；`同意这个说法，但先别执行 / “同意” / 他说“同意” / 上次我说“同意” / 如果之后合适就同意` 等全部拒绝；
3. External Agent client（无 `userChannelToken`）创建 trusted event 被 `TRUSTED_USER_CHANNEL_REQUIRED` 拒绝；
4. 同一 trusted event 第二次 compile 返回 `STALE`，只产生一条 `UserDecision`；
5. `presentationRevision` 不匹配、缺失 revision 都返回 `STALE`，WorkObject 版本不变；
6. 引用/历史/条件语气返回 `NEEDS_CLARIFICATION`，package 与 object 无 mutation。

`packages/test-support/tests/phase10-context-governance.test.ts` 新增：

- Governance Issue 维度检查：`current_focus` judgment 不能 resolve `engagement` issue；同维度 `engagement` judgment 才能 resolve；
- ExecutionProfile 硬边界：`allowedDataScope` gate、`maxContextItems` 总量 cap、`maxInputChars` 逐 item truncate。

`packages/agent/tests/agent.test.ts` 新增：

- DeepSeek 输出语法-only 提取：trailing prose 丢弃，unbalanced JSON 不补 `}`；
- 缺 handles 的 `CONFIRMED_CHANGE` 直接抛错，不 semantic repair；
- 本地 fake HTTP 证明 `modelAlias/reasoningEffort` 进入请求，429/5xx 按 `retryBudget` 有界重试，malformed 输出不重试；
- `executor/remoteEnabled/credentialRef` 不匹配 fail closed。

## 真实 Logseq Desktop 联合链（2026-08-15）

当前保护 Graph（gitignored `logseq/`）与隔离 Kernel `/tmp/tc-phase11-real/`：

```text
Logseq 自然页插入 TODO 块
-> 持久化文件图 id:: source identity
-> Kernel CREATE_WORK_OBJECT，Plugin worker 应用并 VERIFY projection
-> Kernel createDecisionPackage(RENAME title, presentationRevision=1)
-> 无 userChannelToken / 错误 token 的 /v1/user-events 均被 401 拒绝
-> Logseq 命令面板运行 “Task Copilot vNext：回应当前决策”
-> requestTextPrompt 呈现 package summary
-> 用户输入 “好的。”（带标点，走归一化精确白名单）
-> Plugin userChannelToken 创建 TrustedUserEvent
-> compileUserDecision -> AUTHORIZED_DECISION
-> executeUserDecision -> actor=USER、commit=COMMITTED、object version 1→2、package=ACCEPTED
-> 同一 trustedEventId 再次 compile -> STALE（replay 保护）
-> Plugin worker 应用 RENAME projection 并 VERIFY（图收敛）
-> 删除实验页、恢复原 Plugin descriptor
```

证据：`/tmp/tc-phase11-real/user-chain-evidence.json`、`/tmp/tc-phase11-real/user-chain-screenshot.png`。

## 明确不做

- 不恢复任何 `--utterance` 直接编译路径；
- 不给 CLI / External Agent 发放 userChannelToken；
- 不把 presentationRevision 做可绕过检查；
- 不根据 LLM summary 措辞识别或自动关闭 Governance Issue。
