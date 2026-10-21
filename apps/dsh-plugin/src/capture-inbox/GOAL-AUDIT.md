# Goal A 完成审计

核查日期：2026-10-22（Asia/Shanghai）。审计依据为 `docs/product-design/planning/goals/01-Capture-Inbox-Goal.md` 全文及共同契约；此表是证据索引，不是证据本身。**整体尚未完成**，不可用模块测试或合成截图代替真实宿主验收。

共同起点 `f992619025f5b4d086a2e8ee1729936d488ecc89`；本线已普通获取 main 的 `75c8c449`、`10238baf` 和 `2cb0ced7`。最新已核查 A 功能提交 `c536d8e3`，获取主代理公开 RPC 边界的普通 merge 为 `0f2a141b`。主代理工作区尚未发布的入口不作为 A 已消费内容。

| 要求 | 当前权威证据 | 结论/剩余工作 |
|---|---|---|
| 远端/工作区、独立分支、共同契约 | fetch/ls-remote；独立 clone；唯一 copilot-ui-port 类型与共享上下文比较 | 已核查；原工作保留，无 reset/stash/force-push |
| 按 lock 安装、Node 20/npm 10.8.2、构建 | 初始 npm ci/typecheck/build；现有 lock 与根配置无本线改动 | 已验证；宿主另用支持版本，不改仓库 engine |
| G2 先评估 MaterialService | 主代理 G2 方案批准 `75c8c449`；材料 graph/destination 约束，单设备私有 FileCaptureStore | 工程方案与真实文件模块已验证；仍须真实宿主选择私有根并接入 |
| 无项目保存、不创建正式对象 | store test `no-project captures...` 与真实 Store/controller 重启联合用例；protocol 无新 WorkObjectKind | 模块已验证；真实宿主无绑定路径待验 |
| 首帧正文焦点、无需标题/项目/标签/AI、保存后返回、钉住连续输入 | view.jsx；controller test `reliable save closes...`；合成浏览器证据 | 模块已验证；原生焦点返回仍待真实入口验收 |
| 关闭/失败/中断/连接变化保护输入 | read failure/reopen、close/refresh 续写、恢复指纹、迟到 load 测试 | 模块已验证；真实断连/切换与宿主关闭路径待验 |
| 可靠回执才 saved，pending/partial/unknown/conflict 分开 | fsync/目录 fsync/读回、真实故障注入、controller 各失败态测试，无成功动画 | 模块已验证；不把 host 进程/系统断电当已验 |
| 同 key 重试不重复、不同请求拒绝、新 key 同正文允许 | store 测试真实文件、子进程与双进程 CAS；精确提交版本回执 | 已验证；旧请求与继续键入分别保留 |
| 紧凑时间列表、全文/归档/旧正文搜索、今天/当前结果全选/清空、双击编辑 | store 排序；controller search/selection 测试；view 与浏览器 | 模块已验证；真实 Inbox 入口待验 |
| 归档/撤销、旧正文恢复新增版本、原始/后来版本可查、冲突不覆盖输入 | 真实 store history/restore/archive/CAS；controller 显式 rebase 测试 | 已验证；归档不表示正式工作完成 |
| 来源复用，session 单独保留，无伪造身份 | CaptureOrigin 只引用既有 SourceSelection/material 字段；checkOrigin；已发布 CaptureHost 拒绝未核实来源测试 | 结构与拒绝边界已验证；真实 Graph/材料正向来源核实待验 |
| 多选带原文与真实来源进入原生草稿 | quoteRecords 与 SharedUiPort；同步 span 工厂与 busy/stale/unavailable 测试 | 模块已验证；真实 DSH 已有草稿/异步续写/提交锁定/换会话均待验 |
| 不替换全文、不发送、不换 cwd/重绑、不因正文指令扩权 | 模块仅 insertDraft 意图；恶意正文测试；无 setDraft/submit/正式写入出口 | 模块已核查；真实适配器仍需最终审查 |
| 模块保存选择/当前行/滚动并返回原现场 | c536d8e3 控制器内存状态；重开用例；40条合成记录 DOM/截图 `inbox-return-state.png` | 模块已验证；不承诺重启后保留滚动 |
| 键盘、窄屏、减少动效、可读视觉 | 320px 容器截图、焦点/双击浏览器验证；scoped CSS/reduced-motion/IME 快捷键守卫 | 模块证据齐；真实宿主与物理中文 IME 分开记录 |
| 范围与非目标 | 本线 diff 仅 Capture 目录/指定测试；共享代码从 owner 发布后 merge | 无 B/Kernel/Stage/Journal/正式化/依赖/profile 变更 |
| DSH 外发授权与独立复核 | 用户批准精确脱敏目录；任务 a3c60d81084a68f8d2a0facc failed/max-tokens；实际 git diff 空 | 未采纳 Worker 成果、未自动重试；独立 FRONTEND-TASK.md 已交付 |
| 新测试、指定基线回归、受影响 typecheck/build | ACCEPTANCE.md 记录各固定修订退出结果；2026-10-22 Capture37+port8+host9=54/54，退出0 | 当前模块与已发布边界通过；共享入口发布后再跑完整指定命令 |
| 主代理整合后根 check 与生成 diff | 主代理已报告独立副本通过，但入口/验收提交尚未完整发布到 A | 待获取最终固定 SHA 和对应完整检查结果、核查生成差异 |
| 真实 DSH/Logseq：隔离 Graph/profile、版本/步骤/结果/未验项 | 主代理正在执行，A 尚无已发布的完整证据 | **G1/G2 宿主接入/G4 未闭合，整体 Goal 保持 active** |
| commit/diff、远端/PR、文件清单、恢复与可逆默认 | 已推送 codex/capture-inbox-v1；Draft PR #1；README/ACCEPTANCE/INTEGRATION-REQUEST | 模块交回完成，最终共享 SHA/宿主结果待补；不自行合并 main |

## 本次读取与运行

2026-10-22 重新读取 Goal、协议、实际 diff、测试名称、远端与 PR 状态；不沿用“主代理仍在运行”的旧印象。实际终态显示其此前额度失败，重新交回后确认新回合 active。PR 仍 open/draft，head 已包含 c536d8e3；主代理接线完成后需复核最终状态。

普通获取已发布 `2cb0ced7` 后运行：

```sh
node --import tsx --test apps/dsh-plugin/tests/capture-inbox.*test.mjs apps/dsh-plugin/tests/copilot-ui-port.test.mjs apps/dsh-plugin/tests/capture-host.test.mjs
```

54 tests / 54 pass / 0 fail，退出 0。随后加入 Goal 指定的 service、workspace-context、workspace-reading、agent-workspace-entry 回归，共 **79 tests / 79 pass / 0 fail，退出 0**；Logseq typecheck 与 DSH build 退出 0，完整命令见 ACCEPTANCE.md 最新节。测试中 CaptureHost 为真实边界实现，workbench 为明确合成替身，因此这不是 DSH/Logseq 宿主证据。

最终完成只能在上述待验项的实际证据进入已获取版本后重新审计；只要真实入口、来源或草稿保护有缺项，就不标记 Goal complete。单设备、可逆默认及未知结果恢复规则见 README，不把 Journal/跨设备/系统置顶等未决事项冻结为产品决定。
