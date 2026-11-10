# Personal Inbox v1 验收记录

日期：2026-11-08。后端、页面和以下隔离环境交互验收已完成。用户后续明确授权 Codex 直接开发页面；未调用外部 DSH Flash 或模型。分支推送供审查，不合并 main。

## 环境和数据边界

使用本机实际 DSH `0.2.1-rc.2` / Cordis `4.0.5`，以独立 DSH_HOME 启动完整应用；原生 Profile 分别为 inbox-v1、inbox-v1-b，第二次启动改用后者，个人存储根不变。浏览器使用应用自身的认证与页面，不以模拟 UI 代替。

Logseq `0.10.15` 使用本工作区的 sandbox 副本、独立 home、Graph 与 Kernel。启动真实 Logseq SDK、Companion、Graph Adapter 与 SQLite Kernel。未调用模型，未改变系统协议处理器；原工作 Graph、现用 DSH 服务、用户 Profile 均未修改。完成后已停止本轮 DSH、Companion、Logseq 和 Kernel 进程。

按用户“自行筛选，从我的日常工作的 Logseq 中”授权，从 9 份原始日记文件逐条核对选择 15 条简短工作记录。历史 bridge 导出只作为索引；每条必须在当前原文件中有唯一精确文本匹配。样本整体 SHA-256：`b5e47acaf9d417d6d4fad827758f20e70da9fa40d7642055ec36e52ae3a16cba`。

15 条原文首先进入生产 Store 和真实 Cordis 进程持久化验证，再复制到隔离 Graph 的自然工作 A/B，使用新测试 UUID。实际 SDK 导入其中一条，正式化也仅写入这份隔离副本。原日常 Graph 没有写入。另用人工文字、示例 URL 与手动 Flomo 粘贴场景补充交互，总计 21 条隔离 Inbox 记录。

个人正文、原始文件定位、逐条身份和带凭据的运行日志不进入仓库。截图仅展示人工文字和 example.com。测试数据、浏览器导出的 JSON 留在本机，不上传或提交。

## 必要验收

| 要求 | 观察到的结果 |
| --- | --- |
| 1. 一句话创建 | 无 Session 的原生页面输入一句话即可保存；无需标题、类型、Work、日期或优先级。 |
| 2. DSH 重启后保留 | 完整应用停止再启动，18 条记录读回；后续更换 Profile 再启动，21 条均可见。 |
| 3. 切换 Session | 原生 A/B 两个对话切换后，相同 Inbox 仍可继续编辑；捕获和背景草稿也保留。 |
| 4. 切换 Work | 通过既有 Work 出口进入工作 B，Inbox 不换目录、不丢失。B 对话草稿为空，A 的原生草稿/引用独立。 |
| 5. Logseq 离线 | 停止隔离 Logseq 与 Kernel，仍可创建一条记录、补充背景，并以全文查询找回 1 条匹配。 |
| 6. 原文和背景分开 | 保存背景后原文不变；手动修改 Flomo 显示文字后仍能展开最初原文，撤销恢复原显示。 |
| 7. 关联现有 Work | 实际目录选择工作 A 并保存。 |
| 8. 修改/解除 Work | A 改为 B，再解除关联；已处理状态不随关联变化。 |
| 9. Logseq 导入 | 页面从真实 Reader 选择块，宿主 source.read 再次验证；保存 graphId、测试 blockUuid、sourceId、contentVersion 及完整原文（含 id::）。 |
| 10. 手动 Flomo | 粘贴人工 Flomo 场景文字，显式选择 Flomo 来源后保存；不声称已测试 Flomo 在线集成。 |
| 11. 背景和材料 | 保存背景及 example.com 网页引用；跨 Session/Profile 后重新打开仍显示。文件仅保存位置引用。 |
| 12. Planner | 页面明确确认日期与时段；生产 PlannerStore 创建安排及 Inbox backlink，原记录保留，状态可标为 resolved。 |
| 13. Formal Task | 页面明确确认；真实用户能力通道、Graph Broker、Kernel commitFormal 返回 COMMITTED，创建 1 个对象，Graph projection VERIFIED；Inbox 原文保留，双方操作引用可追溯。 |
| 14. Resolved/Archived | 已处理记录归档后从默认列表隐藏；恢复仍为 resolved，未重置为 open。 |
| 15. 搜索/恢复/导出 | 全文、状态、来源及 Work 筛选通过；UI 下载 19 条 JSON 后重新导入：新增 0、跳过 19、冲突 0。独立新数据根恢复由跨进程证明覆盖。 |
| 16. Session/Profile 独立 | 同一 DSH_HOME，改用第二 Profile 仍读回全部 21 条。原生 Graph 菜单从 Graph A 切换到独立 Graph B 后 Inbox 继续可用。 |

