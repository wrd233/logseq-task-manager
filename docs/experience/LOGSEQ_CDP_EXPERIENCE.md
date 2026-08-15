# Logseq / CDP 真实桌面操作经验

> 状态：**经验记录，非 SOP，非约束文件。**
> 本文记录 2026-08-14/15 在 Object Lens 实验中对真实 Logseq Desktop 做 UI 观察、驱动与验证时
> 实际发生的事。后续 Agent / Codex 可以用自己的工具和更完整的系统权限走更好的路径；
> 本文只负责把已踩过的坑、已验证可行的绕行方式、以及失败原因留下。
>
> 置信度标注：[已验证] = 本轮真实 Desktop 会话中直接观察到；[本环境] = 当前 macOS / Logseq 版本下成立；
> [推断] = 合理推断但未专门复验。没有标注为事实的内容不要当作事实。

## 1. 本轮环境

| 项 | 值 |
| --- | --- |
| 系统 | macOS，Apple Silicon |
| Logseq Desktop | 0.10.15（内置 Plugin SDK 0.0.16） |
| Node | 20.20.2（仓库要求 Node 20.x；`/opt/homebrew/opt/node@20/bin`） |
| 插件加载 | `apps/logseq-plugin` 通过 `~/.logseq/preferences.json` 的 `externals` 指向本 checkout |
| 测试 Graph | 仓库内嵌套 `logseq/`（外层 gitignored，内容绝不提交） |
| 自动化入口 | CDP `http://127.0.0.1:9222` |

## 2. 启动带 CDP 端口的 Logseq

### 2.1 两条失败路径，先记住原因

- `open -a Logseq --args --remote-debugging-port=9222` **在本环境没有生效**。[已验证/本环境]
  原因未进一步定位，可能是 LaunchServices / 权限传递问题。换机器或权限更好时仍值得先试这条最简单的路，
  但试完必须 `curl -s http://127.0.0.1:9222/json` 确认端口真的存在，再继续自动化。
- 直接运行 Electron 二进制、复用原始 userData 会失败：
  `SingletonLock: Operation not permitted` / `sandbox initialization failed`。[已验证]
  这是 profile 目录权限/TCC 现象，不是应用损坏。

### 2.2 本轮有效做法：复制 profile 到 /tmp 启动

```sh
rm -rf /tmp/logseq-cdp-profile
mkdir -p /tmp/logseq-cdp-profile
cp -R ~/Library/Application\ Support/Logseq/ /tmp/logseq-cdp-profile/

nohup /Applications/Logseq.app/Contents/MacOS/Logseq \
  --no-sandbox \
  --user-data-dir=/tmp/logseq-cdp-profile \
  --remote-debugging-port=9222 \
  > /tmp/logseq-cdp.log 2>&1 &
```

关键点 [已验证]：

- `--user-data-dir` 换的只是 Electron profile；Logseq 仍会读 `~/.logseq` 的 preferences / settings / graphs。
- 复制 profile 会带入原有图库、localStorage、主题等状态，比全新 profile 更接近真实现场。
- 启动后等 10–15 秒再 `curl http://127.0.0.1:9222/json`；不要只等一个固定 sleep 就假设 target 可用。
- `ps` 可能被系统拒绝；`pgrep -fl Logseq` 与 `lsof -nP -iTCP:9222 -sTCP:LISTEN` 可用。
- 结束实验后用 `pkill -f '/Applications/Logseq.app/Contents/MacOS/Logseq'`，再 `open -a Logseq` 恢复正常应用，
  并确认没有残留 spike kernel / Logseq 进程。

## 3. CDP 客户端与上下文定位

仓库内极简 CDP 客户端：`tmp/desktop/cdp.mjs`（gitignored，本地工具）提供 `targets()`、`connectTo(target)`、
`cdp.send(method, params)`、`cdp.eval(expr)`、`screenshot(cdp, path)`。Node 20 无全局 WebSocket，
必须 `node --experimental-websocket tmp/desktop/cdp.mjs`。[已验证]

### 3.1 主 frame 与插件 iframe 是两个世界

- `/json` 里 `type === "page"` 的 target 是主窗口。[已验证]
- 插件运行在 iframe：`file:///.../apps/logseq-plugin/dist/index.html`。主 frame 无法直接访问插件的 `logseq` / 模块变量。[已验证]
- 可靠定位插件 context 的步骤：
  1. `Runtime.enable`；
  2. 监听 `Runtime.executionContextCreated`；
  3. 对每个 context 执行 `location.href`；
  4. 找到 href 含 `dist/index.html` 的 `contextId`；
  5. 之后用 `Runtime.evaluate({ contextId, expression, awaitPromise, returnByValue })` 在插件 context 内直接调用 `logseq.*`。[已验证]
