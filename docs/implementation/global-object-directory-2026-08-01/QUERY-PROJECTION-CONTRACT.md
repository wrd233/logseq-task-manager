# 全局目录查询投影合同（QUERY-PROJECTION-CONTRACT）

> 只读投影，不是新的领域对象；不写入 SQLite/Graph，不改变 version/Lifecycle/Condition/Focus。

## 1. 输入（全部来自 Local Service 只读查询）

| 输入 | 来源 | 说明 |
|---|---|---|
| objects | `GET /objects`（`listObjects()`） | 全量正式对象 |
| anchors | `GET /primary-anchors`（分页遍历） | Primary Anchor 摘要（active/missing/conflict/replaced） |
| ownerships | `GET /primary-ownerships` | 主归属 |
| focusSelections | `GET /focus`（Sprint C 新增只读端点） | 正式 FocusSelection（含非 OPEN 残留，展示层按合同处理） |
| nowWork | `GET /now-work` | Now 查询投影（focus/next/waitingReview） |

## 2. 条目形状

```ts
interface GlobalObjectDirectoryEntry {
  object: V2ManagedObject;
  primaryAnchor?: { externalId: string; status: "active" | "missing" | "conflict" | "replaced" };
  ownership?: { ownerObjectId: string; ownerText: string };
  focus: { selected: boolean; rank?: number };
  now: { inNow: boolean; section?: "focus" | "next" | "waitingReview"; reason?: string };
  lifecycleDisplay: "进行中" | "已完成" | "已取消" | "已归档";
  conditionDisplay?: "可以行动" | "等待中" | "受阻" | "已暂停"; // 仅 OPEN
  dueSummary?: string;      // 用户语言；无期限不显示
  updatedSummary: string;   // 用户语言相对/本地时间
  availableActions: DirectoryAction[];
}
```

## 3. 显示合同

- **Lifecycle ≠ Condition ≠ Focus ≠ Now**，四轴各自独立表达；
- 非 OPEN 默认不显示 Condition；若技术详情保留最后 Condition，必须标注“历史信息”；
- “在 Now”只来自 `/now-work` 投影：focus → “当前关注”分区；next → “接下来”；
  waitingReview → “需要回看/保持等待”；不写回正式对象；
- “当前关注”筛选使用正式 FocusSelection（`GET /focus`），不根据 Now 标签推断；
- 加入/移出关注只对 OPEN 对象可用（沿用 Application 合同：关闭对象拒绝加入）；
  关闭对象若残留 focus selection，在目录中显示“历史关注”或隐藏，由 Sprint C 决策并测试；
- 打开原文只使用 Primary Anchor（active 优先）+ Durable Origin；无 Anchor 或来源失效时
  显示诚实 fallback，不按标题模糊跳转；
- 排序默认“最近更新”；缺失值（无期限/无 Anchor）排后且稳定；
- 筛选条件与结果数量始终可见；可一键清除；
- 搜索只作用于标题（第一版），防抖 250ms，中文/英文/大小写/特殊字符可测，不替代 Logseq 搜索；
- 空结果中性说明；加载中与失败有 scoped state，不写全局 banner。

## 4. 可用动作（按类型 × Lifecycle 动态提供）

| 对象状态 | 动作 |
|---|---|
| 所有 | 打开原文（有 active Anchor）；加入/移出关注（OPEN 才可加入）；查看详情 |
| OPEN | 更新 Condition；取消（TASK/MINI_PROJECT/PROJECT）；完成小项目；梳理小项目；升级为项目；调整项目；编辑领域；设置期限（TASK，如现有链允许） |
| COMPLETED / CANCELLED | 重开；归档（领域合同已支持时）；查看 Closure |
| ARCHIVED | 查看详情；打开原文；恢复按领域规则（无恢复命令则明确不可用） |

所有正式写入仍走 Proposal → Review → revalidate → Commit → Undo 安全链；
目录 UI 不直接调用 Store。

## 5. 性能预算

- 50/100/500 对象：首渲染与搜索/筛选/排序响应 ≤ 可感知阈值（记录时间）；
- 默认列表 DOM 行数 = 结果行数，不复制冗余嵌套；
- 打开原文每次至多 1 次 Anchor 解析；不预加载全部 Worksite Preview。
