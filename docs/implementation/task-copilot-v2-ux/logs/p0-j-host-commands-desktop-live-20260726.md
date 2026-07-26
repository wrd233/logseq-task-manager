# P0-J 中文命令与可配置快捷键 Desktop Gate

## 结论

状态：`HOST_COMMANDS_DESKTOP_PARTIAL_CHINESE_IME_RESTRICTED_VISUAL_OPEN`

当前真实 Logseq Desktop 已完成命令面板冷启动单次注册、代表动作路由、四条中文 Slash
可发现、任务语法插入，以及一个用户自定义快捷键的配置、触发、清理与冷启动复验。中文
原生 IME、Service/Provider 受限态、Light 与窄栏仍未完成，因此 P0-J 保持 `PARTIAL`。

## 运行基线

- branch：`feature/task-copilot-mvp`
- Slash / palette 运行构建：`e8db32f1af6deee6e37e222ade5c4f68298954db`
- configurable binding 运行构建：`a835f59bf1c4d0f7583b403fd86a57a18d59d2c7`
- Plugin：`0.1.0`；最新 dist 构建时间 `2026-07-26 21:01:58 +0800`
- Logseq Desktop：`0.10.15`
- Graph：专用测试 Graph `logseq`
- theme / window：Dark，`1000 × 720`
- 操作方式：Computer Use 仅操作 Logseq，通过当前可访问性树逐步重验元素；未操作其他前台应用
- 隐私：没有 API Key、descriptor token、数据库路径或私人正文进入截图、日志或报告

## 真实 Desktop 结果

1. 完整冷启动后的命令面板只出现六条 Task Copilot 命令；“打开‘现在’”与“系统状态与
   技术诊断”均路由到当前真实页面，无静默按钮或错误。
2. Plugin Manager 连续 reload 后曾看到重复命令；完整退出并重启 Logseq 后恢复为单组。
   该画面保留为 `HISTORICAL` 宿主 reload residue，不代表冷启动当前体验，也不据此复制
   插件侧注册或新增去重状态。
3. 空白 Block 输入 `/` 后可见“创建任务 / 创建 MiniProject / 创建决策 / 创建成果”四条
   中文 Slash；选择“创建任务”精确插入 `[任务] `，随后 ASCII 标题保持在同一 Block。
4. Computer Use 的 `type_text` 在当前环境会丢失中文字符，因此不能替代原生中文 IME 证明。
   这是取证工具边界，不被记作产品通过，也不被误报为插件缺陷。
5. 修复前，Logseq“设置 → 快捷键”搜索 Task Copilot 为 0 条。`a835f59` 只为既定三项
   高频动作注册空的 global binding；reload 后出现 3 条且均为“未设置”。
6. 临时给“打开‘现在’”设置两段 chord 后，Computer Use 触发 chord 并成功打开“现在”。
   随后把本机 `/Users/wangrundong/.logseq/config/config.edn` 恢复为原始
   `{:shortcuts {}}`；完整冷启动后仍为 3 条且全部未设置。

四条 Slash 共用同一 canonical 插入合同，六条 palette 命令共用同一宿主注册合同；本轮
选取“创建任务”、Now 和系统状态作为代表链，避免把功能与所有宿主、主题、窗口做笛卡尔积。

## 自动与审查证据

- TDD：新增测试先失败，最小实现后通过；
- Plugin tests：`329/329` PASS，`0` skipped；
- Plugin typecheck / build / bootstrap / dist integrity：PASS；
- Standards review：无 finding；
- P0-J Spec review：无 finding；
- 根级 `./scripts/check.sh`：PASS；
- 未新增正式状态、顶层导航、Agent Runtime、Prompt、Skill、Validator 或 Recovery 分支；
- 本 Slice 不调用 LLM / Provider；Validator 拒绝率和模型重试次数不适用。

## CURRENT 截图

- `../current-ui/screenshots/p0-j-02-command-palette-single-current-dark.png`
- `../current-ui/screenshots/p0-j-03-command-palette-open-now-current-dark.png`
- `../current-ui/screenshots/p0-j-04-command-palette-system-status-current-dark.png`
- `../current-ui/screenshots/p0-j-05-slash-command-current-dark.png`
- `../current-ui/screenshots/p0-j-06-custom-binding-current-dark.png`
- `../current-ui/screenshots/p0-j-07-custom-binding-open-now-current-dark.png`
- `../current-ui/screenshots/p0-j-08-cold-start-configurable-shortcuts-current-dark.png`

`p0-j-02`～`05` 对应 `e8db32f` 运行构建；`p0-j-06`～`08` 对应 `a835f59`。历史重复画面
`p0-j-01-command-palette-duplicate-historical-dark.png` 只登记为 `HISTORICAL`。

## 仍开放

- 原生中文 IME 输入与光标体验；
- Service/Provider 受限态下 Slash 正文可用、正式动作清楚降级；
- Light / 窄栏代表性视觉与键盘 Gate；
- P0-H Graph switch、P0-K 多宿主返回和 P1/P2 的其余既定关键路径。
