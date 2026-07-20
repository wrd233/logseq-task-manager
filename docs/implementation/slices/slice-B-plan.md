# Slice B：显式对象同步实施计划

> 状态：IN PROGRESS。本文只拆解 V2 §62 与 E2E-01..06、19，不把自动证据冒充 Desktop Gate。

## 目标与边界

Slice B 把用户在 Logseq 中明确写出的对象语义同步到 SQLite。同步只读取发生变化的 Block、必要父级和有限子树；不做全 Graph 自动扫描、不调用 LLM、不猜自然语言、不改变 Primary Ownership。

自动 Parser 只接受规范冻结的四种核心表达：

```text
[任务]
[MiniProject] / #MiniProject
[决策]
[成果]
```

Area 通过受控领域入口创建，Project 必须与 `Project/<名称>` 页面原子创建；二者没有获得未定义的文本前缀。六类对象仍由 Domain 封顶，但不等于六类都由 Block Parser 自动物化。

## 实施序列

| 阶段 | 交付 | 关键失败路径 | 自动证据 | Runtime 证据 |
|---|---|---|---|---|
| B0 | 纯显式语法 Parser（完成） | 空标题、冲突标识、未定义别名、裸 TODO | `explicit-object-parser.test.ts` | 无 |
| B1 | Block event + 防抖 + 有限子树读取（事件主链完成） | Service 不可用、事件重复、事件乱序 | fake clock、会话恢复队列与事件注册已通过；有限子树 fixture 待补 | Desktop 编辑/快速重复编辑 |
| B2 | materialize / update Application Command（后端完成） | 重复创建、旧版本、类型变化 | Object+Anchor+Audit+Receipt 单事务、同类型同步、Service 路由与类型迁移拒绝已通过 | 创建、改标题、reload 待 Desktop |
| B3 | Marker 同步 | DONE/CANCELED 不静默改错对象；Condition 独立 | Marker matrix | Logseq Marker 实际形态 |
| B4 | move / copy / delete / consistency（已知 Anchor 恢复、状态持久化、move/copy 与 rebind 合同/交互自动证据完成） | UUID 复制不继承 ID；删除保留对象；rebind 必须独立确认 | READY 恢复及低频有界检查、原子观察、失败重试、move/copy 身份合同与显式 rebind Domain/Application/SQLite/Service/Client/Plugin 已通过；Plugin 面板只读选中 Block 与一页已知 Anchor，确认后重读防 stale | 跨页移动、复制、删除、rebind |
| B5 | Project 页面原子创建 | 页面成功而 Store 失败及反向失败 | fault injection + compensation | 新 Project 页面/reload |

## B0 已建立的契约

- `[任务] 标题` 与 `[任务] TODO 标题` 都解析为 Task；Marker 只作为执行表达返回，不决定身份；
- 裸 `TODO/NOW/DOING/DONE/CANCELED` 不物化对象，因此正式对象下的内部 TODO 不获得 object_id；
- `[MiniProject]` 与规范唯一别名 `#MiniProject` 等价；
- `[决策]`、`[成果]` 只产生候选，后续仍必须经过 Application 不变量和单一 Service 写入；
- 同块出现不同正式类型返回结构异常；空标题拒绝；
- 标识必须位于正文开头且大小写精确；自然语言提及、`[Area]`、`[Project]` 等未定义表达不被猜测。

## Gate 纪律

- Parser 不生成 object_id，不写 Graph/SQLite，不触发模型；
- Plugin 不直写 Store；正式变化统一进入 Local Service/Application Command；
- 重复事件以 Graph ID + Block UUID + 规范化输入版本构造幂等边界；
- 类型变化必须形成 Proposal，不在同步路径静默迁移；
- Service 故障不阻塞 Logseq 正文保存，只记录待恢复的一致性状态；
- 断线队列只保存会话内最新同步意图，不持久化正文或领域状态；Plugin reload 后依靠 B4 低频一致性检查补漏，禁止用 FileStorage 建第二权威；
- E2E-01..06、19 只有补齐独立测试 Graph 的 Desktop 证据后才可标记 `DONE`。

