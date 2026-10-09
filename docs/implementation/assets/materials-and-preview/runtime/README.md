# 材料与预览运行证据

与 [交接说明](../../../materials-and-preview-handoff.md) 配套。`evidence-index.json` 记录归档 JSON 的 SHA-256。绝对自有路径替换为 `<A_WORKTREE>` / `<OUTSIDE_PACKAGE>`；UUID、文件字节版本、失败/部分成功语义未改写。PNG 直接复制实际运行截图。

## 最终正常安装版本

`package-install-public-offline.json` 的完整实现提交为 `98c0d4e6d5122ff8a763683e96e25dd511928e36`。`final-*` 是该版本在仓库外、未改动 stock Logseq 的实际运行观察；`lifecycle-*` 使用同一安装包和另建可变合成 MD 验证外部更新、原路径缺失、工作范围切换与资源释放。

`full-check-98c0d4e.log/exit` 为源码完整检查输出；716 business +5 sandbox +12 boundaries =733 tests，其中插件 482，退出 0。文档/证据提交之后没有修改实现源码。

`original-bytes-final.json` 在生命周期验证之后重新核对 24 份原合成材料的完整哈希，全部未变；生命周期可变 MD、外部新加入的五个文件、另一范围页面是另建 fixture，不混入该原件集合。

## 较早能力验证

目录 complete 授权、两层浏览、约 955ms 外部五类发现与真实身份回执在 9d7cf61 至 98c0d4e 的对应运行中取得；最末公共失联 list 已重新用 98c0d4e 验收。各证据只支持其实际场景。

`docx-image-fixed.json`、XLSX、GIF 可见帧、JPEG 与加密格式等早期记录证明相应 renderer 在实现现场的行为，不能当成所有扩展格式在最终安装包逐一重跑过。GIF 结论来自实际 Page 截图裁片的交替像素 SHA，而不是单次 canvas drawImage。

`docx-success.json` 名称沿用原调试文件，实际内嵌图片 width/height 为 null；这是已修复的失败记录。`draft-pointer-before/after` 是 pointer 保护单独不能阻止 stock Logseq hover 重建编辑块的失败记录。它们不能列为通过。后来的 `native-draft-preservation-pass.json` 和最终 `final-draft-*` 才支持当前草稿/选区保持。

`window-resource-live/closed.json` 是较早正常仓库外安装版本的原生关闭资源验证。最终安装版工作切换的资源证据为 `lifecycle-resource-live/after-work-switch.json`，child 消失由同端口 `lifecycle-targets-after-work-switch.json` 证明。

## 当前未证明的项目

物理中文 IME、自由手动拖动/边缘 resize、Windows/Linux/其他 Logseq 版本、长时间运行/断电未实测。系统菜单移动与调整大小的实际位置/尺寸变化已经证明。B 的 Agent CLI 运输与最终跨模块联合验收归 B，尚未完成。

A 最终 Graph 切换、卸载 worker/窗口清理以及目录 observer 失联/改名现场的后续记录应追加归档；上述已通过矩阵不代替这些剩余要求。