## 额外交互检查

- 将隔离 Inbox 目录临时设为只读，保存失败后输入保留；恢复权限，点击“重试保存”只生成 1 条记录。
- “带入当前讨论”保留已有原生文字草稿并新增所选 Inbox 引用；没有自动发送、没有全量读取其他个人记录。
- 纯 URL 粘贴自动保存为网页来源；不弹出分类或日期表单。
- 指定工作筛选：在相同全文查询下，工作 A 返回 0 条，工作 B 返回关联的 1 条。
- 1280px 视口展开原生侧栏全屏：列表/详情两列；420px 视口：详情/返回列表，未发现横向溢出。临时视口已重置。最终浏览器错误日志为空。
- 两张代表性截图：[窄面板详情](screenshots/01-detail-dark.jpg)、[宽面板](screenshots/02-wide-dark.jpg)。未在系统浅色主题或实体移动设备上额外验收。

## 自动验证

最终针对回归共 **38 项通过**：Personal Inbox 9、Planner 9、Structure History 18、Formal HTTP 1、Inbox → Kernel HTTP/SQLite 1。覆盖原文保护、版本冲突、撤销、归档恢复、备份、损坏隔离、重复请求、转化拒绝/未明结果、原生引用、插件生命周期与双 Profile 存储。

```sh
node --import tsx --test \
  apps/dsh-plugin/tests/personal-inbox.test.mjs \
  apps/dsh-plugin/tests/planner.test.mjs \
  apps/dsh-plugin/tests/history.test.mjs \
  apps/kernel-service/tests/personal-inbox.test.ts \
  apps/kernel-service/tests/formal-http.test.ts
```

Kernel Service 与 Client 类型检查、所有改动代码 ESLint、DSH 宿主/浏览器 bundle 构建、git diff --check 均通过。仓库检查使用已有 Node 20，原生 DSH 使用已有 Node 24；未修改系统 Node、模型 Provider 或登录。

另有真实 Cordis SDK 三进程证明：第一进程写入 15 条原文和背景/状态；第二进程逐条核对原文哈希、恢复和导出；第三进程在全新根恢复、重复导入跳过。各进程还卸载/重新加载生产插件，确认路由释放和持久化。使用相同真实样本完成过此证明。Connection/Session 外壳是测试适配器，这部分证据与上述完整应用 UI 验收分开。

```sh
# Node 22.19+，需已有 DSH npm 包；默认使用人工示例
node --import tsx apps/dsh-plugin/tests/personal-inbox-host-proof.mjs
```

可用 DSH_PACKAGE_ROOT 指向 DSH 包，PERSONAL_INBOX_ACCEPTANCE_INPUT 指向本机 10～20 条 originalContent/source JSON。脚本不打印正文，临时根结束后清理。

## 当前限制与交付范围

- 本轮完成隔离真实应用验收；没有部署覆盖用户现用 DSH bundle。启用须更新插件，Formal Task 还须更新 Kernel Service。
- Work 出口复用现有工作导航。没有自然来源的纯文本需先选现有 Work 或在 Logseq 建立自然来源，不另建 Work 数据库。
- Formal Task 遵循现有 Kernel 的真实 Logseq 锚点、在线 Graph 和用户能力要求。
- 材料保存文件/网页/讨论引用，不复制附件，不保证外部来源永久有效。系统 logseq:// 协议打开未在本轮点击，以避免影响用户正在使用的 Logseq。
- 已保存记录可跨重启；未保存 UI 草稿仅跨本次浏览器运行中的记录/对话切换。没有跨设备同步、后台扫描、自动分类或自动正式化。
- 单步编辑撤销、可恢复归档，没有永久删除。并发宿主竞争返回 BUSY，可保留输入重试。Planner 保持其既有存储规则。
