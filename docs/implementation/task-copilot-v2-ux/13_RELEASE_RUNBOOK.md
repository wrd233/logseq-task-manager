# Task Copilot V2 Release Runbook

> 目标环境：macOS、Logseq Desktop `0.10.15` File Graph、Node `>=20.19 <21`
> 当前阶段：Release Freeze；本说明不把完整 Goal 提前标为完成。

## 发布包内容

- `task-copilot-plugin/`：在 Logseq 中通过“手动载入插件”选择该目录，不选择 `dist/`；
- `task-copilot-launcher/dist/installer.js`：一次性安装 Launcher、Local Service、Skills 与
  SQLite native runtime；
- `task-copilot-launcher/dist/payload/`：安装器校验并复制的运行 payload；
- 本 Runbook。

发布包不包含 Graph、SQLite 数据库、日志、截图、API Key 或 Keychain 凭据。

## 安装与升级

1. 安装受支持的 Node 20；
2. 构建包已完成时，执行：

   ```bash
   node task-copilot-launcher/dist/installer.js install \
     --graph-path "/absolute/path/to/your/logseq-graph" \
     --graph-id "your-graph-id"
   ```

3. 同一 Graph 无参数重装/升级会保留既有 `databasePath`、graph key、Provider 配置和 Keychain
   reference；不会自动发现另一数据库并把它提升为 authority；
4. 只有显式迁移 authority 时才传 `--database`。安装、升级和首次启动都不会自动执行 V1
   迁移；
5. 在 Logseq 的插件页“手动载入插件”，选择 `task-copilot-plugin/`；更新后点击“重载”。

Provider Key 必须先放入 macOS Keychain，再用
`keychain:<service>/<account>` reference 配置。不要把明文 Key 写入命令历史、Graph、配置文件、
日志、截图或仓库。

## 日常启动与关闭

- 安装后 macOS LaunchAgent 自动维护 Launcher；打开已配置 Graph 时，Plugin 取得租约并由
  Launcher 启动同一 Graph 的 owned Service；用户无需终端；
- 普通关闭面板不会停止 Service；
- “结束本次 Task Copilot”会先检查 PENDING、RECOVERY_REQUIRED 和正文同步风险，再释放
  当前插件租约；
- 退出 Logseq 或禁用 Plugin 会释放租约。最后租约结束后 owned Service 自动停止；Launcher
  保持待命；
- 重新打开 Logseq 后，Launcher 使用同一 Graph 映射重新启动 Service。

## 失败、恢复与诊断

1. 普通用户先看“更多 → 系统状态”；
2. “尚未完成，可以继续”必须沿用同一 Commit，不重复发起；
3. “自动恢复失败，需要手工处理”进入同一恢复记录，不新建平行恢复；
4. 正文位置变化时使用受控 Rebind；整库问题使用 Backup/Restore；V1 数据进入显式 Migration；
5. CLI 只通过私有 Service descriptor 读取状态：

   ```bash
   node task-copilot-cli/dist/tc.js \
     --service-descriptor "$HOME/Library/Application Support/Task Copilot/runtime/<graph>.service.json" \
     doctor
   ```

6. 不直接修改 SQLite，不删除 ledger，不重复提交不确定操作。

## 安全卸载

当前 installer 只提供安装/升级，不伪装存在未经验证的自动卸载命令。安全卸载采用以下顺序：

1. 在 Task Copilot 系统状态确认没有 PENDING、RECOVERY_REQUIRED 或正文连接冲突；
2. 创建并验证一个当前 Backup；
3. 在 Logseq 中禁用/移除 `Task Copilot` 插件；
4. 确认最后租约释放、owned Service 已停止；
5. 从当前用户的 LaunchAgent 域卸载 `com.task-copilot.launcher`，再移除对应 plist；
6. 可移除 `~/Library/Application Support/Task Copilot/bin`、`runtime` 与 `pairing`；
7. 默认保留 `data`、`launcher-config.json`、Backup 和日志，以便恢复或重装。

完整清除数据是不可恢复操作，不属于普通卸载。只有在独立备份已验证且用户明确要求永久
删除时才处理 `data` 和 Backup。卸载或停用后 Logseq 正文仍然可读。

## 首发默认关闭与已知限制

- Dynamic Now Shadow 不替换正式 Now；
- Waiting 过久、Project 静默、跨对象 LLM 观察、建议关注保持 Shadow；
- Block Marker 关闭；
- P2-F 保持 Shadow；
- Association 与 Project due 不从 Project Router 开放；
- File Graph Page Head 与真实 host Light 能力按宿主限制安全隐藏或有界降级；
- Query/reference/sidebar 无可靠 identity 时不猜测目标；
- `@logseq/libs@0.0.17` runtime 带来的 DOMPurify/lodash audit 风险保持显式已知；建议 major
  仍受当前 advisory 影响，且移除 runtime 已被真实 Desktop 证明会阻止插件加载，因此不做
  无效强升。升级需先有实质更安全的上游构建并重新通过 Desktop compatibility Gate。
