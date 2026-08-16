# Task Copilot vNext RC Release Notes (draft)

本版本是 Feature Freeze 后的第一个 Release Candidate。核心目标不是新增能力，而是让既有能力可信：数据可备份、升级可验证、服务可管理、失败可恢复、长期运行安静。

## 用户可感知变化

- 新增 `task-copilot service start|stop|status`：一条命令启动/停止/查看服务；过期进程信息不会被误报为运行中。
- 新增 `task-copilot backup create|inspect|restore --yes`：SQLite 安全备份，包含完整性校验与版本 manifest，不含 Graph/token/API key；恢复失败不破坏现有数据。
- 新增 `task-copilot doctor`：一句“数据库：正常 / 后台服务：运行中 / Logseq：已连接 / DeepSeek：已配置”式的本地体检。
- 数据库升级更安全：历史 schema 自动迁移到 v22；未来版本数据库会被拒绝启动且不修改数据。
- 完成情况判断不再数 Evidence 数量：每条完成检查/关键结果都需要真实证据支撑，并显示证据来自哪里；冲突优先提示。
- 结束评估改为后台评估：打开对象永远立即显示缓存结果，不等待 AI；评估中显示“完成情况正在重新评估”，就绪后才出现“结束这个项目/子项目”。
- 后台维护与完成情况评估分开提示：完成情况评估失败时，不会把整个系统显示成故障。
- 关闭/取消/重新打开的对象页不再残留“下一步/和 Agent 讨论”；已完成就是已完成。
- 本地文件权限收紧：数据库、备份、启动信息默认仅当前用户可读。
- External Agent 不能再执行 USER decision；USER 授权只能来自 Logseq 插件。

## 仍会做的事情（RC Known）

- Windows/Linux 桌面环境尚未完整实测。
- DeepSeek 输出极少数情况下格式非法；系统会保守地保持“不确定”，不会误判“可以结束”。

## 不会做的事（1.x）

- 自动整理所有自然笔记、自动学习偏好、连续发现、通知平台、报告生成等。
