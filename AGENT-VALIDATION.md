# Agent 介入工作视图：实机验证

2026-09-09 · 在 `logseq-live-preview-spike` 原型上以 Agent 身份实际操作

**结论：Agent 可以真正介入这个原型，但只能通过一条很窄的通道。** 本轮把原型的本地 relay 命令通道从“只能定位”扩展成结构化视图接口（`query / layout / reorder / indent / focus / collapse / scope / locate`），然后由 Agent 自己读范围、改排列、定位原块、感知原文变化、提出带来源的建议。全部操作走真实链路，Logseq 原文文件在整轮会话后逐字节未变（3,282 个 Markdown 文件，0 改动）。

同时暴露出三个此前没有记录的接口缺陷和一批摩擦点，见 §4、§5。**这些缺陷不是“原型不行”，而是“当前接口还不足以让 Agent 安全使用”** —— 它们都能修，但必须修。

## 1. 环境与操作方式

- Graph：`logseq/`（实验文件型 Graph）。插件 `Block Live Preview 实验`（目录即本原型）。
- 通道：插件通过 `EventSource` 连接本地 relay（`127.0.0.1:8768`）的 `/view-ops` 流；Agent 用 `agent-client.mjs` POST 操作、回读结果。**Agent 没有调用任何 Logseq 写接口**，也没有 contenteditable/拖放路径。
- 本轮新增/修改文件：`plugin.ts`（命令处理）、`render.ts`（`getViewState` / `applyViewOp`）、`server.mjs`（`/view-ops`、`/view-result`）、`agent-client.mjs`（Agent 侧客户端）、`agent-ops.mjs`、`agent-semantic.mjs`、`agent-locate-stale.mjs`（验证脚本）。
- 实机操作确实发生在 Logseq 窗口内：截图 `evidence/presentation/agent-semantic/`、面板底部提示文字由插件在 Agent 操作后显示。

## 2. Agent 实际能读到的材料

`query` 返回的是**引用集合 + 两种层级 + 状态**，而不是正文副本：

```text
graph / root / page / instance / seq / kind
items[]   : {uuid, depth}                      ← 视图排列（Agent 可写）
blocks[]  : {uuid, content, missing, outside,
             sourceParent, sourceDepth,        ← 原文层级（只读）
             role, task, kind, editing}        ← 确定性前缀解析
selected / collapsed / anchor                  ← 注意力与阅读位置
```

101 块长树与 8 块采购页都验证过。角色分布（长树）：TODO=20、现状=20、问一下=20、注=20、想法=19。视图深度与原文深度可以不同，这正是 Presentation Layer 的意义。

关键区分在本轮被实证：采购页的 `[问一下]` 原文父块是根块，但**视图父块是 TODO「核对设备清单」**（用户此前拖成的）。Agent 若把视图父块当作任务归属就会读错。`agent-semantic.mjs` 把这一点写进了断言与输出。

## 3. 七项能力验证结果

| 能力 | 结果 | 证据 |
|---|---|---|
| 读取当前 Work Scope 与排列 | 通过：范围、视图排列、原文父链、角色、编辑态、折叠/选中全可读 | `agent-ops/state-before.json` |
| 调整视图顺序 | 通过：`reorder` 以整个视图子树为单位移动，移动后子树根深度随目标层级变化，**原文 sourceDepth 不变**（4→视图 1） | `agent-ops/state-after-reorder.json`、`agent-ops.txt` |
| 调整视图缩进 | 部分通过：`outdent` 稳定生效（深度 4→3）；`indent` 只在存在同深度前序兄弟时生效，否则明确拒绝 `indent-had-no-effect` | `agent-ops.txt` §3 |
| 调整关注重点 | 通过：`focus` 设置选中项、`collapse/expand` 控制折叠，均回读确认 | `agent-ops.txt` §5 |
| 整体重排（原子） | 通过：`layout` 一次性提交完整排列，校验树合法性后应用；错误嵌套/根深度/缺项/重复 UUID 全部明确拒绝 | `agent-ops.txt` §4、§6 |
| 从视图/Agent 判断定位原块 | 通过：`locate` 触发 Logseq 滚动并高亮，未知 UUID 与错误范围被拒 | `agent-semantic/locate.json` |
| 原文变化后感知与重判 | 通过：外部修改页面文件后视图约 2–3 秒内读到新正文；旧建议被 `checkAgentPatch` 判为 `stale-source`，重读后恢复 `eligible-for-review` | `agent-semantic/staleness.json` |

**原文零改动**：整轮会话（33 项通过断言 + 若干次拒绝 + 语义场景 + 两次外部编辑并还原）结束后，`graph-baseline.sha256` 与 `graph-final.sha256` 逐行相同。

## 4. 本轮发现并修复的接口缺陷

