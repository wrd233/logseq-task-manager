# P0-H descriptor 私有导入与 P0-A Desktop 证据摘要

日期：2026-07-23

环境：macOS arm64、Logseq Desktop 0.10.15、Node 20.20.2

数据：隔离测试 Graph，仅使用虚构页面与虚构 MiniProject

## 安全前置

- 未读取、打印、记录或使用用户提供的 DeepSeek Key；
- descriptor token 未进入设置、Graph、Git、日志、截图或报告；
- Desktop 文件选择使用的临时 descriptor 副本权限为 0600，验收后已删除；
- 截图已裁剪并检查，不含路径、终端历史、token 或私人正文；
- Local Service 是既有外部进程，本 Slice 未停止、替换或声称拥有它。

## 自动证据

- 合法 descriptor 经既有 `validateServiceDescriptor` 校验后，只写
  `task-copilot-v2-service-descriptor.json` 固定私有 FileStorage key；
- 非法 JSON/descriptor 零写入；
- FileStorage 失败返回脱敏结构化错误，不回显 token；
- First-run 文件输入覆盖 loading、disabled、安全说明和 escaped error；
- 设置变更与直接 runtime refresh 的 generation race 已由忽略一次自触发设置事件收口；
- Plugin typecheck PASS；
- Plugin tests 137/137 PASS，0 skipped；
- Plugin build PASS。

## 真实 Desktop：descriptor handshake

1. filesystem descriptor path 被当前 renderer 安全拒绝为
   `SERVICE_DESCRIPTOR_PATH_INVALID`；
2. 从 First-run 选择同一 descriptor 的临时 0600 文件；
3. Plugin 校验后写入固定私有 key，并立即刷新连接；
4. 主 UI 显示 `Runtime READY / Store READY`；
5. reload Logseq 后无需重新选择文件，仍直接显示 READY。

结论：P0-H 的 descriptor 私有 handshake 已完成；外部 Service 的自动启动、进程 ownership、
Logseq 退出时安全结束和崩溃恢复仍未产品化，P0-H 整体保持 `PARTIAL`。

## 真实 Desktop：Block Focus

测试正文为单个虚构 MiniProject Block。显式同步后，它具有唯一 active Primary Anchor。

1. 右键 Block，原生菜单显示“加入／移出当前关注”和“撤销上一次关注变化”；
2. 触发 toggle 后显示“已加入当前关注”，Local Service 读回唯一 Focus；
3. 再次触发 toggle 后显示“已移出当前关注”，Local Service 读回空集；
4. 触发 Undo 后显示已恢复，Local Service 再次读回该 Focus；
5. 最终再次移出，Local Service 读回空集，测试状态完成清理；
6. 全程没有导航离开原 Block，没有直接写 SQLite，也没有自动改变正文。

结论：P0-A 正式 Block 的 Focus 加入、移出、会话内 Undo 和 Service 读回闭环已完成 Desktop
验证。普通 Block、Query/引用、右侧栏与 Light 主题留给后续现场路由扩展 Gate。

## 截图索引

- `p0-a-01-descriptor-filesystem-path-rejected.png`
- `p0-h-01-private-descriptor-import-ready.png`
- `p0-h-02-private-descriptor-reload-ready.png`
- `p0-a-02-block-context-menu.png`
- `p0-a-03-focus-added.png`
- `p0-a-04-focus-removed.png`
- `p0-a-05-focus-remove-undone.png`
