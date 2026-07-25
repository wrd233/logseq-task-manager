# P2-C Project Creation Commit / Recovery / Undo 自动证据（2026-07-25）

## 结论

P2-C 已完成以下正式自动化纵向链：

`accepted HIGH Proposal → Service prepare → Logseq Page create/reuse → durable Graph evidence → atomic Project + Anchor + reviewed structure → Proposal APPLIED → restart recovery → compensation / inverse Undo`

当前状态为 `IN_PROGRESS_FORMAL_CHAIN_AUTOMATED_DESKTOP_OPEN`。正式创建、失败补偿、重启
恢复与 Undo 的自动化缺口已关闭；当前 commit 仍缺真实 Logseq Desktop、reload、失败、
Recovery、Undo 和截图 Gate，因此 P2-C 与完整 Goal 均未完成。

最新 Plugin 又关闭了用户入口缺口：Blank、普通 Page 与 OPEN MiniProject 三来源均进入
同一自适应 Grill→零写入 Preview→HIGH Review 链。旧直建 UI 与 action dispatch 已移除，
不能绕过“Project 创建必须 Grill Me”的产品规则。

## 当前构建

- branch：`feature/task-copilot-mvp`
- commits：`c00ad37`、`bc7ef7f`、`2982f20`
- Graph：自动测试隔离 SQLite/Host；没有改动个人 Graph。

## 安全边界

- 只有单一已接受且显式确认的 HIGH `CREATE_OBJECT(PROJECT)` 组进入专用链；
- 新建专用 Page 必须带 owner/object/semantic-commit 精确所有权并保持为空；
- 复用 Page 不创建、不加属性、不要求为空，最终前匹配已审阅 identity/hash；
- 实际 Page UUID/hash 在 Graph step 执行前持久绑定，Service restart 后可继续恢复；
- Domain 失败不留下 Project；专用空 Page 只按精确所有权删除，来源 Page 原样保留；
- Undo 先预检专用 Page ownership/empty，预检前不删除 Project；
- Page 已含用户正文时 fail closed；
- 原 Commit、逆向 Commit、Audit 与回执均保留。

## 自动证据

- Local Service：129/129 PASS；
- Plugin：260/260 PASS；
- 最新入口增量：Plugin 267/267 PASS，Project Creation Controller 5/5，UI 56/56；
- Persistence：48/48 PASS；
- 根级 `./scripts/check.sh`：PASS；
- rule coverage：145；
- recovery rehearsal：`differences=[]`。

覆盖 invalid ownership 零写入、原子 Project/Anchor/structure、幂等 replay、Domain failure、
restart recovery、精确 compensation、dedicated/reused Page 差异、preflight Undo 和专用 UI。

## Desktop 开放项

- Blank/Page/MiniProject 中至少覆盖 dedicated/reused 两类关系；
- Review、创建成功、进入新 Project Page、reload；
- 失败后的补偿及用户层解释；
- Undo 与返回现场；
- Light/Dark、窄栏和 CURRENT 截图索引。
