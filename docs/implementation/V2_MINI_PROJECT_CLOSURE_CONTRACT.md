# V2 MiniProject Closure 合同

> 状态：`UC28_AUTOMATED_LIVE_PROVIDER_DESKTOP_PASS`

## 真实问题

冻结规范要求 MiniProject 完成时回答三问：原目标、实际结果、遗留或转移。旧 Marker Desktop Gate 只证明了 DONE 触发的 Proposal / Review / Commit 安全链，没有把三问收入唯一机器 Proposal 和正式对象，因此不是完整 Closure。

## 数据合同

```ts
type V2MiniProjectClosure = {
  originalGoal: string;
  actualResult: string;
  remainingWork: string;
};
```

三项都必须是非空且每项不超过 4000 字符的文本；没有遗留时也必须显式记录“无遗留”等结论。Closure 只能出现在 `PROJECT / MINI_PROJECT + COMPLETED / ARCHIVED`：它在完成时建立，后续归档必须保留这份完成事实。该结构不改变 Lifecycle / Condition / Focus 的已冻结集合。

## 唯一写入链

```text
Logseq DONE evidence / sidebar object intent / external Agent object scope
→ one READY HIGH Proposal with three unresolved questions
→ human enters all three answers and accepts the group
→ Proposal stores the single reviewed machine representation
→ independent final confirmation and evidence-specific revalidation
→ existing one-step Domain SemanticCommit
→ Object closure_json + COMPLETED + Audit + Receipt atomically
```

- 普通 HIGH 接受请求不能绕过三问；空答案整包拒绝。Closure 组自身必须是独立 HIGH 单操作组。Proposal 可以携带其他可独立审阅的组，但在当前 Closure Commit 前必须将它们明确拒绝或拆成独立 Proposal，避免整份 Proposal 标记 APPLIED 后冻结未提交工作；“遗留转新对象”专用拆分闭环仍是后续 Gate。
- Review 仍然不是 Commit；接受后对象保持 `OPEN`。
- 同一 DONE 证据重放不得擦除已接受的三问；正文 hash/version 变化仍使现有 Proposal 原位修订并重置审阅。
- 最终提交继续使用现有 Proposal、Anchor、Application Command、Receipt 和 SemanticCommit 恢复机制；没有新表、第二写入路径或通用 Saga。
- Marker 路径重验 Block、active Anchor 和 Object version，并更新 Anchor 观察；侧栏与外部 Agent 路径只重验 Object version，不伪造 Graph 证据也不改写正文。
- 对象列表的 `关闭 MiniProject` 只创建或打开一个确定性 object-only Proposal；对象仍为 OPEN。外部 Agent 可经既有 `/proposals/submit` 提交相同机器形状，LLM 仍不能直接完成对象。
- 外部 `/proposals/submit`、Provider、Marker 与侧栏共用按 object_id 串行的 Closure 提交边界，并统一检查 OPEN/type/version/活跃意图；不同 proposal_id 的并发请求只能成功一个，一个 Proposal 也只能关闭一个 MiniProject。历史歧义会显式进入恢复状态而不是任意 `.find()`。

## UC-28 Agent 草拟与遗留承接

- `Agent 草拟三问` 调用专用 Local Service 端点；Provider 仍必须输出一份通过 V2 Validator 的完整 Proposal。Service 只提取已验证的 `payload.closure` 三问，丢弃模型的 scope、target、version、group 和 operation 选择，再通过 `reviseSameMachineIntent` 写回原 proposal_id。
- 草拟后 Proposal 仍为 `READY/PENDING`，对象仍为 `OPEN`，无 SemanticCommit；用户仍需编辑、确认 HIGH 组并独立最终提交。过期 updated_at、终结 Proposal、对象版本漂移、NO_PROPOSAL 或非唯一三问都是零正式写入失败。
- `将遗留转为新对象 Proposal` 要求用户新建并选中空 Block，可选 Task、MiniProject、Decision 或 Output。它生成另一份确定性、可重放的普通 Formalization Proposal，关闭 Proposal 不增加第二组，两者分开审阅/提交/Undo。目标 Block 非空时拒绝覆盖；不点击转移时，遗留仍只作为 Closure 说明保留。
- 这两项能力复用现有 Proposal 表、Validator、Review、Commit、Undo 和恢复路径；没有新表、新状态、第二权威或新的 Saga。

## SQLite 迁移

Schema v11 只放宽已有 `objects.closure_json` 的 CHECK，从“仅 `PROJECT + COMPLETED`”改为“`PROJECT` 或 `MINI_PROJECT`，且 Lifecycle 为 `COMPLETED` 或保留完成事实的 `ARCHIVED`”。v10→v11 必须先创建经校验的不覆盖快照，然后在单一事务中重建 `objects`、执行 foreign-key check 并追加 migration ledger。对象、Anchor 或外键有任何丢失时整体回滚。

## Gate

自动证据已覆盖 Marker、侧栏和外部 Agent 三种发起方式的 Domain/Application/Proposal Validator/Service/Client/Plugin 渲染，侧栏重复发起复用一个 Proposal 且零正式写入；还覆盖 SQLite v10→v11 恢复点迁移、迁移后关闭/归档保留、提交重放和错误输入零正式写入。Agent 草拟自动集成已证明同 proposal_id、模型机器 scope/target/version 丢弃、stale 拒绝、OPEN/PENDING 和零 SemanticCommit；遗留转移已通过四类对象、空 Block 保护、独立 Proposal 和 Validator 自动 Gate。2026-07-22 真实 `deepseek-v4-flash` 专用端点一次通过：1 attempt、3859 tokens、约 28.3 秒，返回三个 Closure 字段，Proposal 仍 READY、Object 仍 OPEN、SemanticCommit=0。此过程同时发现并修复通用 Client 3 秒早于 Provider 有界超时的真实问题：只为两个 Provider 端点使用 125 秒客户端上限，其他命令保持 3 秒。

同日 Logseq Desktop 集中 Gate 又真实通过 Agent loading/disabled、Service 中断后的 timeout/可重试、Flash 成功回填、人工编辑、HIGH accepted-not-applied、独立最终 Closure Commit、非空 Block 零写入拒绝、空 Block 独立 Proposal、正式 Commit、Undo 与 reload。真实 Graph 写入暴露并修复 Logseq read-after-write 延迟和连续 `id::`/正文 echo 竞态：只对仍等于精确旧 hash 的读取做最长 1 秒轮询，同 UUID 的插件写入 suppression 在既有 10 秒窗口内最多保存 4 个 hash，并在已排队/待恢复发送前再检查；任何其他 hash 立即解除 suppression。最终遗留 Task 只由 `proposal_commit` 建立为 v2，没有 `logseq-plugin` echo，Undo 恢复语义空 Block并删除对象；Pending/Recovery=0，Backup/Doctor PASS。证据见 `docs/runtime/V2_MINI_PROJECT_CLOSURE_DESKTOP_REPORT.md` 与 `docs/testing/deepseek-v4-uc28-desktop-2026-07-22.json`，UC-28 现标 Desktop PASS。
