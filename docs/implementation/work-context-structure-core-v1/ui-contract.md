# Work Context & Structure Core v1 — DSH 接口

沿用宿主认证 RPC。客户端调用 `rpc(method, payload, signal)`，宿主方法名为 `logseq-workbench/<method>`。读取和动作带当前原生 `sessionId`。切换 Session、焦点或卸载时取消请求，丢弃旧结果。WorkRef 表示导航身份，Session 是原生对话，Workspace 对应工作目录。来源权限仍由 Goal 3 的 Session、WorkRef、Graph、精确范围和活跃连接共同验证。

## Reader

`reader({sessionId})` → `{scope, workRef, capturedAt, sourceSetVersion, structureVersion, nodes}`。只读取授权范围的主来源。节点保持 Logseq 原始遍历顺序，使用 `parentUuid`、同级 `order` 和 `depth` 构建树。页面来源顶层节点的父级为 `scope.rootUuid`。块范围首块的父级可能在授权范围外。

```js
{
  sourceId: '["logseq","ProjectGraph:/graph","block-2"]',
  blockUuid: 'block-2',
  target: { kind: 'logseq-block', graphId: 'ProjectGraph:/graph', blockUuid: 'block-2' },
  parentUuid: 'block-1', order: 0, depth: 1,
  availability: 'available', contentVersion: '<source SHA-256>',
  logseqUrl: 'logseq://graph/ProjectGraph?block-id=block-2',
  body: {
    markdown: '**到货**，见 [[验收]]',
    status: 'TODO',
    semantic: { kind: 'pending', label: '待确认' },
    properties: [{ name: 'owner', value: '运维组' }],
    tokens: [/* Marked lexer tokens, including inline logseqPage */]
  }
}
```

`body.markdown` 保留 Markdown 正文。Marked tokens 可消费段落、强调、链接、列表、代码等。页面引用有 `{type:'logseqPage', raw:'[[验收]]', page:'验收'}` token。将来源文本、HTML tokens 和链接作为不可信数据处理。行首状态独立返回。语义标签为 `note`、`conclusion`、`pending`、`risk`，分别对应注、结论、待确认、风险。未知标签保留在 Markdown 中。顶层用户属性独立返回，`id::` 隐藏，代码内原样保留。缺失或不可用节点保留位置，版本可为空。

## 引用与原生草稿

`reader-references({sessionId, selections})` 验证当前授权、来源和版本。每个选择为 `{sourceId, contentVersion, range?}`，省略 range 引用整块。文本选择以 `body.markdown` 的 UTF-16 偏移 `{start,end}` 表示，结束位置不包含在内。前端需将渲染文本选区映射到源 Markdown 偏移。结果按选择顺序返回，每条含 `sourceId, blockUuid, graphId, workRef, contentVersion, logseqUrl, range, excerpt`。版本失效返回 `REFERENCE_SOURCE_CHANGED`，超出授权范围返回 `SOURCE_OUTSIDE_SCOPE`。

在 UI 暂存选择。可使用 `reader-draft.mjs` 的 `changeReaderSelection(items, action, index, value)` 添加、移除、移动。验证结果到达后，确认当前 Session 和选择仍一致，再调用 `insertReaderReferences(inputActions, references)`。它通过原生输入动作在当前选区末尾插入带来源的引用，保留已有选区文本和草稿。草稿中已插入的引用可用原生输入编辑。动作不发送消息。

## 当前工作结构与历史

`currentStructure({sessionId, focusUuid?})` 每次读取保存后的当前 Logseq 来源。返回 `{scope, workRef, sourceSetVersion, structureVersion, capturedAt, path, root, children, content}`。省略焦点返回工作根。点击子工作传它的 UUID，仍使用原 Session 和原读取范围。切换视图可共享同一结果。

- `path` 从授权范围根到焦点，`root` 是焦点详情。类型为 `PROJECT`、`MINI_PROJECT`、`TASK`、`PAGE`、`WORK`。正式对象使用 Kernel 身份，事务和范围内的任务状态块也可成节点。
- `children` 只包含直接下一级工作对象。普通中间块隐藏，`parentUuid` 是工作父节点，`sourceParentUuid` 是实际 Logseq 父块。
- `root.body` 是当前对象正文详情。存在子工作时 `content` 为空，否则返回叶子内的 Reader 节点（含根块，省略 tokens）。节点含状态、版本和打开原文的定位。焦点被删除或不再是工作对象时返回 `STRUCTURE_FOCUS_MISSING`，可退回父焦点或工作根。
- `current-structure-client.mjs` 提供 `observeCurrentStructure(rpc, {sessionId, focusUuid}, onEvent)`。挂载时立即读取，默认每 5 秒定向刷新。事件为 `currentStructure.changed` / `currentStructure.unavailable`。收到 Logseq 写回成功后调用返回对象的 `refresh()`。换工作、焦点或卸载时调用 `dispose()`。未保存草稿不进入当前结构。
- 历史仍使用 `history-list`、`history-read`、`history-diff` 和 `history-source`。当前结构读取不生成历史记录。Logseq 结构和 Git 变更仍分别读取。

## 连接恢复

`connection({sessionId})` 返回 `{state, action, workRef, directory}`，探测时不创建 Workspace 或授予权限。重试同一动作，回到 `connected` 后重新读取 Reader、结构和材料。Logseq 仍持有原只读授权时会自动用新连接身份恢复精确范围。Logseq 重启或本地授权已撤销时需在 Logseq 重新确认。

| state | action |
| --- | --- |
| connected / unassociated | null |
| waiting_for_logseq | open_logseq_and_retry |
| companion_unavailable | start_companion_and_retry |
| directory_moved | locate_work_directory |
| source_mismatch | check_graph_in_logseq |
| read_confirmation_required | confirm_read_in_logseq |

## Planner 与导航

`planner-read({sessionId})` 和带 revision 的 `planner-change` 沿用现有接口。灵活安排有 `schedule:'flexible', date, slotId`。固定安排有 `schedule:'fixed', startAt, endAt`，使用本地 `YYYY-MM-DDTHH:mm`，开始早于结束，可以跨日。固定安排的 `date` 由开始时间推导，`slotId:null`。固定时间使用 `action:'save'` 编辑。普通 move / reorder 返回 `PLANNER_FIXED_EDIT_REQUIRED`。截止时间和计划、实际投入各自保存。旧 v1、v2 JSON 的条目继续视为灵活安排。

`planner-current({sessionId, localAt:'2026-11-07T14:30'})` → `{localAt, slot, fixed}`。以用户本地墙钟计算，区间含开始、排除结束。无语义匹配为 `slot:null`，多个重叠时段取配置中的第一个。正在进行的固定安排全部返回。

`planner-navigate({sessionId, id, action:'logseq'})` 返回保存引用的 `{workRef, logseqUrl}`。用宿主原文打开动作。 `action:'continue'` 另带操作 UUID `operationId`，返回 `{sessionId, bound, workRef, logseqUrl}`，复用发现入口和最近有效 Session，之后由原生宿主打开并标记 `opened`。新引用保存经授权读取核对，旧引用依其已有 Graph/块或 Kernel ID 导航。

Logseq 的「在 DSH 继续」优先让已打开且能响应的 DSH 页面接收票据。无法接收时通过系统打开票据 URL。浏览器控制标签页激活及后台计时，跨应用没有强制置顶保证。显式「在新标签页打开 DSH」直接交给系统，仍走继续工作的 Session 选择规则。DSH 内的 `newWork` 创建原生空白 Session，继续保留 WorkRef。
