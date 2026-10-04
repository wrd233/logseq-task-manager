# 材料拖入与文件改名整合到 main

2026-10-04。用户在功能交付后明确授权合入最新 main 并推送。本记录补充[功能交接](../implementation/materials-drop-rename-handoff.md)的本地交付时点；实际行为与权威见[产品设计](../design/materials-drop-rename-design.md)和[架构](../architecture/materials-drop-rename-architecture.md)。

## 提交与环境

| 项目 | 核验值 |
| --- | --- |
| origin | `https://github.com/wrd233/logseq-task-manager.git` |
| 原功能共同基线 | `e666e7be1367e97dabf5f787c7dcb944ac70e815` |
| 本次成功 fetch 的最新 main | `df307efee3572c312b1cbd9c04a4b93a81ac69f1` |
| 保留的功能分支 | `codex/materials-drop-rename`，`4404838bf1d357b9f7deaf9484c873fce1b36134` |
| 独立整合分支 | `codex/merge-materials-drop-rename-main` |
| 双亲合并提交 | `3113483789d6c44c4dcee14756eaa999bd7bc8ab` |
| 共享能力兼容提交 | `a060ef184ea4d286e49a36231d7c5ce8db519596` |
| 工具链 | worktree 独立 Node 20.20.2／npm 10.8.2；Darwin x86_64 |

复用本 chat 已附属的 managed worktree，保留原功能分支与完整历史，不读取其他活动工作树的未提交实现。依赖、构建和临时记录继续在该工作树独立目录；依赖与 lockfile 没有变化，没有升级工具链。

合并第一父提交为上述经 fetch 核验的远端 main，第二父提交为完整材料功能交付。唯一文本冲突是 integration README，保留正文整理、原生报告、书写兼容与材料双方入口。`index.ts` 自动合并并保留所有能力注册；材料编辑测试同时保留 main 的可见恢复状态等待修复和功能分支的真实 child 读回夹具。main 自共同基线更新、而材料分支没有修改的 63 个路径在整合树中逐字节保持不变。

## 实际整合结果

材料列表拖入只关联原文件，可靠报告正文拖入通过现有 content executor 插入原块的子块引用。复制、真实文件改名、有限物理身份定位、稳定 ID 与逐项恢复沿用材料模块；没有创建另一份正文或布局写入口。

`installMaterialTransfers` 消费已发布的 `WorkView.resolveBodyDrop(element,"child")`，由报告 owner 核验面板归属、历史、原生输入和版本，再由材料适配复核 workspace provider 与当前 scope。保留块级落点，不宣称精确鼠标字位，也没有接管原生编辑器的任意 drop。

初次整合类型检查发现 main 新增的 schema 2 `move-block` 不能当成文本操作计算范围。引用编排改为明确识别 `replace-text`／`insert-text`；自身仍只生成 schema 1 的文本和子块操作。没有修改新版正文协议、executor、许可、Journal 或真实块移动实现。

新增组合回归经过真实 Materials、WorkView、ContentInstallation 和 StageWorkbench 安装入口：报告分组改变展示顺序，材料仍插入正确 UUID 的子块；Journal 持久结果为 `APPLIED_VERIFIED`；自然 MiniProject 内生成标签随实际文件改名更新，文件字节、稳定 ID 和已认可阶段历史保持。合成报告标题、原生草稿及历史视图不能成为可写落点。宿主是 DOM／SDK 替身，文件使用临时目录与真实文件 IO。

原功能交付基线中的 MiniProject 含糊保护限制，在 main 已发布的自然子树识别下通过上述回归。正式对象、managed 子树、TODO、原生编辑和版本冲突继续由原 authority/executor 阻止写入；材料没有扩大许可或绕过保护。原截图仍属于功能分支的原构建。

## 本次验证

| 检查 | 最终结果 |
| --- | --- |
| 材料 UI 与新增报告／阶段组合回归 | 5／5，0 fail／skip／cancel |
| `npm run check` | exit 0；需求生成、类型、lint、测试、构建及产物校验全部通过 |
| 工作区业务测试 | 617／617，其中插件 383／383 |
| sandbox 脚本测试 | 5／5 |
| 边界回归与实际扫描 | 12／12；Dependency boundaries verified |
| 总测试数 | 634／634，0 fail／skip／cancel |
| Taste | PASS；KEEP_0.1.0_ACTIVE，未激活候选 |
| 合并与空白 | 无未解决冲突，`git diff --check` 通过 |

完整门禁与计数位于工作树忽略目录 `tmp/materials-main-full-check.log`、`materials-main-verification.json`，组合记录为 `materials-main-composition.log`，main 保留核验为 `materials-main-preservation.json`。初次类型检查日志也保留，没有将其报告为通过。需求 HTML 经原脚本生成，没有无关生成变动或个人状态进入 diff。

本次没有重新启动 Desktop，未操作生产 Graph、数据库或材料。原功能交付中的隔离 Logseq 0.10.9 证据继续按原构建读取；没有将它冒充整合构建的实机验收。Finder 系统拖放、原生精确字位、真实中文 IME／Undo、系统粘贴、其他 OS 和长期竞争仍见原交接的未验范围。普通 IO、rename 与插件内锁不提供跨进程 CAS 或文件／记录／Graph 全局事务。

## 发布核验

发布使用普通 `main:main` 推送，保留双方历史，不强制覆盖或绕过现有钩子。推送前再次 fetch 并核对最新远端 main 已被整合包含；远端前进时先保留其更新，重新验证后再推送。

原 main checkout 的未跟踪 `docs/implementation/prompts/` 不暂存、不提交、不清理。仅在分支、跟踪文件状态和路径无冲突均核验后将本地 main fast-forward 到整合交付；不在主目录安装或构建。

最终发布 SHA 包含本整合记录，以远端 `refs/heads/main`、本地 main 和整合 HEAD 的实际比对及交付回复为准。没有部署，整套用户手册／PDF未在本次合并重写。
