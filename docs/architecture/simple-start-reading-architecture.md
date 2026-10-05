# 一键阅读实际架构

实现身份：`6b669b906b1c94779e53a6d2025d5bf364948297`。本轮沿用现有全文报告、来源提供器、材料服务、原生编辑适配器、Journal 和协作执行器，没有新正文副本或新写回执行器。

## 初始化与释放

`index.ts` 安装本地工作目录、阅读、材料、内容保护和阶段模块。正式任务只在用户进入且已有可信配置时启动 `PluginRuntime`；未配置连接不会引发基础阅读的网络轮询。工具栏只注册「工作台」，正式任务从工作台菜单进入。

`host/reading-entry.ts` 在原生块容器内添加独立按钮，读取保存后的 SDK 块内容识别标题；并发和可见块读取有上限。MutationObserver、DB 变化和 Graph 变化刷新入口。按钮阻止鼠标按下的默认移焦，不接管正文点击或编辑节点。卸载清理节点、样式、监听器和缓存，晚到结果由生命周期检查拒绝。

`FeaturePanel` 拥有布局、宽度、宿主侧栏 ResizeObserver 和分隔线。分隔线位于宿主 document，以保持 iframe 移动时的 pointer capture；关闭或卸载删除。面板注册返回独立释放函数，旧实例释放不能注销后创建的同名面板。

## 来源和页面

原有 block scope 不变。只读页面最小扩展是 `SourceScope.kind = page` 与 `pageName`；`SourceSnapshot.page` 单独保存真实页面身份与可用性，`blocks` 是实际正文块的森林。页 UUID 不会伪装成可写块。版本哈希绑定页面身份和真实块的内容、父级、深度、顺序。

`SourceReader.readPage` 核对当前 Graph、`getPage` 与 `getPageBlocksTree`，在异步读取前后检查生命周期。空页面合法；不存在的页面保留明确缺失状态。`report-model.ts` 沿用原有分组和全文片段组合。每个片段仍是实际 `logseq-block` 目标。

页面 scope 的目录绑定、材料、阶段审阅和正文插入／结构目标被拒绝；原生导航只接受页内实际块。现有 agent 协议没有因此获得页面写入能力。

## 已保存内容与原生输入

`WorkViewReport.capture` 与保存后刷新可在原生中文组合输入期间读取可信来源；插件内部可编辑控件组合输入仍暂停重组。`setMode`、范围应用、写回和危险导航仍检查输入状态，不能把草稿当成权威版本。

`NativeEditorAdapter` 路由实际页面并确认真实目标 textarea；同一编辑块继续复用原输入框。返回阅读不调用结束编辑或回灌 value。阅读更新保留未变片段节点，renderer 用来源 UUID 和偏移恢复锚点。

## 持久化

插件私有 localStorage 保存 Graph 对应的阅读 scope、面板开闭、模式、显式折叠和 UUID 书签；单独保存宽度。记录不含正文或 DOM。恢复核验当前 Graph、来源、模式并重新读取；不会导航原生页面。文件 Graph 页 UUID 可能重建，因此恢复页范围会先按已保存的页面名读取当前真实页面身份。无对象的顶部入口清除旧活动范围，再给出具名继续入口；继续入口恢复原现场。

## 材料与连接

`prepareDefaultMaterialDirectory` 只在实际保存缺省材料时运行，通过真实 desktop bridge 获取宿主 `.logseq` 目录，选择 `Documents/Task Copilot Materials/<Graph 路径哈希前 20 位>`。核对 Graph 外路径、目录状态、已有 Graph 标记、写入与读回；可用宿主文件身份进一步拒绝 Graph 别名。现有 Desktop 未提供可靠 realpath，深层软链接边界仍见交接限制。明确绑定和全局配置优先，不迁移任何旧资料。

`installAgentWorkspace` 优先旧显式连接位置；未配置时发现宿主个人目录下 `.task-copilot-workspace/workspace-plugin.json`。只在用户授权工作后连接和轮询。凭据保持原有私有文件和通道权限，不写入证据包。安装包内 `workspace.mjs` 直接复用生产 `runWorkspaceCli` 和 server，不依赖 Kernel 或原生 SQLite。独立 `.command` 启动器使用 PATH 中的 Node，未硬编码开发机器路径。POSIX 是现有协作通道的运行边界。

## 打包

`npm run package:plugin` 运行现有全量构建，收集实际 `dist`、Logseq SDK、本地 Vditor 资源和许可证，加上仅含运行元数据的 package.json、协作启动器和 build-identity.json。ZIP 文件排序、时间戳与权限固定；身份文件列出代码提交、是否有已跟踪修改和每份运行文件 SHA-256。包里没有 Graph、node_modules、测试资料或连接凭据。
