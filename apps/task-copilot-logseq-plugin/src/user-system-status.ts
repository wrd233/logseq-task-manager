import type { RuntimeDiagnosticsSnapshot } from "./runtime-diagnostics.ts";
import { projectPluginSystemNarration } from "./status-narration-runtime.ts";

export interface UserSystemStatus {
  level: "READY" | "ATTENTION" | "BLOCKED";
  headline: string;
  keyEvidence: string[];
  narrationRuleId: string;
  whatHappened: string;
  affected: string;
  stillAvailable: string;
  dataSafety: string;
  actionRequired: string;
}

function count(value: number | "unavailable" | undefined): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function restrictedStatus(
  snapshot: RuntimeDiagnosticsSnapshot,
): Omit<UserSystemStatus, "keyEvidence" | "narrationRuleId"> {
  const reason = snapshot.service_connection.reason_code ?? "SERVICE_RESTRICTED";
  const common = {
    level: "BLOCKED" as const,
    affected: "正式写入、审阅提交、Undo、备份、恢复与迁移已暂停。",
    stillAvailable: "Logseq 正文仍可编辑；已保存的页面、正式历史和只读说明不受影响。",
    dataSafety: "系统保持只读安全模式，没有把连接失败当成空状态，也没有自动重试正式写入。",
  };
  if (reason === "LAUNCHER_RESTORE_RECOVERY_ARMED") {
    return {
      ...common,
      headline: "Restore 中断，需要核验",
      whatHappened: "上次 Restore 在确认“恢复前状态已保存”之前中断；系统不会猜测恢复点是否完整。",
      stillAvailable: "Logseq 正文仍可编辑；现有页面和只读历史不受影响。",
      dataSafety: "正式写入保持关闭，也没有把一个未验证的文件描述成可用恢复点。",
      actionRequired: "不要重复 Restore；请从系统维护进入人工核验。",
    };
  }
  if (reason === "LAUNCHER_RESTORE_RECOVERY_STATE_INVALID") {
    return {
      ...common,
      headline: "Restore 恢复记录无法核验",
      whatHappened: "上次 Restore 的安全记录损坏、权限异常或仍被另一个恢复操作占用；系统无法确认恢复身份。",
      stillAvailable: "Logseq 正文仍可编辑；现有页面和只读历史不受影响。",
      dataSafety: "正式写入保持关闭；系统没有猜测回滚结果，也没有声称恢复点完整。",
      actionRequired: "不要重复 Restore 或手动删除记录；请从系统维护导出诊断并人工核验。",
    };
  }
  if (reason === "V2_RESTORE_ROLLBACK_FAILED" || reason === "LAUNCHER_RESTORE_RECOVERY_REQUIRED") {
    return {
      ...common,
      headline: "Restore 需要人工恢复",
      whatHappened: "所选快照未能完成切换，原正式状态也未能自动回滚；Task Copilot 已停止正式写入。",
      stillAvailable: "Logseq 正文仍可编辑；Restore 前恢复点、原快照和技术诊断均已保留。",
      dataSafety: "系统没有继续启用未确认的正式状态，也没有覆盖 Restore 前恢复点。",
      actionRequired: "不要重复 Restore 或自行修改恢复材料。请在下方核验后继续恢复；恢复前 Logseq 正文仍可编辑。",
    };
  }
  if (reason.includes("PROTOCOL")) {
    return {
      ...common,
      headline: "Plugin 与正式服务版本不兼容",
      whatHappened: "当前 Service 协议不能由这个 Plugin 安全使用，正式连接已拒绝。",
      actionRequired: "启动与当前 Plugin 匹配版本的 Service，再重新加载；不要绕过协议检查。",
    };
  }
  if (reason.includes("GRAPH")) {
    return {
      ...common,
      headline: "当前 Graph 与正式状态不匹配",
      whatHappened: "Service 绑定的 Graph identity 与当前 Logseq Graph 不一致，正式连接已拒绝。",
      actionRequired: "连接为当前 Graph 建立的 Service；不要切换数据库或复用其他 Graph 的 descriptor。",
    };
  }
  if (reason.includes("DESCRIPTOR") || reason.includes("NOT_CONFIGURED") || reason.includes("PATH_REQUIRED")) {
    return {
      ...common,
      headline: "Task Copilot 尚未连接正式服务",
      whatHappened: "当前 Plugin 没有可验证的私有 Service descriptor，因此没有打开正式状态。",
      actionRequired: "通过产品入口选择本机 descriptor；校验通过后再连接，不要把 token 或路径写进正文。",
    };
  }
  return {
    ...common,
    headline: "正式服务暂时不可用",
    whatHappened: "Plugin 无法确认同一 Graph 的 Local Service 仍可用，正式连接已经暂停。",
    actionRequired: "重新连接同一 Graph 的 Service 并刷新；在状态恢复前不要重复提交修改。",
  };
}

