# Logseq 全天纸面与心流验收

验收日期为 2026-11-26。功能分支为 `feat/logseq-flow-paper-v1`，共同基线为 `81aff122`。原工作树含并行改动，本次从取回的远端基线创建独立 Git 工作树。Node 为 `20.20.2`，npm 为 `10.8.2`。

## 四个阶段

| 阶段 | 提交 | 关键行为 |
| --- | --- | --- |
| M1 | `8069e724` | TimeHub 从同一份日期数据投影今日和明日，周日读取范围含次周一。本周事项可排今天或明天，承诺原话保留在三口袋，澄清出的动作进入明日候选。Logseq、DSH 和独立窗共用纸面渲染。 |
| M2 | `beff1b51` | Page 和 Block Zoom-in 使用原生路由。停笔行使用 Logseq 原生锚点，普通笔记自动收起工作控制。原生编辑约 1 秒后开始 600ms 淡隐，逐段聚焦可关。暂停支持手写停点和先走，停点写回 TimeHub 及原生停点块。 |
| M3 | `eb73e3f4` | `Ctrl+.` 和 `Cmd+.` 追加到本页或本块下的自由随记，快捷键可改。悬浮窗每个子块有独立文本输入，500ms 停手或贴回时走同一串行队列，原块已变更时另存子块。 |
| M4 | 分支第四个阶段提交 | 久别恢复固定三页，中页按实际记录呈现变化，每页最多三处重点着色。回望室按真实来源读取脚印，手记经 Logseq 原生 API 写入 Journal，想法追加带日期的条目。 |

久别阈值延续工作台 3 天、单工作 7 天。已有停笔锚点时，Logseq 末页打开原生编辑器。外部舞台沿用 Companion 的专注导航入口，并携带同一停笔锚点。

逐段聚焦默认开启，可在换气时切换。自由随记快捷键默认为 `mod+.`，可在设置中重绑或关闭。插件浮层沿用宿主背景色和文字色。

晚间短问在界面内轮换，写入正文只取用户的编辑内容。Logseq 离线时，Companion 将待写手记按图谱与原日期暂存，回执使用稳定块标识去重。文件图谱用 Logseq 的原生 ID 属性保留该标识。0.10.9 的原生插入和更新都会修整块首尾的空白字符，插件传入原字符串，段落及段间空行按原文保留。自动化验证覆盖切换图谱时拒绝误写，以及超长手记经 Companion 重启后原文完整。

## 变更文件

| 所属路径 | 文件 |
| --- | --- |
| `packages/stage-runtime/src/` | `engine.ts`、`index.ts`、`pulse.ts`、`renderer.ts`、`schedule-paper.ts`、`time-engine.ts`、`time-model.ts`、`time-types.ts`、`types.ts`、`restart-deck.ts`、`reflection.ts`、`reflection-view.ts` |
| `packages/stage-runtime/tests/` | `time-engine.test.ts`、`restart-deck.test.ts`、`reflection.test.ts` |
| `apps/logseq-plugin/src/` | `index.ts`、`features/agent-workspace/catalog-publisher.ts`、`features/agent-workspace/journal-inbox.ts`、`features/stage/overlay.ts`、`features/stage/flow-mode.ts`、`features/stage/focus-capsule.ts`、`features/stage/paper-scene.ts`、`features/stage/free-notes.ts`、`features/stage/evening-journal.ts` |
| `apps/logseq-plugin/tests/` | `stage-overlay.test.ts`、`flow-mode.test.ts`、`free-notes.test.ts`、`evening-journal.test.ts` |
| `apps/task-copilot-cli/src/` | `stage-app.ts`、`stage-app-browser.ts`、`stage-hub.ts`、`stage-inbox-store.ts`、`icloud-inbox.ts`、`time-hub.ts`、`workspace-server.ts` |
| `apps/task-copilot-cli/tests/` | `time-hub.test.ts`、`stage-reflection.test.ts` |
| `scripts/` | `build-all.mjs` |
| `docs/implementation/` | 本验收记录 |

## 命令与结果

开工运行 `npm ci --no-audit --no-fund`、`npm run typecheck` 和 `npm run build`，退出码均为 0。

