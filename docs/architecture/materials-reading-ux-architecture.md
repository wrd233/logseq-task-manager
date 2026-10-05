# 材料阅读交互架构

2026-10-05 更新。完整数据权威、流程图及程序契约见[材料模块架构](materials-module-architecture.md)。早期列表搜索和原文件拖入语义的验证记录作为历史保留，当前交互由本页和模块文档说明。

## 接线

`Materials.ui` 的 `element/show/open/returnToBody/dispose` 继续供既有 FeaturePanel／WorkView shell 使用。公共 chrome、正文书签、报告模式、原生输入保护和阶段审阅未重写。目录页通过现有 `desktopBridge.doAction(['openDialog'])` 选择目录，不调用会读取 Graph 文件的 openDir。

`MaterialDirectories` 保留 Workspace 主 binding，在独立材料偏好键保存多个目录、默认位置和自动目录。`workContext` 从可信 `WorkView.materialContext` 与有限来源祖先取得 ownerUuid；sourceUuid 仍表示原文位置。MaterialService 把 owner 和 source 都加入关联，使粘贴在工作子块内产生的材料可从工作列表找到。

`folder-ui.ts` 只管理目录 UI；`imports.ts` 管文件复制与单请求恢复；`paste-ui.ts` 管原生编辑旁的一次决定；`transfer-ui.ts` 管事件、逐项状态和直接复制。没有新增框架、全局事件总线或材料 HTTP 服务。

## 性能与行为边界

列表空查询只读独立记录，不执行全文搜索；行读取不预读全部长文。导入进度行在第一个 await 前挂载。完成后局部刷新记录列表，不通过整个面板重建改变异步范围；批量失败保留原操作重试。

File.path 只在实际存在且通过 stat、名称、大小核验时使用。浏览器目录 handle 在 drop 派发时保留，虚拟 fullPath 不当 OS 路径。缺 OS 路径的文件通过 ArrayBuffer 导入；目录内容按文件读取 bytes。宿主 copy 使用不覆盖选项，普通 IO/rename 不作跨进程原子承诺。

复制采用点击栈内已有稳定引用，先宿主 document copy，再 Clipboard API；无二次手动复制表单。原生链接粘贴观察器仍只登记已核验、唯一范围的引用事实，不接管普通 paste。缓存的标题不是定位或授权权威。

自动长文本提示不 preventDefault。确认保存后，在原 Graph 和精确原生输入吻合时释放模态焦点，再通过 insertText 替换粘贴范围；否则保留原文和已保存材料。切换 Graph 或卸载释放弹窗，迟到结果不重开。恢复原文继续按稳定 ID 和 record.original；编辑使用既有 expectedVersion／expectedContent、历史、草稿和读回保护。

人和 agent 共用 `materials.list/read/capture/import/associate/save`。新 import 只写材料文件与记录；明确正文关联再走 associate 或现有 executor。展示 apply 没有文件写入权限，程序 save 同样执行编辑边界。

## 验证

行为测试、完整检查及实际隔离 Desktop 结果见[本轮交接](../implementation/materials-drawer-handoff.md)。旧[阅读交接](../implementation/materials-reading-ux-handoff.md)中的截图、源码 SHA 和测试结果属于对应版本，不能当成本轮 UI 或物理 Finder 验收。
