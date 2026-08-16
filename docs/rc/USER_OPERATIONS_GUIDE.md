# Task Copilot vNext 用户操作手册（RC）

> 普通用户只需读完本页。内部概念（Evidence / Projection Obligation / runtime lease）不是必学内容。

## 1. 安装前准备

- macOS + Logseq Desktop 0.10.15（真实实测基线）。
- Node.js 20.20.x（项目 engines：`>=20.19 <21`）。
- 本仓库 clone + `npm install`。
- 可选的 DeepSeek API Key：只有环境变量 `DEEPSEEK_API_KEY` 这一种方式；不要写进任何文件。

## 2. 启动

```sh
task-copilot service start
```

看到：

```
Task Copilot 已启动
Logseq：等待连接
后台维护：正常
```

即成功。首次会自动创建数据库（schema v22）。

## 3. 连接 Logseq

1. Logseq 打开你的 Graph。
2. 安装/加载插件 `Task Copilot vNext`。
3. 在插件设置粘贴本机 `graph-adapter.json` 的 JSON（路径由 `task-copilot service status --json` 的 state dir 决定），运行“Task Copilot vNext：连接 Kernel”。
4. 成功后运行“Task Copilot vNext：打开今天”。

## 4. 配置 DeepSeek

- 在启动服务的终端里 `export DEEPSEEK_API_KEY=...` 后 `task-copilot service start`。
- 检查：`task-copilot doctor` 输出 `DeepSeek：已配置`。
- 不配置也能用：后台理解与完成情况评估会保持“未配置/暂时不可用”，但你的笔记和正式数据完全不受影响。

## 5. 停止 / 状态

```sh
task-copilot service stop
task-copilot service status
task-copilot doctor
```

`status` 不会把过期 pid 误报为运行中；`doctor` 会检查数据库完整性、后台服务、Logseq 连接与待处理笔记。

## 6. 备份

```sh
task-copilot backup create
task-copilot backup inspect <备份目录>
```

备份包含 SQLite 数据库 + manifest（schema 版本、时间、完整性），**不包含** Graph、token、API key。服务运行中也能安全备份。

## 7. 恢复

```sh
task-copilot backup restore <备份目录> --yes
```

- 服务运行中会拒绝恢复。
- 恢复会先校验完整性，再原子替换；失败时现有数据库保持不变。
- 恢复成功后原数据库保留为 `task-copilot.sqlite.pre-restore-*`，确认无误后可自行删除。

## 8. 升级

- `git pull` + `npm install` + `npm run check`。
- 重新 `task-copilot service start`。旧 schema 会自动迁移到最新；如果数据库 schema 比程序更新，启动会拒绝且不修改数据。
- 升级前建议先备份。

## 9. 故障诊断

```sh
task-copilot doctor
```

常见提示：

- `后台服务：未运行` → `task-copilot service start`。
- `Logseq：未连接` → 重新运行插件“连接 Kernel”。
- `DeepSeek：未配置` → 按第 4 节配置；不配置不影响自然笔记。
- `完成情况评估暂时不可用` → DeepSeek 侧失败；恢复后会自动重新评估。

## 10. 卸载 / 清理

1. `task-copilot service stop`
2. 删除 state 目录（默认 `~/.task-copilot-vnext`；可用 `service status --json` 查看）
3. 在 Logseq 中卸载插件；Graph 内容不受影响（正式字段只是普通 Logseq 文本块，可保留或手动删除）。