1. **静默无效操作被当成成功。** 早期实现里 `move()` 在不合法输入下原样返回，包装层却回 `ok:true`。Agent 无法区分“做了”和“什么都没做”。已改为先做前置校验，并区分 `root-not-movable` / `target-inside-moved-subtree` / `uuid-equals-target` / `move-had-no-effect` / `indent-had-no-effect`。
2. **范围校验不对称。** 某次实测中 `query` 成功而 `layout` 被 `graph-mismatch` 拒绝。根因是客户端把 `inspect()` 的返回整体当 scope 传入，而 scope 嵌在 `snapshot` 下，`graph/root` 被静默丢掉。已把 `inspect()` 的 scope 提到顶层并让 `sendOp` 缺 scope 直接抛错——**接口应该让这种错误不可能静默发生**。
3. **工作范围切换原本只能人工点击。** 已加 `scope` 操作：Agent 可自行把工作视图指向另一个根块（`scope-root-not-readable` 拒绝不可读根）。

## 5. 接口摩擦与不自然之处（未全部修复）

- **插件安装路径一挪就断。** Logseq 记录的是外部路径 `/Users/wangrundong/work/logseq-live-preview-spike`，目录被移入工作区后插件静默失效——没有任何错误提示，只是“重载后没反应”。已用符号链接修复。**这类断裂应该在插件侧或启动脚本里显式检测并提示。**
- **reload 是人工动作。** 本轮共请用户重载 4 次。Agent 无法重载自己依赖的插件，这是当前闭环里最大的人工环节。
- **`move` 不是可逆操作。** 把子树 A 移到目标 T 下会把 A 的深度改成 T 的深度（delta 平移），移回后形状与原状不同。这不是 bug，但 Agent 很容易把它当成“撤销”。**需要显式的 `layout` 快照做回滚，而不是反向 move。**
- **视图缩进语义窄。** `indent` 只能“成为上一个同深度兄弟的子项”，没有“把当前项插入前一个父项的子列表”这类意图表达。用户按 Tab 时的心智模型与接口能力不完全一致。
- **`layout` 要求提交全部条目。** 对 101 块范围意味着每次重排要回传整棵树（约 6–8 KB）。范围更大时这会成为摩擦。需要增量的“期望排列”表达，或版本号+补丁。
- **注意力只有单选。** `focus` 只能标一个块。Agent 说“这几个都值得看”时无处表达。
- **没有“用户主动移出引用”的接口。** 长期使用会积累占位（`missing`），本轮也见到一个空块占位。
- **状态回读有两个来源。** `query` 走 view-ops 应答，布局也会随 2 秒心跳进 telemetry。Agent 需要知道哪个是权威、是否可能滞后。

## 6. 语义协作最小场景

在合成页「工作视图试验 2026-09-08」上，对 `[问一下] 是否需要附项目背景？` 做了一次完整闭环：

1. 读取材料：问题、原文父块、视图父块、同页 `[注]/[现状]/[想法]`；
2. 提出**带来源引用**的建议，并显式列出**不主张什么**（不判定已解决、不判定谁负责、不改写原文、不建立任务归属）；
3. 每条引用都能定位回原块（`locate` 通过，`sourceParent` 一致）；
4. 记录建议所依据的**精确正文版本**；原文被外部修改后，旧建议被判 `stale-source`，重读新版本后才重新可议。

建议内容本身是**确定性读取的产物**（无 LLM 调用），因此它证明的是“材料与失效判据成立”，不是“语义理解已经可靠”。`evidence/presentation/agent-semantic/proposal.json`。

## 7. 值得做成稳定工具的能力

1. **`view-ops` 协议本身**（含 scope 校验、明确拒绝原因、`query` 回读）——这是 Agent 与工作视图之间唯一需要长期维护的契约。
2. **`checkAgentPatch` 式的失效判据**：`graph-mismatch / source-missing / source-editing / stale-source / source-parent-changed / eligible-for-review`。这组词比任何自动改写都更有价值。
3. **原文↔视图双向定位**（`locate` + `reveal`），以及“视图父块 ≠ 任务归属”的显式声明。
4. **确定性角色/状态解析**（`parse`）：`task` 与 `role` 两个独立维度，配合 `sourceParent` 上下文。
5. **上下文 envelope**：`agentContext()` 已经把来源、版本、编辑态、角色、排列打包好，约 450 字节/块——可以直接作为 Agent 的输入材料格式。

## 8. 尚未验证

- 真实 LLM 参与的语义判断（本轮建议由确定性脚本产生）。
- Agent 写回事务：本轮没有任何写入路径，`eligible-for-review` **不是**写入授权。
- 大范围（>300 块）的 `layout` 提交代价与并发安全。
- 跨机器/清缓存/重建索引后的块身份稳定性（本轮观察到无 `id::` 块的 UUID 与显式 `id::` 块共存，后者稳定，前者未验证）。
- 停靠面板与独立浏览器窗口的布局一致性（本轮只操作停靠面板）。
