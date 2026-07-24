# P1-G Unified UX Output 与 Context Recovery Skill 自动证据（2026-07-24）

结论：`PARTIAL_SERVICE_AUTOMATED_PASS / ZERO_FORMAL_WRITE / RUNTIME_UI_OPEN`

## 契约

- Application `materializeUnifiedUxOutput(unknown, authority)` 是唯一公共物化入口；
- 输出固定分离 facts、inferences、unknowns、summary、evidenceScope、
  suggestedChanges、nextAction、risk、discussion/review 和 provenance；
- 模型只返回 `factRefs`，正式 fact 文本和 source refs 来自机器 authority；
- inference 和 suggested-change evidence 只能引用机器 scope；
- next action 只接受 allowlisted ID，intent、label 和 target 不受模型控制；
- scope hash、生成时间、contract/prompt/Skill/Provider/model provenance 由机器覆盖；
- risk 使用最高值，机器 discussion/review 要求不能被模型降低；
- `DRAFT_PROPOSAL` 不含 semantic operation 或 write port；没有新增 Domain、SQLite、
  Graph、Proposal 或 Commit 写路径。

## Skill

- `recover-context@1.0.0` 先应用 `task-copilot-core`；
- 上下文严格按正式事实、当前对象正文、Project 当前接口、直接关系、宽检索逐层扩大；
- 够用即停；宽检索必须显式/高价值、有界、异步并列入 evidence scope；
- 信息不足时明确进入 unknowns；next action 默认不合格；
- Skill 已纳入同一 SHA-256 catalog、Local Service `/skills` 和 Context Package。

## 自动验证

- `skill-creator/scripts/quick_validate.py skills/recover-context`：PASS；
- Application：120/120、0 skipped；
- Local Service：94/94、0 skipped；
- Service Client：12/12、0 skipped；
- 根级 `./scripts/check.sh`：typecheck/lint/tests/build、Plugin/architecture boundaries、145 条
  稳定规则全部 PASS；恢复演练 `differences: []`；
- 覆盖模型 provenance spoof、未知/越界 evidence、未知 action、歧义 machine identity、
  400 字 summary 上限、risk/review 不可降级和 review-only suggestion。

## Project Context Recovery Service 接线

- `POST /provider/ux/project-context-recovery` 只接受 `objectId + expectedVersion`；
- Project、Ownership、Association、Focus、Anchor、Commit、Context Package、Skill 和
  allowed action 全部由 Local Service 从正式状态构造，客户端不能提交 facts、Prompt 或动作；
- 请求前拒绝 stale、非 Project、额外字段和 Provider disabled；Provider 返回后再次重验
  Object version，变化时丢弃派生草稿；
- 不创建 Proposal、SemanticCommit、Graph/SQLite 写入或持久缓存；
- Local Service 100/100、Service Client 12/12、两包 typecheck PASS。

## 尚未声明

- 未运行真实 DeepSeek context-recovery 语义 Gate；
- 未把 unified UX output 接到 Plugin 用户可见 Project 重入状态；
- 未验证 Desktop 信息密度、下一动作接受率或上下文恢复时间；
- 因此不能声明 P1-G 或 P1 完成。
