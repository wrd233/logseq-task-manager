# P0-H Launcher 同 Graph 重装 authority Gate — 2026-07-26

## 真实发现

为安装 `112a11a` 的后台 Service/Skill，真实运行 Launcher installer 时省略了可选
`--database`。现有同一 Graph 原本绑定专用测试数据库，旧安装器却重新计算默认数据路径并
覆盖 config 映射；Logseq 随后安全显示“暂无 Project”。两份数据库文件都未删除或覆盖。

运行映射已立即用原明确数据库路径重新安装并恢复。该事件证明“重装不会改变 Graph 的 SQLite
authority”此前缺少真实 Gate。

## 修复

- 先读取私有现有 config，再按 graphKey 查找原映射；
- 未传 `databasePath` 时优先保留同一 Graph 的既有路径；
- 只有首次安装才生成默认路径；
- 用户显式给出绝对路径时仍按明确意图替换；
- 不新增数据库状态、迁移流程、恢复页面或第二配置权威。

## 自动证据

- 回归顺序：首次安装显式数据库 → 同 Graph 省略数据库重装 → 第二 Graph 安装；
- 同 Graph 重装后 graphKey、graphId、databasePath、token、port 与 Provider 配置保持；
- Launcher tests：`29/29` PASS；
- 根级 `./scripts/check.sh`：PASS；145 条稳定规则与恢复演练差异为空。

## 状态

`IMPLEMENTED_AUTOMATED`。真实运行已经暴露并恢复错误映射；修复后的再次真实无参数重装尚未
执行，避免在提交前再次触碰当前后台 authority。该项不替代 P0-H Graph switch Desktop Gate。
