# 工作台视觉、全文投影与材料交互交接

2026-10-06，本轮全部工作位于一个独立分支和工作树，无子 agent、其他 chat、推送、PR、合并或发布。

## 版本与交付

- 分支：`codex/workbench-visual-refresh`。
- 成功 fetch 后的 `REMOTE_BASE_SHA`：`131401afc12edd505819b36ed80d1bc15034faa7`。
- 实现与安装包来源提交：`35b04e82d74ac69d53b02987736d07fad957a0ef`，打包时源码树干净。后续证据提交仅包含文档和验收资产；最终提交见本轮回复和 `git log`。
- 专用工作树：`/Users/mac/.codex/worktrees/workbench-visual-refresh/logseq-task-manager`。原工作树中已有 `docs/implementation/prompts/` 未修改。
- [可加载 ZIP](assets/workbench-visual-refresh/task-copilot-workbench.zip)，SHA-256：`bf8a7a85e0fc728125e2eaa68ee1d90846574ada0e9b6a01c269ad7c71fba821`。
- [可交互视觉稿](assets/workbench-visual-refresh/interactive-design.html)、[最终设计](../design/workbench-visual-refresh-design.md)、[架构边界](../architecture/workbench-visual-refresh-architecture.md)、[实机证据索引](assets/workbench-visual-refresh/README.md)。视觉稿不冒充实机画面。
- 中文手册：[装好后直接阅读](../user-guide/simple-start-reading.md)、[用工作台推进实际工作](../user-guide/workbench-usage.md)。保留的旧图已标为历史资料。

解压 ZIP 后在 Logseq 开发者模式加载 `task-copilot-workbench` 文件夹。基础阅读没有必填配置，也不需要 Node、Kernel 或外部连接。

## 实际变化

共享暖灰／青绿色变量贯穿外壳、报告、材料、目录、表单、确认及审阅／历史。工作身份和正文／材料导航更紧凑；明暗宿主和 iframe 使用相同层次。局部菜单在触发点旁覆盖，滚动及窄窗口中夹取边界，不推开文件列表。危险动作、主动作与普通动作分开呈现。

行首标记以有限、可逆的显示投影转成目标、思考、说明、记录、问题和真实任务状态，保留完整原句、多行、重复句与四层后代。同父连续类别共用局部标题，沿用原 composer 的保守分组；代码、引用、未知或句中标记不清洗。来源、raw 版本、历史快照和认可依据仍使用原内容；展示标题没有伪写入 UUID。根对象由真实映射的工作标题承载。

文件名改为当前行内保存／取消；同范围刷新保留输入 DOM、焦点和未提交草稿，失败保留名称。复制成功／失败在固定行内位置反馈，失败可以重试。目录名称、默认保存位置和“添加目录”可辨认，完整路径按需展开。长文收纳确认复用公共视觉；既有精确范围、Graph／元素／内容保护及保存后继续入口保留。服务、ID、旧链接、手写别名、文件复制和权限语义未重写。

## 检查

Node 20.20.2、npm 10.8.2，依赖位于专用工作树；实际 Desktop 诊断使用系统 Node 22 的 WebSocket，不参与产品构建。

- `npm run check`：通过。690 个 workspace 测试、5 个 sandbox 测试、12 个 dependency-boundary 测试，共 707 个；无失败、跳过或取消。类型、lint、文档、构建、包依赖和 taste 检查通过。
- 新增五个回归测试：有限标记与 raw 偏移可逆；冻结的 102 来源预期全文、版本与层级；覆盖菜单／Escape／组合输入／清理；行内改名草稿、焦点、取消与失效范围；真实反馈、重试及迟到复制结果。
- `npm run package:plugin -- <本轮 ZIP>`：通过，428 个打包文件；在仓库外解压后加载。打包身份与每个文件 hash 见 `package-proof.json`。
- `git diff --check`：通过。

完整最终检查输出见资产目录 `checks.txt`。先前失败的调试记录仅留在 `tmp/visual-refresh/`，不作为最终通过证据；没有调弱失败断言。

## 实机环境与旅程

macOS 15.2 Intel，Logseq Desktop 0.10.9。复制 `/Applications/Logseq 2.app` 建立自有 `Logseq Task Copilot Lab.app`；Graph、HOME、profile、材料、私有状态和调试端口 19373 隔离。未启动 Kernel、companion 或外部 agent。运行包位于仓库外：`/Users/mac/.codex/workbench-labs/visual-refresh-01a10fad/package/task-copilot-workbench`。截图来自实际 Electron 宿主与最终 ZIP，没有开发服务器、图片加工或浏览器替身。

