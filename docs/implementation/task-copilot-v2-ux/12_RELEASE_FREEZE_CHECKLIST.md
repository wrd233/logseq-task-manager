# Task Copilot V2 Release Freeze Checklist

> 状态：`IN_PROGRESS`
> Freeze 起点：`8d24569` 及其 P2-D 当前证据提交之后
> 原则：不新增大功能、正式状态、顶层导航、Skill 家族、Agent Runtime 或 Recovery Kernel；
> 只处理 Release blocker、明确回归和严重体验问题。

## 已满足

- [x] P0 代表性 Desktop 总 Gate：入口、IME、宿主有界降级、Service 生命周期、Graph authority、
  accepted-not-applied、PENDING、RECOVERY_REQUIRED、Undo、reload/restart；
- [x] P1 Context Recovery 当前 Skill/UI/Provider/错误/stale/主题/窄栏代表链；
- [x] P1 首批确定性 Attention：session-only disposition、reload 重算、事实解除自动失效；
- [x] P1 Block Marker：Logseq 0.10.15 File Graph 宿主拒绝，有界关闭；
- [x] P2-D A/B/C/D 唯一发布路由和一条 C 类外部 Agent
  Context→Review→Commit→reload→Undo→reload 代表链；
- [x] P2-E 单步 Closure 有界恢复结论；
- [x] P2-F 保持 Shadow、默认关闭、不阻断首发；
- [x] P2-G Rebind、Restore 与 Migration 高风险代表链；
- [x] 根级测试、typecheck、build、145 条规则、恢复演练和仓库边界 PASS；
- [x] 当前同 Graph 无参数重装保留既有 database authority；Launcher、Service、Plugin
  descriptor 指向同一映射；
- [x] 当前构建 P2-D 正常操作、真实失败、安全补偿、Undo 和 reload 证据。

## Freeze 中仍需复核

- [ ] 对当前 freeze commit 重新执行 Release 代表矩阵：安装/无参数重装/升级、reload、
  quit/reopen、Graph switch/切回、正常操作、失败、Undo、Recovery；
- [ ] 核对当前 Skill catalog、安装态和运行态只使用明确 active 版本，并用代表性真实 Provider
  样本确认无回归；
- [ ] 核对 Project create→reload→Undo、Context Recovery、Light/Dark/窄栏的当前构建证据；
- [ ] 生成并校验可安装 Release 包；同步安装、启动、关闭、恢复、升级与卸载说明；
- [ ] 完成发布前 TODO/FIXME/stub、skipped、silent overwrite、Pending Recovery、依赖审计与
  当前截图/文档一致性检查；
- [ ] 只把真实 Release blocker 保持为 OPEN；bounded host limitation 与默认关闭研究能力
  不冒充 blocker。

## 首发默认关闭与已知限制

- Dynamic Now Shadow 不替换正式 Now；
- Waiting 过久、Project 静默、跨对象 LLM 观察与建议关注不前台化；
- Block Marker 关闭；
- P2-F 保持 Shadow；
- Association 与 Project due 不从 Project Router 正式开放；
- File Graph Page Head 与真实 host Light 能力按宿主限制安全隐藏或有界降级；
- 无可靠 identity 的 Query/reference/sidebar 位置不猜测目标。