M1 和 M2 的工作区测试覆盖 `stage-runtime`、Companion CLI、Logseq 和 DSH。M3 的工作区检查覆盖 Logseq。每阶段用 `npm run typecheck --if-present -w …`、`npm test --if-present -w …` 检查涉及的工作区，并执行根目录 `npm run lint`、`npm run build` 和 `npm run check:boundaries`。M4 运行根目录的五项检查。测试通过 Node 的 `--test-concurrency=3` 控制并发，实际测试文件和断言照常执行。

| 阶段 | typecheck | lint | build | check:boundaries | test |
| --- | --- | --- | --- | --- | --- |
| M1 | 0 | 0 | 0 | 0 | 退出 1，724 通过、2 个基线失败 |
| M2 | 0 | 0 | 0 | 0 | 退出 1，727 通过、2 个基线失败 |
| M3 | 0 | 0 | 0 | 0 | 退出 1，592 通过、2 个基线失败 |
| M4 | 0 | 0 | 0 | 0 | 退出 1，967 条中 965 通过、2 个基线失败、0 跳过 |

保留的两个基线失败位于 `apps/logseq-plugin/tests/integration/view-lenses-ui.test.mjs` 和 `apps/logseq-plugin/tests/stage-review.test.ts`。前者仍查找旧的选区菜单，后者仍查找旧的结构菜单。两项原测试未改动，最终全仓运行无跳过。首次基线全量运行另有一次 `reading-ai-decoupled` 的模型标签断言失败，原基线单独复跑和最终全仓运行均通过。原始日志在独立工作树的 `tmp/flow-paper-validation/`。

## Logseq 0.10.9 隔离桌面

使用仓库沙箱脚本启动独立 Electron 副本、Graph 和 Kernel，Companion 使用单独状态目录及回环随机端口。下列桌面场景使用合成记录，原生日记写入发生在沙箱 Graph。

| 场景 | 实际结果 |
| --- | --- |
| 本周排入明日 | 原生插件点「放明天」后切到明日，推进块与合成会议同列显示。外层纸面铺满窗口，实测边角半径为 0。周日读取次周一及午夜接力另由测试覆盖。 |
| Page、Block 和回锚 | 从日程「进入」打开实际 Page。块级专注进入原生 Zoom-in，编辑器命中指定子块。保存的停笔行在 Desktop 重载后仍可用。 |
| 写字隐身与换气 | 输入后测得顶栏透明度为 0、同级段落为 0.32、含活动段落的父块为 1。真实指针移到顶沿恢复顶栏，点击「抬头换气」显示计时及当前小尾巴，原生编辑器保持焦点。 |
| 停点与现场恢复 | 输入停点并回车，顶端显示原生停点块。结束专注返回之前的普通随笔页，工作控制随即隐藏。 |
| 自由随记 | Cmd 快捷键打开并用 Esc 取消，Ctrl 快捷键追加新子块。原编辑器恢复到原块的第 3 字符位置。行尾 Agent 标记成功。实测可拖动悬浮窗，停手自动写回。原块独立更新后，贴回同时保留改过的原块和另存的悬浮稿。 |
| 三页恢复 | 用合成的五天间隔触发。实际 Space 和右方向键翻到末页，顶部共三条进度线，末页有两处重点。点「直达上次那一行」回到重载后仍存在的同一原生块。 |
| 安静回望室 | 实际展示日记、随口记、专注与清扫记录。展开原记录及「顺着写」后，当前记录作伴，光标进入手记。短问留在界面。两段手记经 Companion 回执确认，留在当天 Journal。另将目标日期设为前一天模拟跨日暂存，重启后自动创建原先缺失的原生日记页。逐字符比对的 9,019 字符与提交正文一致。 |
| 想法生长线 | 从纸面创建了一个想法，再按回车补写。原条目和追加条目均保留，各有日期。 |

桌面截图和结构化证据位于 `tmp/logseq-sandbox/evidence/`。真实 Apple 日历和 iCloud TCC 授权、物理中文输入法、生产 DSH 和第三方主题未实机验证。输入法保护已通过合成组合输入测试，Calendar 和 iCloud 采用隔离数据及适配器测试。
