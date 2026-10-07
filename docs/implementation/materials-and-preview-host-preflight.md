# 材料与预览：宿主能力核验

2026-10-07。这是 A 分支的实施前核验及边界记录，格式渲染和最终安装包验收仍在进行。

共同基线固定为 `5b05d156cc03b37956d6f77de2d10213a6cb58e3`，包含视觉刷新 `eb07013d119584dbd3c68012541f1355118d2b0b` 和修订 2 的两分支资料。分支为 `codex/materials-and-preview`，独立工作树由当前任务创建；主工作树未切换或重置。使用 Node 20.20.2 / npm 10.8.2，宿主 macOS 15.1 arm64、Logseq 0.10.15、SDK 0.3.4。

## 未修改宿主的能力事实

应用以原安装的文件系统副本启动；未更改 package.json、electron.js、preload 或 IPC。关键源文件哈希及实际结果见[能力证据](assets/materials-and-preview/host-capabilities.json)。专属 Graph、材料、home、profile、日志和端口放在本工作树忽略的 `tmp/materials-preview-desktop/`。Kernel、companion 和远程模型未启动。

首次启动只设置 HOME 时，Electron 主目录没有隔离，读取了原用户插件列表；在选择 Graph 前按 PID 与参数核对停止。macOS 的 CFFIXED_USER_HOME 随后由 Foundation 和真实 `getLogseqDotDirRoot` 双重核验为本次专属 home。系统沙箱实验使 Chromium 子进程嵌套初始化失败，该终止实例未被当作验收；正式能力核验使用未修改的应用副本与已核验的隔离主目录，不修改 Chromium 安全开关。

| 能力 | 真实结果 | 实施约束 |
| --- | --- | --- |
| 桥接 readFile | 返回 UTF-8 字符串 | 不作为 Office/PDF 原始字节来源 |
| assets 协议 XHR | 回读 `00 ff 80 0d 0a c3 28 fe` 与磁盘完全一致 | 使用 ArrayBuffer、读取上限、取消与错误，不重新编码字符串 |
| assets 协议 fetch | Failed to fetch | 使用宿主已支持的 XHR |
| readdir / listdir(true) | 递归、只有文件路径 | 不用于活跃目录轮询 |
| listdir(false) | 递归文件数组，目录自身/空目录名字缺失 | 不能冒充一级目录能力；目录 URL 的 XHR 也失败 |
| stat | size、无法序列化的时间对象，无 dev/ino/birthtimeMs | 物理身份缺失时不按名称、大小、mtime 或 hash 自动认领改名/副本 |
| 标准 showDirectoryPicker | 真实选择器成功列出当前层及文件夹 | 没有绝对 File.path；仅凭 handle.name 不能绑定现有配置路径 |
| about:blank 子窗口 | 独立 CDP page，640×480、可访问自己的 document | 创建能力成立；移动、调尺寸、格式渲染与资源清理仍待最终 UI 验收 |

选择器路径问题的候选方案是从同一个原生目录拖入项取得 File.path 与 getAsFileSystemHandle；只授予读取，持久化为 Graph 与实际根绑定，逐层迭代且最多读取 512 项。代码拒绝只有名称、没有实际路径的授权，也拒绝为另一个同名目录替换当前根。该候选还须通过实际插件 UI 与 Finder 拖入验收；这里不提前记为已通过。

只读目录授权与目录配置、Workspace 主身份、材料元数据是不同事实。旧根/历史保持入口；没有受信的一级能力时报告不可用，不回退到无限递归扫描。部分观察不构成删除证明；文件关联/引用的物理身份核验仍须由材料服务完成。

## 保持与依赖

核验之后重新读取前轮的生产采样：3393 个 Graph 文件、16 个 settings 文件和 10 个 storages 文件均无哈希变化。这只证明这些既有采样文件，不能替代完整文件系统、物理 IME 或最终生产验收。

预览依赖按[官方 Mammoth 文档](https://github.com/mwilliamson/mammoth.js)、[PDF.js 文档](https://mozilla.github.io/pdf.js/getting_started/)和[SheetJS 安装文档](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/)核对：Mammoth 1.13.0（BSD-2-Clause）、pdfjs-dist 4.10.38（Apache-2.0，Node >=20）、SheetJS CE 0.20.3（官方 tarball，Apache-2.0）。worker、字体、CMap、样式与许可证的打包以及实际离线运行仍须完成。npm audit 中新增 Mammoth/argparse/sprintf-js 告警须结合最终浏览器 bundle 的实际路径复核；没有用降级到 0.3.29 代替分析。既有 SDK 预打包代码的告警不能仅按 devDependency 排除。

当前新增回归覆盖字节保真、路径转义、上限/取消、真正逐层读、部分/分页/失联保留、工作/Graph 范围撤销、过期回复与卸载。最终交接、格式矩阵、整个仓库检查、仓库外安装及 B 联调适配在完成实际接线后记录。
