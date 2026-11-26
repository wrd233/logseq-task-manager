import { sameWorkRef, type WorkRef } from "@task-copilot/contracts";
import type { StageAreaNode, StageFocusRole, StageProjectNode, StageSnapshot } from "./types.ts";

export const WORKBENCH_GAP_RESTART_DAYS = 3;
export const WORK_RESUME_RESTART_DAYS = 7;

export type RestartDeckKind = "workbench-gap" | "work-resume";
export type RestartTone = "focus" | "risk";

export interface RestartLine {
  source: "user" | "record";
  fragments: Array<{ text: string; tone?: RestartTone }>;
}

export interface RestartSlide {
  index: number;
  total: number;
  kicker: string;
  heading: string;
  lines: string[];
  emphasis?: RestartLine[];
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
  pageTitle?: string;
  lastBlockUuid?: string;
  focusRole?: StageFocusRole;
  suggestedActionTitle: string;
  primaryActionLabel: string;
  canSettleCarryover: boolean;
  exitAreaId?: string | null;
  exitAreaName?: string | null;
  slides: RestartSlide[];
}

type Line = { text: string; source?: RestartLine["source"]; focus?: string; risk?: string };
type Slide = { heading: string; lines: Line[] };

function compact(text: string, max = 110): string {
  const clean = text.replace(/\s+/gu, " ").trim();
  return clean.length <= max ? clean : clean.slice(0, max - 1) + "…";
}

function phrase(text: string): string {
  return compact(text).slice(0, 16);
}

function highlightLine(line: Line, available: number): RestartLine {
  const matches = [line.focus ? { text: line.focus, tone: "focus" as const } : null,
    line.risk ? { text: line.risk, tone: "risk" as const } : null]
    .flatMap(mark => {
      if (!mark) return [];
      const position = line.text.indexOf(mark.text);
      return position < 0 ? [] : [{ ...mark, position }];
    })
    .sort((left, right) => left.position - right.position);
  const fragments: RestartLine["fragments"] = [];
  let cursor = 0;
  for (const mark of matches.slice(0, available)) {
    if (mark.position < cursor) continue;
    if (mark.position > cursor) fragments.push({ text: line.text.slice(cursor, mark.position) });
    fragments.push({ text: mark.text, tone: mark.tone });
    cursor = mark.position + mark.text.length;
  }
  if (cursor < line.text.length) fragments.push({ text: line.text.slice(cursor) });
  return { source: line.source ?? "record", fragments };
}

export function restartSlides(first: Slide, changes: Slide, last: Slide): RestartSlide[] {
  return [first, changes, last].map((slide, index) => {
    const input = slide.lines.filter(line => line.text.trim()).slice(0, 3);
    let remaining = 3;
    const emphasis = input.map(line => {
      const result = highlightLine(line, remaining);
      remaining -= result.fragments.filter(fragment => fragment.tone).length;
      return result;
    });
    return {
      index: index + 1, total: 3, kicker: ["总体意图", "最近选型", "上次落脚点"][index]!,
      heading: slide.heading, lines: input.map(line => line.text), emphasis,
    };
  });
}

function recordLine(label: string, value: string): Line {
  return { text: `${label} · ${compact(value)}`, focus: phrase(value) };
}

function lastSlide(stop: string | undefined, action: string, lastBlockUuid?: string): Slide {
  const lines: Line[] = [];
  if (stop) lines.push({ text: compact(stop), risk: phrase(stop), source: "user" });
  else lines.push({ text: "没有留下停点" });
  lines.push(recordLine(lastBlockUuid ? "从这一行继续" : "下一步", action));
  return { heading: "上次落脚点", lines };
}