- 插件 console 不会自动出现在主 frame console。[已验证] 需要在插件 context 给 `console.log/warn/error`
  打补丁，把日志收集到 `window.__logs`，或按需输出到可读取的 DOM。[已验证]

### 3.2 真实事件，而不是 `element.click()`

Logseq 会忽略很多 untrusted 的 `element.click()`，命令面板（cmdk）与插件注入 UI 尤其明显。[已验证]

可靠组合 [已验证]：

1. 用选择器定位元素，`scrollIntoView({ block: 'center' })`；
2. `getBoundingClientRect()` 算中心点；
3. 用 `document.elementFromPoint(x, y)` 确认该点真的是目标元素；
4. `Input.dispatchMouseEvent` 发送 `mouseMoved` → `mousePressed` → `mouseReleased`；
5. 动作后检查预期 DOM 状态（例如 `activeElement`、目标节点、hash），不要只检查“API 返回成功”。

命令面板/搜索选中行：`Input.dispatchKeyEvent` 的 ArrowDown + Enter 比直接 `.click()` 可靠；
结果行选择器为 `.cp__cmdk .search-results > div`。[已验证]

## 4. Block 编辑、键盘与“调用成功 ≠ 编辑态”

### 4.1 双击进入真实编辑态

`Input.dispatchMouseEvent` 的 `mousePressed` / `mouseReleased` 带 `clickCount: 2` 可在 block 正文上双击。[已验证]
进入编辑态后 `document.activeElement` 是 `TEXTAREA`（Logseq 的 uniline textarea）。[已验证]
判断“进入编辑态”必须以 `activeElement` / textarea 存在为准，而不是以事件派发成功为准。

### 4.2 `logseq.Editor.editBlock` 不进入编辑态

`logseq.Editor.editBlock(uuid)` 在 0.10.15 不会把 UI 带入可输入状态。[已验证/本环境]
实际可用的 Source 闭环是：`scrollToBlockInPage(page, uuid)` 先定位到块，再由用户双击进入原生编辑，
或由 CDP 发送真实双击。[已验证]

### 4.3 键盘自动化：Cmd+A 是最脆的一环

- `Input.insertText` 在 textarea 聚焦后可靠插入文本。[已验证]
- `Input.dispatchKeyEvent` 发 Cmd+A（`modifiers=4`）在 Logseq uniline textarea 上**不稳定**，
  自动脚本出现过文本拼接。[已验证] 人类用户不受影响。
- 任何自动编辑都要在开始前保存精确 block UUID 与原文；出现拼接时用
  `logseq.Editor.updateBlock(uuid, exactText)` 精确恢复，这在本实验中被证明是最稳的恢复路径。[已验证]

### 4.4 为什么要强调这个坑

最容易误判的不是“调用失败”，而是**调用成功、界面没有进入预期编辑态**，后续键盘输入就写进了错误的位置。
自动化验证序列应该是：定位 block → 进入编辑态（验证 TEXTAREA）→ 输入 → 失焦/保存 →
读取 `Editor.getBlock(uuid)` 复核内容 → 实验结束用 exact restore 恢复原文。

## 5. 导航：页面、Graph 与刷新

### 5.1 页面跳转

```js
location.hash = "#/page/" + encodeURIComponent("页面名");
```

- 导航后等 5–9 秒，并检查 `#main-content-container` 文本确认真的切换了；有时主区仍停在日志页，
  先跳 Today 再跳目标页通常恢复。[已验证]
- **页面名不要使用「·」等特殊字符**，实测会造成路由异常；用 ASCII、空格、连字符。[已验证]
- 文件型 Graph 新增页面：先写 `logseq/pages/<页面名>.md`，再重启 Logseq 才稳定导入。[已验证]

### 5.2 切换 Graph

```js
localStorage.setItem("current-repo", JSON.stringify(JSON.stringify("logseq_local_/绝对路径")));
location.reload();
```

- 值是**双层 JSON 字符串**。[已验证]
- 一次 reload 未生效时，先导航 Today 再跳目标页；文件型 Graph 路径变化后必要时完整重启。[已验证]
- 全新 Electron profile 可能停在 Welcome 页；复制真实 profile 更稳。[已验证]

### 5.3 三种 “reload” 的区别（重要）

