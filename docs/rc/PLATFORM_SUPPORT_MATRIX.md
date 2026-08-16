# Platform Support Matrix (RC)

| 平台/组件 | 状态 | 证据 / 限制 |
| --- | --- | --- |
| macOS + Logseq Desktop 0.10.15 | **真实实测** | Round 11–13 全部实机；closure UI click-through、CDP、OS screenshot |
| macOS + Kernel Service (standalone) | **真实实测** | 本机 `/tmp/tc-demo` + 多轮 harness/soak |
| Node.js 20.20.x | **代码路径支持 + CI 未固定** | engines `>=20.19 <21`；当前开发机 Node24 在 better-sqlite3 v12 后可用，但声明基线仍是 Node20 |
| Node.js 24 | **部分实测** | 开发环境实际运行全部 tests/soak；v12 前 native 崩溃已修；不作为正式支持声明 |
| SQLite | **真实实测** | better-sqlite3 12.6.2；WAL；backup API；v16→v22 migration |
| Windows | **未实测** | 代码路径无平台特判，但无真实 soak |
| Linux | **未实测** | 同上 |
| Logseq 0.9.x / 其他桌面版 | **未知** | 仅 0.10.15 实测 |
