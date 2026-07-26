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

## 修复后真实无参数重装

当前源码构建完成后，以同一测试 Graph、只提供 `graphPath + graphId` 的方式真实重装，
没有传 `databasePath`：

| 检查 | 重装前 | 重装后 |
|---|---:|---:|
| Graph mapping 数 | 1 | 1 |
| graphKey digest | `1560878c9a97b680` | `1560878c9a97b680` |
| databasePath digest | `56632d412d8d32ef` | `56632d412d8d32ef` |
| database inode | `46601378` | `46601378` |
| Objects / Commits / Proposals | `7 / 24 / 12` | `7 / 24 / 12` |
| Provider model | `deepseek-v4-flash` | `deepseek-v4-flash` |

随后为 Provider error、Validator rejection 和真实 DeepSeek 延迟 stale Gate 做的多次受控
Launcher 重装，也都保持同一 graphKey、databasePath 与 inode；最后已恢复
`https://api.deepseek.com` 和原 Keychain reference。Logseq Plugin 每次均在后台自动重连，
Project 正式投影恢复可用，未要求用户从终端维护 Service。

## 状态

同 Graph 无参数重装 authority 子 Gate 从 `IMPLEMENTED_AUTOMATED` 升级为
`DONE_DESKTOP_RUNTIME_AUTHORITY_PRESERVED`。没有发生静默替换，没有复制或删除数据库，
测试结束后 Provider 与 Graph authority 均恢复原值。该结论不替代 P0-H 的真实 Graph switch
和切回原 Graph Gate；P0-H 整体仍为 `PARTIAL`。