export function buildWorkRestartDeck(input: {
  project: StageProjectNode;
  area: StageAreaNode;
  snapshot: StageSnapshot;
  now?: number;
  force?: boolean;
}): RestartDeck | null {
  const { project, area, snapshot, force = false } = input;
  if (!force && project.recencyDays < WORK_RESUME_RESTART_DAYS) return null;
  const time = snapshot.time;
  const lastFocus = time?.recentFocusRecords.find(record => record.projectWorkKey === project.workKey || sameWorkRef(record.workRef, project.workRef));
  const planned = [...(time?.todaySlots ?? []), ...(time?.tomorrowSlots ?? [])].flatMap(slot => slot.items)
    .find(item => item.projectWorkKey === project.workKey || sameWorkRef(item.workRef ?? undefined, project.workRef));
  const move = time?.weekMoves.find(item => item.projectWorkKey === project.workKey);
  const stop = lastFocus?.stopNote ?? planned?.lastStopNote ?? move?.lastStopNote;
  const anchor = lastFocus?.lastBlockUuid ?? planned?.lastBlockUuid ?? move?.lastBlockUuid;
  const advancement = project.advancements.find(item => item.state === "active");
  const next = advancement?.title ?? project.title;
  const changes: Line[] = project.advancements.filter(item => item.updatedAt > project.updatedAt)
    .map(item => recordLine("推进项", item.title));
  const relatedInbox = snapshot.inbox.find(item => !item.cooled && item.updatedAt > project.updatedAt &&
    (item.matchProjectWorkKeys.includes(project.workKey) || item.matchAreaIds.includes(area.id)));
  if (relatedInbox) changes.push({ ...recordLine(relatedInbox.sourceLabel, relatedInbox.text), source: "user" });
  const change = changes.length !== 0;
  if (!change) changes.push({ text: "离开期间没有新增相关记录" });
  const intent = [recordLine("所属领域", area.name)];
  if (area.quarterGoal) intent.push({ ...recordLine("本季目标", area.quarterGoal), source: "user" });
  if (advancement) intent.push(recordLine("推进方向", advancement.title));
  return {
    id: `restart-work-${project.workKey}`, kind: "work-resume", title: project.title, gapDays: project.recencyDays,
    hasObjectiveChanges: change, areaId: area.id, projectWorkKey: project.workKey, workRef: project.workRef,
    ...(project.workRef.kind === "logseq" && project.workRef.sourceKind === "page" ? { pageTitle: project.title } : {}),
    ...(anchor ? { lastBlockUuid: anchor } : {}),
    focusRole: area.focusRole, suggestedActionTitle: next, primaryActionLabel: anchor ? "直达上次那一行" : "进入现场",
    canSettleCarryover: false, exitAreaId: area.id, exitAreaName: area.name,
    slides: restartSlides({ heading: compact(project.title, 56), lines: intent }, { heading: "最近选型与变化", lines: changes }, lastSlide(stop, next, anchor)),
  };
}

export function buildWorkbenchRestartDeck(input: {
  snapshot: StageSnapshot;
  now?: number;
  force?: boolean;
}): RestartDeck | null {
  const { snapshot, force = false } = input;
  const time = snapshot.time;
  if (!time || (!force && (time.workbenchGapDays < WORKBENCH_GAP_RESTART_DAYS || time.restartDismissedToday))) return null;
  const main = snapshot.areas.find(area => area.focusRole === "main") ?? snapshot.areas[0];
  const lastFocus = time.recentFocusRecords[0];
  const move = time.weekMoves.find(item => item.state === "open");
  const key = lastFocus?.projectWorkKey ?? move?.projectWorkKey;
  const area = (key ? snapshot.areas.find(item => item.projects.some(project => project.workKey === key)) : undefined) ?? main;
  const project = area?.projects.find(item => item.workKey === key) ?? area?.projects[0];
  const ref = lastFocus?.workRef ?? move?.workRef ?? project?.workRef ?? null;
  const anchor = lastFocus?.workRef ? lastFocus.lastBlockUuid : !lastFocus && move?.workRef ? move.lastBlockUuid : undefined;
  const next = lastFocus?.title ?? move?.title ?? project?.title ?? "进入今日日记";
  const intent = [recordLine("上次推进", next)];
  if (main?.quarterGoal) intent.push({ ...recordLine("本季目标", main.quarterGoal), source: "user" });
  const since = time.lastWorkbenchActiveAt;
  const changes: Line[] = [];
  if (since !== undefined) {
    const updated = snapshot.areas.flatMap(item => item.projects).filter(item => item.updatedAt > since);
    if (updated[0]) changes.push(recordLine("更新的工作", updated[0].title));
    const captured = snapshot.inbox.find(item => !item.cooled && item.createdAt > since);
    if (captured) changes.push({ ...recordLine(captured.sourceLabel, captured.text), source: "user" });
  }
  if (time.carryoverItems.length) changes.push(recordLine("昨日遗留", `${time.carryoverItems.length} 项`));
  const change = changes.length !== 0;
  if (!change) changes.push({ text: "离开期间没有新增记录" });
  return {
    id: `restart-workbench-${time.today}`, kind: "workbench-gap", title: "回到现场",
    gapDays: time.workbenchGapDays, hasObjectiveChanges: change, areaId: area?.id ?? null,
    projectWorkKey: key ?? project?.workKey ?? null, workRef: ref,
    ...(project && sameWorkRef(ref ?? undefined, project.workRef) ? { pageTitle: project.title } : {}),
    ...(anchor ? { lastBlockUuid: anchor } : {}),
    ...(area ? { focusRole: area.focusRole } : {}), suggestedActionTitle: next,
    primaryActionLabel: anchor ? "直达上次那一行" : "进入现场", canSettleCarryover: time.carryoverItems.length > 0,
    exitAreaId: main?.id ?? null, exitAreaName: main?.name ?? null,
    slides: restartSlides({ heading: "总体意图", lines: intent }, { heading: "最近选型与变化", lines: changes },
      lastSlide(lastFocus?.stopNote ?? move?.lastStopNote, next, anchor)),
  };
}
