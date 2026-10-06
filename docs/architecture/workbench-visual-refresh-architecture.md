# 视觉刷新实现边界

## 样式与展开层

`host/visual-style.ts` 统一管理少量 `--wb-*` 颜色和公共控件／对话框／外壳规则。变量限定于插件面板、导航和自有对话框，旧模块使用的 `--ls-*` 在这些表面内映射到同一颜色。主题跟随宿主 `data-theme`／class／背景；iframe 同步所属属性并在卸载恢复。`paste-ui.ts` 复用同一字符串在宿主对话框内部安装样式，关闭即移除；不改宿主全局主题。

`panel-host.ts` 的 `bindOverlayMenu` 供工作菜单、报告行、文件、目录与材料阅读器复用：fixed 覆盖、视口夹取、滚动／尺寸更新、单菜单开启、外点和 Escape 关闭及焦点返回。各 owner 持有 disposer。没有引入 UI 框架、全局通用状态库或新的材料服务。

`materials/ui.ts` 统一模态表单和行内文件名编辑。范围清理会解除本轮决定；正在执行的 IO 继续由原服务完成和核验，迟到失败不重新聚焦已关闭输入。取消不回放 IO。行内草稿和当前输入 DOM 在同范围列表刷新时保留。

## 全文投影与身份

`report-body.ts` 返回 raw、Markdown 显示内容、有限类别／任务状态及被隐藏的原始字符偏移。仅处理真实块第一条正文行；不会写入属性、原块或 TODO。已有 `id::` 隐藏规则独立保留。renderer 的 `data-report-projection` 为当前显示偏移记录，`data-report-source-id`／contentVersion／structureVersion 保持原协议。

`report-model.ts` 消费同一识别器，并沿用原 composer 的邻接保护、安全兄弟范围与整棵子树移动规则。未知段、普通解释父段、事务与子对象边界没有放宽。局部标题只有展示身份，不附可写 UUID。renderer 在同父兄弟内表达连续类别一次，实际任务状态仍逐条显示；已分组章节只覆盖相同深度和类别，不能吞掉后代的局部目标。

历史 overlay 仍使用保存顺序与原始内容，不改变已认可版本。审阅高亮在当前投影上比较同样投影后的旧文，修改依据仍是完整 raw 版本；原文对照、原生定位、材料落点和写回继续用真实 SourceScope／BlockTarget。Project／Area 仍是 page，没有新增伪根块。

## 材料列表归属

`MaterialTransfers` 以稳定材料 ID 与当前 epoch 缓存行及菜单。controller 成功读完后按键更新结果列表，不在异步读取起点清空全部行。更新文件按钮时保留行内表单、输入草稿、反馈与菜单入口，清理消失的 ID。Graph／工作导航关闭旧范围 UI；复制的来源证明沿原协议保留跨面板往返，并在 Graph／卸载丢弃。

复制沿原剪贴板 helper 在用户点击中立即启动，成功之后反馈；失败不插入文本框。改名沿 `renameLocal` 和真实身份引用同步服务，稳定 ID、旧链接和手写别名不变。原 import request key、复制完成恢复、原生精确粘贴与 Journal 不改。

## 验证边界

冻结的 [逐来源预期正文](../../apps/logseq-plugin/tests/fixtures/visual-refresh-expected.json) 与共享长篇样例用于完整渲染核对。新增测试检查字面标记、raw 偏移可逆、来源版本、嵌套、标题无 UUID、窄窗菜单、组合输入、改名焦点和草稿、失败重试及晚到复制结果。具体检查、最终运行包身份、Desktop 旅程与未验项见[交接](../implementation/workbench-visual-refresh-handoff.md)。
