# Logseq 工作视图实验

本轮结果见 [PRESENTATION-VALIDATION.md](PRESENTATION-VALIDATION.md)；Agent 介入实机验证见 [AGENT-VALIDATION.md](AGENT-VALIDATION.md)。

已在本机 Logseq 文件型 Graph 中进行原生操作验证。插件名：**Block Live Preview 实验**。这是独立技术原型，不依赖 Task Copilot Kernel，也不修改工作对象的正式状态。

本目录即 Logseq 记录的外部插件路径 `/Users/wangrundong/work/logseq-live-preview-spike`；移动目录会导致插件静默失效，需在 Logseq 里重新加载。`evidence/`、`dist/`、`runtime.json` 保留在本地、不入版本库（`evidence/` 含真实笔记片段与实机遥测）。

## 直接使用

1. 在 Logseq 中右键点击一个块左侧的圆点，选择 **实时预览此块**。原生菜单较长时，需要向下滚动。
2. 或点击块进入编辑，然后按 **⌘⌥P**（Command + Option + P）。
3. 右侧显示这个块及其子块；继续在左侧编辑，预览跟随更新。
4. 想换范围，就对另一个块重复上述操作。普通点击其他块不会自动更换预览范围。
5. **独立窗口**会在默认浏览器打开同一份预览。此后可以关闭停靠面板，浏览器仍会更新。
6. 预览圆点用于折叠；不会改变 Logseq 的块结构。**原文**用于定位，预览正文双击也可请求定位。

停靠预览可独立运行。浏览器预览需要本地 relay 服务保持运行。完全停止采样可在 Logseq 插件管理中禁用本插件；仅关闭外部标签页暂不会停止插件采样。

## 构建与服务

在此目录运行：

```sh
/opt/homebrew/opt/node@20/bin/node build.mjs
/opt/homebrew/opt/node@20/bin/node server.mjs
```

当前构建复用了旧工作区已安装的 esbuild、Logseq SDK 0.3.4、DOMPurify 3.3.3；没有修改旧项目依赖。在其他机器上需要先安装本目录 package.json 中的依赖。Marked 15.0.12 的构建文件与许可证位于 vendor/，来源为官方 npm 包。

首次构建生成私有 runtime.json；它与 dist/ 均不应提交。服务仅监听 127.0.0.1:8768，块内容只保留在进程内存。敏感接口需随机 token；浏览器地址由插件按钮生成。

Logseq 手动载入插件时选择本目录，**不要选择 dist 子目录**。更新代码后构建，再在插件管理中重载 Block Live Preview 实验。

## 代码地图

| 文件 | 职责 |
|---|---|
| plugin.ts | 选块、草稿采样、DB 变化订阅、停靠与外部预览桥接 |
| render.ts | Markdown 净化与渲染，按 UUID 更新行，预览折叠状态 |
| shell.html | 连续行布局与轻量视觉样式 |
| server.mjs | 可选本地 HTTP/SSE 中继，内存快照与测量数据 |
| external.ts | 独立浏览器接收快照、渲染帧确认 |
| agent-client.mjs | Agent 侧结构化客户端（relay view-ops 通道） |
| AGENT-VALIDATION.md | Agent 介入实机验证、接口缺陷与摩擦 |
| VALIDATION.md | 实际验证结果、延迟口径与覆盖限制 |

## Agent 结构化接口

本地 relay 的 `/view-ops` SSE 流是 Agent 唯一入口；插件按 graph+root 校验范围，操作只影响 presentation 状态，不调用任何 Logseq 写接口。

```sh
node agent-client.mjs state          # 当前连接与范围概览
node agent-client.mjs query          # 回读 items/blocks/selected/collapsed
node agent-client.mjs op '{"type":"focus","uuid":"..."}'
```

操作类型：`query`、`scope`（切换工作范围根块）、`layout`（原子提交完整排列）、`reorder`、`indent`、`focus`、`collapse`、`locate`。拒绝原因（`root-not-movable`、`target-inside-moved-subtree`、`indent-had-no-effect`、`stale-source` 等）是接口契约的一部分，Agent 必须按原因重判而不是重试。

验证：`node agent-ops.mjs`、`node agent-semantic.mjs`、`node agent-locate-stale.mjs`；证据在 `evidence/presentation/agent-ops/`、`evidence/presentation/agent-semantic/`（含整轮会话前后的 Graph 文件哈希对照）。

## 当前能力边界

- 从根块子树进入，持续跟踪已纳入 UUID；支持插件重载恢复范围。完整进程重启和重建索引尚未验收。
- 常见 Markdown 由 Marked 渲染；把 `[现状]`、`[注]` 等标签压缩显示，并隐藏 id:: 行。
- 不提供 Logseq 完整渲染器：宏、查询、公式、嵌入块、引用展开、Org 格式尚未适配；图片当前主动不渲染。链接不等同于 Logseq 内部导航。
- 输入中的草稿为只读临时覆盖；本插件没有 updateBlock、moveBlock 等正文写入路径。
- 约 50ms 的 SDK 采样不是逐按键事件订阅；输入法组合态、后台节流、长块和大树需要后续专门测试。
- 插件每两秒补发快照。关闭外部标签后的采样回收和进程守护尚未完成。

## Presentation Layer 实验新增能力

拖动手柄调整顺序，向右拖到目标行成为视图子项；点击条目后 Tab / Shift+Tab 缩进与提升。每行的来源按钮定位并高亮 Logseq 原文。编辑原文时，顶部定位按钮可以展开并找到相应条目。

顺序、缩进、折叠、选中与阅读锚点保存于 localStorage。停靠与 Chrome 各自保存布局，当前不跨端同步。原文移出初始子树后仍跟踪同一 UUID；不可读时保留占位。

验证：`node --test model.test.mjs`、`node semantic-audit.mjs`、`node agent-experiment.mjs`。本机 Node 使用 `/opt/homebrew/opt/node@20/bin/node`。`evidence/presentation/` 保存升级前源文件、测试结果和本轮快照；真实语义扫描证据含私人笔记片段，应保持本地。

## Agent 介入的已知限制

- Agent 只能改 presentation 状态；`eligible-for-review` 不是写入授权，本轮没有实现任何写回事务。
- `layout` 需要提交全部条目（101 块约 6–8 KB）；更大范围需要增量表达。
- `move` 不是可逆操作，回滚请用 `layout` 快照，不要用反向 `reorder`。
- `focus` 只支持单选；没有“用户主动移出引用”的接口，占位会累积。
- 插件重载仍需人工操作；插件安装路径被移动后 Logseq 会静默失效（已用符号链接修复，见 AGENT-VALIDATION.md §5）。
