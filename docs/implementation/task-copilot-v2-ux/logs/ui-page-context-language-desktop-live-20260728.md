# Page / Project Page 用户语言与身份 Gate

- 日期：2026-07-28
- 分支：`feature/task-copilot-mvp`
- 最终 exact build：`869127f`
- 中间修复：`f007cb8`、`6462f64`
- Logseq：Desktop `0.10.15`
- Graph：File Graph `logseq`
- 主题 / 窗口：Plugin 显式 Dark、宿主 Light、`1001×720`
- 运行形态：真实 Plugin / Launcher / Local Service

## 场景

1. 在普通测试 Page 的宿主菜单选择“Task Copilot：页面操作”；
2. 确认首屏只使用“当前页面 / 整理当前页 / 查看本页正式事项 / 将本页建立为项目”等用户语言；
3. 返回 Logseq，打开既有受控 Project Page，再从相同宿主入口进入；
4. 首轮真实运行发现该 Page 被错误识别为普通 Page：File Graph reload 后 Page UUID 已变化，
   而 Page Context 仍只接受旧 active Primary Anchor UUID；
5. 修复复用 Project 创建页既有 owner/object metadata，同时要求正式 Project 存在且只有一个
   active Primary Anchor；精确 Anchor 与受控 metadata 冲突时继续 fail closed；
6. reload 最终构建，确认 Project Page 正确显示一个突出主操作“打开项目工作区”，
   “更新项目当前状态 / 讨论项目结构”保持次级，并明确“审阅方案后、确认应用才修改”；
7. 返回原 Page，恢复用户原窗口与主题设置。

## 结果

- 普通 Page 与 Project Page 均有一个突出主操作；三个意图不再使用相同视觉权重。
- 普通路径移除 `Page / Project Page / active Primary Anchor / SQLite / Graph /
  HIGH Proposal / vN / OPEN` 等工程词。
- 正式事项只读列表使用“任务 / 进行中”等用户状态，不显示对象版本。
- File Graph Page UUID 漂移不再把合法受控 Project Page 降级为普通 Page。
- metadata 不能单独授予身份；对象不存在、类型错误、无 active Primary Anchor、重复 Anchor
  或与精确 Page Anchor 冲突时均安全拒绝。
- 本 Gate 只读打开并取消，没有 Provider 调用、Proposal、Commit、Graph/SQLite 正式写入。

## 自动证据

- Plugin：`347/347`，failed `0`，skipped `0`。
- 根级 `./scripts/check.sh`：typecheck、lint、全部测试、build、package/bootstrap/dist、
  architecture boundaries、145 条稳定规则、acceptance rehearsal `differences=[]` 全部 PASS。
- npm audit 仍为既有 `3 high / 1 critical`，本 Slice 没有新增依赖。

## CURRENT 截图

- `current-ui/screenshots/ui-page-context-user-language-current-869127f.jpg`
- `current-ui/screenshots/ui-project-page-context-user-language-current-869127f.jpg`

## 状态边界

关闭 Page Context 用户语言与 File Graph 受控 Project Page 识别的代表性 UI Partial。
不替代 P0-K Query/reference/sidebar 的宿主限制，不关闭 DB Graph Page Head、P1 Attention、
Block Marker、P2-E Recovery 决策或 Final Release。
