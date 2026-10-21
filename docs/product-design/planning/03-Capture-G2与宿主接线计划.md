# Capture A：G2 方案审查与宿主接线计划

日期：2026-10-21（Asia/Shanghai）。共同基线输入：`f992619025f5b4d086a2e8ee1729936d488ecc89`。本记录回应 A 线的 `INTEGRATION-REQUEST.md`，只发布审查结论和接线计划；不修改 A/B 模块，不导入未提交代码，不宣称 G2/G4 已验收。约束继续来自[共同契约](02-并行开发契约.md)、[A Goal](goals/01-Capture-Inbox-Goal.md)与[待决登记](../DECISION-REGISTER.md)。

## 1. G2 结论

**批准作为可实现、可验证的单设备工程方案：** A 在自己的模块内实现 `FileCaptureStore`，私有文件保存 Capture、追加编辑版本、归档状态、请求意图/结果和草稿；无项目 Capture 合法，不新建占位正式对象，不写 Graph、Journal 或任意项目目录，不承诺跨设备同步。MaterialService 的 Graph/destination 约束使它不能直接承担无绑定 Inbox；可复用其请求指纹和读回原则，不复制材料的 ready 为 Inbox 状态。

这是工程方案批准，**G2 最终通过仍取决于实际文件、并发、故障及重启验证**。Journal/Inbox 的长期权威关系、跨设备同步和正式写入权限没有因此定案。

## 2. 必须满足的存储条件

- 根目录由可信 DSH 宿主决定。默认候选为宿主既有 `bindingStateDirectory`（缺省 `~/.dsh/logseq-workbench`）下的 `capture-inbox`；隔离 profile 必须由宿主配置独立的 Capture 私有根。不要假定不同 profile 默认就隔离了这些文件。最终路径只由主代理在接线中设置，不接受浏览器、Agent 或命令 payload 的 root/path。目录/文件须检查权限、所有者、符号链接和真实路径，文件名仅由内部标识派生。
- **持久分区与活跃校验分开。** 比较完整 scope/binding 用于操作前验证；`generation`、Kernel `workObject.version` 和其他内容版本不是新的持久身份，不能因重连或正式对象版本递增就让旧 Inbox 消失。用稳定身份构成模块本地 partition key，版本作为捕获证据保留。没有可靠正式映射时 `workObject` 为 null，不从 cwd 猜测。
- A 的分区设计须交付 canonical key 样例：无项目/有会话、两个 Graph 同 UUID、两个 session、页面 scope、断线重连、对象版本变化和目录搬迁。`pageName`/directory 变化不能静默迁移条目到另一个范围；应能保留并明确回访原分区，迁移另行审查。第一版不新增跨 session 全局聚合/隐式归属。
- 不可变意图和递增版本；同 key 同请求恢复原结果，同 key 不同请求拒绝；新 key 相同正文可新建记录。编辑、归档、恢复旧正文都做 CAS，恢复产生新版本，不覆盖原始或后来版本。幂等与 CAS 必须跨进程有效，不能只靠内存 queue。
- 明确发布协议：文件 fsync、发布目录 fsync、读回确认后才 saved。平台不支持、同步失败、磁盘满、半写或回执丢失应返回诚实的 unknown/partial/failed，不将 rename 成功直接当持久化证明。崩溃后的临时/意图文件不能被当作已发布正文，重试沿用原 key。
- 列表、版本、文本和请求大小有边界；存档来源仍是数据，不作为路径、HTML 或权限执行。读取损坏/外来文件要报告，不靠覆盖重建掩盖损坏。卸载入口时保留已存数据和未知请求。
- 客户端提供的来源字符串只作待核对数据；宿主应依据当前已授权快照/材料记录核实 sourceId、target、版本与材料引用。只有格式正确不能证明来源真实或属于当前范围。无法核实的来源应拒绝或明确保留为未知，正文仍可无来源捕获；不得为核实自动扩大读取范围。

## 3. 主代理接线范围

