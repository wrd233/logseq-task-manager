# Personal Inbox v1 实现与接入

本分支从 `origin/main` 的 `fbdb03c1` 创建，不包含旧 Capture Inbox 分支或原工作区的未提交修改。
本轮 Codex 提供独立存储、宿主 API、Planner/Kernel 出口和原生引用接口。页面由 DSH 按 [UI 契约](ui-contract.md) 开发；当前没有声称页面或真实数据验收已完成。

## 存储规则

每条记录为一个私有可读 JSON 文件：

```
${PERSONAL_INBOX_HOME}/<inbox-uuid>.json
```

未设置 PERSONAL_INBOX_HOME 时：

```
${DSH_HOME 或 os.homedir()/.dsh}/personal-data/inbox-v1/<inbox-uuid>.json
```

本机默认解析为 `~/.dsh/personal-data/inbox-v1`。根目录只按应用级环境决定，不接收 Session、Workspace、Profile、Graph、Work 或当前目录。自定义根目录必须为绝对路径。改变 DSH_HOME 或 PERSONAL_INBOX_HOME 是更换应用数据根，需要显式导出/恢复；普通 Profile 切换不改变路径。

已检查本机 DSH 的 storage/storage-domain/storage-json：domain 的后端 root 可随 composition/Profile 配置，不能据此假设它一定是跨 Profile 的全局目录。本实现采用宿主已使用的应用级 DSH User Data 根，不新增后端挂载和数据库依赖。

JSON 包含 `item`、一个可撤销的 `previous` 快照、少量 `operations` 转化收据。写入使用同目录临时文件、fsync、rename 和目录 fsync；失败不会用空数据替换原文件。单条损坏在列表中独立报错；导出遇到损坏会报告备份不完整。目录权限 0700，记录 0600。

写入按进程队列串行，并用短期文件锁拒绝另一宿主同时写入；进程退出后的锁可在下一次写入时识别并恢复。正常锁竞争返回 INBOX_BUSY，调用方保留输入再重试。没有自动同步或多设备合并。

记录保留 originalContent；用户编辑写入 editedContent；context 保存补充背景。归档保存 archivedFrom，恢复不会把 resolved 误改为 open。撤销只保留最近一次编辑；转化清除此撤销快照，避免撤销抹掉已创建目标的追溯关系。没有永久删除入口。

## 其他模块

- WorkRef 直接复用 contracts，不按标题推断；编辑引用不触碰 Work 数据。
- Work 出口使用既有 DshHandoffs.enterCatalog：已关联 Work 或导入的 Logseq 块可直接进入自然工作。纯文本记录尚无有效工作来源时，必须先选择现有 Work 或在 Logseq 建立自然来源。本轮不发明本地 Work 类型或第二套工作数据库。
- Planner 使用 PlannerStore.change 的 fromInbox 入口；目标 entry 带 inboxRef，持久收据跨撤销/删除保留。不会直接编辑 Planner JSON。仍遵循现有 Planner 的应用/配置目录和日期/时段规则。
- Formal Task 使用 KernelClient.createInboxTask，经新的薄 HTTP 适配入口转给现有 Kernel.commitFormal。必须具备现有 Plugin USER-channel capability，且必须有真实 Logseq 锚点；来源读取由现有 Graph Broker 完成。请求 ID 为 `inbox:<inboxId>:<operationId>`，提供 Kernel → Inbox 追溯；Inbox outcomes 保存 objectId 和 commitId。没有绕过快照、唯一锚点或 Kernel 规则，也不写 Kernel 数据文件。
- 转化结果未明时持久保存 pendingConversion；UI 可在重启后重试同一操作。确认拒绝时允许继续编辑；不确定结果期间暂缓该条记录的修改，原文仍可查看。
- 讨论引用使用独立的 Personal Inbox 原生引用 codec。仅在明确插入时将所选记录快照放入当前原生草稿，附 id/revision；不读取全部 Inbox、不自动提交、不注册自动正式化的模型工具。
- Logseq 导入通过现有授权 source.read 获取原文及 graphId/blockUuid/contentVersion；能取得页面名时同时保留。来源离线后可重复找回已导入条目，独立 CRUD 不访问 Logseq。
- 材料仅保留文件/网页/讨论定位与名称。不复制文件，不管理附件生命周期。

## 备份与恢复

inbox-export 返回全部 item，包含归档项和 outcomes。UI 下载为 JSON；inbox-import 只新增不存在的 ID，相同项跳过，冲突返回 conflicts，不覆盖原文或较新的记录。未完成转化不能导出成“完整备份”，需先重试确认结果。单步撤销快照和临时转化意图不作为可迁移业务数据导出。

## 开发边界与接入

DSH 页面集中放在新的 personal-inbox 目录中；不要编辑旧 Capture 页面。宿主路由、模型和共享协议由 Codex 维护；页面开发只消费契约。现有 client.jsx 仅增加 Personal Inbox 原生引用 codec 注册，不改变现有页面布局。

参考 UI 的数据源、参数、错误恢复和例子见 ui-contract.md。页面完成后才部署到现用 DSH 并开展真实记录验收；目前没有替换正在使用的 DSH bundle，也未重启用户现有会话。