| 操作 | 会发生什么 | 不会发生什么 |
| --- | --- | --- |
| 插件 reload（`LSPluginCore.reload("task-copilot-vnext")`） | 插件模块重新执行 | **不清理宿主 DOM 中插件上次注入的节点**；不重导新页面 |
| 页面刷新 / 页面重渲染 | 宏 slot 重建、宏回调重新触发 | 不保证插件 JS 重新执行 |
| Logseq 完全重启 | 重读 preferences/externals、文件型 Graph 新页面导入 | — |

由此得到的规则 [已验证]：

- 改插件代码：先 build，再插件 reload。
- 首次切换插件 checkout：改 `~/.logseq/preferences.json` 的 `externals` 与 settings 后，必须**完全重启**。
- 插件 reload 后要按 `data-object-lens-owner` 这类 owner 属性清扫陈旧节点；不能假设旧 UI 会自动消失。
- 宏参数/宏 block 内容变更不会立即重渲染；旧 Lens 会残留到页面重渲染。[已验证]
- 主题切换会触发宏 slot 重建，prototype 面板状态可能回到默认值。[已验证]

## 6. 截图、视口、主题

- 截图：`Page.captureScreenshot({ format: "png" })`。[已验证]
- 视口：`Emulation.setDeviceMetricsOverride`；结束用 `Emulation.clearDeviceMetricsOverride` 恢复。[已验证]
- 深色主题：
  `window.LSPluginCore.selectTheme({ mode: 'dark', name: 'Default Dark Theme', ... }, { effect: false })`。[已验证]
- 深色切换会触发宏 slot 重建，面板状态回到默认值是已知行为；正式 UI 需要把持久状态与 slot 生命周期解耦。[已验证/本环境]

## 7. 低风险验证真实 Graph 的纪律

1. 使用 gitignored 嵌套测试 Graph（本仓库 `logseq/`），绝不把验证动作落在业务 Graph 上。
2. 动 `~/.logseq/preferences.json`、`settings/*.json`、FileStorage descriptor 前先备份到 `tmp/*/backup/`；
   本实验每个阶段都保留了独立备份。
3. 实验结束恢复配置、精确恢复被编辑的 block、删除 synthetic 页面、停掉 spike kernel。
4. 截图、evidence JSON、门禁日志全部只放 gitignored `tmp/`；descriptor / token / graphSnapshotKey /
   graphBridgeToken 不打印、不提交。
5. 涉及真实 Kernel 的 spike 使用独立 state 目录，不触碰 `~/.task-copilot-vnext`。
6. “闭环验证”以最终 URL/hash anchor、最终 block 内容为准；例如 Derived 跳转必须核对 hash 指向的 block UUID，
   而不是只看“面板出现了”。[已验证]

## 8. 可靠与脆弱的自动化清单

### 较可靠 [已验证]

- CDP 真实鼠标事件 + `elementFromPoint` 定位。
- 插件 context 内直接调用 `logseq.Editor.getBlock / updateBlock / scrollToBlockInPage`。
- `DB.onBlockChanged(uuid, cb)` 订阅 source block 变更后刷新 Lens；需去抖和订阅去重。
- 精确 UUID + 精确原文作为编辑前的 restore 基线。
- 页面名 ASCII、页面跳转后检查 `#main-content-container`。
- 证据采用“screenshot + JSON 状态快照”，JSON 记录 DOM/hash/高度等可复核数字。

### 较脆弱 [已验证/本环境]

- `element.click()` 驱动宿主 UI / cmdk。
- `Input.dispatchKeyEvent` 发组合键，尤其 Cmd+A。
- 依赖 slot id 持久（每次页面渲染都会变）。
- 期待 `Editor.updateBlock` 改宏参数后立即重渲染。
- 页面名带「·」等特殊字符。
- 只用 sleep 不验证 target / 页面 / 编辑态是否真实到位。

## 9. 尚未验证、不要当作结论

- 其他 Logseq 版本（尤其新版本）的行为可能不同；本文结论以 0.10.15 + 内置 SDK 0.0.16 为准。
- 通过 Accessibility / UI Automation 定位与驱动 Logseq 的路线本轮没有实测。
- 更完整的 GUI / LaunchServices 权限下，`open --args` 可能直接可用，值得优先尝试。
- 稳定 select-all、系统级 undo 后的 block UUID 行为、以及自动键入在长文本/多行 block 中的边界，本轮没有专门覆盖。
- 本仓库后续若正式启用桌面自动化，应当把这些行为写成可复跑的 smoke probe，而不是继续依赖人工记忆。
