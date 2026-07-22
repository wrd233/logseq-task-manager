# V2 Marker-Driven MiniProject Closure 合同

> 状态：`MARKER_DRIVEN_AUTOMATED_PASS / DESKTOP_PENDING / UC28_PARTIAL`

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
Logseq DONE evidence
→ one READY HIGH Proposal with three unresolved questions
→ human enters all three answers and accepts the group
→ Proposal stores the single reviewed machine representation
→ independent final confirmation and Object/Anchor/Graph revalidation
→ existing one-step Domain SemanticCommit
→ Object closure_json + COMPLETED + Anchor + Audit + Receipt atomically
```

- 普通 HIGH 接受请求不能绕过三问；空答案整包拒绝。Closure 组自身必须是独立 HIGH 单操作组，但 Proposal 可以保留其他可独立审阅的组。
- Review 仍然不是 Commit；接受后对象保持 `OPEN`。
- 同一 DONE 证据重放不得擦除已接受的三问；正文 hash/version 变化仍使现有 Proposal 原位修订并重置审阅。
- 最终提交继续使用现有 Proposal、Anchor、Application Command、Receipt 和 SemanticCommit 恢复机制；没有新表、第二写入路径或通用 Saga。

## SQLite 迁移

Schema v11 只放宽已有 `objects.closure_json` 的 CHECK，从“仅 `PROJECT + COMPLETED`”改为“`PROJECT` 或 `MINI_PROJECT`，且 Lifecycle 为 `COMPLETED` 或保留完成事实的 `ARCHIVED`”。v10→v11 必须先创建经校验的不覆盖快照，然后在单一事务中重建 `objects`、执行 foreign-key check 并追加 migration ledger。对象、Anchor 或外键有任何丢失时整体回滚。

## Gate

自动证据已覆盖 Marker DONE 路径的 Domain/Application/Proposal Validator/Service/Client/Plugin 渲染、SQLite v10→v11 恢复点迁移、迁移后关闭/归档保留、重放和错误输入零正式写入。仍需在 Logseq Desktop 批量验证三问表单、接受但未生效、最终确认、reload 读回和故障恢复。UC-28 的侧栏/外部 Agent 发起、Agent 草拟三问与“把遗留转为新对象”仍属后续 Proposal 用户闭环，当前只保存人工审阅的遗留说明；不将本轮自动合同冒充完整 UC-28。
