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
| B0 | 纯显式语法 Parser | 空标题、冲突标识、未定义别名、裸 TODO | `explicit-object-parser.test.ts` | 无 |
| B1 | Block event + 防抖 + 有限子树读取 | Service 不可用、事件重复、事件乱序 | fake Graph fixture + clock | Desktop 编辑/快速重复编辑 |
| B2 | materialize / update Application Command | 重复创建、旧版本、类型变化 | SQLite 事务/幂等/冲突测试 | 创建、改标题、reload |
| B3 | Marker 同步 | DONE/CANCELED 不静默改错对象；Condition 独立 | Marker matrix | Logseq Marker 实际形态 |
| B4 | move / copy / delete / consistency | UUID 复制不继承 ID；删除保留对象 | Graph fixture + restart | 跨页移动、复制、删除 |
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
- E2E-01..06、19 只有补齐独立测试 Graph 的 Desktop 证据后才可标记 `DONE`。
