# P2-G Migration Import / Verify / Undo Desktop Gate

日期：2026-07-26
branch：`feature/task-copilot-mvp`
代码提交：`593d14ac2c7221c839386e1b6687dca8fe104007`
插件构建时间：`2026-07-26T14:52:15+0800`

## 运行环境

- Logseq Desktop：0.10.15；
- Test Graph：`logseq`，仓库忽略的专用测试 Graph；
- 宿主主题：Dark；
- 窗口：994 × 700；
- Launcher：最新 payload 重装后 PID `83018`；
- owned Local Service：PID `83028`；
- 安装态与仓库构建 `service.js` SHA-256 均为
  `2674e250521c17352279ad0d3cc29bc05d21ff4f8c347cdab727798d2e392813`；
- 材料：忽略目录中的专用脱敏 2 项 Recovery Bundle；截图不含凭据、token、内部路径或
  私人正文；
- Provider：未调用。本链是确定性迁移事务，不需要 LLM 或 API Key。

## 真实操作链

1. 从既有 `PREVIEWED` 计划开始；SQLite 基线为 run/batch `1/0`、formal objects `4`、
   PENDING Commit `0`。
2. 用户点击“准备下一批”，重新选择创建计划时的同一 Bundle。Plugin/Service 只读核对
   source hash、run 与未导入 Review scope；前台只显示一项有界标题和来源类型。
3. 用户只选中已审阅的直接迁移项；创建恢复点后才出现独立 HIGH 最终确认。此时
   migration batch 仍为 `0`，正式对象仍为 `4`。
4. 明确确认并导入后，UI 显示“1 项等待验证”；SQLite 为 run `IMPORTING`、batch
   `IMPORTED`、scope `1`、formal objects `5`、PENDING `0`，run 已绑定校验过的恢复点。
5. 点击“验证本批”后，UI 显示“1 项投影完整”；SQLite 为 run/batch
   `VERIFIED/VERIFIED`、validation `PASS`、object count `1`、formal objects `5`。
6. 完整退出并重启 Logseq。重新打开 Task Copilot 后，session Bundle 和恢复点引用已释放，
   同一 batch 从正式台账重新出现，仍可“准备安全撤销”。
7. 进入独立 HIGH Undo Review；前台明确只撤销未被后续修改/引用的本批对象，并保留审阅、
   验证和 Audit 证据。
8. 确认后 UI 显示“正式对象已回到导入前范围”；SQLite 为 run `PREVIEWED`、batch
   `UNDONE`、formal objects `4`、target evidence `0`、PENDING `0`。
9. 再次完整退出并重启 Logseq。迁移计划、UNDONE batch 与“准备下一批”仍可从台账重建，
   Runtime/Store/Graph READY。

## CURRENT 截图

- `p2-g-30-migration-batch-scope-current-dark.png`：同材料核对后，只显示一项可选择范围；
- `p2-g-31-migration-recovery-review-current-dark.png`：恢复点 PASS 后的独立 HIGH 导入确认；
- `p2-g-32-migration-imported-current-dark.png`：导入成功、尚未验证；
- `p2-g-33-migration-verified-current-dark.png`：本批逐项验证 PASS；
- `p2-g-34-migration-verified-reload-current-dark.png`：完整 Logseq restart 后 batch 与 Undo
  入口从台账恢复；
- `p2-g-35-migration-undo-confirm-current-dark.png`：独立 HIGH 撤销边界；
- `p2-g-36-migration-undone-current-dark.png`：撤销后正式对象回到导入前范围；
- `p2-g-37-migration-undone-reload-current-dark.png`：第二次 restart 后计划、UNDONE batch
  和下一批入口仍可读。

## 交互评估

- 用户不需要复制 run/batch/object/backup identity，也不需要使用 CLI 或理解 SQLite 状态；
- 重新选择材料、选择范围、创建恢复点、正式导入、验证和撤销是六个可理解的独立判断，
  没有把恢复点创建伪装为已经导入；
- 导入后唯一主动作是验证；验证后唯一高影响动作是预检式安全撤销；
- 完整 restart 后无需记忆上一会话材料，正式台账恢复正确下一步；
- 当前插件表面在 Dark 宿主仍偏亮，且 994×700 下需要滚动看完整 batch card；Light/Dark
  token 与窄栏仍需集中视觉 Gate；
- 这是 Import/Verify/Undo 正常主链 DONE，不是 Migration/P2-G DONE：Activate、
  import/verify/undo 失败注入、Service 中断不确定恢复、最终退出日常 UI 仍 OPEN。
