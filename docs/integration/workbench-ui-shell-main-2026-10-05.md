# 工作级 UI Shell 与最新 main 整合

用户明确授权将整体界面合入最新 main 并推送远端。本次从已发布的 main 建立整合分支，以普通双亲合并保留已有报告、材料和协作提交；主 checkout 的未跟踪 `docs/implementation/prompts/` 保留。

## 版本与范围

| 项目 | SHA |
| --- | --- |
| 固定功能开发 BASE | `8529212296f0b65fb78ef7ccd2a2102474d9310a` |
| 原 UI Shell 完整交付 HEAD | `9d8f47b1b261a3e7886a8fed78c4004d73063fbb` |
| 整合前最新 origin/main | `06f24bd28a2bd979e9fab207332d984e3bec7a9e` |
| 产品及回归合并提交 | `d7473c871f624caade1b692a8161922f471a5db4` |

整合分支为 `codex/workbench-ui-shell-main-integration`，工作树仍为原 UI Shell 独立工作树。七处冲突按当前能力组合解决，没有重置其他分支。最新 main 的完整原句报告、材料阅读 UI、明确草稿恢复和协作权限 owner 均保留。公共导航把默认入口收敛为「正文／材料」，原结构放入工作选项，正式任务及插件设置放入工作台菜单，阶段工具按需在「审阅与历史」展开。当前路径同步至[使用手册](../user-guide/workbench-usage.md)，手册中的旧截图仍明确标注历史验收基线。

## 最小公共接线

- `panel-host.ts` 只提供限定工作台的公共样式与入口，未重排 FeaturePanel 布局、原生 expose 或输入恢复。
- `WorkView` 维护当前工作的 chrome；来源仍由 SourceScope 与原 controller 负责，报告正文和书签仍由既有 renderer/report owner 负责。
- `Materials.setWorkChrome(mount, before, nativeContext?)` 在材料面板打开前保存真实几何书签，成功后移动同一 header。正文按钮走原材料离开流程，保留草稿和冲突保护。全局材料库显式传 `null`，避免误用新版默认当前工作范围。
- `WorkView.materialContext(uuid)` 复用原 `readTrace`：当前工作子块的原生材料引用保持同一 root，明确其他来源按其真实工作返回；Graph/root/epoch 改变时丢弃晚到读取。独立材料模块未挂回调时保持已有行为。
- ReviewPort 的可选 `enter/navigation/leave` 和 bridge 的 `openReview/closeReview` 只适配共享入口；修订、历史、认可和写回继续归 StageReview。外层展开会真正展开 owner 控件，内部入口不重复显示。关闭历史回到当前正文；输入中的 owner 可以拒绝离开。
- index 保留 main 的真实 `local.connect`、`local.stop` 和 `stages.setCollaboration`。技术连接就绪不表示 agent 正在工作，开启结构权限仍需要原明确操作。

```ts
materials.setWorkChrome(
  (surface, scope) => work.mountMaterialChrome(surface, scope),
  scope => work.rememberMaterials(scope),
  uuid => work.materialContext(uuid)
);
await work.setReviewOpen(true); // 展开实际 review owner
// 材料构造回调仍为 uuid => work.returnToBody(uuid)
```

完整模块边界见[架构](../architecture/workbench-ui-shell-architecture.md)。没有新增正文副本、通用状态库或宿主对 feature 的反向依赖。

## 本轮完整门禁

Node 20.20.2、npm 10.8.2，Darwin 24.2.0 / x86_64。重新核验仓库要求 Node `>=20.19 <21`、npm `10.8.2`；使用本工作树独立依赖、构建和工具链。

| 检查 | 实际结果 |
| --- | --- |
| 全 workspace 测试 | 655/655，其中插件 421/421 |
| sandbox | 5/5 |
| boundary | 12/12 |
| 总计 | 672/672，失败、取消、跳过均为 0 |
| 需求生成、类型、lint | 通过 |
| 构建、二进制校验、依赖边界 | 通过 |
| Taste | PASS，保留原 active，未自动激活 |
| `git diff --check` | 通过 |

