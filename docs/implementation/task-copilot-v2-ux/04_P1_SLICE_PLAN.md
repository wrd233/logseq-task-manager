# P1 Slice 计划：注意力信号、状态翻译与重入

## 进入条件

只有 P0 已完成并有真实 Desktop 验收，才允许把信号展示给用户。P1 的第一阶段始终是影子模式。

## P1-A：Attention Signal 纯模型与影子存储

状态：`NOT_STARTED`

最小内部字段：

- signal type；
- object id；
- source facts / source event；
- first detected / last confirmed；
- urgency / certainty / context relevance；
- proposed display level / surface；
- invalidation；
- merge target；
- cooldown；
- shown count / user disposition；
- rule / Skill / Prompt / model version；
- evidence scope。

硬边界：

- Signal 不是正式对象，不改变 Lifecycle/Condition/Focus/Ownership；
- 用户不维护 Signal；
- 默认不保存完整正文；
- 可重算、可失效、可清理；
- PENDING、RECOVERY_REQUIRED、Graph mismatch 不允许冷却；
- LLM 不能单独把信号升级为强提醒。

## P1-B：确定性 detector、合并与失效

状态：`NOT_STARTED`

开放顺序：

1. reviewAt due；
2. due；
3. accepted-not-applied；
4. PENDING / RECOVERY_REQUIRED；
5. Anchor missing/conflict；
6. blocker 变化；
7. WAITING 过久；
8. Project 静默；
9. LLM 跨对象。

同一对象的主问题优先级：

```text
数据/恢复风险
> 已确认未完成
> blocker 变化
> reviewAt
> due
> 等待过久
> 建议关注
> Project 静默
```

测试必须覆盖合并、自动失效、用户处置、冷却、新事实解除冷却和一对象一主问题。

## P1-C：“现在”动态编排

状态：`NOT_STARTED`

稳定骨架：

- 继续处理；
- 需要回看；
- 保持等待。

Copilot 建议关注只有达到质量门槛时动态插入。普通 OPEN、普通 Waiting、全部 Project 不进入首页。

指标：

- 原始信号数；
- 合并候选数；
- 实际显现数；
- 忽略/不准确/重复；
- 下一动作拒绝率；
- 每屏信息量；
- 用户找到正文和停留点的时间。

## P1-D：状态翻译层

状态：`NOT_STARTED`

Application/ViewModel 契约：

```text
conclusion
keyEvidence[]
facts[]
inferences[]
unknowns[]
nextActionEligible
nextAction?
evidenceScope
source
```

前台：

> **主结论**（最多一到两个关键依据）

详情再显示完整证据。确定性模板优先，LLM 只能在不改变事实的情况下起草或压缩表达。

下一动作资格至少要求：信号强、上下文充分、动作具体、不依赖猜测、与对象直接相关、当前场景适合且减少判断成本。

## P1-E：Block 轻标记原型

状态：`NOT_STARTED`

候选：

- 左侧细线；
- 圆点；
- 小图标；
- 极淡底色；
- 正文末尾短语。

原型 Gate：

- Light/Dark；
- TODO/DOING/DONE；
- 编辑态和光标；
- 长文本；
- 连续 Block；
- 父子；
- Query；
- 引用；
- Linked References；
- 右侧栏；
- Zoom；
- 100 个正式 Block；
- renderer reload；
- Plugin 关闭后正文干净；
- 性能预算。

原型验证前不全局上线。

## P1-F：Project/Task 重入

状态：`NOT_STARTED`

Project 顶部条只组合 schema v12、Condition、Focus、Anchor、最近 Audit 与未完成 Commit；不建立第二摘要权威。

上下文充分：

> **项目｜当前停留点**（关键边界）

上下文不足：

> **当前进入点不明确**（最近一次正式变化时间）

Task 不建立强制 current interface。依次使用正式状态、当前正文、父 Block、Condition、所属 Project 和最近变化；不足时只打开原文。

## P1-G：LLM 叙述与上下文恢复 Skill

状态：`NOT_STARTED`

统一结构化输出至少包含：

- facts；
- inferences；
- unknowns；
- summary；
- evidenceScope；
- suggestedChanges；
- nextActionEligible / nextAction；
- riskLevel；
- requiresDiscussion / requiresReview；
- provenance；
- skill/prompt/model version。

Service 必须机器覆盖 provenance、model id/version、时间和 scope hash。输出只可进入缓存/Proposal，不直接成为正式事实。

## P1-H：交互日志与版本

状态：`NOT_STARTED`

默认仅记录：

- scene/object type；
- signal/Skill/version；
- evidence scope 的结构化摘要；
- user disposition；
- Commit/Undo/stale/conflict；
- elapsed time。

禁止：

- API Key；
- Authorization；
- 全键盘输入；
- 全 Graph；
- 默认完整正文；
- 无期限 raw request/response。

Prompt/Skill 演化仍必须走证据 → 候选 → 人工审阅 → 测试 → 版本 → 可回退。
