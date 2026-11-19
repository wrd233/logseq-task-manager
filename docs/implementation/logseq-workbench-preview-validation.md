# 工作台预览验收

2026-11-18 在 macOS 15.2（x86_64）和 Logseq Desktop 0.10.9 上，用两套独立的 Markdown Graph 走查。安装包在插件设置里显示 `0.2.0 · 预览 2026-11-18T14:22:53.879Z · WCyVro`。源码位于独立工作树 `codex/logseq-workbench-preview`。

[安装包 ZIP](../../tmp/deliverables/task-copilot-workbench.zip) · [SHA-256](../../tmp/deliverables/task-copilot-workbench.zip.sha256) · [安装与更新说明](../user-guide/simple-start-reading.md)

| 场景 | 现场结果 |
| --- | --- |
| 首次安装 | 从空插件列表用 Logseq 的解压插件加载器装入交付 ZIP。从「会议草稿」进入「阅读当前页」，随后在原工作台开启「发现已有工作」，看到带项目标签的「资料交接」。本地阅读和搜索独立运行。 |
| 自动发现 | 已有工作标记、默认项目标签和自定义 `#交付` 标签均有可读的收录原因。普通 TODO 和只有引用的 Journal 保持在原笔记中。反复打开工作搜索后无重复，九份笔记及 Journal 的文件哈希一致。 |
| 手动选择 | 「园区验收」移出后，在刷新、重载和更新后仍保持移出。原有手动收录的「手动归档资料」用旧身份锚点正常打开。 |
| 来源恢复 | 测试笔记从「设备交付准备」改名为「设备采购准备」后，搜索显示新名称，原 UUID 可定位。另用一条失联的旧记录验证「用当前页重新关联」，随后打开关联后的原笔记。 |
| 原位更新与回退 | 从同一个目录加载，先后更新到 `d0iTwu`、`F5Cnac`，再回退到 `d0iTwu`。每次用 Logseq 重载并读回加载版本，保留自定义标签、移出记录、旧收录条目和正文滚动位置。刻意让一次构建失败时，现有安装目录仍指向上一份可用版本。 |
| 宽窄窗口 | 在交付版本用 1080 px 宽窗走鼠标路径，用 540 px 窄窗走键盘路径。均完成搜索、打开阅读、查看原文、具名继续阅读。分别恢复原滚动位置 2060 px 和 1360 px。窄窗用方向键从搜索框进入结果，再按回车打开。 |

插件的 571 项现有测试、完整构建、插件类型检查和仓库依赖边界检查通过。本轮也用独立协作服务核对了原有工作目录的发布格式。

## 实机记录

- [首次安装入口](../../tmp/deliverables/evidence/fresh-entry.png) · [普通笔记阅读](../../tmp/deliverables/evidence/fresh-ordinary-reading.png) · [设置中的加载版本](../../tmp/deliverables/evidence/fresh-version.png)
- [宽窗正文](../../tmp/deliverables/evidence/wide-reading.png) · [窄窗工作搜索](../../tmp/deliverables/evidence/narrow-catalog.png) · [窄窗正文](../../tmp/deliverables/evidence/narrow-reading.png)
- [首次安装](../../tmp/deliverables/evidence/fresh-preview.json) · [更新与回退](../../tmp/deliverables/evidence/preview-observations.json) · [交付版鼠标和键盘往返](../../tmp/deliverables/evidence/final-journeys.json) · [来源恢复](../../tmp/deliverables/evidence/identity.json)
