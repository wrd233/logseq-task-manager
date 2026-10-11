# 2026-10-11 验证记录

环境：macOS、DSH 0.2.0-rc.2 / Node 22.23.2；仓库检查用 Node 20.20.2。

- `tests/service.test.mjs`：6 项通过，含绑定持久化、过期写入回滚、会话隔离、取消、文件路径/符号链接边界、私有状态、外部材料身份和上下文预算。
- `tests/host-proof.mjs`：7 组通过；另在协作现场准备前验证只读连接 fallback。生产插件 + HTTP companion + 原生 Tools/SystemPrompt/AgentLoop，本地脚本模型和合成 Logseq SDK。方案实际出现在 Logseq 测试 DOM；无正文写入。Graph 切换拒绝旧连接并清空上下文，卸载移除工具。
- 本机原生 DSH 浏览器：正式插件实际加载；关联隔离工作、原文/文件列表、段落及文件引用进入原生草稿、访达定位成功；解除关联清空正文和列表，另一会话没有继承绑定。没有发送模型消息。
- 原生页面拒绝未认证请求（401）和跨来源请求（403）。
- `npm run check`：需求映射、类型检查、lint 通过；工作区测试中原有 `native-report-ui.test.mjs` 的“void SDK route acknowledgement”时序用例失败一次（false 与 b0 不一致），其余测试通过。该文件单独按仓库 Node 版本复测 **25/25** 通过；未修改该用例，不声称首次全量检查全绿。
- 继续运行的 sandbox 测试 **5/5**、构建、依赖边界 **12/12** 和 taste eval 通过。构建包含正式 DSH 客户端和宿主 bundle。

[原生界面截图](assets/native-workbench.jpg) 使用隔离工作数据，不是用户 Graph；真实 Desktop Graph 与远端模型端到端仍由用户连接后试用。测试会话绑定已解除、测试草稿已清理、临时 companion 已关闭。正式 DSH 恢复默认 companion 状态目录；本机配套只读连接服务已启动，尚无用户工作授权。
