# Personal Inbox v1 — UI 契约

本功能使用全新 Personal Data Store；不调用旧 Capture Inbox。
Codex 负责此契约、存储和宿主 API，DSH 负责页面。入口使用已有认证 RPC：
`rpc('inbox-…', payload)`，宿主返回已有 `{ok,value}` / `{ok:false,error:{code,message}}` 封装。
所有记录 API **不需要 sessionId、Work、Graph 或 Profile**。仅来源读取和工作导航需要处理现场。

## InboxItem

```ts
type InboxItem = {
  schemaVersion: 1; id: string; revision: number;
  originalContent: string; // 创建时的原文，始终保留
  editedContent: string | null; // 用户明确编辑的显示文本；不覆盖原文
  context: string; // 后续补充背景
  source: null | {
    type: 'manual'|'flomo'|'logseq'|'dsh'|'browser'|'other';
    locator?: string; sessionId?: string;
    graphId?: string; blockUuid?: string; pageName?: string; contentVersion?: string;
  };
  materials: Array<{label: string; locator: string}>; // 外部文件、网页或讨论链接，不复制附件
  workRef: WorkRef | null; // 复用 contracts，单一主要关联
  status: 'open'|'waiting'|'resolved'|'archived';
  archivedFrom: 'open'|'waiting'|'resolved'|null;
  createdAt: string; updatedAt: string;
  outcomes: Array<{kind:'work'|'planner'|'formal-task'; operationId:string;
    inboxId:string; createdAt:string; reference:object}>;
};
```

`originalContent` 永不由编辑接口改写。用户编辑保存到 `editedContent`；详情允许查看原文。
UI 投影额外提供 `content`（editedContent ?? originalContent）、`preview`、
`stage`（有 context/materials/workRef 时 developing，否则 new）、`canUndo`。
Session 仅是来源信息。不要用当前会话/Work 筛掉全部记录。

## CRUD、浏览与检索

- `inbox-create {id, originalContent, source?}`：id 为客户端生成的 UUID，同一 id、同一内容重试返回同一记录。只输入一句话即可保存；不必填写其他项。
- `inbox-list {query?, sourceType?, status?, workRef?, linked?}`：返回 `{items,problems}`，最近更新在前；默认排除 archived，status='all' 包含全部。全文搜索原文、编辑文本、背景、材料、来源定位。
- `inbox-get {id}`：完整详情投影。
- `inbox-update {id, revision, patch}`：patch 允许 context、materials、workRef、status。status 只允许 open/waiting/resolved；关联和背景更新不自动改状态。
- `inbox-edit {id, revision, content, confirmed:true}`：仅 UI 的明确用户操作；不注册模型工具。
- `inbox-archive {id, revision}`：软删除，保留原状态及结果。
- `inbox-restore {id, revision}`：恢复 archivedFrom。
- `inbox-undo {id, revision}`：撤销最近一次编辑、补充、状态或关联操作；转化结果不可由此删除。
- `inbox-export {}`：返回 `{schemaVersion:1, exportedAt, items}`，包含归档记录和原文。UI 下载 JSON。
- `inbox-import {backup}`：仅补入不存在的记录；相同记录跳过，ID 冲突不覆盖并返回 conflicts，损坏数据不会替换现有文件。用于备份恢复。

保存成功后再清空输入；失败保留草稿；INBOX_CONFLICT 时重读并保留用户未保存内容。
禁止永久删除；“删除”使用归档，并提供恢复和撤销。无复杂历史系统。

## 来源

手动粘贴默认无需来源分类；可显式选 flomo，或使用 browser + locator 保存 URL。
`inbox-import-logseq {id, sessionId, sourceId}` 从现有授权 source.read 获取原文及真实 graphId/blockUuid/contentVersion，不信任 UI 传来的身份。
离线粘贴也可保存，但不要把未验证的定位显示为已核实的 Logseq 导入。
来源失效不影响已保存文本。材料仅保存引用，移动或删除外部文件不会删除原文。

## Work

现有 `catalog {}` 提供离线目录；workRef 复用已有 WorkRef，不能按标题猜身份。
用 inbox-update 设置/修改 workRef 或传 null 解除；不会创建任务或复制 Work。
`inbox-open-work {id, operationId}` 通过既有导航进入关联 Work。
`inbox-convert {id, revision, operationId, kind:'work', confirmed:true, ...}` 发展为 Work：见下文的完整出口参数。

## 转化

所有出口必须是明确用户按钮和确认；不注册 Agent 自动转化工具。
相同 operationId 重试相同参数。宿主先保存转化意图，再调用目标模块，最后保存结果。
确认成功后按 `resolve:true` 标记 resolved；默认保持状态。原文、背景和原记录始终保留。
结果 reference 和 inboxId 提供双向追溯。结果未明时保留 operationId 重试，不生成新 ID。

- Planner：`inbox-convert {id,revision,operationId,kind:'planner',confirmed:true,resolve?,parameters:{entry}}`；entry 遵循现有 Planner（title/date/slotId 或 fixed startAt/endAt 等），使用 PlannerStore 接口；UI 先读 `inbox-options {}` 取得 slots 与能力。
- Formal Task：必须走现有 Kernel 用户确认通道和来源锚点规则；不可直接写库。无有效锚点时显示具体限制，保持 Inbox 原状态。完整参数见下文。
- Work：复用既有导航；不构造新的通用工作数据库。

