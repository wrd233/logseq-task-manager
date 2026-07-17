# MVP Blockers

只有以下条件可以登记为 `BLOCKED`：

1. 正式插件无法加载；
2. 无法读取用户主动选择的 Block；
3. 无任何可恢复的持久化方案；
4. 无法建立稳定 object_id 与 Anchor；
5. Domain Kernel 无法构建或测试；
6. SemanticCommit 失败无法检测、补偿或标记冲突；
7. 规范存在不可调和且可能破坏数据的冲突；
8. 根级构建测试基础设施完全无法运行。

## Active Blockers

当前无。

自动化已经穷尽；剩余 RT-MVP-001..004 属于合并后的 Desktop 证据，不符合本文件的 BLOCKED 定义。

## 不是阻塞

- Graph dirty；
- 外部页面变化；
- FileStorage 位置未知；
- 运行时 Shape 未完全确认；
- SQLite 不可用；
- 没有真实 LLM；
- DB Graph 未支持；
- UI 尚不够美观；
- 可选 API 不可用。
