# V2 MiniProject Closure 合同

> 状态：`MARKER_SIDEBAR_EXTERNAL_AGENT_AUTOMATED_PASS / DESKTOP_PENDING / UC28_PARTIAL`

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

## SQLite 迁移

Schema v11 只放宽已有 `objects.closure_json` 的 CHECK，从“仅 `PROJECT + COMPLETED`”改为“`PROJECT` 或 `MINI_PROJECT`，且 Lifecycle 为 `COMPLETED` 或保留完成事实的 `ARCHIVED`”。v10→v11 必须先创建经校验的不覆盖快照，然后在单一事务中重建 `objects`、执行 foreign-key check 并追加 migration ledger。对象、Anchor 或外键有任何丢失时整体回滚。

## Gate

自动证据已覆盖 Marker、侧栏和外部 Agent 三种发起方式的 Domain/Application/Proposal Validator/Service/Client/Plugin 渲染，侧栏重复发起复用一个 Proposal 且零正式写入；还覆盖 SQLite v10→v11 恢复点迁移、迁移后关闭/归档保留、提交重放和错误输入零正式写入。侧栏 object-only 路径已在 Logseq Desktop 0.10.15 真实通过：READY 时对象仍 `OPEN + v2`，三问 HIGH 接受后仍 `OPEN + v2 + closure=null`，最终显式确认后才变为 `COMPLETED + v3`；Anchor hash 不变，reload 后三问和 APPLIED Proposal 可读，Backup 校验与 Doctor 均 PASS。证据见 `docs/runtime/V2_MINI_PROJECT_CLOSURE_DESKTOP_REPORT.md`。Marker/DONE 的新三问仍需真实 Block 事件验证 Block + active Anchor + Object 重验文案和行为；不用 object-only 证据代替。UC-28 的 Agent 草拟三问与“把遗留转为新对象”仍未完成，当前只保存人工审阅的遗留说明；不将自动合同或侧栏 Gate 冒充完整 UC-28。
