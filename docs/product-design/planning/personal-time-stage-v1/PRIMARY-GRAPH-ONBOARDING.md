# 真实主力 Logseq Graph 启用清单（Personal Time Stage v1）

> 适用分支：`feat/personal-time-stage-v1`（Sprint 1–3 全部已落地并验证）
> 目标：在 10 分钟内把个人时间舞台、iCloud 语音入池、Apple 日历轻协同与 `Attention Navigator` 接入真实主力 Logseq Graph，正式启动 14 天主力 Dogfooding。

---

## 第一步：确认 Node 20 与构建产物

本机默认 Node 25 存在 `libsimdjson` 兼容问题，所有 CLI 与服务安装命令均须在 Node 20 下执行：

```sh
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
node -v   # 预期输出 v20.x
npm run build
```

构建完成后确认以下产物存在：
- Companion CLI：`apps/task-copilot-cli/dist/main.js`（开发态也可用 `npx tsx apps/task-copilot-cli/src/main.ts`）
- Logseq 插件目录：`apps/logseq-plugin`（含 `dist/` 与 `package.json`）
- DSH 插件目录（可选）：`apps/dsh-plugin`（含 `dist/`）

---

## 第二步：安装并启动 Companion 开机自启（macOS LaunchAgent）

Companion 是中立的本机常驻中枢，负责托管全局活舞台、纯语义时间容器、iCloud 语音监听、Apple 日历桥接与 MCP 接口（不依赖 DSH 是否打开，不触碰 Formal Kernel）。

```sh
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"

# 1. 安装 macOS 开机自启 LaunchAgent（默认状态目录 ~/.task-copilot-workspace）
node apps/task-copilot-cli/dist/main.js workspace service install

# 2. 启动常驻服务并核对运行态
node apps/task-copilot-cli/dist/main.js workspace service start
node apps/task-copilot-cli/dist/main.js workspace service status
```

预期 `status` 返回 `"running": true` 与 `"launchAgentInstalled": true`。如需使用独立测试目录，可附加 `--state-dir <path>`。

---

## 第三步：一步自检 macOS iCloud 与 Apple 日历权限

运行新增的 `workspace stage-check`，一次性检查 Node 20、Companion 常驻态、iCloud Drive `TaskCopilotInbox` 可读性、Apple 日历只读桥接与 `Attention Navigator` Skill 就绪态：

```sh
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
node apps/task-copilot-cli/dist/main.js workspace stage-check
```

### 若出现 `[ACTION]` 权限提示（全部 Fail Open，不阻断基础使用）

1. **iCloud 语音目录权限（`EPERM`）**：
   - 打开 macOS **系统设置 -> 隐私与安全性 -> 文件与文件夹**；
   - 为当前终端（或 LaunchAgent 使用的 Node 进程）开启 **iCloud Drive** 访问权限；
   - 确认 iPhone 快捷指令「随口记」写入目录为 iCloud Drive 根目录下的 `TaskCopilotInbox/`（Mac 路径：`~/Library/Mobile Documents/com~apple~CloudDocs/TaskCopilotInbox/`）；
   - 放心原则：Companion 对该目录**严格只读**，归档记录仅写入 `~/.task-copilot-workspace/stage-inbox-state.json`，绝不删除或移动原始 `.md` 文件。

2. **Apple 日历权限（`-1743`）**：
   - 打开 macOS **系统设置 -> 隐私与安全性 -> 日历** 与 **自动化**；
   - 允许当前终端 / Node 进程访问并控制「日历」应用；
   - 若你希望记录专注足迹，可在今日容器顶部手动勾选「专注结束后静默写入 `Task Copilot 足迹`」（默认关闭）。

授权完成后再次运行 `workspace stage-check`，确认全部转为 `[OK]`（或可接受的 `[WARN]`）。也可通过运行中的 Companion 随时查验 `/stage/inbox-status` 与 `/stage/calendar-status`。

---

## 第四步：接入主力 Logseq Graph 与外部 Agent MCP

### 4.1 在主力 Logseq 中加载插件
1. 在 Logseq 中开启 **开发者模式（Developer mode）**；
2. 进入 **插件 -> 加载未打包的插件（Load unpacked plugin）**，选择本仓库的 `apps/logseq-plugin` 目录；
3. 确认工作台顶部出现「拉远」入口；若设置了独立 `--state-dir`，在插件设置中同步填好对应 Companion 状态目录（默认 `~/.task-copilot-workspace` 无需修改）。

### 4.2 接入外部 Agent（Antigravity / Codex / Claude Code / DSH）
1. 生成并复制对应客户端的 MCP 配置片段：
   ```sh
   export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
   node apps/task-copilot-cli/dist/main.js workspace mcp config --client antigravity
   # 或 --client codex / claude-code / cursor
   ```
2. 将 `skills/attention-navigator/SKILL.md` 挂载或引用到你的外部 Agent 会话中；
3. 如同时使用 DSH，将 `apps/dsh-plugin` 指向本仓库构建产物，即可用 `Cmd+Shift+G` 呼出独立悬浮活舞台。

---

## 第五步：首日冷启动与 14 天主力 Dogfooding 节拍

### 首日冷启动（10–15 分钟，只需一次）
1. 打开你的外部 Agent，激活 `Attention Navigator`，先**不看旧笔记目录**，直接口述当下脑中真正在意的工作、成长与生活版图；
2. Agent 调用 `stage_get_pulse` 与 `workbench_list_works` 对照真实目录和 iCloud 语音碎片，亮出“嘴上没提但一直在干”的落差，并在活舞台以虚态摆出 4–7 个四态领域；
3. 确定 **1 个本季主线**（附 1 句季度目标 + 1 句反目标）、**2–3 个支线**、若干 **维护模式**（附每周最低底线）与 **搁置**；点击「一键凝固星图」。

### 14 天日常三节拍
- **早上开局（<= 2 分钟）**：在 Logseq 点「拉远」切到 `今日容器` -> 扫一眼今日 Apple 日历硬日程 -> 10 秒清空昨日遗留托盘（放入今日 / 退回本周 / 撤掉）-> 选 1 件事放进「上午 · 深潜」（需要时点一次「写入日历护盾」）-> 点「开始专注」直接回 Logseq 原文现场。早上不刷 Inbox。
- **晚上收尾（<= 3 分钟）**：离开电脑前在 Logseq 顶栏专注胶囊点「结束」，顺手留 1 句停点便条；下班路上用 iPhone「随口记」语音卸压。
- **周日复盘（10–15 分钟）**：找 `Attention Navigator` 跑剧本 B——看 5 行客观事实镜、批量分流本周语音碎片与 14 天冷却项、直面主线错配、按 Apple 日历下周密度虚态装盒 3–5 块（密集周 1–3 块）并敲定周一上午那 1 件事。
- **若中途断档 >3 天或某项目 >7 天未碰**：打开舞台时会弹出纯白纸黑字的 2–3 页极简翻页重启卡，空格翻页、`Esc` 随时跳过，无内疚接回现场或直接移入搁置/维护。

---

## 安全与回退说明

- **原文安全**：Stage 与时间层所有数据均保存在 `~/.task-copilot-workspace/{stage-areas.json,stage-inbox-state.json,time-stage.json}`，绝不静默改写你的 Logseq `.md` 原文，也不触碰 `apps/kernel-service`。
- **随时停用**：如需暂停常驻服务，执行 `workspace service stop` 或 `workspace service uninstall`；Logseq 在 Companion 离线时会自动 Fail Open 退回只读本地视图，不影响原生写作。
