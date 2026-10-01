# 第二、三轮合并重构（实施中）

基线 `main@9293ad6bad3d778ae1897603c34a9c90c2fcacf3`，工作区干净；第一轮提交已经在远端。Node 20.20.2 / npm 10.8.2，SQLite 原生模块可用。没有发现适用的 AGENTS.md。本轮不改变 schema、投影协议、权限、布局记录或功能启用条件，不实施新 Workspace、内容维护、FocusPlan、审阅或行动建议，也不提前退出 legacy 提交链。

| 职责 | 开始时的实际所有者 | 本轮目标与进展 |
|---|---|---|
| 连接、Graph Worker、来源观察、身份刷新 | task-center 控制器；UUID 单实例缓存 | 已迁至插件级 Runtime；入口按 tasksEnabled 启动，Graph/generation 隔离 |
| 正式标记、菜单、用户命令 | task-center | 保留 UI 所有权，订阅小范围身份变化回调 |
| 正式事务与恢复 | Kernel + SQLite 同连接 | 保留；待收窄应用服务存储依赖 |
| 上下文、阅读基线、闭合维护、义务交付 | Kernel / 投影与维护协调器 | 待迁移、验证 |
| 工作视图来源、展示、版本、读取、DOM | WorkView 控制器 | 待收敛状态入口、读取调度与条目更新 |
| 文件契约 / 材料草稿和保存 | host 反向导入 materials；材料模块 | 待调整契约边界，保留编辑恢复 |

开始时的依赖：

```mermaid
flowchart LR
  Entry --> TaskUI[任务 UI + Runtime]
  TaskUI --> Worker[Worker / Observer / 身份刷新]
  WorkView --> Identity[UUID 缓存]
  TaskUI --> Identity
  Kernel --> SQLite
  Projection[读模型 + 闭合维护] --> Maintenance
  Projection --> SQLite
  Maintenance --> SQLite
```

目标依赖（后端及视图尚在实施，不能作为已完成状态）：

```mermaid
flowchart LR
  Entry --> Runtime[Graph 作用域运行时]
  Entry --> TaskUI
  Runtime --> Worker[Worker / Observer / 身份刷新]
  TaskUI --> Runtime
  WorkView --> Identity[只读身份]
  Runtime --> Identity
  Query[读模型组装] --> ReadPorts[只读存储能力]
  Readiness[显式闭合维护] --> StatePorts[内聚状态能力]
  Delivery[义务交付] --> Kernel[正式验证与同连接事务]
  Maintenance --> Delivery
  Kernel --> FormalPorts[正式存储能力]
```

## 已核对的基线

主工作区完整 `npm run check` 在 lint 因 Git 忽略的个人研究文件 `docs/research/longdoc-2026-09-14/file-watch-probe.cjs` 的同一 22 项既有错误中止，类型检查通过。没有删除用户文件、改 lint 规则或扩大忽略项；日志在 `tmp/round0203/` 汇总，原始日志为 `/tmp/task-copilot-round0203-*`。现有测试独立运行通过；完整交付检查、性能对比和 Desktop smoke 将在全部变更后记录。

## 运行时阶段

`index.ts` 是组合根；只在 tasksEnabled 启用时启动 `PluginRuntime`，再安装任务 UI，初始化 UI 失败时停止运行时。面板切换只导航，不创建 Worker。运行时拥有 Graph 订阅、Worker、来源观察、30 秒身份刷新、自身写入清理计时器；任务 UI 保留正式标记、菜单、Online DONE 用户命令和可移除交互注册。运行时不导入面板控制器。

Graph 切换立即清空身份并提升 generation；读取新 Graph 后才启用新作用域。索引、单块 revalidate、直接正式化、异常标记都过滤同一 Graph；晚到索引、观察批次和适配器调用先核对捕获的 scope。卸载停止未来领取；已经领取的 Graph 请求失效时向 Broker 报告失败，不能假报成功。已经进入 SDK 的单次调用没有取消 API，但后续读写都受作用域保护；正式义务仍由 Kernel 持久恢复。

自身写入采用每次写入 token，重叠写入不会因另一写入过期而解除抑制。抑制只服务语义观察和 Online DONE 识别，工作视图的 DB 变化仍可刷新。Descriptor 仍从私有 FileStorage 读取，按原文缓存解析而非永久缓存连接；私有内容变化自动重解析，连接命令替换私有内容并使在途刷新失效。缺文件的 SDK 兼容处理保留，其他 IO 失败仍上报。

运行时回归覆盖单实例启动、部分失败清理、重复 stop、A/B 同 UUID、A 延迟返回、停止后 revalidate、绑定适配器失效、重叠自身写入、descriptor 更新；来源观察覆盖旧 pending 与晚到批次，Graph Worker 覆盖领取后失效。关闭任务的组合根测试仍能打开自然工作视图和材料库，且不请求 Kernel。

## 仍需完成

后端职责与查询成本、维护串行预算、工作视图状态与局部更新、材料边界、性能证据、完整交付检查、隔离 Desktop smoke、最终删除/保留清单与第四轮事项尚未完成。第一轮历史证据不能代替本轮验收。
