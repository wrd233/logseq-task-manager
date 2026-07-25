# Current Golden Flows

## P2-C Blank Project Creation

状态：`ALL_SOURCES_DONE_VISUAL_GATES_OPEN`

1. 项目 → 正式事项与创建 → 开始梳理 Project；
2. Service 构造 Blank Context，真实 DeepSeek 每轮只处理一个机器选定的不确定性；
3. 前台分开显示事实、推断和未知；回答只进入 session；
4. 七个机器维度齐备后生成最终阅读预览，仍为零正式写入；
5. 用户进入待我确认，独立接受唯一 HIGH 组；此时仍未创建 Object/Page/Commit；
6. 最终确认后先 prepare，再创建或复用已审阅 Page，最后原子写 Project、Anchor 与当前接口；
7. 若中断，只恢复同一 SemanticCommit，不新建重复 Project；
8. reload 后从项目与最近修改读回同一正式投影；
9. Undo 重新校验 Page ownership、受控 metadata-only 内容和对象版本；专用 Page 按 name
   删除，复用来源 Page 原样保留；
10. 再次 reload 后系统状态必须 READY，Pending/Recovery/Anchor conflict 为零。

当前真实结果：Blank Dark 主链 PASS。Page“保留来源另建”主链也 bounded PASS：真实
DeepSeek 七轮收敛，来源三段正文逐字保留；完整 Logseq restart 后 runtime UUID 漂移，
专用 Undo 只以 Service 原账本加精确 Page name/owner/object/commit metadata 安全重绑，
随后移除 Project/Anchor/受控空 Page；再次 restart 后系统健康。Page“升级当前 Page”也
PASS：模型在原材料要求另建与用户明确 reuse 的冲突中保留两者并以用户决定收口，创建/
restart/Undo/restart 全程 Page properties 和三段 Block UUID/content/properties 与创建前
逐字段一致。

MiniProject 演化也已 PASS：正式 Object/version + active Primary Anchor + 精确 Block
子树由 Service 有界读取，七项真实不确定性收敛后只允许
`CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE`；最终 Preview 将五个来源 Block 全部标为
`LINK_AS_SOURCE`。HIGH Review 接受仍零正式写，最终确认才创建专用 Project Page、Project
Object 与 Anchor。reload 后 Project workspace 可重入，inverse Undo 移除本事务拥有的空
Page/Object/Anchor，原 MiniProject v14/OPEN、Primary Anchor、五个 Block UUID/正文/顺序
逐字段不变。首轮真实运行发现 Undo 只回到 Journal；`7a7492a407ed` 将 Service 审阅过的
source return target 传回 Plugin，并只在正式 Page 或 active Primary Anchor 可重验时导航。
最新构建再次跑通真实 DeepSeek 全链，Undo 精确返回原 MiniProject 根 Block，再次 reload
后 `0/0/0`。因此 P2-C 的来源功能矩阵已闭环；Light、窄栏与集中
宿主视觉 Gate 继续 OPEN，不影响 P2-D 启动但仍属于最终验收。

## 交互评估

- 优点：用户只需一次回答一个问题；确定性基线和正式安全链未被 LLM 覆盖；恢复复用同一
  Commit；最终健康态不要求理解技术状态机。
- 已修复：英文/双问题输出、Preview 关系枚举冲突、Logseq properties Block 被误判为正文、
  最近修改误路由通用 Undo、`deletePage` UUID/name 契约、删除读回延迟、完整 restart 后
  runtime UUID 漂移、mounted diagnostics 旧快照、Grill validation 错误误报 500，以及
  MiniProject 演化中的 machine identity/fact key 泄漏、错误 closure 对象和 evidence
  rejection。统一 Validator 现在给出安全分类，并只做一次有界自动修复。
- 待改进：Review 历史卡片密度偏高；“尚不能确认安全撤销条件”与可点击的预检式 Undo
  同屏时仍可能让用户困惑；真实 Provider 多次给出超出 Page 写入权限的建议，虽被 Validator
  安全拒绝但增加重试负担；最新 MiniProject 重跑的最终 Preview 前两次也被安全拒绝、第三次
  在同一答案集上通过，说明分类虽安全但真实拒绝率与用户诊断仍需降低；reuse Preview 还有
  重复“完成证据”标签；新 Project Page
  首屏仍直接露出 ownership/object/commit properties，虽不泄密但工程味过重。需要在既有
  Skill/renderer/Page Head 中继续压缩，并在后续状态翻译 Slice 中把撤销文案改成“撤销时
  会重新检查”。
