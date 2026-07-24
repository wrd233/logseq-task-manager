# P0-K 完成后返回业务现场自动证据（2026-07-24）

结论：`AUTOMATED_PASS / DESKTOP_GATE_OPEN`

## 实现

- 新增 session-only origin route token；只保存 Block UUID、Page UUID/名称和
  `MAIN_PAGE / SECONDARY_PAGE`，不进入 SQLite、FileStorage、Graph、日志正文或设置。
- 当前 Block Provider 命令、Block Condition 入口和 Page Context 入口捕获来源。
- 有来源时，顶栏“关闭”改为“返回原 Block / 返回原 Page”，不暴露 UUID。
- 关闭、表单取消与 Block Condition 成功统一走同一返回 Controller；错误留在可观察界面，
  用户仍可通过同一动作返回。
- 主 Page Block 返回前重新读取 Block UUID 和当前 Page；Block 移动后跟随 UUID 的现位置。
- secondary Page/右侧栏来源只关闭 overlay，不调用主 Page 导航，避免破坏宿主现场。
- 主 Page 在处理期间发生导航时，Page 返回按稳定 UUID 解析当前名称；重命名后仍能返回。
- 来源 Block/Page 已删除、SDK shape 不可用或定位能力缺失时，关闭 overlay 并显示
  `SOURCE_UNAVAILABLE` 用户提示，不猜测替代目标，不执行正式写入。
- 受控 Project 创建成功按设计进入新 Project Page，并显式清除旧来源 token。
- Graph switch、工具栏/普通命令入口和技术诊断普通入口均清除旧会话 token。

## 自动 Gate

- OriginRoute Controller：
  - main Page Block 重验、定位、关闭；
  - secondary Page Block 保持侧栏，不导航主 Page；
  - Page rename 后按 UUID 返回；
  - 来源缺失时安全关闭且无替代导航。
- UI：来源存在时显示“返回原 Block”，且不渲染技术身份。
- source boundary：表单取消复用 `returnToBusinessOrigin`，未知来源不会进入其他路径。
- Plugin tests：187/187 PASS，0 skipped。
- typecheck、build、dist integrity：PASS。

## Desktop Gate

本轮没有把自动 Gate 计作 Desktop PASS。集中验收仍需覆盖：

1. main Page 普通 Block 的成功、验证失败、Provider 不可用和 Undo 后返回；
2. Block 移动后按 UUID 返回当前位置；
3. right sidebar Block、Block 引用和 Query 结果不被错误提升到 main Page；
4. 普通 Page、Project Page、Journal 的取消/失败/完成返回；
5. Page rename、来源删除与 Graph switch；
6. Light/Dark、窄窗口和键盘关闭路径。
