# V2 Project 页面创建合同

状态：`AUTOMATED_FOUNDATION`（2026-07-20）。Desktop 与进程中断 Gate 尚未完成，不能标记 E2E-19 `DONE`。

## 用户闭环

`Projects / 对象` 工作区提供一个插件内表单。Local Service READY 时，用户输入名称并执行一次操作：

```text
输入名称
→ Service 准备稳定创建意图
→ 精确检查 Project/<名称>
→ 创建带事务所有权标记的空页面
→ 重读页面 UUID、属性和内容边界
→ Service 在 SQLite 单事务创建 Project + Primary Anchor + Audit + Receipt
→ SemanticCommit 两个 step 均 VERIFIED 后显示成功
```

Service 未就绪时按钮禁用；未知同名页面存在时零覆盖、零 SQLite 写入。该入口不使用浏览器 prompt/confirm，不扫描全 Graph，也不激活 V1 FileStorage。

## 单一身份与幂等

- Service 以 `Graph ID + 规范化 Project 名称` 生成稳定 `semanticCommitId`；首次 prepare 发行 `objectId`，后续重试只读取账本中的同一 ID。
- 页面只接受 `task-copilot-owner`、`task-copilot-object-id`、`task-copilot-semantic-commit-id` 三项精确所有权证据；插件不覆盖未知页面。
- SQLite 的 `create_project_with_page` Application Command 原子写 Object、Primary Anchor、Audit 与 Receipt；客户端不能指定 Graph、actor 或数据库路径。
- 完成后 prepare 返回已记录的 Page UUID。用户改名页面不会改变 object_id，重试按 UUID 找回原页，不创建旧名称副本。
- Primary Ownership 与页面名称没有联动；本命令不写 Ownership。

## 失败与恢复

- prepare 只写 PENDING SemanticCommit，不创建领域对象，因此不会出现“SQLite Project 无页面”。
- 页面创建失败时 finalize 不执行，SQLite 对象数保持不变。
- 页面创建后若 finalize 响应不确定，插件不自动删除页面：请求可能已在 Service 内完成，盲删会把成功对象变成孤儿。页面保留事务所有权标记，用户以同名操作安全续跑。
- finalize 校验 commit/name/object/page 证据；不匹配返回冲突并保持零领域写入。
- 只有 GRAPH_WRITE 与 DOMAIN_WRITE 都 VERIFIED 时账本才进入 COMPLETED。

当前没有增加 Project 专用表、后台扫描器或第二恢复账本；复用 SQLite SemanticCommit step ledger。待补的真实 Gate 是：Desktop 新建/同名冲突/改名/reload，以及在页面创建后、领域提交前后的进程故障注入与恢复证据。
