# V2 Slice A Desktop 集中验收清单

> 状态：`READY_FOR_CONSOLIDATED_RUNTIME`。自动证据已覆盖首次启用分支、descriptor 校验、Service probe 和受限状态；以下仍需 Logseq Desktop 0.10.15 真实验收，不能用 Node 测试代替。

## 安全边界

- 使用专用空测试 Graph，不修改生产事项；
- 启动前记录 Graph 文件列表、FileStorage 键和 Service/Provider 请求计数；
- descriptor 仅存放在本机 0600 文件，截图、诊断、报告不得包含 token 或完整本地路径；
- 不启动迁移 Commit、Restore 切换或模型调用。

## A-RT-01 未配置的首次启用

1. 清空 `serviceDescriptorPath`，重新加载插件；
2. 打开 Task Copilot，确认只有“开始使用”“迁移现有内容”“检查系统状态”三个主入口；
3. 逐一点击，确认有明确反馈，迁移入口只解释 Preview/Confirm，不执行写入；
4. 打开 Diagnostics，确认 `SERVICE_DESCRIPTOR_PATH_REQUIRED`、`formal_writes_available=false`、`graph_editing_available=true`、Store `NOT_STARTED`；
5. 对比启动前后文件与请求计数：无 Graph 扫描产物、无 FileStorage 初始化、无 SQLite 迁移、无 Provider 请求；
6. 在 Logseq 中新建和编辑普通 Block，确认正文功能不受影响。

## A-RT-02 Service READY

1. 用专用测试 Graph 启动 `task-copilot-service`，确认 descriptor 是绝对路径、普通文件、权限 0600；
2. 将路径写入插件设置并 reload；
3. 确认 Diagnostics 为 `READY`，protocol/capabilities 与 Service 一致；
4. 确认诊断 JSON、Console、Graph、FileStorage 和截图均无 session token；
5. 再次 reload，确认重新 probe 且不缓存过期 token。
6. 确认 Diagnostics 显示 `V1 FileStorage inactive`，旧 Capture/Proposal/Commit 写入口不可执行；对比 FileStorage，确认未因 V2 启动创建或更新 V1 Slot。

## A-RT-03 故障与恢复

1. 停止 Service，重新打开插件；
2. 确认进入 `SERVICE_UNAVAILABLE` 受限态，不出现任何正式写入成功提示；
3. 确认 Logseq 原生正文仍可编辑；
4. 使用错误协议版本的脱敏 descriptor，确认 `SERVICE_PROTOCOL_MISMATCH`；
5. Service 保持停止时创建 `[任务] 断线同步测试`，快速改名两次；确认正文可正常保存，Diagnostics 显示 `explicit_sync.pending=1` 且没有正式写入成功提示；
6. 不 reload Plugin，恢复 Service 并在设置中重新触发连接；确认只提交最新标题、pending 回到 0，SQLite 中只有一个对象和一个 Primary Anchor；
7. Service READY 时先建立一个已绑定 Task；卸载 Plugin 后修改其标题，再 reload Plugin，确认恢复检查只按 Service 返回的 UUID 读取该 Block，并经统一同步命令更新同一 object_id/Anchor；
8. 删除一个已绑定 Block 后 reload，确认 Diagnostics 标记 `EXPLICIT_SYNC_PRIMARY_ANCHOR_MISSING`；通过只读查询确认 Object 仍存在、Anchor 为 `missing`、Object version 前进一次且有 `observe_primary_anchor` Audit/Receipt；
9. 将另一已绑定 Block 移除显式标识或改成冲突形态，确认 Object 保留、Anchor 为 `conflict`，没有静默类型迁移；
10. 在同一 UUID 恢复原显式语法，确认 Anchor 回到 `active`、object_id 不变；再等待一轮低频检查，确认相同状态不再增加 Object version 或 Audit；
11. 将一个已绑定 Block 移动到另一个测试页，确认 UUID、object_id、anchor_id 和 Primary Ownership 都不变；
12. 复制该 Block，确认 Logseq 给出新 UUID，Service 为副本建立不同 object_id/anchor_id，原对象不被覆盖；
13. 保持 Plugin 运行，修改另一个已绑定 Block，等待一轮 5 分钟低频检查，确认自动收敛且没有全 Graph 扫描；
14. 删除或破坏一个 Task 的 Primary Anchor，再创建一个未绑定的同类型显式 Block；选中新 Block，在 Diagnostics 打开 Primary Anchor repair，确认面板显示旧 Anchor 状态、新 UUID/正文、同类型边界及“旧 replaced / 新 active”影响；
15. 不勾选确认直接提交，确认可见拒绝且 SQLite 零写入；勾选后提交，确认原 object_id 和 Primary Ownership 不变、旧 Anchor 为 `replaced`、新 Anchor 为 `active`，且 Audit/Receipt 只增加一次；
16. 再使用一个候选执行预览；分别验证（a）预览后修改新 Block 正文，（b）预览后让旧 Anchor 恢复/变为其他状态或让对象版本前进，（c）预览后重连 Service；三种旧预览提交都必须明确停止且不写 SQLite。真正发出提交后面板不得显示无效“取消”；
17. 在 Plugin 退出期间于当前专用测试页新建至少两个从未物化的合法显式 Block，并新建一个空标题或类型冲突块；reload 后确认不会自动扫描或写入。在 Diagnostics 手动执行“扫描当前页候选”，确认范围明确为当前页、UI 如实说明 Logseq 提供整页树而 Plugin 只处理前 256 项、已有对象不重复出现、非法块只报告数量且两个合法项仍未自动写入；模拟 Anchor 分页超过查询预算时应整轮拒绝且零写入。选择一项后修改其标题再提交，确认 stale 预览明确停写。重新扫描后只同步一项，确认 `/objects/synchronize` 建立一个 Object/Anchor/Audit/Receipt，另一候选保持未写入；重连 Service 后旧预览必须失效。记录 UI、SQLite、Audit/Doctor 和无全 Graph 扫描证据。
18. 新建一个 `[任务]`，其下放置裸 `TODO` 内部步骤，并在更深层放置一个显式 `[决策]`；分别执行逐项编辑、快速连续编辑和整棵子树粘贴。确认事件 payload 只作为 UUID 通知，300ms 后重读当前正文；Task 与 Decision 各有独立 object_id/Anchor，裸 TODO 没有 object_id 且不产生 Service 写入；Diagnostics 不出现隐式整页/全 Graph 扫描。制造不可读子引用、33 个并发新根或超过 256 Block 处理预算的专用 fixture 时，确认只同步失败前已权威验证的前缀，失败点和未遍历项不写入并明确进入 `reconciliationRequired`；根不可读时整轮零写入。卸载 Plugin 时确认未开始的读取被清空、进行中的读取最多返回当前调用且不继续读取后代。

## 通过标准

- A-RT-01..03 全部记录“预期 / 实际 / 证据”；
- 无静默扫描、迁移、模型调用或 V1/V2 双写；
- 任何 Service 错误都只限制正式领域写入，不影响原生正文；
- 不得在完成本清单前将 V2-FIRST-001 或 E2E-15 标记为 `DONE`。