## 当前自动证据

- `ExplicitObjectChangeDebouncer` 按 Block UUID 合并短时间事件，只交付最新正文与纯 Parser 结果；无效 runtime shape 忽略，投递失败进入显式错误回调，dispose 后不迟到提交；
- `materializeExplicitObject` 只允许四类 Parser 对象，expected version 固定为 0；创建 Object 与 Primary Anchor 作为一条 Application Command；
- SQLite 将 Object、Primary Anchor、Audit、Receipt 放在一个事务中；已绑定外部 Block 的第二次物化整笔回滚；
- Local Service `/objects/materialize` 不接受 Graph ID、数据库路径、object_id、anchor_id 或 actor，Service 自行注入当前 Graph 和固定 actor；
- Local Service `/objects/synchronize` 对未绑定 Block 执行首次物化，对已绑定同类型 Block 原子更新标题和 Anchor 证据；类型变化只返回 Proposal-required，不静默迁移；
- Service 以自身 Graph ID、Block UUID 和 Logseq `updated-at` 观察版本计算 SHA-256 幂等键；客户端不能选择跨 Graph 的领域幂等边界。类型变化是 terminal 审阅冲突，不暂停健康 transport 或循环重试；
- Plugin `DB.onChanged` 已接入同一 Parser/防抖/Service Client；Service 能力不足时不交付正式写入，恢复 READY 后重试会话内最新意图；队列容量、交付失败、Parser 冲突和 dispose 均有自动失败路径；
- V2 descriptor 启用时旧 V1 FileStorage/Application 写路径不初始化，Plugin UI 写命令保持受限；不存在为了接入事件同步而激活的 V1/V2 双写；
- Service 分页列出当前 Graph 未被替换的 Primary Anchor；Plugin 恢复 READY 时及其后每 5 分钟最多逐 UUID 检查 256 项，以游标逐轮收敛，hash 变化走统一同步，缺失/Marker 移除/形态冲突通过 Application Command 原子持久化为 `missing/conflict`，Object 始终保留；同 UUID 恢复合法语法可回到 `active`，`replaced` 不会被复活；
- Anchor 观察由 Service 注入 Graph、actor、expected version 和幂等边界，Object version、Anchor、Audit、Receipt 同事务写入；重复同状态无写入，失败显式报告并下轮重试；
- 同 UUID 同步保持 object_id/anchor_id 且不改 Primary Ownership；相同文本的新 UUID 经 Service 物化为新 object_id/anchor_id，不从原 Block 继承身份；
- rebind 后端安全合同已完成：Application 强制精确高影响确认，Service 不接受 Graph/object/anchor identity 权限，SQLite 在一个事务中保留旧 `replaced` Anchor、建立唯一新 active Anchor、推进对象版本并写 Audit/Receipt；类型变化、已占用目标、旧版本和未确认都零写入，成功重试幂等；触发器在旧 Anchor 已更新后注入新 Anchor 插入失败，证明 Object/双 Anchor/Audit/Receipt 整笔回滚；
- Plugin rebind 有界交互已完成自动证据：只在 Service READY/formalWrites 时出现，只采集当前选中的显式 Block、一页 Anchor 和 Service 对象投影，只列同类型候选；明示旧/新影响、需勾选确认，提交前重读新 Block UUID/version/hash/type/title，Service/Application/SQLite 原子校验预览 Object version 和旧 Anchor status/hash；预览不能跨 Service discovery generation，已提交请求不提供假取消，且 V2 恢复动作不会激活冻结的 V1 runtime；
- 尚未完成有限子树、Marker，以及退出期间全新未绑定标识的受控候选发现；move/copy/rebind 仍需真实 Desktop 证据，因此完整 B1/B2/B4 Gate 与 E2E Desktop 仍未完成。
