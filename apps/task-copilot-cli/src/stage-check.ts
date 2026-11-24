import { access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dateKeyFromMs, weekDatesFor } from "@task-copilot/stage-runtime";
import { AppleCalendarBridge, type AppleCalendarBridgeOptions } from "./apple-calendar.ts";
import { defaultIcloudInboxDirectory, readStageInboxState, scanIcloudInbox, type IcloudInboxFsOps } from "./icloud-inbox.ts";
import { workspaceServiceStatus, type WorkspaceServiceDeps, type WorkspaceServiceStatus } from "./workspace-service.ts";

export type StageCheckItemStatus = "ok" | "warn" | "action";

export interface StageCheckItem {
  id: "node" | "companion" | "icloud-inbox" | "apple-calendar" | "attention-navigator-skill";
  label: string;
  status: StageCheckItemStatus;
  summary: string;
  detail?: string;
  fixHint?: string;
}

export interface StageSelfCheckReport {
  checkedAt: number;
  ok: boolean;
  stateDir: string;
  icloudDir: string;
  items: StageCheckItem[];
}

export interface StageSelfCheckOptions {
  stateDirectory: string;
  icloudInboxDirectory?: string;
  skillPath?: string;
  nodeVersion?: string;
  now?: number;
  serviceDeps?: WorkspaceServiceDeps;
  readServiceStatus?: (stateDir: string) => Promise<WorkspaceServiceStatus>;
  icloudFsOps?: Partial<IcloudInboxFsOps>;
  appleCalendar?: AppleCalendarBridgeOptions;
}

function defaultSkillPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // apps/task-copilot-cli/src -> repo root -> skills/attention-navigator/SKILL.md
  return resolve(here, "..", "..", "..", "skills", "attention-navigator", "SKILL.md");
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function runStageSelfCheck(options: StageSelfCheckOptions): Promise<StageSelfCheckReport> {
  const now = options.now ?? Date.now();
  const stateDir = resolve(options.stateDirectory);
  const icloudDir = resolve(options.icloudInboxDirectory ?? defaultIcloudInboxDirectory());
  const skillPath = resolve(options.skillPath ?? defaultSkillPath());
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const items: StageCheckItem[] = [];

  // 1. Node 20 runtime check
  const major = Number(nodeVersion.split(".")[0]);
  if (major === 20) {
    items.push({
      id: "node",
      label: "Node 运行时",
      status: "ok",
      summary: `当前为 Node v${nodeVersion}（符合 v20 基线）`,
    });
  } else {
    items.push({
      id: "node",
      label: "Node 运行时",
      status: "warn",
      summary: `当前为 Node v${nodeVersion}，推荐使用 Homebrew Node 20`,
      fixHint: 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"',
    });
  }

  // 2. Companion service & LaunchAgent check
  const readStatus =
    options.readServiceStatus ?? ((dir: string) => workspaceServiceStatus(dir, options.serviceDeps));
  const svc = await readStatus(stateDir);
  if (svc.running && svc.launchAgentInstalled) {
    items.push({
      id: "companion",
      label: "Companion 常驻服务",
      status: "ok",
      summary: `运行中（PID ${svc.pid ?? "?"}，已安装 macOS 开机自启 LaunchAgent）`,
      ...(svc.baseUrl ? { detail: svc.baseUrl } : {}),
    });
  } else if (svc.running) {
    items.push({
      id: "companion",
      label: "Companion 常驻服务",
      status: "warn",
      summary: `运行中（PID ${svc.pid ?? "?"}），但尚未安装开机自启 LaunchAgent`,
      ...(svc.baseUrl ? { detail: svc.baseUrl } : {}),
      fixHint: "执行 workspace service install 安装 macOS 开机自启",
    });
  } else {
    items.push({
      id: "companion",
      label: "Companion 常驻服务",
      status: "action",
      summary: svc.launchAgentInstalled
        ? "已安装 LaunchAgent，但当前未检测到 Companion 监听"
        : "Companion 当前未运行，且尚未安装 LaunchAgent",
      fixHint: "执行 workspace service install && workspace service start",
    });
  }

  // 3. iCloud Drive voice inbox check (Fail Open)
  const inboxState = await readStageInboxState(join(stateDir, "stage-inbox-state.json"));
  const icloud = await scanIcloudInbox({
    directory: icloudDir,
    archivedIds: new Set(inboxState.archivedIds),
    archivedSignatures: new Set(inboxState.archivedSignatures),
    now,
    ...(options.icloudFsOps ? { fsOps: options.icloudFsOps } : {}),
  });
  if (icloud.diagnostic.status === "ok") {
    const evictedCount = icloud.diagnostic.evictedCount ?? 0;
    if (evictedCount > 0) {
      items.push({
        id: "icloud-inbox",
        label: "iCloud 语音入池",
        status: "warn",
        summary: `可读（本地 ${icloud.diagnostic.itemCount} 条，另有 ${evictedCount} 条处于云端占位待下载，已自动触发拉取）`,
        detail: icloudDir,
        ...(icloud.diagnostic.guidance ? { fixHint: icloud.diagnostic.guidance } : {}),
      });
    } else {
      items.push({
        id: "icloud-inbox",
        label: "iCloud 语音入池",
        status: "ok",
        summary: `可读（当前 ${icloud.diagnostic.itemCount} 条，其中冷却 ${icloud.diagnostic.cooledCount ?? 0} 条）`,
        detail: icloudDir,
      });
    }
  } else if (icloud.diagnostic.status === "permission-denied") {
    items.push({
      id: "icloud-inbox",
      label: "iCloud 语音入池",
      status: "action",
      summary: "macOS TCC 拒绝访问 iCloud Drive（已 Fail Open，不影响工作台其余功能）",
      detail: icloudDir,
      fixHint:
        icloud.diagnostic.guidance ??
        "打开「系统设置 -> 隐私与安全性 -> 文件与文件夹」，为当前终端或 Node 进程开启 iCloud Drive 访问权限。",
    });
  } else if (icloud.diagnostic.status === "missing") {
    items.push({
      id: "icloud-inbox",
      label: "iCloud 语音入池",
      status: "warn",
      summary: "目录尚未创建（iPhone 首次运行「随口记」快捷指令后会自动出现）",
      detail: icloudDir,
      fixHint: `或手动创建目录：mkdir -p "${icloudDir}"`,
    });
  } else {
    items.push({
      id: "icloud-inbox",
      label: "iCloud 语音入池",
      status: "warn",
      summary: icloud.diagnostic.message ?? "读取 iCloud 目录失败",
      detail: icloudDir,
    });
  }

  // 4. Apple Calendar read-only bridge check (Fail Open)
  const today = dateKeyFromMs(now);
  const weekDates = weekDatesFor(today);
  const calendar = new AppleCalendarBridge(options.appleCalendar);
  const calResult = await calendar.readHardEvents({
    startDate: weekDates[0]!,
    endDate: weekDates[6]!,
    footprintCalendarName: "Task Copilot 足迹",
    footprintCalendarEnabled: false,
    now,
    forceRefresh: true,
  });
  const calDiag = calResult.diagnostics;
  if (calDiag.status === "ok") {
    items.push({
      id: "apple-calendar",
      label: "Apple 日历协同",
      status: "ok",
      summary: `只读硬日程就绪（本周读取到 ${calDiag.eventCount} 条带精确起止时间的日程）`,
    });
  } else if (calDiag.status === "permission-denied") {
    items.push({
      id: "apple-calendar",
      label: "Apple 日历协同",
      status: "action",
      summary: "macOS 尚未授予「日历」自动化权限（已 Fail Open，仍可使用纯语义槽位）",
      fixHint:
        calDiag.guidance ??
        "打开「系统设置 -> 隐私与安全性 -> 自动化 / 日历」，允许当前终端或 Node 控制「日历」应用。",
    });
  } else if (calDiag.status === "disabled") {
    items.push({
      id: "apple-calendar",
      label: "Apple 日历协同",
      status: "warn",
      summary: "当前通过配置禁用了 Apple 日历读取",
    });
  } else {
    items.push({
      id: "apple-calendar",
      label: "Apple 日历协同",
      status: "warn",
      summary: calDiag.message ?? "当前环境暂不可用 Apple 日历桥接",
      ...(calDiag.guidance ? { fixHint: calDiag.guidance } : {}),
    });
  }

  // 5. Attention Navigator Skill check
  const skillReady = await fileExists(skillPath);
  if (skillReady) {
    items.push({
      id: "attention-navigator-skill",
      label: "Attention Navigator Skill",
      status: "ok",
      summary: "Skill 规格文件已就绪",
      detail: skillPath,
    });
  } else {
    items.push({
      id: "attention-navigator-skill",
      label: "Attention Navigator Skill",
      status: "warn",
      summary: "未在默认仓库路径找到 skills/attention-navigator/SKILL.md",
      detail: skillPath,
      fixHint: `请确认已切换到 feat/personal-time-stage-v1 分支，或指向 ${join("skills", "attention-navigator", "SKILL.md")}`,
    });
  }

  const ok = items.every((item) => item.status !== "action");
  return {
    checkedAt: now,
    ok,
    stateDir,
    icloudDir,
    items,
  };
}

export function formatStageSelfCheckText(report: StageSelfCheckReport): string {
  const tagFor = (s: StageCheckItemStatus): string => (s === "ok" ? "[OK]    " : s === "warn" ? "[WARN]  " : "[ACTION]");
  const lines: string[] = [
    "Task Copilot 个人时间舞台一步自检",
    `状态目录：${report.stateDir}`,
    "",
  ];
  for (const item of report.items) {
    lines.push(`${tagFor(item.status)} ${item.label}：${item.summary}`);
    if (item.detail) lines.push(`         路径：${item.detail}`);
    if (item.fixHint) lines.push(`         建议：${item.fixHint}`);
  }
  lines.push("");
  lines.push(
    report.ok
      ? "结论：核心链路就绪，可直接进入主力 Logseq Graph 启用。"
      : "结论：存在需要本机授权或启动的 [ACTION] 项，按上方建议完成即可（所有未授权项均已 Fail Open，不阻断基础使用）。",
  );
  return lines.join("\n");
}
