# P2-G Migration 逐项审阅与计划创建 Desktop Gate

日期：2026-07-26
branch：`feature/task-copilot-mvp`
代码提交：`c660f2d00be55bfcf606a3f64d329deaab193473`
插件构建时间：`2026-07-26T14:17:55+0800`

## 运行环境

- Logseq Desktop：0.10.15；
- Test Graph：`logseq`；
- 宿主主题：Dark；
- 窗口：994 × 700；
- Launcher：重新安装 `c660f2d` 打包 payload 后 PID `77457`；
- owned Local Service：新 PID `77567`；
- 安装的 `service.js` 与仓库构建 SHA-256 一致；
- Bundle：仓库忽略目录中的专用脱敏 2 项 Recovery Bundle；截图不含私人正文、路径、
  token 或凭据。

## 真实操作链

1. 最新 Plugin reload 后经 command palette 打开 Task Copilot，Runtime/Store/Graph READY。
2. `更多 → 迁移 → 选择文件`，通过原生文件选择器选择脱敏 Bundle。
3. 只读检查得到 2 项：1 项建议直接迁移，1 项建议保持普通内容；前台显示当前会话的一行
   有界摘录以辨认项目。
4. “保持普通内容”项输入判断依据并保存；直接迁移项保持机器建议并保存。
5. 只有两项都保存后才出现“保存审阅并创建迁移计划”。
6. 创建结果明确：2 项完成审阅、1 项准备迁移、1 项保持普通内容、尚未导入正式对象。
7. SQLite 只读回查：`migration_runs=1`、状态 `PREVIEWED`、summary
   `{total:2, import:1, keepOrdinary:1, defer:0, exclude:0}`；
   `migration_batches=0`、`formal_objects=4`、`PENDING commits=0`、恢复点为空。
8. Plugin reload 后重新进入迁移：文件与逐项 session 材料已清空，`迁移计划 1` 持久显示，
   下一步仍是确认恢复点和批次范围。

## CURRENT 截图

- `p2-g-26-migration-item-review-current-dark.png`：当前会话逐项阅读与第一项决定；
- `p2-g-27-migration-decisions-complete-current-dark.png`：两项决定保存完成，计划入口开放；
- `p2-g-28-migration-plan-created-current-dark.png`：PREVIEWED 计划创建成功；
- `p2-g-29-migration-plan-reload-current-dark.png`：reload 后 session 清空、计划账本保留。

## 交互评估

- 用户无需理解 run ID、hash、SQLite、batch enum 或内部 identity；前台只有材料、决定和
  一个主动作。
- 一行摘录解决“只看计数、不知道在审什么”的缺口，但当前界面整体仍使用亮色卡片覆盖 Dark
  宿主，Light/Dark token 与窄栏仍需集中视觉 Gate。
- 本 Gate 的判断依据使用英文脱敏测试文本，只验证输入/保存/正式 Validator 链，不作为中文
  文案质量样本。
- 这是 Migration Review/Preview 的完整链，不是正式 Migration 完成：恢复点、Import、
  Verify、Activate、失败续跑和 Undo 仍 OPEN。
- 本 Slice 不调用 LLM，也不新增 Skill；Migration 决策保持确定性机器分类 + 用户明确判断。
