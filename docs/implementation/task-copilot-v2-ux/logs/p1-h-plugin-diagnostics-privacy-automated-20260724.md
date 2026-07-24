# P1-H Plugin Diagnostics 隐私自动证据（2026-07-24）

结论：`PLUGIN_DEFAULT_DIAGNOSTICS_PRIVATE_PASS / CROSS_PROCESS_AUDIT_OPEN`

## 发现

- 旧 `StructuredLogger` 自动保存 `Error.message`、stack 和 cause，并随 Console、复制诊断
  与 JSONL 导出暴露；
- `RuntimeDiagnostics.fail` 也把同样自由文本带入 snapshot 和技术诊断 HTML；
- Plugin 初始化、global error 和 fallback 路径存在直接 `console.error(error)`，会绕过
  structured logger；
- 因此 P1-H 专用事件安全并不能证明 Plugin 默认诊断链安全。

## 修复

- `privateErrorEvidence` 只物化 bounded `errorName` 和 machine-token `errorCode`；
- 无机器错误码的异常统一为 `UNCLASSIFIED_ERROR`，不尝试从 message 猜测；
- StructuredLogger 使用显式字段 allowlist，只接受 bounded machine token、计数、时长和
  boolean；任意 runtime 字段注入与自由文本错误码被忽略；
- Runtime Diagnostics snapshot/HTML 不再具有 error message、stack 或 cause 字段；
- Plugin 初始化、全局异常和 fallback 改走同一 logger，不再把 Error 对象直接送入 Console；
- Debug 开关只控制 debug/trace 事件是否收集，不改变字段或异常隐私边界。

## 自动验证

- focused logger/Runtime Diagnostics：16/16 PASS；
- Plugin 全量：222/222、0 skipped；
- Plugin typecheck/build：PASS；
- bootstrap integrity checker 已改为要求结构化 failed-stage code，并禁止正式 Plugin
  `console.error(` 绕行；
- 根级 `./scripts/check.sh`：typecheck/lint/tests/build、Plugin/architecture boundaries、
  145 条稳定规则全部 PASS；恢复演练 `differences: []`；
- `git diff --check`：PASS。

## 尚未声明

- 本证据只覆盖正式 Task Copilot Plugin 的内存、Console、copy diagnostics 与 JSONL export；
- Local Service/CLI stderr 和显式 live/golden research runner 仍需按“默认日常输出”与
  “用户主动研究样本”分别审计；
- 尚无真实 Desktop 导出文件的本轮 canary scan；
- 因此“全系统默认日志不含正文”验收项仍不勾选。
