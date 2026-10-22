# 历史模块与共享接线交付

目标分支 `codex/work-structure-history-v1`；原分支起点 `f992619025f5b4d086a2e8ee1729936d488ecc89`，普通快进到已经发布的 main `2cb0ced7688b7af19ac5814b1f556ecae255f3c9`。只复用 `f84631604eba47e0311f927897da626ede4afb00` 的历史模型、视图、测试和宿主归档；没有合并该旁支的 DSH 入口/绑定功能。

原并行契约要求共享所有者串行接线。本任务的人类用户明确授权本次作为唯一执行者串行接线，因此同时提交下述最小共享变更供 main 整合者审阅，未推送 main：

- `stage-workbench/review.ts`：安装 HistoryPlayer；用 StageHistoryPort 只读消费 StageStore；读前后检查 Graph/context；scopeChanged/dispose 清空、取消旧任务；复用现有历史入口；返回实际可见的 `.wb-review-entry`。
- 新 `workspace/history-source-opener.ts`：SharedUiPort.openSource 的 Logseq 宿主适配；核验来源身份与版本；每次异步读取后及最终导航前复核 context/Graph/交互代次；仅调用 getCurrentGraph/getBlock/openInRightSidebar。
- `workspace/copilot-ui-port.ts` 完全复用已发布 main 的实现与签名，没有另建共享接口变体。

模块目录独立维护：`model.ts` 只派生数据并调用 composeDiff；`view.ts` 只渲染与回调；`player.ts` 仅持有 StageHistoryPort / SharedUiPort。没有 Stage 持久化协议、Store、Recorder、Kernel、权限、公共 CSS、依赖或锁文件改动。

DSH 当前没有 Stage 历史枚举入口。本次只接 Logseq，DSH 历史播放器明确不可用；不新增 transport、不把本地归档作为 DSH 生产 provider。正式对象树、代码历史和恢复写入均未覆盖。

本次完成后停止扩展，等待 main 整合；后续模块新增内容应保持上述只读能力边界。
