# CUX Evidence Index（2026-08-01）

## 历史证据（HISTORICAL_VISUAL_OBSERVATION）

- 交接包解压根：`~/.codex/attachments/4c802414-6f29-4569-b825-8dd50d6c88f9/handover/Task-Copilot-Cognitive-UX-Hardening-无视觉模型交接包/`
  - `05-VISUAL-EVIDENCE-TRANSCRIPT.md`：32 张截图逐张人工转录；
  - `06-SCREENSHOT-COMPARISON-AND-FLOW-MAP.md`：流程与 before/after；
  - `10-SCREENSHOT-INDEX.json`：机器可读索引；
  - `references/audit-shareable-evidence/cognitive-audit-2026-07-31/screenshots/`：32 张脱敏 PNG/JPEG（仅供独立视觉 Gate，不自读）；
  - `references/audit-shareable-evidence/commit-patches/`：历史补丁（不机械重放）。
- 仓库内审计报告：`docs/implementation/task-copilot-v2-ux/cognitive-audit-2026-07-31/README.md`
- 本地原始现场（Git ignored）：`tmp/runtime/cognitive-ux-audit-20260731/`

## 当前结构/行为证据（STRUCTURAL_FACT / AUTOMATED）

- `apps/task-copilot-logseq-plugin/src/scoped-outcome.ts` + `tests/scoped-outcome.test.ts`
- `apps/task-copilot-logseq-plugin/src/durable-origin-storage.ts` + `tests/durable-origin-storage.test.ts`
- `apps/task-copilot-logseq-plugin/src/origin-route-controller.ts` + `tests/origin-route-controller.test.ts`
- `apps/task-copilot-logseq-plugin/src/ui.ts`（renderApp / renderActionDialog / renderReview / renderObjects / renderNow）
- `apps/task-copilot-logseq-plugin/src/index.ts`（beginUiAction / model / handleAction / returnToBusinessOrigin / environmentInfo）
- `apps/task-copilot-logseq-plugin/src/v2-explicit-candidate-discovery.ts`（空候选 throw 根因）
- 根级检查：`./scripts/check.sh`（2026-08-01 PASS，Node 20.20.2）

## 本轮待生成证据

每个 Sprint 至少交付：

1. `screenshots/<sprint>-before/after-<viewport>-<theme>.png`（当前构建，供独立 Gate）；
2. `visible-text.txt`、`accessibility-tree.txt`、`interactive-elements.json`、`ui-state.json`、`computed-style.json`；
3. `route-and-data.json`（route/Page/Block/queue/Proposal/Commit/Doctor）；
4. `evidence.md`（结论、支持证据、限制、Gate 状态）。

截图与运行时产物放入 `tmp/runtime/cognitive-ux-hardening/current/`（Git ignored），
可提交的脱敏伴随文件放入 `docs/implementation/task-copilot-v2-ux/cognitive-ux-hardening-2026-08-01/evidence/`。
