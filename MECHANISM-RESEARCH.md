# 机制调研：块历史与渲染层样式

2026-09-09 · 在实验 Graph 上实测，探针操作已并入原型插件（`style` / `host-css` / `dom` / `history` / `git-commit`）

**结论：① 可行，但历史来源的可用性取决于开关状态；② 可行，但有两个落点，必须分清。**

## ① 块历史追踪

### 1.1 两条现成来源

| 来源 | 位置 | 状态 |
|---|---|---|
| Logseq 自动保存的 git | `<graph>/.git` | 历史完整，但**当前已停止提交** |
| Logseq 页面备份 | `<graph>/logseq/bak/<page>/<时间戳>.md` | 每次保存留一份快照，**只覆盖最近若干次** |

实测数据：

- 实验图：22,635 次提交，最后一次 `Auto saved by Logseq` 停在 **2026-08-13 16:44**；本轮新建的合成页（9-08、9-09）**从未进入版本库**。
- 真实图：19,534 次提交（含人工提交），最后一次自动保存停在 **2026-06-03**。
- 两个图的 `config.edn` 都没有 `:git/auto-commit?` 设置。

**受控实验（T0/T1）**：在 Logseq 运行中外部修改一个块 → 视图 2–3 秒内读到新正文（说明 Logseq 在跟踪文件变化），但等待 2 分钟后：git 无新提交，`bak` 无新快照。**说明"能感知变化"不等于"有历史记录"**，两者是不同机制。

### 1.2 插件内读取历史：`logseq.Git.execCommand`

SDK 提供 `logseq.Git.execCommand(args[])`，在 Logseq 内部对当前 Graph 的仓库执行 git 命令。实测通过：

```text
history ['log','--oneline','-n','3']                    → 97623edc9 Auto saved by Logseq …
history ['log','--oneline','-n','2','--', page]         → 单页历史
history ['log','--oneline','-n','3','-S','两项差异','--', page] → 定位引入/删除该文本的提交
history ['show','<rev>:<page>']                         → 取回该版本内容
```

插件也可以**写入历史**（`git-commit` 探针，需显式 `confirm`）：实测提交 `054366589 probe: agent snapshot` 后，新增页面立即进入版本库，`-S` 能定位到引入 `两项差异` 的那一次提交，`show` 能取回该版本正文。这意味着**即使自动保存关闭，Agent 也能按需为工作视图建快照**。

### 1.3 块身份与历史记录的关联

- 文件里的 `id::` 与插件看到的 UUID **一致**：合成页 `**[注]**` 块 `id:: 6a9f85c4-96d8-4161-94bc-6aa7c9d12741`，插件读到的 UUID 完全相同。
- 无 `id::` 的块由 Logseq 生成 UUID：本会话经历 6 次插件重载（instance 从 `84b3aaf1` 到 `43b5b8d0`），**全部 UUID 保持不变**。这比上一轮"未验证"前进了一步，但仍不等于清缓存/重建索引/跨设备。
- 因此块历史的可行路径是：`UUID → 页面文件 → git 按路径/内容回溯`；无 `id::` 的块还需要内容指纹兜底。

### 1.4 尚缺

- `bak` 的触发条件（保存周期 vs 退出）未完全确定，本轮 25 秒观察窗口内未触发。
- 未验证清缓存/重建索引后无 `id::` 块的 UUID 是否稳定。
- 未实现"块级 diff"：目前只能拿到整页版本再自己比对。

## ② 渲染层样式

### 2.1 两个落点，不能混用

| 落点 | API | 实测结果 |
|---|---|---|
| 插件主 UI（工作视图面板） | `logseq.provideStyle({key,style})` | **生效**：`.label` / `.task` 上色后截图可见 |
| Logseq 原生块 | `provideStyle` | **不生效**：插件文档内 `.ls-block` 数量为 0 |
| Logseq 原生块 | 直接向宿主文档注入 `<style>` | **生效**：计算样式立即改变 |

`dom` 探针实测：

```text
pluginDoc: .ls-block count = 0          ← provideStyle 的注入落点是插件自己的文档
hostDoc:   .ls-block count = 14, targetFound = true, hostAccessible = true
```

向宿主文档注入 `.ls-block[blockid="<uuid>"]{background:…}` 后，同一探针回读：`targetBg = rgba(255,224,138,0.957)`、`boxShadow = rgb(217,139,0) 5px 0 0 0 inset`，截图确认原生块出现黄色底与橙色左边线。

**要点：`provideStyle` 只覆盖插件 UI；原生块样式必须写进宿主文档，或走 Logseq 的 custom.css。** 宿主文档可达（`window.parent.document`），所以面板内的行级样式、按块类型上色、在块上叠加可点击区域都可以实现。

### 2.2 已可用的样式钩子

- 面板行：`data-role` / `data-depth` / `data-source-depth`，`.label`（现状/问一下/注/想法）、`.task`（TODO 等）、`.selected` / `.draft` / `.source-focus` / `.missing` / `.outside`。
- 原生块：`.ls-block[blockid="<uuid>"]`。
- 本轮演示：`现状` 绿底、`问一下` 橙底、`TODO` 红字、目标原生块黄底 —— 全部由 Agent 通过 relay 指令注入，已清理。

### 2.3 风险

- 宿主 DOM 的类名与结构**不是 SDK 契约**，Logseq 升级可能失效（与 `scrollToBlockInPage` 高亮同一类风险）。
- 直接改宿主 DOM 需要克制：只加样式、不改结构，且必须可清理（本轮用固定 id 的 `<style>` 元素，可重复注入与清空）。

## ③ 待确认（未开始实现）

第 ③ 项（点击对象 → 自动渲染该对象；多层嵌套时渲染最深对象 + 上方可点击的上级标题；同级点击即切换）需要在实现前确认两点：

1. "高层对象中点击不改变工作视图、要改内部任务需右键选中" —— 这与当前原型行为一致（点击不换范围），确认是否**保持**该行为，只在"叶子对象/最深层对象"上触发自动渲染。
2. "对象"如何判定：沿用现有 `task` + `role` 判定，还是需要 `MiniProject` / `project` 这类页面级对象识别（真实图里有 `MiniProject建立说明书` 等既有结构）。
