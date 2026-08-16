# Production Dogfood Evaluation (EXPERIENCE / EMPIRICAL, non-authoritative)

> 状态：2026-08-19 Round 12 首轮。FakeGraph + 真实 Kernel Service 的 5-day synthetic-clock 长周期 + 真实 Logseq Desktop closure 链。

## 1. Long-horizon setup

- 36 Formal WorkObjects：5 Projects / 11 MiniProjects / 20 Tasks，挂在 3 层 ownership 树。
- FakeGraphAdapter + 真实 startKernelServer（maintenance、closure coordinator、broker、trusted USER channel 全部真实代码）+ synthetic clock 跨 Day1–Day5。
- harness：repo `tmp/phase16-dogfood-harness.mts`（不入 Git）；结果 `/tmp/tc-dogfood/dogfood.json`。

## 2. Day-by-day

| Day | 行为 | 观察 |
| --- | --- | --- |
| 1 | 8 个 source bursts → drain | HEALTHY；18 closure assessments DONE；Now 3 |
| 2 | 5 个任务进入 WAITING；6h 后 3 种回复 | quiet WAITING 不 resurface；真实回复只让 1 个恢复信号出现 |
| 3 | 2 个 MiniProject READY；1 Complete、1 Cancel+Reopen | 无 cascade；package/execution 都走 trusted USER |
| 4 | provider 401（2 个对象）+ Graph offline（2 个对象）+ 恢复 | DEGRADED 如实出现；自然记录照写；恢复后 queue drain |
| 5 | 一次真实成功 | 回 HEALTHY；历史 4 条 FAILED 保留不洗白 |

## 3. Long-horizon hygiene（Day5 final）

- Now：**3** 个对象，全部有真实“为什么现在”（无 READY 堆积、无重复）。
- Confirmation：**0**。
- WorkMap：36/36 结构完整；OPEN packages / OPEN candidates / OPEN issues：全部 **0**。
- More：`一切正常，后台维护中`。
- 这满足“跑了 5 天还像第一天一样安静、清楚、可信”的第一轮验收。

## 4. Real Desktop closure 链

见 `CLOSURE_SEMANTIC_EVALUATION.md` 第 3 节：Evidence → semantic READY → Object Surface `已具备结束条件` → 点击结束 → trusted USER commit → Now 变空 → closed re-entry 修复。

## 5. 发现并修复

1. Closed re-entry 残留“目前可推进”+“和 Agent 讨论”→ 已修（backend summary + Plugin 按钮隐藏）。
2. `GET /v1/objects/:id/closure-assessment` 对已关闭对象原先 404 → 改为 200 + `{assessment:null}`，Object 存在就返回状态。
3. FakeGraph non-Task anchor 若带 TODO marker，真实 Graph 语义会 closure precondition fail → harness 已按真实语义 seed 无 marker 的 MiniProject/Project。

## 6. 待补

- 真实 DeepSeek gold-set（40 cases）与 latency/token 复跑：等 runtime `DEEPSEEK_API_KEY`。
- 10+ MiniProject / 10+ Project 多轮 Agent conversation replay：下一步在 `tmp/` 做 DSH 剧本回放。
