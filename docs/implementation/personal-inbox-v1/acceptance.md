# Personal Inbox v1 验收记录

日期：2026-11-08。当前阶段：Codex 侧后端/API 可交给 DSH 页面接入；不是完整产品验收完成。

## 已完成的自动验证

最终针对测试共 20 项：

- Personal Inbox：9 项（含 15 条代表性测试记录、原文/用户编辑/背景分离、WorkRef 更改/解除、单步撤销、归档恢复、检索、备份、损坏隔离、请求重试、转化拒绝与未明结果边界、原生引用、真实宿主路由注册与双 Profile 配置共享存储）。
- 现有 Planner 回归：9 项。
- Formal HTTP 回归：1 项。
- 新增 Inbox → Kernel HTTP/SQLite 集成：1 项。

Kernel 集成使用实际 KernelClient、HTTP 服务、Formal Kernel 和 SQLite；Graph Adapter 使用项目的 FakeGraphAdapter。没有调用外部模型。不能据此声称真实 Graph 或 UI 通过验收。

现有 History 18 项与 Personal Inbox 9 项在生命周期修正后合计 27 项回归通过。

通过的静态检查：Kernel Service 与 Client 类型检查、所有修改代码的 ESLint、DSH 插件宿主及浏览器 bundle 构建、git diff --check。

本机默认 Node 启动器缺少 simdjson 动态库，仓库检查使用已有 Node 20 安装，原生 SDK 证明使用已有 Node 24 安装；未修改系统 Node 或用户登录/Provider。依赖仅安装在新工作区。没有 task-owned 常驻进程。

## 必要验收逐项状态

| 要求 | 当前证据 | 尚需真实验证 |
| --- | --- | --- |
| 一句话创建 | API 创建测试通过，不需要标题、类型、Work、日期 | DSH 页面保存操作 |
| DSH 重启后保留 | 文件持久化、新 Store 实例、原生 Cordis SDK 的独立进程重启及热重载通过 | 现用 DSH 完整重启 |
| 切换 Session 保留 | CRUD 路由不接受所有权 sessionId，跨处理现场读写通过 | 原生 UI 切换 Session |
| 切换 Work 保留 | 存储根不含 Work；引用修改/解除测试通过 | 原生 UI 切换 Work |
| Logseq 离线可创建搜索编辑 | 宿主测试让 Logseq 读取抛错，独立 CRUD 仍通过 | 现用 Logseq 断开场景 |
| 原文与背景分开 | 实际文件模型和测试通过 | 详情呈现 |
| 关联一个现有 Work | WorkRef 单值，关联 API 通过 | 真实目录选择 |
| 解除与修改关联 | 测试通过 | UI 交互 |
| Logseq 导入保留定位 | 授权 source.read 边界测试通过，graphId/blockUuid/version 保留 | 真实块与页面定位 |
| 手动粘贴 Flomo | source.type=flomo 和原文独立存储通过 | 真实 Flomo 内容 |
| 补充背景与材料 | context/materials 测试通过 | 外部材料打开/失效展示 |
| Planner 创建保留 Inbox | 使用真实 PlannerStore API，持久 backlink/去重测试通过 | 页面确认与 Planner 导航 |
| Formal Task 明确创建 | 用户能力、实时来源读取、Kernel/SQLite 收据集成通过 | 真实来源锚点、正式服务部署与用户确认 |
| Resolved/Archived 不同 | 状态、归档前状态和恢复测试通过 | UI 分入口 |
| 搜索恢复导出 | 全文、多条件、归档恢复、备份导入测试通过 | 下载和导入交互 |
| 独立于 Session/Profile | 默认路径和两份宿主/Profile 配置共享文件测试通过 | 现用 Profile 切换 |

## 仍需安排

DSH 页面开发与接入安排尚未明确。真实记录已补充本地数据层验收（见下文），不再将记录范围作为后端验证的等待项。

测试生成记录、真实记录的数据层验证、现用 DSH 页面验收分开记录。隔离 SDK 进程重启不等于现用 DSH 应用完整重启。
本次未改变现用 DSH bundle，未重启现用服务，未将个人 Graph 内容复制进仓库或发送给外部模型。

## 限制

- 页面尚由 DSH 待接入；本分支未实现完整 Inbox 页面。
- Work 出口复用已关联 Work 或真实 Logseq 块导航；没有来源的纯文本须先选择/建立自然 Work 来源。
- Formal Task 遵循当前 Kernel：必须有真实 Logseq 来源锚点与 USER-channel capability；不支持脱离 Graph 凭空创建正式对象。
- 文件/网页/讨论作为引用保存；不复制附件，不保证外部材料永久有效。
- 单步编辑撤销；没有永久删除、复杂版本控制、跨设备同步或自动分类。
- 多宿主同时写入时短期竞争会返回 BUSY；调用方需保留输入并重试。Planner 仍沿用其已有配置和存储位置。

## 补充：原生 Cordis SDK 跨进程证明

使用本机实际安装的 DSH `0.2.1-rc.2` / Cordis `4.0.5`，启动三个独立进程：第一进程保存 15 条记录、背景、resolved + archived 状态；第二进程重启后逐条核对原文哈希、搜索、恢复归档并导出；第三进程在全新数据根恢复备份，重复导入不重复创建，并再次逐条核对原文哈希。每个进程还执行一次插件卸载/重新挂载，确认记录继续存在且路由释放。

本验证发现宿主 RPC 注册返回的注销函数原先没有纳入插件生命周期。已改为通过 Cordis effect 执行注销，避免热重载留下旧路由；没有修改现用 DSH 服务。

复现（Node 22.19+，需本机已安装 DSH）：

```sh
node --import tsx apps/dsh-plugin/tests/personal-inbox-host-proof.mjs
```

可用 DSH_PACKAGE_ROOT 指定已有 DSH npm 包目录。脚本默认使用示例记录，支持 PERSONAL_INBOX_ACCEPTANCE_INPUT 指向本地 10～20 条样本 JSON（originalContent/source），验收时不打印正文。数据根均为临时目录，结束后清理；不调用模型、不读取会话消息。它验证实际 Cordis SDK 加载生产插件与文件持久化，Connection/Session 外壳为测试适配器，仍不是完整 DSH 应用或页面验收。

## 补充：15 条真实个人记录的数据层验收

在指定的本机 Logseq Graph 中，以历史 bridge 导出为索引，从当前 9 份原始日记 Markdown 文件逐条核对选取 15 条简短工作记录。只选取原文件中有唯一精确文本匹配的记录；bridge 的历史快照本身不作为当前内容证明。

样本整体 SHA-256：`b5e47acaf9d417d6d4fad827758f20e70da9fa40d7642055ec36e52ae3a16cba`。

通过上述三个真实 Cordis SDK 进程，验证了：15 条真实原文保存与逐条哈希保护、补充背景分离、全文与来源筛选、resolved 后归档及恢复、重启后读回、导出到新数据根恢复、重复导入跳过、插件热重载。全过程未检查 Session 或 Work；Logseq 未参与这些 CRUD 调用。

数据来源标为 other + 离线原文件定位；这是实际个人内容的本地文件捕获，不是通过真实 Logseq SDK 的块导入。真实块接口、Work 选择器、Flomo 粘贴 UI、Planner/Kernel 页面确认及现用 DSH 应用重启仍待页面接入后验收。

样本正文、原文件内容及逐条身份没有写入仓库；样本及备份仅在权限受限的本机临时目录使用，结束后清理。原 Graph 未写入。公开说明仅保留数量、核对方法与整体校验摘要。
