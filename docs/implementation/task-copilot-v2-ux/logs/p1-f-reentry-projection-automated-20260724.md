# P1-F Project / Task Reentry Projection 自动证据（2026-07-24）

结论：`PARTIAL_AUTOMATED_PASS / READ_ONLY_PROJECTION / PLUGIN_PAGE_SLOT_DESKTOP_OPEN`

## Project 契约

- Recovery/PENDING Commit 优先于普通工作上下文；
- schema v12 结构边界、精确 Condition、Focus 直属进入点共同决定上下文充分性；
- 新建 Project 的初始化占位接口不单独构成“当前停留点”；
- 最多三个进入点，必须同时满足 Focus、Primary Ownership、OPEN、active Primary Anchor；
- Association 只计入 related context，不升级为进入点；
- closed Project 只展示正式 Lifecycle/Closure，不建议加入 Focus 或更新接口。

## Task 契约

- 不建立 Task current-interface 字段；
- 依次组合精确 Condition、有机器 sourceRef 的父正文、Primary Owner 与 active Anchor；
- 信息不足时明确表示需要打开原文；
- 未完成 Commit 仍优先进入同一恢复记录。

## 安全与隐私

- 投影不包含 Anchor external Block identity；
- `facts / inferences / unknowns / evidenceScope` 分离，确定性 `inferences` 恒为空；
- 主结论/摘要/关键依据有界，完整正式事实仍保留在 facts；
- duplicate object/Anchor/Commit/Focus identity、无效时间、身份不匹配与不可信父正文引用 fail closed。

## 自动证据

- `packages/application/tests/reentry-projection.test.ts`：8/8；
- Application 全量：112/112、0 skipped；
- Application typecheck：PASS；
- 根级 `./scripts/check.sh`：PASS；
- rule coverage：145；
- acceptance rehearsal：PASS（恢复投影 differences 为空）。

## 尚未声明

- 未替换现有 Plugin Project workspace；
- 未接 Project Page slot 或 Task 原文/父 Block Desktop reader；
- 未做 Light/Dark/窄栏/右侧栏/Zoom/Query/引用 Desktop Gate；
- 未启用 LLM 上下文恢复。
