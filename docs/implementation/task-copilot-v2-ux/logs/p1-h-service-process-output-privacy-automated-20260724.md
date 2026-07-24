# P1-H Local Service 进程输出隐私自动证据（2026-07-24）

结论：`DAEMON_DEFAULT_OUTPUT_PRIVATE_PASS / RESEARCH_OUTPUT_EXPLICIT`

## 发现与修复

- 旧 Service READY stdout 包含 descriptor path；
- schema migration stdout 展开完整结果，其中包含 backup path；
- 未捕获失败把任意 Error message 直接写入 stderr；
- 新 `process-output.ts` 只生成三个固定 envelope：
  - READY：status、pid、四项 boolean capability；
  - MIGRATED/CURRENT：from/schema version、backupCreated boolean；
  - FAILED：machine-token error code；
- helper 不接收 database/descriptor path，migration 只把 backup path 转为 boolean；
- 未分类异常固定为 `LOCAL_SERVICE_START_FAILED`，不输出 message、stack、cause 或对象。

## 输出分层

- Launcher 已使用结构化失败码，并以 `stdio: "ignore"` 管理 Service 子进程；
- CLI stderr 是用户主动运行命令时的即时反馈，不是后台自动留存日志；
- live/golden runner 默认关闭，只在显式真实 Provider Gate 运行，既有测试要求 bounded
  metadata、zero-write evidence 与只含结构 key 的失败诊断；
- 上述显式研究结果仍不得自动进入 P1-H interaction evidence。

## 自动验证

- process output focused test：1/1 PASS；
- Local Service：98/98、0 skipped；
- Local Service typecheck/build：PASS；
- 根级 `./scripts/check.sh`：typecheck/lint/tests/build、Plugin/architecture boundaries、
  145 条稳定规则全部 PASS；恢复演练 `differences: []`。
