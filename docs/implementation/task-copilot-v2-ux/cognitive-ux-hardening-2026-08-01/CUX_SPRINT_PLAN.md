# CUX Sprint Plan（2026-08-01，plan-design-review 后）

## Sprint 1：Scoped Outcome 收口（CUX-P0-01 + CUX-P1-04）

根因：`prepareV2ExplicitCandidateDiscovery` 把“0 个合法候选”当异常 throw → 红色 error 面板；
且空结果没有与队列事实绑定。

共享合同：

- 无候选 = 中性 empty（notice），文案“当前页没有新增需要整理的内容”，显示已扫描数/非法显式块数，不出现提交按钮；
- 部分非法 = 中性 empty + 非法计数说明；
- 真实候选 = 预览 + “加入待整理” + 提交后成功数 == 队列数；
- 扫描失败（宿主/Service/上限）仍为 error，但保持可行动（重新检查/关闭）；
- 新动作开始或工作区切换时清理旧瞬时结果（`beginUiAction` 已做，补测试锁定）。

改动面：

- `apps/task-copilot-logseq-plugin/src/v2-explicit-candidate-discovery.ts`：空候选不再 throw，返回 empty preview；
- `apps/task-copilot-logseq-plugin/src/ui.ts`：empty 分支显示 invalidExplicitBlocks 说明；保证无 submit；
- `apps/task-copilot-logseq-plugin/tests/v2-explicit-candidate-discovery.test.ts`：新增空/全非法/部分非法用例；
- `apps/task-copilot-logseq-plugin/tests/ui.test.ts`：新增 scoped outcome 时间序列测试（同工作区新动作清旧结果、cancel 非 success、empty 非 error）。

Desktop 矩阵：1000/760 × Light/Dark × 无候选/部分非法/真实候选；队列读回一致。

## Sprint 2：Durable Origin / Return Contract（CUX-P0-02）

根因：origin 已持久化但 reload 后没有自动解析导航；也没有明确的 fallback 降级 UI。

合同（Goal §5.2）：

- graph ready + 索引完成前不竞争；索引后若当前路由是失效 UUID Page，则按 pageName 恢复 Page，再 `scrollToBlockInPage` 恢复 Block；
- 解析失败时：不空白、不静默，显示“来源不可用”提示 + 一键打开 Page（Page 名可解析时）或关闭；
- 保留 session token 语义：一般关闭 Overlay 用 session origin；reload 恢复用 durable origin；
- 不清除 durable origin 除非用户完成返回或显式清除。

改动面：`origin-route-controller.ts`（恢复解析）、`index.ts`（bootstrap 恢复时机）、
`durable-origin-storage.ts`（如需内容 hash fallback 字段）、测试 + Desktop reload/reopen/rename/move。

## Sprint 3：One-question Workspace + Progressive Disclosure（CUX-P1-02/03）

- Grill 首屏：来源摘要（1 行）→ 当前唯一问题 → 输入 → 安全退出；“查看判断依据/已确认事实”折叠；
- 对象工作区：日常词（项目/事项/成果/归属/当前状态/相关内容）；SQLite/Anchor/Association/Lifecycle/版本号进“技术详情”；
- 不改变 `mini-project-modeling`/`project-creation-modeling` 的 machine contract。

## Sprint 4：Now / Provider / 时间语言（CUX-P2-01/02、P3-02）

- Now 默认折叠次级筛选；首屏主目标“继续处理/需要回看/保持等待”；
- Provider 失败前台按“可重试/查看系统状态”两级，技术分类留日志；
- Review/结果日常层本地时间，ISO 只进 details。

## Sprint 5：回归与 Gate

- 全量根级检查；Desktop 代表矩阵；视觉 Gate 请求（1000/760、Light/Dark、空/失败/取消/reload）；
- 状态文档与 traceability 更新；原子提交；`VISUAL_GATE_PENDING` 显式保留。
