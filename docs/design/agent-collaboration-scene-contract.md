# 协作现场与共同指导

复用既有 private companion、workspace identity/manifest、WorkspaceContextService 与内容 Journal。新入口不创建聊天、MCP、Kernel 身份或第二套来源库，也不改用户全局 Agent 配置。块型工作先关联真实目录；页面型外部协作仍待扩展，不能假装页面是可写根块。

本地「带当前工作去协作」填写本次请求并选必要背景，外部 payload 不能自选这些内容、路径、作者或许可。请求草稿使用插件 UI 的 localStorage；正式现场使用插件 FileStorage，记录原有 scope/workspaceId/directory、manifest entryFile 和 source publisher revision。已有用户 WORKSPACE.md 不覆盖。

`workspace collaboration refresh` 重读已保存原文与所选背景，保留完整句子、版本、真实层级及必要祖先上下文。材料只用现有服务的 ID、path、reference 与版本；Node companion 通过既有受限文件观察及会话关联补充 files/sessions。没有可靠 URL 时如实说明。读取不要求退出原生输入，也不读取 getEditingBlockContent/textarea.value；editing 状态与 `nativeDraft.included:false` 分开记录。

`workspace collaboration read` 返回保存的 scene 与当前核验的 current。保存的 source/text、阅读方案和指导版本不会因 current 改变被解释为新现场；sourceMatches、materialsMatch、guidanceMatches 与当前权限分别报告。来源持续改变、缺失或核验失败不能生成 checked 新现场。源、关联背景、材料或本次请求在准备期间改变会拒绝保存当前提议。阅读层状态属于展示，不提供写入权限。

共同指导唯一 key 为 `agent-collaboration-common-guidance-v1`；第一次只读默认文本，无存储写入。项目差异 key 由受信 graphId/workspaceId 派生，不由外部指定。明确本地保存采用源版本校验、串行及读回；腐坏或 IO 失败不能静默退回默认并覆盖。FileStorage 无跨进程事务保证，普通 IO 竞态仍需按实际宿主列出边界。新读取返回实际文本 SHA-256、source key/origin、loadedAt；旧 scene 保留自己的加载内容。共同指导并不自动加载到任意 Agent 或当前聊天，受支持入口显式运行 `workspace guidance read`。

新连接默认建立只读 ScopeLease，不补写 native id，不创建正文 Journal intent。相同请求已有可靠结果仍可查询；新正文补丁、identity 恢复写入与原块移动须正文/结构许可。文件写作是连接内独立本地 grant；Node 在文件写入前检查，插件再次检查，材料自身权限仍适用。普通 TODO 新权限尚待实施；这些许可不授予正式端口或认可。

工作范围限制附加在私有 lease 上，不能由 payload 更改；源执行器在每次读/宿主写入边界核验。工作切换后 lease 被永久撤销，回到原范围不会恢复。停止连接同时清除连接、读法请求/高亮及所属内容 lease；重绑定/Graph/卸载/晚到调用继续使用既有生命周期保护。客户端标签是关联字段，并非独立认证或可证明的模型身份。

阶段验证：现有独立 CLI、真实文件与 Journal 回归覆盖场景/指导读取、旧版识别、共同/局部差异、拒绝写入、恢复及永久撤销；真实 Desktop 的 101/25 块工作均建立只读现场，CLI 拒绝未授权正文与材料写入；一处共同指导更新后，两入口实际重读同新版，项目差异保持。切换工作撤销旧连接。普通 TODO、写作 Journal 的指导/作者关联、最终 A 与仓库外安装还未完成，不能由这一契约代替验收。