| 层 | 计划 | 边界 |
|---|---|---|
| DSH 宿主 | 在 `src/index.mjs` 的受认证连接内实例化 A 的已提交 Store；从可信配置注入私有根 | 不新增模型工具，不将 Capture 自动纳入 system prompt |
| 服务与 RPC | 在 `src/service.mjs` / host route 注册 context、list、execute、readDraft、saveDraft 所需入口；最终名称以 A 已提交协议为准 | 严格字段校验与大小限制，不接任意 root/path/客户端权威 context |
| 工作上下文 | 宿主 inspect session、读取既有 binding，构造 WorkUiContext；暂不增加 Kernel 身份查询，无法可靠映射则 null | 在读取/提交前后复核 session、完整 scope/binding、generation 与进程生命周期；客户端快照只是并发前提，不是授权 |
| 传输生命周期 | 服务签发与本次宿主进程、session、分区及连接代次绑定的上下文凭据，RPC 校验后重建上下文 | 旧进程凭据、错 session、错分区与迟到结果失败关闭；不能仅接受客户端给的数字 generation |
| DSH 客户端 | 在 `src/client.jsx` 注册轻入口，挂载 A 已提交 controller/view 与局部样式 | 不接第二套聊天，不复制 Store/公共模型；不编辑 A 模块来适应接线 |
| SharedUiPort | 由主代理实现宿主适配；在用户引用动作中同步 captureInsertion，任何异步前保存 span；完成后用同一 span insertText | stale/busy/unavailable 保留引用；不 setDraft、submit、换 cwd 或重绑 session。returnFocus 仅回原有效触发控件 |
| Logseq 入口 | 待 A 已提交模块后判断所需挂载；若需要持久化只能接同一受控存储服务 | 不另建 Logseq 私有 Inbox，不为便利暴露无认证本机 HTTP 写入口 |

显式切换前尽力保存原分区草稿；突发断连后保留未保存输入并显示状态，不能把它保存到新的分区，也不能为了保存旧草稿绕过过期上下文校验。恢复时重新取得原分区的有效上下文。

## 4. 交接顺序与验收

1. A 在自身分支提交协议、Store、controller/view、行为/真实文件测试和此请求的修订版，提供实际 commit SHA、导出与 props、partition key 样例及测试结果；不要为等待接线修改共享核心。主代理不依赖 A clone 的未提交文件。
2. 主代理审查该提交，独立运行真实文件/CAS/故障/重启测试；不以 Worker 或 A 的自述代替 G2 验收。若协议不满足上述条件，审查意见回到 A 模块，不在 main 复制另一套实现。
3. 通过后在 main 按契约整合 A 的已提交模块，再串行增加上述共享接线和适配测试。共享接线提交必须能独立构建，不导入另一分支尚未合并的文件；必要的模块依赖先合并，不能发布悬空 import 或假可用入口。
4. 接线进入远端 main 后，A 普通 merge 获取，不 cherry-pick 另一份共享实现，不 reset 或 force-push。B 只在需要该共同接口增量时获取 main，不需要导入 A 的模块来完成历史数据适配。
5. 验证服务端伪造 context/root 拒绝、过期凭据、会话隔离、重启和断连；原生草稿既有正文、异步续写、换 session、提交锁定及返回焦点。整合后先 build 再根 check，并核对生成 diff。
6. 真实 DSH/Logseq 使用独立合成 Graph 与隔离 profile 验收入口、存储/服务重启、引用、来源、窄屏、减少动效；真实 Desktop 和物理中文 IME 与 scripted host-proof 分别记录。缺少这些证据时只报告模块/接线阶段完成，整体 A Goal 不算完成。

本次尚未执行上述模块或宿主验收。待 A 的可审提交出现前，主代理只发布本计划，不创建功能占位实现。

后续进展：`7b49d00e` 的[独立审查](04-Capture-7b49d00e审查.md)发现六项问题，未整合该版本。主代理已在共同 `copilot-ui-port.ts` 实现不依赖 A/B 的原生交互适配器；8 项合成适配边界测试与 6 项既有 DSH service 测试通过，Logseq workspace 类型检查和受影响文件 ESLint 通过。这些只证明同步 span、上下文失效、插入/焦点边界，尚未注册真实宿主入口，也不等于模块 G2 或真实 DSH/Logseq 验收。
