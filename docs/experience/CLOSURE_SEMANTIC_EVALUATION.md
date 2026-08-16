# Closure Semantic Evaluation (EXPERIENCE / EMPIRICAL, non-authoritative)

> 状态：2026-08-19 Round 12，Fake pipeline + real Desktop；DeepSeek gold-set 复跑待 runtime key。

## 1. Fake / deterministic pipeline

- Gold set：40 anonymized cases（MiniProject 20 + Project 20）。
- Fake assessor 跑 `scripts/eval-closure-semantic.ts --fake`：
  - false READY = **0**（第一质量指标）
  - readiness accuracy 28/40；UNKNOWN restraint 23；CONFLICT detected 4/7
  - Fake assessor 是显式 test scaffolding，低召回符合预期；真实语义判断以 DeepSeek 为准
- 生产测试证明 count 门槛已移除：`phase14-closure.test.ts` 两条“无关 Evidence 数量达标”只到 UNKNOWN，显式归因后才 READY。

## 2. Async / cached Object read

- Object GET / closure-assessment GET 全部只读 cached：phase15 断言 assessor calls = 0 且 <1s。
- 真实 Desktop 实测（7 次采样，本地 Fake 模式）：now / workmap / system / object-context(open+closed) / closure-assessment 全部 **1–2ms**。
- 证据：`/tmp/tc-phase16-ux/perf.json`。

## 3. Real Desktop closure UI dogfood

- 真实 Logseq 0.10.15 + repo `logseq/` Graph + `/tmp/tc-demo` Kernel（新 build，schema v22）。
- 通过 real Plugin trusted USER channel：设 WorkIntent + freeze 2 条 Evidence → 后台 Fake assessor → **FRESH READY**，checks 显示 `✓ 厂商新版探针验证完成` 且 attribution 只带真正支持的那条 Evidence。
- Now 卡片：`完成情况已具备结束条件，可以收口`，无重复。
- 点击 `结束这个子项目` → 真实 COMPLETE 提交成功；Now 随即为空（安静）。
- **发现并修复 closed re-entry 残留**：关闭后对象页 reentrySummary 仍显示“目前可推进”，且还有“和 Agent 讨论”。已改为 `${title} 已完成/已取消`，关闭对象不再显示 Agent 讨论按钮（commit 随本轮 checkpoint）。
- Screenshots：`/tmp/tc-phase16-ux/ui/semantic-{now,workmap,object-ready,after-close,closed-reentry,closed-reentry-fixed}.png` + `evidence.json` / `closed-evidence.json`。

## 4. DeepSeek closure eval（pending runtime key）

- `scripts/eval-closure-semantic.ts` 已就绪，40 cases × 真实 Responses API，输出 falseReady / falseNotReady / UNKNOWN restraint / CONFLICT detection / item attribution / invalid refs / latency / tokens。
- 用户提供 `DEEPSEEK_API_KEY`（仅 runtime env）后即可复跑。
