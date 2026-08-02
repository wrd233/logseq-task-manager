# Agent Governance 前端信息架构减法 Status

```yaml
goal_state: NONVISUAL_FRONTEND_IMPLEMENTATION_COMPLETE
base_commit: 6eb96909fa9dcd68f0ef62b057fe420134b860e7
current_commit: <final commit after check.sh>
slices:
  - slice_0: DONE
  - slice_a: DONE
  - slice_b: DONE
  - slice_c: DONE
  - slice_d: DONE
  - slice_e: DONE
  - slice_f: DONE
automatic_gate: PASS
desktop_gate: PASS
visual_gate: PENDING_INDEPENDENT_REVIEW
```

## Baseline facts（Slice 0 输出）

- 治理入口：More 工作区 → 更多区域 section-nav → `view` `governance`。
- 当前渲染：`apps/task-copilot-logseq-plugin/src/agent-governance-ui.ts`（258 行单文件）。
- 当前样式：`apps/task-copilot-logseq-plugin/src/index.css` 第 299–372 行（治理）与 397–418 行（窄宽）。
- 控制器状态与动作：`apps/task-copilot-logseq-plugin/src/index.ts`（`agentGovernance*` 模块状态、`refresh()` 内加载、`onRootClick` 动作分发）。
- 服务 API：`listAgentDecisions` / `listAgentDecisionEvents` / `listAgentReviewSignals` / `listAgentRuleAuthorizations` / `getAgentGovernanceSettings` / `setAgentRulePaused` / `setAgentGlobalWritesPaused` / `setAgentObservationEnabled` / `setAgentExpandedContextEnabled` / `recordAgentFeedback` / `recordAgentBulkFeedback` / `exportAgentSkillFeedback` / `exportAgentReviewEvidence`。
- 测试：`apps/task-copilot-logseq-plugin/tests/agent-governance-ui.test.ts`（5 个）与 `agent-governance-change-queue.test.ts`。
- 截图流程：物理 Logseq Desktop 0.10.15 窗口（1000×720 与 720×520），Light/Dark 通过插件外观偏好切换；提交至 `docs/goal/agent-decision-governance/screenshots/`（6 张）。实现 Agent 不评价视觉。

## Next steps

1. Slice A：次级视图状态与默认决策视图。
2. Slice B：页头状态行 + 紧凑摘要 + 设置 Popover。
3. Slice C：Decision 流重构。
4. Slice D：详情与快速反馈。
5. Slice E：规则与复盘视图。
6. Slice F：响应式/无障碍/截图/文档收口。
