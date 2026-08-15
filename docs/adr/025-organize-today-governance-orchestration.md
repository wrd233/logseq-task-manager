# ADR 025 — Organize Today as Governance Orchestration

- 状态：accepted
- 日期：2026-08-15
- 关联权威文档：`docs/vnext/05` 第 23 章、`docs/vnext/06` 第 31 章、`docs/vnext/07` Phase 12

## 1. 决定

`整理今天` 是用户主动触发的**治理编排命令**，不是 Daily Review 工作流，也没有独立 domain entity。

执行序列：

1. Resolve scope：今天 Journal（date 参数可测试注入）；
2. Expire 过期 Candidate；
3. 找到 dirty / uncovered / queued 的 OPEN WorkObject，显式 enqueue INTERACTIVE reconcile（one-off，不解除 pause）；
4. Bounded Discovery 跑今天材料；
5. Existing-Object-First association；
6. 成熟 Candidate → Decision Package；
7. 输出面向用户的简洁结果：今天主要变化、已自动对齐事项、少数需要拍板的边界。

## 2. 权限边界

- 用户说“整理今天”意味着让理解追上现实，**不扩大权限**；
- 不自动 CREATE / PARK / COMPLETE / 改 WorkIntent / 改 ownership；
- 不改 Natural Workspace：不移动 block、不改标题、不加 tag/property、不重排层级；
- pause 继续有效：显式 one-off 可运行，但 pause 状态保持；Graph offline 时返回明确 partial/unavailable，不编造结果；
- 重复整理：无新材料不重复 association / candidate / package。

## 3. 输出预算

结果优先：已自动对齐的主要现实、今天最重要变化、真正需要判断的少数事项。不展示全部 association / issue / no-candidate；diagnostics 走 run receipts API。

## 4. 不做什么

- 不创建 `DailyReview` / `TodayOrganizationSession` / 整理队列 / 待整理 Inbox；
- 不连续扫描全 Graph；
- 不为了“有输出”制造 Candidate；
- 不实现 Now ranking / attention UI / 最终 Object Lens。
