# Capture / Inbox — 共同基线接线请求

输入共同基线：`f992619025f5b4d086a2e8ee1729936d488ecc89`。本线只改 Capture 目录及对应测试；不修改共享 port、RPC、入口、全局样式、profile、Kernel 或依赖。

## G2 存储方案待主代理确认

MaterialService.capture 依赖 graph、MaterialDirectories 与 destination(context)，MaterialStore 以材料目录为根；其 ready 不包含 Inbox 队列和追加编辑版本。直接作为无项目全局 Capture 会引入虚假归属。因此建议复用其“原文/请求指纹/读回确认”原则，使用模块私有 Node 文件存储 `FileCaptureStore`，由共同基线主代理批准并注入独立的单设备私有根目录。不能在 Graph、Journal 或任意项目文件中写入；不承诺跨设备同步。

本线协议唯一位置 `protocol.ts`；文件适配器位于 DSH capture-inbox/store.mjs。每个完整 scope/binding、稳定 workObjectId、session 分区，generation 与 workObject.version 仅用于活跃调用保护，重连/对象版本递增可读回原分区。无项目保存允许 scope/binding/workObject 为空；有 session 时仍隔离 session。来源块只接受真实 sourceId/target/contentVersion，材料保存既有 UUID/version/reference，sessionId 单独保留。不扫描来源文件。

不可变请求意图、不可变递增版本；同 requestKey 重试恢复原操作，同 key 变内容拒绝；CAS 发布避免两个进程覆盖同版本。每个落盘文件 fsync、发布目录 fsync、读回核对后才 saved。崩溃后重新读取/同键重试，未知结果不清输入。草稿也是 CAS 追加版本，冲突保留调用方输入。必须通过真实文件/重启测试后再批准接线；不是以 mock Store 完成 G2。

## 主代理唯一所有的接线

1. 在独立 profile 的 DSH 插件服务内实例化并注入 FileCaptureStore；私有根由可信宿主选择，RPC 不接受任意 root/path。批准此具体 G2 方案或返回替代适配器。
2. 注册 capture/inbox 打开入口、按会话授权的 list/execute/readDraft/saveDraft RPC；服务端每次由可信会话重建 WorkUiContext，核对完整 scope/binding/generation，不能信任客户端自报 context。保存范围不是普通文件读取授权。不要给外部 Agent 开放正式操作。
3. 客户端挂载本线 controller + CaptureInboxView，在模块容器安装局部 styles，关闭/重开保留同 controller，或从私有草稿读回。连接改变先保存原分区草稿，不能迁移到新分区。
4. 为每次用户“带去 DSH”交互同步创建 SharedUiPort（异步读取之前 captureInsertion）；闭包保存 native span，再调用同 span 的 insertText。stale/busy/unavailable 必须保留引用，禁止 setDraft/submit/cwd/session 重绑。returnFocus 只回原有效控件。
5. Logseq 安装入口按需挂载模块与同一受控存储服务，不复制第二套模型/公共协议；共享变更先发 main，再通知本线普通 merge。

## 验证门槛

G1/G4：真实独立合成 Graph/profile，记录 DSH/Logseq 版本；已有草稿、异步续写、换 session、提交锁定、关闭返回、窄屏、减少动效、断连/服务重启/进程重启后读回。物理中文 IME 单独验收。主代理整合后根 check 并检查生成 diff。只读脚本/React 替身不能当真实桌面结果。

回滚：卸载新入口并保留私有根；不删除已保存/未知请求/草稿。请求失败读回同 key 后再重试，不能换 key 自动重复保存。恢复旧正文新增版本，绝不抹去原始或后来版本。
