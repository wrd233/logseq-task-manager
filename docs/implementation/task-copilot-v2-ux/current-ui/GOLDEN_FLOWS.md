# Current Golden Flows

## P2-C Blank Project Creation

状态：`BLANK_DONE_PAGE_PRESERVE_DEDICATED_BOUNDED_DONE_MINI_AND_PAGE_REUSE_OPEN`

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
随后移除 Project/Anchor/受控空 Page；再次 restart 后系统健康。Page“升级当前 Page”、
MiniProject 来源、Light、窄栏和全程同一 commit 的中间截图仍 OPEN，因此 P2-C 不是完整
Done。

## 交互评估

- 优点：用户只需一次回答一个问题；确定性基线和正式安全链未被 LLM 覆盖；恢复复用同一
  Commit；最终健康态不要求理解技术状态机。
- 已修复：英文/双问题输出、Preview 关系枚举冲突、Logseq properties Block 被误判为正文、
  最近修改误路由通用 Undo、`deletePage` UUID/name 契约、删除读回延迟、完整 restart 后
  runtime UUID 漂移、mounted diagnostics 旧快照和 Grill validation 错误误报 500。
- 待改进：Review 历史卡片密度偏高；“尚不能确认安全撤销条件”与可点击的预检式 Undo
  同屏时仍可能让用户困惑；真实 Provider 多次给出超出 Page 写入权限的建议，虽被 Validator
  安全拒绝但增加重试负担。需要在既有 Skill 中降低拒绝率，并在后续状态翻译 Slice 中把
  文案改成“撤销时会重新检查”。
