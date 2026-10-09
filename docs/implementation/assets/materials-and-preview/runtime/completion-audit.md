# A 完成核对

核对对象是固定 BASE 的材料实施 A，不是整个插件生产上线、B 的阅读/Agent 协议或未来 main。实现 SHA 为 `98c0d4e6d5122ff8a763683e96e25dd511928e36`。以下证据均来自已检查的源文件、完整 gate 输出、真实文件 IO 回归或正常安装后的实际运行；限制不记为支持。

| 要求 | 证明与结论 |
| --- | --- |
| 同一 BASE/独立工作树/保留 main | 固定 BASE 完整 SHA、origin、实际分支与本地提交；主目录未切换/重置，范围内 Graph/profile/材料/端口隔离；无推送/PR/委派 |
| 先验证 bytes 与窗口能力 | host-capabilities.json/host-preflight.md 与 stock Desktop 核验；原始非 UTF-8 bytes、真实 about:blank 原生窗口；未修改宿主 |
| 一级目录、两根、文件夹/面包屑 | directory-layer2、rootB-complete；实际两个根同名及两层；directory-ui 与真实 FileIO 目录回归 |
| 活跃外部发现约 2 秒 | 五类普通文件加入后约 955ms 可见，未登记、元数据未改；当前层同步有 512 上限/5 秒单读取超时/取消；没有递归观察 |
| 初次目录受信能力 | 当前宿主缺一级桥接/watcher：明确原生复制目录只读授权；恢复 FSA 为 partial，fresh legacy entry complete；没有伪造路径/剪贴板 |
| 部分/分页不当成删除 | directory-sync/UI 的截断/无效/分页/取消回归；实际失联 29 项保留 current=false，恢复目录后可继续读取 |
| 重叠/多工作/default/unbind/history | directory-sync 与 materials-reading-ux 的真实文件 IO 回归；实际 A/B/default/unbind/层级；历史独立入口，不迁移 WORKSPACE/旧文件 |
| 同一材料入口与幂等 | resolve→retry→existing-path import→resolve 同 ID；A/B 同名不同 ID；Node 真实 dev/ino/birthtime 回归验证可靠改名与副本区别 |
| reference 当前文件名与转义 | 原 UUID/longdoc 生成器，中文/空格/括号/特殊字符及手写别名回归；真实返回完整 Markdown reference |
| 缺身份与失联不认领 | stock stat 缺身份，needs-verification/partial；新替代 ID 拒绝、已知 B 可用；单根失联 public list partial 且无正文/编辑权限 |
| Agent 文件产物复用 | 普通外部 IO 产物经同一 resolve 服务得到真实 ID/reference，接口已发布和实际调用；CLI 运输与笔记写回归 B，未伪称通过 |
| 原始二进制与文本兼容 | FileIO readBytes +真实 XHR ArrayBuffer，字节 SHA 原件比对，原 read API 保留；取消/上限/typed-array offset/前后身份范围回归 |
| 五类 renderer | 最终包 native 与 list 两入口；MD 表格/代码/列表/本地图，DOCX 核心与图片，PDF 中文/扫描/页码/缩放，PNG 尺寸/缩放，XLSX sheets/merge/分页 |
| 扩展格式 | 原实施现场 JPEG/WebP/GIF 可见交替帧、真实 BIFF8 XLS/CSV；renderer 实现未在后续 controller 修复中变化。未宣称最终包逐项重跑扩展格式 |
| 格式失败/边界 | 加密真实 Office/PDF、损坏/超限/ZIP CRC/结构/OLE/缺公式缓存等回归及 runtime 记录；Excel 缺缓存 previewComplete=false；旧 .doc 不支持且明确说明 |
| 可靠清洗 | 最终包实际 script/onerror/javascript 移除、远程图片无请求、合法 material href 保留；source 字符串净化及边界回归 |
| 原件唯一正文与只读 | 预览无保存/转换覆盖、只读权限；24 合成原件最终 SHA 全部不变；新增生命周期 fixture 明确区分；Vditor 仍独立原路径 |
| 链接分类与 Graph asset | 原生 longdoc、MD 相对图片/文件及 Graph assets 同服务；实际 asset target/SHA/window；web/wiki/页面不消费的路径/点击回归 |
| B 点击委托 | 实际导出 delegateFileClick，同步消费文件点击；native 文件点击/草稿实测。B 集合高亮装配需在 B 合并后复验 |
| 原生草稿/选区 | 最终包 textarea ID/value/18–22/connected 与 saved block 保持；hover 修复因 stock blur 的实际失败而实施；composition 生命周期回归，物理 IME 未实测 |
| 既有菜单/改名/复制/书签/焦点 | 现有 UX 回归；实际 external refresh 后改名输入 value/selection/active/connected 保持；取消未提交改名没有改文件 |
| 窄面板/明暗主题 | 最终 384px 预览、长名称/表格分页；native dark 窗口表格背景/文本与原图，实际 theme sync |
| 真正可移动/调尺寸窗口 | 正常 window.open +原生窗口/目标/版本；系统移动与调整大小改变实际 bounds；独立关闭且主窗口仍可写作。自由拖动未证明 |
| 文件变化/改名/缺失状态 | 实际独立窗口旧 SHA 固定、变化/ENOENT 提示、重新打开新 SHA；可信身份改名由 Node 文件 IO 回归、stock 身份限制明确 |
| 作用域与迟到结果 | generation/abort/epoch 的有意义回归；真实 UI 工作切换关闭窗口并 revoke blob；真实另一个 Graph 清除主/子 PDF worker 和旧 views |
| 关闭/卸载资源 | 实际 PDF child worker 独立关闭消失；工作切换 blob 不再可取；正常停用新增 PDF workers/child 清除、7 类 host listeners 全部移除；source dispose 清 timer/abort/URLs |
| 非 Kernel 的正常仓库外安装 | tasks=false/空 descriptor；615 安装字节哈希与 clean build identity，正常 GUI install/reload；PDF worker/CMaps/fonts/license 随包，无开发服务 |
| 依赖与完整仓库 gate | 精确依赖/lock integrity/licenses/浏览器 bundle 输入；check 733 tests exit0、requirements44/type/lint/build/boundaries/taste。依赖漏洞与基线生产风险仍披露 |
| 本地提交与交接 | 代码、本文件、handoff、实际证据及 24 可移植合成样本已在 A；完整提交由 branch rev-parse 核验；B 可合入完整 A，无第三分支 |

物理 IME、Windows/Linux/其他宿主、自由拖动/边缘 resize、崩溃/断电/长时间运行属于未实测限制，未用模拟结果宣布支持。当前宿主物理身份不支持，也未给出 realpath/symlink 级保证。B 必须重新核验合并后的正文高亮/文件点击、Agent 产物到授权写回及最终安装包。这些边界不由 A 代签。
