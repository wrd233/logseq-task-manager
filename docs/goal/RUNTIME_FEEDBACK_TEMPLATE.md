# Runtime Checkpoint Feedback Template

请用户在 Codex 输出 `CONSOLIDATED_RUNTIME_CHECKPOINT` 后，按下列格式反馈：

```text
PLUGIN_COMMIT:
LOGSEQ_VERSION:
GRAPH_PATH:
LOAD_RESULT: PASS / FAIL

TEST_RESULTS:
- RT-xxx: PASS / FAIL
  actual:
  error:
  uuid:
  screenshot_or_log:

UI_FEEDBACK:
- capture_friction:
- readability:
- information_density:
- confusing_actions:
- missing_feedback:

CLEANUP_RESULT:
```

Codex 收到后应：

1. 写入 Runtime Test Log；
2. 修复失败；
3. 运行完整自动回归；
4. 更新验收矩阵；
5. 继续 Goal，不重新规划已完成部分。
