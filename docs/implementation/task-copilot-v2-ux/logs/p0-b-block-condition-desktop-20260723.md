# P0-B Block Condition 自动与 Desktop 证据摘要

日期：2026-07-23

环境：macOS arm64、Logseq Desktop 0.10.15、Node 20.20.2

数据：隔离测试 Graph，仅使用虚构 MiniProject `P0 Focus Gate`

## 实现边界

- 现场入口只解析唯一 active Primary Anchor 与 OPEN 正式对象；
- Condition 写入只调用 `LocalServiceClient.changeCondition`；
- 不新增 Condition 类型、Store、写路径或恢复器；
- 不修改 Graph 正文、Lifecycle、Ownership 或 Focus；
- WAITING 的一个合并短语同时满足既有 `waitingFor/expectedResult` Domain 字段；
- Undo 仅在同一对象、预期版本和语义相同的当前 Condition 下执行。

## 自动证据

- 三种意图到封闭 Condition 的最小字段映射；
- 空字段与非法时间在调用 Service 前拒绝；
- 唯一 active Primary Anchor / OPEN Object 解析；
- in-flight 重复提交拒绝；
- 精确 prior Condition Undo；
- stale Object/Condition 零覆盖拒绝；
- UI 三种意图、三份最小表单、busy/disabled；
- Bootstrap 四项菜单的注册顺序与 UUID 回调；
- Plugin typecheck PASS；
- Plugin tests 143/143 PASS，0 skipped；
- Plugin build PASS。

## 真实 Desktop 结果

1. 正式 Block 的原生菜单显示 Focus toggle、“暂时做不了”、Focus Undo、Condition Undo；
2. “暂时做不了”先显示等待别人、被问题卡住、我先暂停；
3. 缺少必要字段时显示“没有保存，原状态未改变”，Local Service 对象仍为 ACTIONABLE；
4. WAITING 写入后，读回合并短语与 `reviewAt`，Focus 为空；
5. BLOCKED 写入后，读回具体卡点，Lifecycle 仍 OPEN，Focus 为空；
6. PAUSED 写入后，读回原因与 `reviewAt`，Lifecycle 仍 OPEN，Focus 为空；
7. 三种写入均自动返回原 Block，并提供会话 Undo；
8. 三次 Undo 均恢复 ACTIONABLE，最终 force reload 读回 version 10 / ACTIONABLE / Focus 空。

## Desktop 发现并修复的缺陷

首轮 WAITING Undo 安全拒绝，原因是 SQLite JSON 读回把 Condition key 重排，而 controller 用
`JSON.stringify` 做顺序敏感比较。没有发生覆盖。修复改用共享 `stableJson`，并在自动测试中
模拟 key 重排；重新构建、force reload 后，真实 WAITING Undo 通过。

## 截图索引

- `p0-b-01-block-context-menu.png`
- `p0-b-02-intent-router.png`
- `p0-b-03-waiting-minimal-form.png`
- `p0-b-04-blocked-minimal-form.png`
- `p0-b-05-paused-minimal-form.png`
- `p0-b-06-blocked-success.png`
- `p0-b-07-waiting-undo-success.png`
- `p0-b-08-validation-error.png`