最终 `npm run check` 退出 0，[完整日志](../implementation/assets/workbench-ui-shell/main-check.log)和[计数与 Desktop 状态](../implementation/assets/workbench-ui-shell/main-integration-evidence.json)独立于原分支的 640 项证据。

整合回归覆盖默认报告下的审阅开闭、所见修订、历史只读、材料返回、工作切换、菜单焦点、草稿和过期读取。既有结构视图测试明确选择 structure，不以默认 report 破坏原断言。几个旧固定延时等待改为等候实际来源失效、材料读取、文件登记恢复入口或改名输入框出现，原安全和部分成功断言保留。

前几次检查遇到系统盘 ENOSPC、HFS 临时盘的 Unicode 文件名规范化，以及负载下固定延时测试。最终仅将本任务临时数据与缓存放入独立 APFS RAM 卷，保留产品文件名校验；完整门禁通过后已卸载。没有清理其他工作树或其他人的临时数据。

## 真实隔离 Desktop 复验

使用本机 Logseq 0.10.9 的隔离副本、原任务合成 Graph/profile/材料，tasksEnabled=false；未启动 Kernel、未接入生产 Graph。原副本在功能验收结束已删除，本轮在自有 RAM 卷重建，再由 CUA 转发实际 Electron 画面与输入。转发页没有实现插件 UI，最终图片均为未经修改的 Desktop 截图。

本轮通过实际公开的 `taskCopilotWorkbench.open(uuid)` 入口打开验收长工作，再连续操作界面：

1. 完整报告显示 93 个来源块，保留无标签正文、交错标签、嵌套、事务和局部 TODO。
2. 阅读滚动至 560，切到材料，实际列表显示 4 份文件；打开 `reference-guide.md` 后点「正文」，同一 root、report 模式、原文哈希和滚动位置 560 保持。
3. 点「审阅与历史」展开实际 StageReview 控件；从阶段历史选择具体修订，出现只读说明，原生写作入口禁用。
4. 点「收起审阅」，当前完整报告 93 行恢复，原文哈希与滚动位置 560 不变，原生入口重新可用。
5. 680 宽窄窗中共享 header 的 clientWidth 与 scrollWidth 都是 680，无水平溢出；1440 宽窗实际并排布局已截图。

实际运行 bundle 与全仓构建只有 esbuild 来源路径注释差异（单插件构建与根构建工作目录不同）；去除这些明确路径注释后的执行文本完全一致，SHA-256 记录在证据 JSON 中。未把不同原始文件哈希宣称为一致。

本轮重新验证暗色、宽窄窗、材料和只读历史组合。原功能交接中的明暗主题、短工作、原生写作、断连、外部 CLI 等证据仍属于原分支验收，本轮没有重复宣称这些完整旅程。物理中文 IME、系统级撤销/拖放及其他操作系统未在本轮重新实机覆盖。

| 本轮截图 | 内容 |
| --- | --- |
| [正文](../implementation/assets/workbench-ui-shell/main-body-dark.png) | 最新报告与共享工作身份 |
| [材料](../implementation/assets/workbench-ui-shell/main-materials.png) | 新材料 UI 与共享导航 |
| [审阅](../implementation/assets/workbench-ui-shell/main-review.png) | 实际 owner 控件展开 |
| [历史](../implementation/assets/workbench-ui-shell/main-history.png) | 只读版本、所见修订和返回动作 |
| [窄窗](../implementation/assets/workbench-ui-shell/main-narrow.png) | 680 宽正文导航与长文 |

验收结束恢复临时尺寸覆盖、关闭转发页，并按 app/profile 身份核验后停止仅本任务 Desktop/bridge。两个自有 RAM 卷已卸载，合成 Graph/profile 继续保留。原[设计](../design/workbench-ui-shell-design.md)、[架构](../architecture/workbench-ui-shell-architecture.md)、[功能交接](../implementation/workbench-ui-shell-handoff.md)及原分支截图保留历史时点。本次发布采用主 checkout 快进和普通推送，不绕过 hook、不 force push；最终发布 HEAD 以 main 和 origin/main 为准。
