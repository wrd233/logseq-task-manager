# P2-D Project 操作影响路由

## 结论

状态：`IN_PROGRESS_ROUTER_AUTOMATED_DESKTOP_ENTRY`

这轮只关闭 Project 操作进入错误安全链的风险，不宣布 P2-D 完成。Project 重入、正式对象和
Project Page 更新入口现在先回答“这次要改变什么”，再按实际影响进入既有命令或安全链。

## 路由合同

- LIGHT：Focus、Condition、reviewAt、dueAt、普通 Association；
- MEDIUM：只压缩当前理解或进入点，必须 Review 后应用，不得改变正式结构；
- HEAVY：完整当前接口、Stage mapping、Ownership、批量子对象、正文移动、
  Objectives/Deliverables、拆分合并、Closure 与 external Agent。

HEAVY 必须经过讨论、最终阅读 Preview、Proposal、显式 Commit，并保留 Undo 或 Recovery。
LLM 不获得正式写入权。自动测试逐项保证 Ownership、正文移动、完整结构和 Closure 永远不会
被降级。

## 当前 UI

- LIGHT 显示现有版本化状态与普通 Association 路径，并明确只有具备对应 Undo 的动作才可
  通过最终 Gate；
- MEDIUM 专用叙述链尚未实现，因此只解释边界，不显示虚假保存按钮；
- HEAVY 的完整当前接口继续复用现有 HIGH Proposal→Review→Commit→Undo；
- 其他重操作保留各自安全链，不合并成万能表单。

## 证据

- commit：`419c9e6de950`
- Logseq Desktop：`0.10.15`
- Graph：专用测试 Graph `logseq`
- 主题：Dark
- 自动：router `4/4`，Application `159/159`、Local Service `133/133`、Plugin `271/271`
  与根级检查 PASS
- Desktop：从 `P0 Page Route Gate 20260723` 正式 Project 点击“调整 Project”，三层真实
  选择界面可见
- CURRENT 截图：`../current-ui/screenshots/p2-d-01-project-impact-router-current-dark.png`

## 未关闭

- MEDIUM 真实 Provider→统一 Validator→Review→apply→Undo；
- LIGHT Condition/Association 的可发现 Undo 与 reload；
- HEAVY 完整当前接口的一条 Desktop Commit/Undo 链；
- Ownership、正文移动、批量子对象和 Closure 各自路由后的用户链；
- Light、窄栏与 Project Page Head 宿主入口。
