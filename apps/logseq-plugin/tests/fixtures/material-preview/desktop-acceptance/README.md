# 隔离 Desktop 只读预览合成样本

24 份合成样本对应 A 的 Desktop 证据和 manifest 中的原始 SHA-256，不包含生产 Graph、笔记或用户材料。仓库内以数字文件名保存，避免 `*` 等原验收文件名影响其他平台的 Git checkout。

在仓库根、Node 20 环境中，将它们物化到**尚不存在的验收目录**：

```sh
node apps/logseq-plugin/tests/fixtures/material-preview/desktop-acceptance/materialize.mjs /absolute/path/to/a-new-fixture-directory
```

命令只建立新目录、校验字节、按 manifest 还原材料根 A/B 与相对文件名；已有目的目录会拒绝，原样本不会改写。输出含 `materials/` 与 `materials-B/`；把它们关联到自有隔离 Graph 的真实工作。用 `materials.resolveFile` 返回的实际 UUID/reference 建立该 Graph 的原生引用，不复用 A 电脑上已生成的 UUID。

Graph asset 验收可以在自有 Graph 的 `assets/` 放入这份合成 PDF 的副本；正文引用它的实际相对路径。实际预览不复制 Graph asset。Kernel/companion 关闭，按正常 GUI 安装仓库外解压的插件包，首次目录读取依宿主能力取得明确的原生只读授权。

核心样本含：复杂 Markdown/本地图片/表格/代码/链接、中文 DOCX 标题/列表/表格/内嵌图片、两页中文与扫描 PDF、两 sheet/合并单元格/351 行 XLSX、真实 BIFF8 XLS、UTF-8 BOM CSV、PNG/JPEG/WebP/GIF、两个根同名 MD 与两层子目录。

加密 DOCX/XLSX/PDF 的预期是就地报告加密；损坏 PDF 的预期是解析失败；安全清洗 MD 的预期是 script/onerror/javascript 链接被去除、远程图片不请求、合法 longdoc 链接保留。安全样本内的 longdoc UUID 属于 A 的 fixture：在新 Graph 中应替换为本机 resolve 得到的合成材料 reference 后测试，不能当成可用身份。

`旧格式.doc` 是 BIFF8 数据换扩展名，仅证明旧 .doc 路由正确报告未支持，不能据此宣布真实旧 Word 阅读通过。特殊文件名与 physical IME/其他平台行为需在实际目标环境核验；物化样本成功不证明 UI 或系统验收通过。
