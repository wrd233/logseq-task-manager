# 截图与验证证据

版本 2026-10-04；实机日期 2026-10-03–04（Asia/Shanghai）。macOS 15.2 / x86_64、Logseq 0.10.9、插件 0.2.0。唯一案例为“整理一份本地资料协作方案”，任务管理关闭，无 Kernel。

最终产品源码：`10f0a664ec136902e839e2503127e249da8ce81a`。最终插件 index.js SHA-256：`562e984af5b2ff24ceb1d1da83954ec55d1d0941235aecb3b6de4e7fa5451ffb`。后续文档提交不改变产品源码。

## 图片对应代码

这里的 21 张图均为本分支隔离 Desktop 的原始全尺寸 PNG（1960×1400，CSS 980×700、DPR 2），未重绘、改字、拼接或使用生成式图像。保留宿主与工作台上下文，没有生产资料或完整 descriptor。图中临时目录只属于合成夹具。

审阅、编辑、认可、聚焦与菜单图片采于 `15ed5ab4b721ce4be48fc1b925d223fdb0d5b547`；此后唯一产品差异为材料离线列表识别 capture 身份。git 比较确认 work-view controller/renderer、stage review/diff、panel-host 与组合根完全相同；受影响的材料/目录、不可用恢复、历史、重载与重入在最终 `10f0a664ec136902e839e2503127e249da8ce81a` 构建上重采或复验。逐图原始文件名、实际源码、bundle/PNG 校验值见 [manifest.json](manifest.json)，没有把早先实际 bundle 的 hash 改写为最终 hash。

| 图片 | 实际源码短标识 | 说明 |
| --- | --- | --- |
| [accepted.png](accepted.png) | `15ed5ab4` | 本地认可；已认可按钮禁用；独立 CLI 核对 revisionId 与不可变 SHA256 |
| [after-accept.png](after-accept.png) | `15ed5ab4` | 认可后经原生 Logseq 编辑保存；当前原文与提交版本不同，已认可状态不要求再次认可。 |
| [captured-text.png](captured-text.png) | `10f0a664` | 最终产品构建且无 agent 连接，收纳长文仍通过原材料身份完整阅读。 |
| [changes.png](changes.png) | `15ed5ab4` | 当前阶段；新增与修改；下划线标实际改动；旧文按需展开 |
| [connection.png](connection.png) | `15ed5ab4` | 连接就绪是程序通道状态；目录与查找中的停止 agent 连接只撤销自己的当前连接。 |
| [dark.png](dark.png) | `10f0a664` | 最终构建，宿主切换暗色主题，工作台基础阅读可用；iframe 使用既有回退色，见交接限制 |
| [direct-edit.png](direct-edit.png) | `15ed5ab4` | 点击变化正文打开当前权威原文；本地草稿；显式提交修改 |
| [directory.png](directory.png) | `10f0a664` | 最终构建的本地断连目录：已收纳输入和输出仍标明已关联，交接提醒仍未关联，查看与关联分开。 |
| [entry.png](entry.png) | `10f0a664` | 最终代码在原块右键菜单中具有目录关联、工作视图和允许连接入口；菜单滚动后完整可见。 |
| [focus-before.png](focus-before.png) | `15ed5ab4` | 结束原生编辑后，同一工作完整范围，保留条件与反例附近的阅读位置；聚焦前后使用相同视口。 |
| [focus.png](focus.png) | `15ed5ab4` | 按实际来源版本选取六个完整依据块，加上根与两个标题共显示 9 / 26 条；标题、条件和反例保留，范围外变化提示可见。 |
| [history.png](history.png) | `10f0a664` | 最终构建且连接停止时仍可回看已认可历史；快照只读，在当前内容中纠正与建议重新读取现存原文，返回原位置回到当前工作。 |
| [offline.png](offline.png) | `10f0a664` | 最终构建重载后仍显示未连接，本地材料可以阅读；当前连接维持停止状态。 |
| [old-text.png](old-text.png) | `15ed5ab4` | 旧文展开；删除线与作者事实；后续当前段落仍可读 |
| [preview.png](preview.png) | `10f0a664` | 最终代码断连只读预览交接提醒.md，不产生材料记录、来源引用、编辑授权或阶段成果。 |
| [reading.png](reading.png) | `10f0a664` | 最终产品源码 10f0a66 重新构建并由宿主重载，仍为同一工作、当前阶段与 26 条来源。 |
| [reentry.png](reentry.png) | `10f0a664` | 最终构建；停止、插件重载、Desktop 重启后通过真实本地命令重新允许；CLI 状态与刷新成功，原工作 26 条、第二阶段保留 |
| [reference.png](reference.png) | `10f0a664` | 最终代码中文件恢复后仍经原身份阅读，默认只读，未增加引用或编辑授权。 |
| [row-actions.png](row-actions.png) | `15ed5ab4` | 局部菜单固定在阅读视口下方的预留区；下一段的 y 坐标没有变化，原文、Markdown、范围和视图缩进均有等价入口。 |
| [setup.png](setup.png) | `15ed5ab4` | 最终构建；工作连接配置保留；普通工作无需 Kernel |
| [unavailable.png](unavailable.png) | `10f0a664` | 合成参考文件临时改名后，材料显示文件暂不可用，原材料身份、关联与历史保留，未提供写入入口。 |

