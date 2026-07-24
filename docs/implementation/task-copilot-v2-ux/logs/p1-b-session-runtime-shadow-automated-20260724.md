# P1-B Plugin Session Runtime Shadow 自动证据（2026-07-24）

结论：`AUTOMATED_PASS / SESSION_RUNTIME_WIRED / USER_VISIBLE_FORBIDDEN / DESKTOP_OPEN`

## 运行边界

- 只在 Plugin 已绑定 READY Local Service、Graph key 已知且 Object/Proposal/Commit 投影完整时运行；
- 只读 `objects / proposals / semantic commits / primary anchors`，不调用任何正式写入命令；
- Anchor 分页有 cursor-loop 防护；读取或 detector 失败只记录 warning，不降低主 UI 或正式写入能力；
- repository 仅在 renderer session 内存中，容量固定 512；Graph switch 显式 clear；
- 每轮候选上限 512，继续强制 `SHADOW / NONE`，没有 UI surface；
- structured logger 只在汇总变化时记录 raw/merged/cooled/active/invalidated 五个数量。

## 证据最小化

Service projection adapter 只保留：

- Object identity/type/version/lifecycle/condition kind/reviewAt/dueAt/updatedAt；
- Proposal identity/status/accepted count/已有正式 Object targets/updatedAt；
- Commit identity/status/Proposal link/已有正式 Object targets/updatedAt；
- Primary Anchor identity/Object/status/observedAt；
- Graph key/binding 与 cycle timestamp。

它不保留 Object text、Proposal title/context/understanding/objective/logic/finalPreview、Proposal
files 或 Anchor content hash。变化日志进一步只保留数量，不记录任何 Object/Proposal/Commit/
Anchor identity。

## 身份语义修正

正式 Object 创建前，CREATE Proposal 没有合法 `objectId`。因此 Signal 以 `subjectRef` 作为
必需身份，只有事实真正指向已存在正式对象时才附带 `objectId`：

- existing Object：`object:<id>`；
- CREATE Proposal：`proposal:<id>`；
- unscoped Commit：`commit:<id>`；
- Graph risk：`graph:<key>`。

这避免把来源 Block UUID 或虚构 ID 提前提升成正式对象身份，不改变 Domain、Proposal 或
Commit 语义。

## 自动 Gate

- Application 82/82 tests、0 skipped、typecheck PASS；
- Plugin 196/196 tests、0 skipped、typecheck/build PASS；
- 正文与 Proposal files 不进入 snapshot；
- CREATE Proposal 与 unscoped Commit 生成两个真实 subject，不发明 Object；
- 事实消失后 active 归零并产生 invalidated；
- source arrays 不被 adapter 修改；
- `index.ts` 继续不直接依赖 writable Application runtime，边界测试 PASS；
- 根级 `./scripts/check.sh` PASS。

## 尚未声明

- 没有真实 Logseq Desktop telemetry 读回；
- 没有 reload 后重算/失效时延证据；
- 没有用户可见信号、Now 动态插入或 Block 标记；
- UX-G008 是否需要 SQLite derivative 仍 OPEN；
- blocker change、WAITING stale、Project quiet、LLM cross-object 尚未实现。
