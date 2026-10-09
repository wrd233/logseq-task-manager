# 材料与预览运行证据

与 [交接说明](../../../materials-and-preview-handoff.md) 配套。`evidence-index.json` 记录归档 JSON 的 SHA-256。绝对自有路径替换为 `<A_WORKTREE>` / `<OUTSIDE_PACKAGE>`；UUID、文件字节版本、失败/部分成功语义未改写。PNG 直接复制实际运行截图。

## 最终正常安装版本

`package-install-public-offline.json` 的完整实现提交为 `98c0d4e6d5122ff8a763683e96e25dd511928e36`。`final-*` 是该版本在仓库外、未改动 stock Logseq 的实际运行观察；`lifecycle-*` 使用同一安装包和另建可变合成 MD 验证外部更新、原路径缺失、工作范围切换与资源释放。

`full-check-98c0d4e.txt/exit` 为源码完整检查输出；716 business +5 sandbox +12 boundaries =733 tests，其中插件 482，退出 0。文档/证据提交之后没有修改实现源码。

`original-bytes-final.json` 在生命周期验证之后重新核对 24 份原合成材料的完整哈希，全部未变；生命周期可变 MD、外部新加入的五个文件、另一范围页面是另建 fixture，不混入该原件集合。

## 较早能力验证

目录 complete 授权、两层浏览、约 955ms 外部五类发现与真实身份回执在 9d7cf61 至 98c0d4e 的对应运行中取得；最末公共失联 list 已重新用 98c0d4e 验收。各证据只支持其实际场景。

`docx-image-fixed.json`、XLSX、GIF 可见帧、JPEG 与加密格式等早期记录证明相应 renderer 在实现现场的行为，不能当成所有扩展格式在最终安装包逐一重跑过。GIF 结论来自实际 Page 截图裁片的交替像素 SHA，而不是单次 canvas drawImage。

`docx-success.json` 名称沿用原调试文件，实际内嵌图片 width/height 为 null；这是已修复的失败记录。`draft-pointer-before/after` 是 pointer 保护单独不能阻止 stock Logseq hover 重建编辑块的失败记录。它们不能列为通过。后来的 `native-draft-preservation-pass.json` 和最终 `final-draft-*` 才支持当前草稿/选区保持。

`window-resource-live/closed.json` 是较早正常仓库外安装版本的原生关闭资源验证。最终安装版工作切换的资源证据为 `lifecycle-resource-live/after-work-switch.json`，child 消失由同端口 `lifecycle-targets-after-work-switch.json` 证明。

## 当前未证明的项目

物理中文 IME、自由手动拖动/边缘 resize、Windows/Linux/其他 Logseq 版本、长时间运行/断电未实测。系统菜单移动与调整大小的实际位置/尺寸变化已经证明。B 的 Agent CLI 运输与最终跨模块联合验收归 B，尚未完成。

`final-before/after-graph-switch` 与 `final-before/after-unload-resources` 记录了正常 UI 的实际 Graph 切换和插件停用：各自新增的主/子 PDF worker 和 child 清除，仅保留同一个宿主基线 worker。`final-listeners-before/after-unload` 证明 7 类材料监听全部移除。

`final-observer-before/during-offline` 证明失联后的 29 项保留为 current=false；`final-rename-draft-before/after` 证明外部新增文件引发刷新时改名草稿/选区/焦点不变。`final-list-*` 补齐最终包的五类当前层列表进入。`final-malicious-network` 的只读网络观察在 native 打开之前已 ready，期间发生本地材料 bytes 请求且没有该 fixture 的远程图片请求。

完整要求核对在 [completion-audit.md](completion-audit.md)。可移植的合成源文件与物化入口见 [desktop-acceptance](../../../../../apps/logseq-plugin/tests/fixtures/material-preview/desktop-acceptance/README.md)。
