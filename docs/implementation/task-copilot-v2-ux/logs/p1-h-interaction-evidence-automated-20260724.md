# P1-H Interaction Evidence 自动证据（2026-07-24）

结论：`PARTIAL_SESSION_AUTOMATED_PASS / PRIVATE_TEXT_EXCLUDED / PERSISTENCE_AND_UI_OPEN`

## 数据边界

- Application `InteractionEvidenceBuffer` 是 session-only 派生证据容器，不写 Graph、SQLite
  或正式 Proposal/Commit；
- 入口采用 exact-key allowlist，未知字段 fail closed；
- 只允许 scene/outcome、对象类型、Signal/Rule/Skill/Prompt/model 版本、结构计数、
  user disposition、固定 failure code 和 elapsed time；
- 没有 summary、content、objectId、blockUuid、Prompt、request、response、error message
  或 Authorization/API Key 字段；
- 容量限制 1–4096，默认 500；满时删除最旧项；提供显式 snapshot、JSONL export 和 clear，
  当前没有自动持久化或上传。

## P1-G 接线

- 生成成功记录 evidence scope hash、fact/inference/unknown/suggested-change/ref 数量、
  next-action eligibility、Skill/Prompt/model 版本和 Provider duration；
- Validator 拒绝只记录 `UX_OUTPUT_VALIDATION_FAILED`；
- Provider transport 失败只记录 `UX_OUTPUT_PROVIDER_FAILED`，不保存异常文本或响应体；
- evidence sink 是 best-effort：sink 异常不能改变成功结果，也不能替换原始 Provider/
  Validator 异常；
- 三类事件均不获得 Domain、Graph、SQLite、Proposal 或 Commit 权限。

## 自动验证

- focused interaction evidence：2/2 PASS；P1-G generator：4/4 PASS；
- Application：122/122、0 skipped；
- Local Service：98/98、0 skipped；
- Application 与 Local Service typecheck：PASS；
- 根级 `./scripts/check.sh`：typecheck/lint/tests/build、Plugin/architecture boundaries、
  145 条稳定规则全部 PASS；恢复演练 `differences: []`。

## 尚未声明

- 未接用户 disposition 入口或噪声 dashboard；
- 未批准跨会话留存、上传或完整研究样本；
- 未完成通用 StructuredLogger 全调用面隐私审计；
- 未进行真实 Provider/Plugin/Desktop 交互证据 Gate；
- 因此不能声明 P1-H 或 P1 完成。

## 版本与噪声汇总补充

- session buffer 可按 Skill/Prompt/model version 统计 generated/rejected/error；
- 用户处置只统计 HELPFUL/NOT_NEEDED/INACCURATE/TOO_MUCH/DO_NOT_REPEAT；
- noise 定义为有处置样本中非 HELPFUL 的数量，helpful/noise rate 固定四位小数；
- 未评分时 rate 为 null，避免把没有反馈误报为低噪声；
- summary 不含 objectId、blockUuid、正文或自由文本。