export function deriveUserSystemStatus(snapshot: RuntimeDiagnosticsSnapshot): UserSystemStatus {
  const narration = projectPluginSystemNarration(snapshot);
  const narrated = {
    headline: narration.conclusion,
    keyEvidence: narration.keyEvidence,
    narrationRuleId: narration.source.ruleId,
  };
  const recovery = count(snapshot.recovery_required_commits);
  if (recovery > 0) {
    return {
      ...narrated,
      level: "BLOCKED",
      whatHappened: "上一次正式修改没有完成，系统已停止创建新的重复操作。",
      affected: "相关正式写入与 Undo 在恢复收口前不可继续；其他独立事项不受影响。",
      stillAvailable: "Logseq 正文、只读历史、诊断和不依赖该 Commit 的日常浏览仍可用。",
      dataSafety: "已完成步骤保存在原 Commit 与恢复账本中，系统不会假报成功或另建重复 Commit。",
      actionRequired: "继续同一恢复记录，先验证已完成步骤，再完成剩余步骤或安全补偿。",
    };
  }
  const pending = count(snapshot.pending_semantic_commits);
  if (pending > 0) {
    return {
      ...narrated,
      level: "ATTENTION",
      whatHappened: "正式修改已经开始，但还没有得到完整的完成确认。",
      affected: "相关修改不能再次提交；其最终结果仍需核对。",
      stillAvailable: "Logseq 正文、其他独立事项、只读历史和诊断仍可用。",
      dataSafety: "已经完成的步骤保存在原 Commit 中；没有删除历史或建立第二条写入链。",
      actionRequired: "继续原操作或进入恢复核对，不要创建一项内容相同的新修改。",
    };
  }
  if (
    snapshot.service_connection.status !== "READY"
    || !snapshot.service_connection.formal_writes_available
    || snapshot.store_status !== "READY"
  ) {
    return { ...restrictedStatus(snapshot), ...narrated };
  }
  const conflicts = count(snapshot.source_anchor_conflicts);
  if (conflicts > 0) {
    return {
      ...narrated,
      level: "ATTENTION",
      whatHappened: "正式事项仍被保留，但有正文连接缺失或指向多个位置。",
      affected: "这些事项暂时不能安全打开原文或执行依赖正文位置的修改。",
      stillAvailable: "其他连接正常的事项、Logseq 编辑、当前关注、暂时做不了、审阅与历史仍可用。",
      dataSafety: "正式事项和修改历史仍被保留；系统没有猜测新的正文位置。",
      actionRequired: "逐项检查正文连接并明确重新连接；不要从技术标识列表盲选目标。",
    };
  }
  const sync = snapshot.explicit_sync;
  if (sync?.reconciliationRequired || (sync?.pending ?? 0) > 0) {
    return {
      ...narrated,
      level: "ATTENTION",
      whatHappened: "Logseq 正文变化尚未与正式对象投影完成一致性核对。",
      affected: "依赖这些正文连接的正式修改暂不应继续。",
      stillAvailable: "正文编辑、只读浏览和其他已连接事项仍可用。",
      dataSafety: "正文仍由 Logseq 权威保存；同步只做有界重验，没有建立第二个正式状态源。",
      actionRequired: "保持 Service 连接并完成核对；若连接中断，先恢复连接而不是重复编辑。",
    };
  }
  const providerAvailable = snapshot.service_connection.capabilities?.provider === true;
  return {
    ...narrated,
    level: "READY",
    whatHappened: "正式状态与当前 Graph 已连接，未发现未完成修改或正文连接冲突。",
    affected: providerAvailable ? "当前没有已知受影响能力。" : "Agent 分析未启用；确定性基础事务能力不受影响。",
    stillAvailable: "正文编辑、当前关注、暂时做不了、项目、审阅、撤销、备份与迁移均可用。",
    dataSafety: "Logseq 正文仍是工作现场；所有正式变化继续经过审阅、应用与可恢复安全链。",
    actionRequired: providerAvailable ? "无需操作。" : "无需操作；需要 Agent 分析时再配置 Provider。",
  };
}
