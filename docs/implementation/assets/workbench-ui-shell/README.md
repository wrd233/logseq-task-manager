# UI Shell 真实证据

所有 desktop-*.png 都来自本任务隔离 Logseq 0.10.9 的真实 Electron 页面，没有 mock 截图。1440×950 和 680×780 是 Desktop 视口尺寸；部分宽图按宿主设备像素比保存为 2880×1900。

| 文件 | 验证事实 |
| --- | --- |
| desktop-body-light.png | 浅色、完整长正文、单一工作标题、原生并排 |
| desktop-body-dark.png | 最终构建、宿主深色主题、真实原生输入状态 |
| desktop-materials.png | 同工作公共 shell 与四份合成材料 |
| desktop-review.png | 按需进入实际阶段和所见修订审阅 |
| desktop-history.png | 实际已认可历史、只读状态 |
| desktop-work-menu.png | 目录／连接分组和连接不等于 agent 工作的说明 |
| desktop-narrow.png | 680 宽视口的完整报告与简洁入口 |
| desktop-native-narrow.png | 窄窗真实原生段落及「返回正文」 |
| desktop-short-work.png | 正确短工作 identity、普通正文 |
| desktop-short-materials.png | 短工作材料 scope、0 篇与可行动空态 |

before/after-material-final.json 是真实 DOM 读取，返回前后相同 root、标题、scroll=560、report=93。history-final.json 记录 93 历史行、禁用原生写作和只读提示。menu-open/menu-escape.json 记录真实菜单和焦点。narrow-return.json 记录窄窗返回后的 scope、93 行和无 shell 横向溢出。short-materials.json 记录真实短工作空态。

body-final.json 保存实际报告的 93 行与来源 UUID；coverage.json 对照 fixture-map，无遗漏或额外来源。多行编号段落 b70 的 authoredFixtureUuid 在宿主导入时没有成为该块的实际 UUID，映射记录观察到的真实 UUID 并保留原 authoredFixtureUuid；内容与编号项完整出现。重新导入仍应以宿主实际 UUID 核对。

check-delivery.log 为完整成功 gate（640 tests，0 fail）；final-scope-guard.log 是其后最后一处 Graph/root 连接入口匹配变动的成功 typecheck/lint/build。纯样式未增加镜像测试。日期跨 UTC／Asia/Shanghai，日志和截图保留实际时间。

fixtures/ 保存任务包长文替换真实 UUID 后的映射、原生 Markdown 页面以及四份合成 Markdown 材料。路径是当时隔离工作树路径；换机器复用时需要重新关联材料和目录，不复制私有 descriptor／token。

现场过程中曾出现磁盘 ENOSPC，详情见交接的检查限制；截图与 gate 不替代对失败写入的恢复核验。中文系统输入法候选窗、其他主题插件、物理 OS 窗口拖动、Kernel 与真实外部 agent 未在该现场验证。
