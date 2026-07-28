# P0-K Block Condition 返回现场 Desktop Gate

## 运行身份

- 状态：`DONE_DESKTOP_REPRESENTATIVE`
- 分支：`feature/task-copilot-mvp`
- 精确 Plugin 构建提交：`73dc1e26f6102672b17cbbe0c62268f027b45e04`
- Plugin 构建时间：`2026-07-28 15:33:54 +0800`
- Logseq：`0.10.15`
- Graph：File Graph `logseq`，专用测试内容
- 窗口：`999×720`
- 主题：Logseq host Light / Plugin Dark
- Service / Launcher：真实本地运行
- Provider：本 Gate 不调用

## 真实操作链

1. 在脱敏 Query 投影上打开 Block 菜单并选择“Task Copilot：暂时做不了”。
   宿主没有提供可用于正式写入的受控对象身份，因此系统安全停止，只显示“这条内容尚未由
   Task Copilot 管理；原状态未改变。原内容保持原位”。没有猜测来源、没有打开错误对象、
   没有正式写入。
2. 从“现在”打开正式测试任务 `P0-J Desktop Slash Gate 20260726` 的原文，再从同一 Block
   菜单进入“暂时做不了”。
3. 首屏只说明本次只记录无法推进的原因、不完成事项、不移动正文、不改变当前关注；提供
   “等待别人 / 被问题卡住 / 我先暂停”三个互斥意图和一个取消动作。
4. 进入“被问题卡住”，空原因提交被拦截；界面明确显示“没有保存，原状态未改变”。自动回归
   证明该校验发生在 `changeCondition` 之前。
5. 输入脱敏测试原因“等待本轮界面验收”并保存。系统完成正式 Condition 变化，关闭面板，
   返回同一 Logseq Block，提示当前关注保持不变并提供撤销语义。
6. 在同一 Block 菜单执行“撤销上一次状态变化”。系统返回同一 Block，提示任务恢复为
   “可以行动”，当前关注保持不变。
7. 重载 Logseq 后打开“现在”，同一任务仍显示“当前可以继续推进”。测试环境已恢复到操作前
   的业务状态。

## Desktop 驱动修复

第一次真实 Query 降级暴露出旧提示仍包含 `Block / active Primary Anchor`。写入边界本身
正确，但前台泄漏了内部身份模型。`73dc1e2` 将空身份、未管理、关联冲突、对象缺失、已结束
和正式能力不可用统一翻译为用户结果，并增加 fail-closed 零写入回归。没有新增正式状态、
Runtime、Skill、Validator、恢复分支或写入路径。

## 自动证据

- Plugin tests：`347/347`，`0 skipped`
- Plugin typecheck：PASS
- Plugin build：PASS，产物内嵌 `73dc1e26f610`
- 根级 `./scripts/check.sh`：PASS；145 条稳定规则、构建/产物边界与恢复演练
  `differences=[]`

## CURRENT 截图

| 文件 | 结论 |
|---|---|
| `p0-k-query-safe-degrade-current-73dc1e2.jpg` | Query 无可靠正式身份时安全停止，用户语言、零猜测 |
| `p0-k-condition-route-current-73dc1e2.jpg` | 三个用户意图；主结论和安全边界在首屏 |
| `p0-k-condition-validation-current-73dc1e2.jpg` | 空原因没有保存，原状态不变 |
| `p0-k-condition-success-worksite-current-73dc1e2.jpg` | 保存后返回同一原文，关注不变、可撤销 |
| `p0-k-condition-undo-worksite-current-73dc1e2.jpg` | 撤销后返回同一原文并恢复“可以行动” |

## 边界

- 该 Gate 关闭 P0-K 的成功、失败、Undo 与 reload 代表链，并与既有 main Page、来源移动/
  删除、Query/reference/right-sidebar bounded 证据共同支持 P0-K
  `DONE_DESKTOP_REPRESENTATIVE`。
- 它不关闭 P0-J 中文 IME/受限视觉，不替代 P1 Attention/Block Marker 或 P2 高风险恢复
  Gate，也不代表 P0 或完整 Goal 完成。
- API Key、私人正文和内部数据库路径未进入截图、普通日志或仓库。