## 主路径与版本事实

实际完成首次设置、原块目录绑定、生产 CLI 接入、目录发现/预览/显式关联、材料收纳、阶段开始、外部正文与输出提交、删除/修改/新增审阅、本地纠正与建议、同阶段修订、本地精确认可、认可后人工原文编辑、完整块聚焦、材料往返/退出、上一阶段历史、停止和重入。

- CLI 来自本仓库生产构建，独立进程通过私有 companion 与原插件 provider；final status 为 online，formalKernelRequired=false、authorizesTodo=false。
- 本地认可的 revisionId/hash 与所见版本完全相同；认可后的人工编辑没有改变 revision 或 acceptance。
- 聚焦选择 6 个完整依据块及必要祖先，显示 9/26；未生成新答案摘要。进入材料再返回 plan/question/basis 不变，同一段落 y 坐标相同；退出恢复完整 26 块顺序与阅读锚点。
- 停止时 CLI 明确 WORKSPACE_OFFLINE，本地材料、长文和历史仍可读。最终重载/重启/重新允许后，26 块来源、当前阶段与上一阶段不可变记录未变。
- 目录预览未增加材料或引用，参考/输入 user/agent 权限仍 false，output 按既有权限可写；阶段成果只有明确选择的说明文件。

原始逐步记录、CLI JSON、输入日志与图留在自有忽略目录；共享摘要见 [实施交接](../../../implementation/workbench-ux-polish-handoff.md)。

## 方法与未验范围

CUA 操作薄测试页面中的真实实时图像，转发 Chromium 鼠标、键盘和 insertText 到身份核验过的隔离 Logseq Desktop。它证明实际宿主入口、文本框和导航，未调用 controller/API 代替用户。调试接口只作夹具准备、只读核验、截图与输入桥；外部写回和聚焦走正式生产连接。

这不等于 macOS 原生中文 IME、剪贴板或 Undo 验证。Graph 初始内容由夹具建立，原生文件夹选择器未覆盖。模拟 composition/DOM 回归只证明保护分支；Windows/Linux、其他文件格式外部打开、实际并发文件冲突和手动重新定位未实机覆盖。

窄视口实际 DOM/几何（650×700，面板 404px）已核对标题换行和菜单不覆盖正文；截图采集停滞，没有可交付的窄图。误取的旧图已移出共享目录，manifest 不包含它。reduced-motion override 未在实际 iframe 生效，不标为实机通过；既有 CSS 媒体查询保留。宿主暗色切换与恢复已实机完成，基础阅读可用，但 iframe 在 Logseq 0.10.9 仍使用亮色回退，见 dark.png。

最终源码全仓 check 退出 0：550 项测试通过、0 失败、0 跳过，typecheck/lint/build/built-binaries/依赖边界/需求地图通过，Taste 6 pairwise + 4 regression PASS、保持原 active 版本。文档与索引加入后的再检查见交接。
