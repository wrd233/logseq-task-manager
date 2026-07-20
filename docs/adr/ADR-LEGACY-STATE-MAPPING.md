# ADR：旧 Phase / Signal 的可审阅状态迁移

- 状态：accepted
- 日期：2026-07-20
- 关闭决定：OD-003
- 影响规则：D-055、D-064..067、D-148、D-208、D-220；V2 §22

## 背景

V1 的 Phase 同时表达生命周期和推进阶段，Signal 同时包含计算事实与注意力提示；V2 只保留 Lifecycle、Condition 和 Focus。字段改名或机械一对一映射会制造伪语义并丢失自然语言上下文。

## 决定

迁移器为每个对象生成可审阅记录：旧值、建议的新 Lifecycle / Condition / Focus、确定性证据、理由、信息损失、候选级别和回滚引用。

- 明确完成、取消、归档证据映射到 Lifecycle；
- 等待、阻塞、暂停及其必需详情映射到 Condition；
- 仅表示当前关注且仍有效的证据才建议 Focus；
- READY、ACTIVE、DEFINING、PLANNED、CLOSING 等推进含义默认保留为历史/自然语言证据，不伪造新的状态轴；
- OVERDUE、REVIEW_DUE、STALE、NO_NEXT_ACTION、UNASSIGNED、CONFLICT 作为可计算事实或迁移问题，不写成持久 Signal；
- 证据不足、冲突或信息损失明显时生成迁移候选，禁止自动切换。

迁移后不得隐藏保留 Phase/Signal 作为第二权威。Legacy 原值只存在于只读迁移证据、报告和历史事件中。

## 回滚与审阅

每条映射引用源恢复包 checksum 和批次；用户可逐项接受、调整、保持候选或撤销批次。调整的是 V2 目标语义，不回写 V1 源数据。

## 验收

- 映射 fixture 覆盖全部旧 Phase/Condition/Signal 组合；
- 不确定项不会自动写 V2；
- 映射报告能说明信息损失；
- 回滚后 V2 无残留状态，源恢复包不变；
- V2 Domain 不包含 Phase 或 Signal 当前字段。
