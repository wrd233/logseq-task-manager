import type { WorkRef } from "@task-copilot/contracts";
import type { StageAreaNode, StageFocusRole, StageProjectNode, StageSnapshot } from "./types.ts";

export const WORKBENCH_GAP_RESTART_DAYS = 3;
export const WORK_RESUME_RESTART_DAYS = 7;

export type RestartDeckKind = "workbench-gap" | "work-resume";

export interface RestartSlide {
  index: number; // 1-based
  total: number; // 2 or 3
  kicker: string;
  heading: string;
  lines: string[]; // strictly <= 3 lines
  directLinkLabel?: string;
}

export interface RestartDeck {
  id: string;
  kind: RestartDeckKind;
  title: string;
  gapDays: number;
  hasObjectiveChanges: boolean;
  areaId?: string | null;
  projectWorkKey?: string | null;
  workRef?: WorkRef | null;
  focusRole?: StageFocusRole;
  suggestedActionTitle: string;
  primaryActionLabel: string;
  canSettleCarryover: boolean;
  exitAreaId?: string | null;
  exitAreaName?: string | null;
  slides: RestartSlide[];
}

function clampText(text: string, maxLen: number): string {
  const clean = text.replace(/\s+/gu, " ").trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, Math.max(1, maxLen - 1))}…`;
}

function findLatestStopNoteForProject(snapshot: StageSnapshot, projectWorkKey: string): string | undefined {
  const time = snapshot.time;
  if (!time) return undefined;

  for (const rec of time.recentFocusRecords) {
    if (rec.projectWorkKey === projectWorkKey && rec.stopNote?.trim()) {
      return rec.stopNote.trim();
    }
  }
  for (const slot of time.todaySlots) {
    for (const item of slot.items) {
      if (item.projectWorkKey === projectWorkKey && item.lastStopNote?.trim()) {
        return item.lastStopNote.trim();
      }
    }
  }
  for (const move of time.weekMoves) {
    if (move.projectWorkKey === projectWorkKey && move.lastStopNote?.trim()) {
      return move.lastStopNote.trim();
    }
  }
  return undefined;
}

function finalizeSlides(
  rawSlides: Array<{ kicker: string; heading: string; lines: string[]; directLinkLabel?: string }>,
): RestartSlide[] {
  const total = rawSlides.length;
  return rawSlides.map((slide, idx) => ({
    index: idx + 1,
    total,
    kicker: slide.kicker,
    heading: slide.heading,
    lines: slide.lines.filter((line) => line.trim().length > 0).slice(0, 3),
    ...(slide.directLinkLabel ? { directLinkLabel: slide.directLinkLabel } : {}),
  }));
}

/**
 * Builds a 2–3 slide plain-text restart deck for a single project/work untouched for >= 7 days.
 * Automatically compresses to 2 slides when zero objective changes happened since leaving.
 */
export function buildWorkRestartDeck(input: {
  project: StageProjectNode;
  area: StageAreaNode;
  snapshot: StageSnapshot;
  now?: number;
  force?: boolean;
}): RestartDeck | null {
  const { project, area, snapshot, force = false } = input;
  if (!force && project.recencyDays < WORK_RESUME_RESTART_DAYS) {
    return null;
  }

  const sinceMs = project.updatedAt;
  const stopNote = findLatestStopNoteForProject(snapshot, project.workKey);
  const activeAdvs = project.advancements.filter((a) => a.state === "active");
  const firstAdv = activeAdvs[0];

  // Slide 1: Last intent & stop point (<= 3 lines)
  const slide1Lines: string[] = [
    `所属「${clampText(area.name, 28)}」 · 距上次推进已 ${project.recencyDays} 天`,
    stopNote
      ? `上次停点：${clampText(stopNote, 68)}`
      : firstAdv
        ? `上次推进项：${clampText(firstAdv.title, 64)}`
        : "上次未留停点便条，可先打开原块快速扫一眼结尾。",
  ];
  if (project.location || project.graphName) {
    slide1Lines.push(`原块锚点：${clampText(project.location || project.graphName, 64)}`);
  }

  // Slide 2: Objective changes since leaving (AUTO-OMITTED if 0 changes!)
  const changeLines: string[] = [];

  const matchedInbox = snapshot.inbox.filter(
    (item) =>
      !item.cooled &&
      (item.matchProjectWorkKeys.includes(project.workKey) ||
        (item.matchAreaIds.includes(area.id) && Math.max(item.createdAt, item.updatedAt) > sinceMs)),
  );
  if (matchedInbox.length > 0) {
    const voiceCount = matchedInbox.filter((i) => i.sourceType === "ios-shortcut").length;
    const prefix =
      voiceCount > 0
        ? `新增 ${matchedInbox.length} 条相关碎片（含 ${voiceCount} 条手机语音）`
        : `新增 ${matchedInbox.length} 条相关 Inbox 线索`;
    changeLines.push(`${prefix}：「${clampText(matchedInbox[0]!.text, 34)}」`);
  }

  const newerAdvs = project.advancements.filter((a) => a.updatedAt > sinceMs);
  const projectGhosts = snapshot.ghostProposals.filter((g) => g.projectWorkKey === project.workKey);
  if (newerAdvs.length > 0 || projectGhosts.length > 0) {
    const count = newerAdvs.length + projectGhosts.length;
    const sample = newerAdvs[0]?.title ?? projectGhosts[0]?.title ?? "";
    changeLines.push(`期间出现 ${count} 项状态或分支更新：${clampText(sample, 40)}`);
  }

  const siblingUpdates = area.projects.filter((p) => p.workKey !== project.workKey && p.updatedAt > sinceMs);
  if (siblingUpdates.length > 0 && changeLines.length < 3) {
    changeLines.push(
      `同领域有 ${siblingUpdates.length} 项关联工作发生更新（如「${clampText(siblingUpdates[0]!.title, 28)}」）`,
    );
  }

  const hasObjectiveChanges = changeLines.length > 0;

  // Final Slide: 10–15 min minimal next step + legitimate exit
  const minimalStep = firstAdv
    ? `先花 10–15 分钟推进「${clampText(firstAdv.title, 44)}」，只完成可验证的第一步。`
    : stopNote
      ? `先花 10–15 分钟顺着停点续写 3 行现状，把卡点明确下来。`
      : `先花 10–15 分钟打开原块，补写 1 句「下一步最小动作」即可。`;

  const rawSlides: Array<{ kicker: string; heading: string; lines: string[]; directLinkLabel?: string }> = [
    {
      kicker: "久别重启 · 上次停点",
      heading: clampText(project.title, 56),
      lines: slide1Lines,
      directLinkLabel: "直达 Logseq 原块",
    },
  ];

  if (hasObjectiveChanges) {
    rawSlides.push({
      kicker: "久别重启 · 期间变化",
      heading: "离开期间的客观动静",
      lines: changeLines.slice(0, 3),
    });
  }

  rawSlides.push({
    kicker: "久别重启 · 最小切口",
    heading: "此刻 10–15 分钟最小启动",
    lines: [
      minimalStep,
      "如果这件事已经不再重要，直接移入搁置或维护，不必背负心理包袱。",
    ],
  });

  return {
    id: `restart-work-${project.workKey}`,
    kind: "work-resume",
    title: project.title,
    gapDays: project.recencyDays,
    hasObjectiveChanges,
    areaId: area.id,
    projectWorkKey: project.workKey,
    workRef: project.workRef,
    focusRole: area.focusRole,
    suggestedActionTitle: firstAdv ? `${project.title}：${firstAdv.title}` : project.title,
    primaryActionLabel: "进入现场，开始专注",
    canSettleCarryover: false,
    exitAreaId: area.id,
    exitAreaName: area.name,
    slides: finalizeSlides(rawSlides),
  };
}

/**
 * Builds a 2–3 slide plain-text restart deck when the user returns to the workbench after >= 3 days away.
 * Automatically compresses to 2 slides when zero external changes occurred during the gap.
 */
export function buildWorkbenchRestartDeck(input: {
  snapshot: StageSnapshot;
  now?: number;
  force?: boolean;
}): RestartDeck | null {
  const { snapshot, force = false } = input;
  const time = snapshot.time;
  if (!time) return null;
  if (!force && (time.workbenchGapDays < WORKBENCH_GAP_RESTART_DAYS || time.restartDismissedToday)) {
    return null;
  }

  const gapDays = Math.max(1, time.workbenchGapDays);
  const sinceMs = time.lastWorkbenchActiveAt ?? 0;

  const mainArea = snapshot.areas.find((a) => a.focusRole === "main") ?? snapshot.areas[0] ?? null;
  const lastFocus = time.recentFocusRecords[0] ?? null;
  const firstOpenMove = time.weekMoves.find((m) => m.state === "open") ?? null;

  // Resolve target project for direct jump & focus start
  let targetProject: StageProjectNode | null = null;
  let targetArea: StageAreaNode | null = mainArea;
  const candidateWorkKey = lastFocus?.projectWorkKey ?? firstOpenMove?.projectWorkKey ?? null;
  if (candidateWorkKey) {
    for (const a of snapshot.areas) {
      const hit = a.projects.find((p) => p.workKey === candidateWorkKey);
      if (hit) {
        targetProject = hit;
        targetArea = a;
        break;
      }
    }
  }
  if (!targetProject && mainArea?.projects[0]) {
    targetProject = mainArea.projects[0];
    targetArea = mainArea;
  }

  // Slide 1: Last focus & stop note (<= 3 lines)
  const slide1Lines: string[] = [
    `距上次打开工作台已 ${gapDays} 天${mainArea ? ` · 当前主线「${clampText(mainArea.name, 26)}」` : ""}`,
  ];
  if (lastFocus?.stopNote) {
    slide1Lines.push(`上次停点（${clampText(lastFocus.title, 24)}）：${clampText(lastFocus.stopNote, 52)}`);
  } else if (lastFocus) {
    slide1Lines.push(`上次专注：${clampText(lastFocus.title, 48)}（${lastFocus.date}）`);
  } else if (firstOpenMove) {
    slide1Lines.push(`本周待推进：${clampText(firstOpenMove.title, 54)}`);
  } else {
    slide1Lines.push("无需补旧账，先安静确认今天唯一值得动手的一件事。");
  }
  if (mainArea?.quarterGoal) {
    slide1Lines.push(`本季目标：${clampText(mainArea.quarterGoal, 60)}`);
  }

  // Slide 2: Objective changes during the gap (AUTO-OMITTED if 0 changes!)
  const changeLines: string[] = [];

  const newInbox = snapshot.inbox.filter((item) => !item.cooled && sinceMs > 0 && Math.max(item.createdAt, item.updatedAt) > sinceMs);
  if (newInbox.length > 0) {
    const voiceCount = newInbox.filter((i) => i.sourceType === "ios-shortcut").length;
    changeLines.push(
      voiceCount > 0
        ? `期间新增 ${newInbox.length} 条碎片（含 ${voiceCount} 条 iPhone 随口记），暂存于右侧浮带`
        : `期间新增 ${newInbox.length} 条 Inbox 线索，暂存于右侧浮带`,
    );
  }

  const updatedProjects: StageProjectNode[] = [];
  if (sinceMs > 0) {
    for (const area of snapshot.areas) {
      for (const proj of area.projects) {
        if (proj.updatedAt > sinceMs) updatedProjects.push(proj);
      }
    }
  }
  if (updatedProjects.length > 0) {
    changeLines.push(
      `期间有 ${updatedProjects.length} 项笔记或目录更新（如「${clampText(updatedProjects[0]!.title, 28)}」）`,
    );
  }

  if (time.carryoverItems.length > 0 && changeLines.length < 3) {
    changeLines.push(`有 ${time.carryoverItems.length} 项旧日程停在昨日遗留托盘，未挤爆今天`);
  }

  const hasObjectiveChanges = changeLines.length > 0;

  // Final Slide: 10–15 min gentle restart
  const suggestedTitle =
    firstOpenMove?.title ??
    targetProject?.title ??
    (mainArea ? `重启「${mainArea.name}」主线` : "梳理今天唯一主线切口");

  const rawSlides: Array<{ kicker: string; heading: string; lines: string[]; directLinkLabel?: string }> = [
    {
      kicker: "久别重逢 · 上次现场",
      heading: "回来就好，先接回上次停点",
      lines: slide1Lines,
      ...(targetProject ? { directLinkLabel: "直达 Logseq 原块" } : {}),
    },
  ];

  if (hasObjectiveChanges) {
    rawSlides.push({
      kicker: "久别重逢 · 期间变化",
      heading: "这几天的客观变动",
      lines: changeLines.slice(0, 3),
    });
  }

  rawSlides.push({
    kicker: "久别重逢 · 重新起步",
    heading: "此刻 10–15 分钟最小切口",
    lines: [
      `建议先花 10–15 分钟进入「${clampText(suggestedTitle, 44)}」，只推进第一步。`,
      time.carryoverItems.length > 0
        ? "旧遗留不必今天全清，可一键退回本周或直接温和搁置。"
        : "若原本的主线方向已变，也可以直接移入搁置或维护。",
    ],
  });

  return {
    id: `restart-workbench-${time.today}`,
    kind: "workbench-gap",
    title: "工作台久别重逢",
    gapDays,
    hasObjectiveChanges,
    areaId: targetArea?.id ?? null,
    projectWorkKey: targetProject?.workKey ?? null,
    workRef: targetProject?.workRef ?? null,
    ...(targetArea ? { focusRole: targetArea.focusRole } : {}),
    suggestedActionTitle: suggestedTitle,
    primaryActionLabel: "进入现场，开始专注",
    canSettleCarryover: time.carryoverItems.length > 0,
    exitAreaId: mainArea?.id ?? null,
    exitAreaName: mainArea?.name ?? null,
    slides: finalizeSlides(rawSlides),
  };
}