## UI 边界

单页快速输入 + 简单列表/详情即可。默认展示 open/waiting/resolved，归档独立入口。
Resolved 表示已决定如何处理；Archived 表示从默认列表隐藏，两者不等同。
不要强制标题、分类、日期、优先级或 Work。保存按钮只依赖非空文字。
不要把服务端文件路径、令牌或配置值带入模型上下文。

## 已实现的出口参数与引用

Work 出口完整参数：

```js
rpc('inbox-convert', {
  id, revision, operationId, kind: 'work', confirmed: true,
  parameters: { workRef, title } // 可省略 workRef，使用现有关联或已导入的真实 Logseq 块
})
```

纯手动文本暂不自动创建 Logseq 块；没有关联或来源锚点时返回 INBOX_WORK_SOURCE_REQUIRED。
可先选现有 Work 关联，再进入工作；或先在 Logseq 创建自然来源后明确选择它。
不会使用合成 graphId/UUID 假装已经创建 Work。

Planner 参数是 `parameters:{entry}`（而非顶层 entry）：

```js
rpc('inbox-convert', {
  id, revision, operationId, kind: 'planner', confirmed: true, resolve: true,
  parameters: { entry: {title:'整理材料', date:'2026-11-08', slotId:'slot-evening'} }
})
```

entry 仅接受 title/schedule/date/slotId/startAt/endAt/dueAt/plannedMinutes/actualMinutes。
无需 Work 或在线 Logseq。目标 entry 保存 inboxRef:{inboxId,operationId}，outcome.reference 为 {entryId}。
既有 planner-read 仍需要当前 sessionId；inbox-options 本身不需要 Session。

Formal Task 参数：

```js
rpc('inbox-convert', {
  id, revision, operationId, kind:'formal-task', confirmed:true, resolve:true,
  parameters:{title:'联系厂商', anchor:{graphId, blockUuid}}
})
```

anchor 可省略，使用 Inbox 的 Logseq 来源。原始块必须存在、当前 Kernel 的 Graph Broker 必须连到对应图。
纯文本记录须先由用户选择/建立合法来源块，不自动写入 Graph。
宿主使用 Plugin USER-channel 令牌；令牌不返回页面。现用 Kernel 也需要部署本分支服务更新。
outcome.reference 含 workRef（kernel）、commitId、graphId、blockUuid、logseqUrl；正式提交与 Graph 投影交付沿用既有 Kernel 机制。

## 转化重试与错误

完整详情的 `pendingConversion` 为 null 或 `{operationId,kind,parameters,resolve}`。
丢失响应或重启后，使用它和当前 id/revision/confirmed:true 再次调用 inbox-convert。
请保留 parameters 原值；不要生成新的 operationId。转化结果未明期间该条记录只读，其他记录仍可捕获。
已完成结果按 operationId 幂等；恢复备份后也不会因重复相同结果请求重新创建目标。

关键错误：

| code | UI 行为 |
| --- | --- |
| INBOX_CONFLICT | 重读详情，保留未保存输入；让用户决定如何再保存 |
| INBOX_BUSY | 保留输入，稍后重试同一请求 |
| INBOX_ID_REUSED / INBOX_OPERATION_REUSED | 不覆盖；检查重复使用的请求 ID 与参数 |
| INBOX_CONFIRM_REQUIRED | 等待明确用户点击确认 |
| INBOX_CONVERSION_PENDING | 展示 pendingConversion 的重试动作 |
| INBOX_WORK_SOURCE_REQUIRED | 先选择已有 Work 或建立自然来源 |
| INBOX_FORMAL_ANCHOR_REQUIRED | 先选择合法来源块 |
| INBOX_KERNEL_UNAVAILABLE / INBOX_KERNEL_USER_CHANNEL_REQUIRED | 检查现有 Kernel/用户确认通道，Inbox 继续可用 |
| INBOX_SOURCE_UNAVAILABLE | Logseq 来源不可读，保留已有 Inbox 内容 |
| INBOX_CORRUPT / INBOX_BACKUP_INCOMPLETE | 报告不可读记录；不声称导出完整，不静默清空 |
| PLANNER_INVALID / PLANNER_CONFLICT | 校正日期/时段或刷新 Planner 后重试 |

## 放入当前讨论

UI 可从 `personal-inbox/reference.mjs` 导入 `insertInboxReference`：

```js
await insertInboxReference(inputActions, item, (reference, span) =>
  insertReference(currentSessionId, reference, span))
```

插入路径与既有 reader 原生引用一致；client.jsx 已注册 Personal Inbox codec。
只插入所选条目的 id/revision/原文/用户编辑/补充背景/来源/材料/WorkRef 快照；不读取会话消息。
保留已有草稿及附件，只在捕获的位置追加，不发送消息。引用可跨 Session 使用；快照不是实时最新内容，UI 显示版本。
