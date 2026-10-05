# 材料阅读交互与最新 main 整合

用户明确授权合并最新 main 并推送远端。origin 为 `https://github.com/wrd233/logseq-task-manager.git`。功能仍在固定共同基线开发，整合时才接入已发布的报告全文布局和协作审阅，保留远端历史和主 checkout 的未跟踪提示词。

## 版本与范围

| 项目 | SHA |
| --- | --- |
| 固定功能开发起点 | `8529212296f0b65fb78ef7ccd2a2102474d9310a` |
| 功能及独立文档 HEAD | `d86fe27` |
| 合并前最新远端 main | `f0bfe2edff50ca6657bcf491209afa4b715df6b9` |
| 最新 main 无冲突合并提交 | `4435666058e172a18cd97392abcd91537c9e593d` |
| 最终受检 HEAD | `7df7e4f179187065a0a92ec3bd41e9c02d1a5cb9` |

主 checkout 先快进至已发布 main，再以普通 `--no-ff` 合并材料分支；推送前远端又发布协作审阅，已在本轮工作树再次无冲突整合并重验。测试在本轮独立工作树运行，依赖及构建输出与主 checkout 分开。最新报告仍发布 `.wb-row .wb-body`、实际来源版本和 `resolveBodyDrop`；材料继续消费既有端口，没有复制正文 renderer 或改变写回协议。

合并后的测试修正 `a414931` 用已有 `settle` 等待来源刷新及失效状态，替换 lens 安全回归的两个固定 80ms 等待；原链接、HTML 清洗、临时推断失效和样式断言保留，没有修改业务代码以适配测试。`7df7e4f` 让恢复 UI 回归等待新请求完成并显示恢复结束，断言仅有一个新请求且为 `APPLIED_VERIFIED` 后再清理临时目录，避免 SDK 派发后 Journal 尚未完成的清理竞争。

## 完整门禁

最终 `npm run check` 退出 0，Node 20.20.2、npm 10.8.2：

| 检查 | 结果 |
| --- | --- |
| 全 workspace 测试 | 647/647，其中插件 413/413 |
| sandbox 回归 | 5/5 |
| boundary 回归 | 12/12 |
| 总计 | 664/664，失败、跳过、取消均为 0 |
| 需求生成、类型、lint | 通过 |
| 构建、二进制校验、依赖边界 | 通过 |
| Taste | PASS，原 active 保留，未自动激活 |
| `git diff --check` | 通过 |

[结果摘要](../implementation/assets/materials-reading-ux/integrated-gate-summary.json)记录分包计数、受检 SHA 和完整日志摘要。原功能分支 644/644 与此整合 664/664 分别保留，不把旧结果当作整合验证。

中间两次整合检查遇到磁盘不足的 `SQLITE_IOERR_SHMSIZE`、`SQLITE_FULL`／`ENOSPC`，与材料或报告业务断言无关；只清理本轮已记录临时应用、重复运行时及私有测试目录，未清理用户文件或其他活动 checkout。最终检查禁用 tsx 磁盘缓存，使用单次独立短路径临时目录，结束后删除该目录。工具链版本和项目检查脚本未更改。

## UI 证据与发布

材料实机截图来自 `7a11cfd` 的隔离 Logseq 0.10.9，实际系统剪贴板、文件改名、冲突草稿和稳定 ID 找回事实见[交接](../implementation/materials-reading-ux-handoff.md)。整合后没有重新启动 Desktop；新版报告与材料的共同落点、引用／别名／历史、只读与返回路径由完整自动回归证明。不能把旧截图冒充新报告的实机截图。

Finder 系统拖放、任意原生字位、物理中文 IME 和完整原生 Undo 链仍列为未验；PDF 默认应用启动已得到真实宿主成功回执，未声称窗口内容渲染已验证。

门禁后仅提交本记录、结果摘要及交接链接，产品代码不再变化。发布采用正常 `git push origin main`，不强推、不跳过 hook、不部署。最终发布 SHA 由交付回复及远端 main 读回确认。