隔离脚本禁用外部链接、自动更新和协议注册，并将测试目录选择器固定为自有 Graph；所以本轮没有验收外部应用打开、真实系统多选目录或 Finder 拖放。额外 lab IPC 仅改变自有窗口尺寸及对合成文本调用 Electron clipboard／`webContents.paste`，不进入交付源码或 ZIP。

1. **全文**：同一份 102 块合成样例贯穿视觉稿和 Desktop。逐来源对照完整预期文字、原始内容、父级、深度、版本 hash 与隐藏字符偏移；确认根标题有真实映射、局部标题没有 UUID。`source-audit.json` 可逐块审查。Logseq Markdown 导入器对有序列表块 40 生成了自己的 UUID，fixture→宿主映射据完整合成内容显式记录；renderer 始终使用实际宿主 UUID，没有伪造身份。
2. **材料往返**：从长文滚动 480px 处打开实际 Markdown 材料，再返回正文仍为 480px；材料保存／复制不要求外部连接。长文件名不导致全局横向溢出。
3. **展开及失败**：文件覆盖菜单不移动各行；Escape 返回入口。真实文件改名保留扩展名、ID 和全部文件内容；不合法名称失败保留草稿，取消不改文件。行内复制失败通过短暂替换本 lab 的 clipboard 返回值注入，验证就地重试和稳定列表尺寸，再恢复真实实现。目录路径默认收起，默认位置可辨认；680px 窗口的文件／目录菜单与列表没有全局溢出。
4. **原生输入**：在真实 Logseq textarea 中用 CDP 输入，打开只读阅读后原节点、草稿、焦点和选区保持；保存的完整新句出现在报告。测试结束还原合成原句。这不等同于物理中文 IME 或 Undo。
5. **收纳**：lab 通过真实 Electron clipboard 和 native paste 方法粘贴 2,560 字合成文本，确认框在宿主显示并随明暗主题中途切换，取消后长文本保留。另一轮保存 2,730 字，磁盘材料逐字相同；宿主粘贴元素／位置变化时显示“材料已保存，粘贴位置已变化”与复制继续入口，保留当时当前原生内容。该轮没有证明正常精确范围自动替换成功，见未验事项。
6. **页面、结构、历史与重载**：结果见 `boundary-proof.json` 与 `reload-package-proof.json`。阶段认可没有代用户执行。版本保护的不可变认可、聚焦、Graph 失效及迟到 IO 另外由现有回归测试覆盖；未将程序测试冒充全部人工旅程。

## 尚未完成的 Desktop 项目与最小复验

以下项目不能由当前自动化输入证明，均标为**未完成**，不纳入实机通过结论：

- **物理中文 IME、Tab 全流程及原生 Undo**：在自有 Graph 新建一个工作，用中文输入法组合期间打开阅读、展开／关闭菜单，检查选区与候选未丢；完成保存后 Cmd+Z／恢复，确认只撤销原生输入及此次粘贴。组合事件和 Escape 保护有回归测试，不能代替此步骤。
- **跨应用系统剪贴板**：实际 trusted CDP 点击后，Logseq renderer 读回链接完全相同；独立 `/usr/bin/pbpaste` 探针不一致。请从实际文件“复制链接”，立即在另一个本机文本编辑器粘贴并核对 ID、显示名称；拒绝权限再重试。未声称跨应用粘贴已通过。
- **正常长文粘贴后的精确范围自动替换**：用物理 Cmd+V 在前后已有原句的原生编辑区粘贴长文本，命名确认后核对只替换此次范围、前后文字和属性保持；再 Undo。实机已证明确认主题、取消、完整保存和位置变化继续入口，正常自动替换尚未完成实机验收。
- **Finder 多文件／目录拖放、真实目录多选、导入部分失败与重试**：向当前材料列表拖入两个文件，确认原件保留；令一个目标不可写，重试成功项不重复；宿主选择两个目录并切换默认，新材料进入新目录、旧材料仍在原处。目录选择器在 lab 被隔离脚本替代，这些物理动作未执行。
- **Graph 切换、材料编辑冲突／只读草稿、宿主右侧栏与完整聚焦旅程**：使用两个自有 Graph，在菜单／改名未完成时快速切换，检查旧结果不进入新工作；外部编辑只读文件及未保存材料草稿后往返历史／当前，核对冲突和恢复；打开宿主侧栏、显示／退出聚焦后确认窄面板完整原句。自动回归保护通过，这组实际人工旅程未完成。
- **Windows／Linux、其他 Logseq 版本**：未实机验收。

专用工作树、原始检查输出、合成 Graph 和执行脚本保留于 `tmp/visual-refresh/`、`tmp/logseq-sandbox/`；证据索引记录可复现路径。收尾只停止本轮 PID 且核对其 app＋profile 所有权，不触碰生产 Logseq 或其他实验进程。
