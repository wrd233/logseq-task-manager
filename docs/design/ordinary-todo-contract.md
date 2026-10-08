# 普通 TODO：独立授权与核验契约

本模块是自然任务维护的独立能力。`content.apply` 原有 schema 与正文/TODO/正式字段保护不放宽；外部 `todo.*` 只接受有限动作，私有安装器把已核验动作编译给既有串行写入、原生输入检查、Journal、读回和恢复框架。

## 本地许可

当前工作连接中的「允许 Agent 维护普通 TODO」让用户选实际来源范围与 create/complete/reopen 操作，界面不要求 UUID 或补丁。范围包含实际后代，默认未选，不由外部 payload 授权。许可绑定真实 ScopeLease，仅本次连接有效；工作/Graph 切换、重绑定、撤销、停止连接、卸载使其失效。撤销后再授权不会复活已等待的旧调用。正文、结构及文件许可独立。

执行时重新读取 actual paths、保护、正文版本与父级。正式锚点、受管内容、含糊正式字段及其保护上下文拒绝；不能从一个子任务完成推断项目完成。完成/重新打开只处理首行普通 `TODO ` / `DONE `，不处理引用、缩进代码、未闭合代码或块中其他任务。新任务的标题为单行自然正文，不能借此创建正式标签、属性或受管语法。

## 机器入口

- `todo.read`：实际来源与 targets、当前范围/操作/生命周期、能力说明。
- `todo.apply --input-file`：schemaVersion=1、requestId、scope、action、target（blockUuid、expectedContentVersion、expectedParentUuid）。create 另需 title；complete 另需 evidence（materialId、expectedVersion、verifiedText）；reopen 没有额外写入文本。
- `todo.result/recover <原 requestId>`：查询/读回原有日志，不重放 SDK 调用。
- `todo.retry --input-file`：previousRequestId + 新 request。只允许日志证明未应用的操作，重读基础版本并重新核验许可与依据；未知或已有部分写入不能盲重试。
- `todo.resumeIdentity <原 requestId>`：仅已有 create 的内容读回已确认、原生 id 未确认时，在当前有效 TODO 许可下补原生身份；不新增另一个任务。

外部请求 ID按真实范围、client 标签隔离，日志另外记录通道实例、连接、client 标签、运输请求及命令。标签用于调用关联，不证明自然人或模型身份。Journal 记载此 client 最后显式读取的共同/项目指导来源与版本、读取/返回时刻；未读取时为 null，不伪造自动加载，也不证明 Agent 已遵守指导。重试保留原请求和新的来源版本。

## 完成依据与限制

complete 使用当前工作真实材料服务的 scoped read，核验 ready/available、实际文本 SHA-256、所提版本及原样片段确实存在。写入前再次读取材料，随后重新检查原文与原生输入；变化使状态操作整体拒绝。只修改 TODO 为 DONE，并在同一次 SDK 更新中追加 `**[记录]**` 与服务实际返回的 reference。原措辞、后续条件、属性与层级保持；reopen 保留旧依据记录。

终端属性没有换行时，依据插在该属性串之前，旧属性保护不放宽。实测 Desktop 会把已有 `id:: <目标 UUID>` 移到首行后；新 TODO 的受信读回只允许这个确切的原生身份调整，去掉这一行后其余字节必须完全一致，其他属性和正文不作模糊匹配。Journal 同时保留 proposedContent 与 actualContent，明确记 `native-id-after-first-line`。旧 content.apply 读回仍严格比较。未知日志只能观察原结果，不因后来识别宿主行为就自动冒充原操作已确认。

这是对材料版本及片段的机械核验，不能证明任务的全部业务语义已满足。Agent 必须以实际执行事实作完成判断；用户授权不代替这个判断。当前并行阶段只能消费基线可读文本材料，新格式和引用能力由 A 合入后核验。不接受外部 `verified:true`、任意文件路径、替代全文或 actor。

外部 Agent 的 materials.capture 只保存文件及返回真实引用。已许可的文件写作不自动在 Graph 插入材料链接；正文引用走正文或 TODO 的独立许可和 Journal。用户原有本地收纳入口保持其已有语义。这是 A 材料 controller 中一个最小内部接线参数，合入时必须保留。

先持久化 intent 再调用宿主。响应的 status、durable、journalProblem 和每项事实必须一起判断：最后日志失败可能出现实测已写入但 durable=false，不能把它当可靠结项；create 的内容与原生身份可能部分成功。已确认请求重复只返回原结果，撤销许可后仍可在同范围只读重连查询。材料与 Logseq SDK 没有跨系统原子事务，核验后被其他写入者改变的普通 IO 竞态仍属于实测限制。
