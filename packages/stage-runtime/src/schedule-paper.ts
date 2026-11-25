import type { WorkRef } from "@task-copilot/contracts";
import { focusRoleLabel } from "./pulse.ts";
import { compactHours, compactMinutes, dateLabel, shortMonthDayLabel, slotShortLabel } from "./time-model.ts";
import type { DayPlanSubject, DaySlotItem, StageViewTab, TimeGhostProposal, TimeSlotId } from "./time-types.ts";
import type { StageSnapshot } from "./types.ts";

export const SCHEDULE_PAPER_CSS = `
.tcs-root {
  --tcs-paper: var(--tcs-host-paper, #faf9f5);
  --tcs-paper-ink: var(--tcs-host-ink, #1e2124);
  --tcs-paper-muted: #626872;
  --tcs-paper-hair: color-mix(in srgb, var(--tcs-paper-ink) 11%, var(--tcs-paper));
  --tcs-paper-blue: #316292;
  --tcs-paper-amber: #a86c25;
  --tcs-paper-glow: color-mix(in srgb, var(--tcs-paper-blue) 8%, transparent);
}
.tcs-root[data-theme="dark"] {
  --tcs-paper: var(--tcs-host-paper, #16181a);
  --tcs-paper-ink: var(--tcs-host-ink, #e5e3dc);
  --tcs-paper-muted: #a1a7af;
  --tcs-paper-blue: #88afd6;
  --tcs-paper-amber: #cf964e;
}
.tcs-root[data-paper-view] { background: var(--tcs-paper); color: var(--tcs-paper-ink); }
.tcs-root[data-paper-view] .tcs-stage-wrap { background: none; }
.tcs-root[data-paper-view] .tcs-bar { background: var(--tcs-paper); border-color: var(--tcs-paper-hair); flex-wrap: wrap; }
.tcs-root .tcs-tabs { gap: 14px; background: transparent; border: 0; padding: 0; }
.tcs-root .tcs-tab, .tcs-root .tcs-tab.is-active {
  padding: 4px 0; background: transparent; border-radius: 0; border-bottom: 1.5px solid transparent; box-shadow: none;
}
.tcs-root .tcs-tab.is-active { border-bottom-color: var(--tcs-paper-blue); }
.tcs-time-wrap {
  container-type: inline-size; max-width: 1040px; margin: 0 auto; padding: 26px 22px 64px;
  line-height: 1.65; user-select: text;
}
.tcs-root[data-paper-view] .tcs-stage { padding: 8px 14px; }
.tcs-root[data-paper-view] .tcs-toast, .tcs-root[data-paper-view] .tcs-change-pill {
  border: 0; border-top: 1px solid var(--tcs-paper-hair); border-radius: 0;
  background: var(--tcs-paper); box-shadow: none; color: var(--tcs-paper-ink);
}
.tcs-paper-top {
  display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 12px;
  padding-bottom: 16px; border-bottom: 1px solid var(--tcs-paper-hair); margin-bottom: 34px;
}
.tcs-paper-top h2 { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -.02em; }
.tcs-paper-cols { display: grid; grid-template-columns: minmax(0, 1.32fr) minmax(0, .92fr); gap: 48px; align-items: start; }
.tcs-paper-aside { border-left: 1px solid var(--tcs-paper-hair); padding-left: 28px; opacity: .76; transition: opacity 220ms ease; }
.tcs-paper-aside:hover, .tcs-paper-aside:focus-within { opacity: 1; }
@container (max-width: 680px) {
  .tcs-paper-cols { grid-template-columns: minmax(0, 1fr); gap: 36px; }
  .tcs-paper-aside { padding: 24px 0 0; border-left: 0; border-top: 1px solid var(--tcs-paper-hair); opacity: 1; }
}
.tcs-paper-group + .tcs-paper-group { margin-top: 32px; }
.tcs-paper-head { margin: 0 0 10px; display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 13px; color: var(--tcs-paper-muted); font-weight: 600; }
.cap-dots { display: inline-flex; gap: 5px; flex-wrap: wrap; }
.cap-dot { width: 6px; height: 6px; border-radius: 50%; border: 1px solid color-mix(in srgb, var(--tcs-paper-muted) 48%, transparent); }
.cap-dot.filled { background: var(--tcs-paper-muted); border-color: var(--tcs-paper-muted); }
.cap-dot.main { background: var(--tcs-paper-blue); border-color: var(--tcs-paper-blue); }
.cap-dot.over { background: var(--tcs-paper-amber); border-color: var(--tcs-paper-amber); }
.tcs-paper-slot {
  margin: 0 0 30px -12px; padding: 6px 0 8px 10px; border-left: 2px solid transparent;
  transition: border-color 180ms ease, background-color 180ms ease;
}
.tcs-paper-slot.slot-target-hint, .tcs-paper-slot.tcs-drop-active {
  border-left-color: var(--tcs-paper-blue) !important; background: var(--tcs-paper-glow) !important; box-shadow: none !important; transform: none !important;
}
.tcs-paper-row { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 0 10px; padding: 6px 8px 6px 10px; margin-left: -12px; border-left: 2px solid transparent; overflow-wrap: anywhere; }
.tcs-paper-row:hover, .tcs-paper-row:focus-within { background: color-mix(in srgb, var(--tcs-paper-ink) 4%, transparent); }
.tcs-paper-row.is-main { border-left-color: var(--tcs-paper-blue); }
.tcs-paper-row.is-done .tcs-paper-title { text-decoration: line-through; color: var(--tcs-paper-muted); }
.tcs-paper-title { font-size: 15px; line-height: 1.5; }
.tcs-paper-row.is-main .tcs-paper-title { font-weight: 500; }
.tcs-paper-context { font-size: 12.5px; color: var(--tcs-paper-muted); margin-top: 2px; }
.tcs-paper-project { color: var(--tcs-paper-blue); }
.tcs-paper-kind { font-size: 11px; color: var(--tcs-paper-muted); margin-left: 7px; }
.tcs-paper-actions { display: inline-flex; align-items: baseline; flex-wrap: wrap; gap: 0 5px; }
.tcs-paper-actions.is-quiet { opacity: 0; transition: opacity 140ms ease; }
.tcs-paper-row:hover .tcs-paper-actions, .tcs-paper-row:focus-within .tcs-paper-actions { opacity: 1; }
@media (hover: none) { .tcs-paper-actions.is-quiet { opacity: 1; } }
.tcs-root .tcs-paper-btn { border: 0; background: transparent; cursor: pointer; padding: 3px 5px; font-size: 12.5px; color: var(--tcs-paper-muted); white-space: nowrap; }
.tcs-root .tcs-paper-btn:hover, .tcs-root .tcs-paper-btn:focus-visible { color: var(--tcs-paper-ink); text-decoration: underline; text-underline-offset: 3px; }
.tcs-root .tcs-paper-btn.is-primary { color: var(--tcs-paper-blue); font-weight: 600; }
.tcs-paper-form { display: flex; align-items: baseline; gap: 7px; margin: 4px 0 10px; min-width: 0; }
.tcs-paper-form input { width: 100%; min-width: 0; border: 0; border-bottom: 1px solid var(--tcs-paper-hair); padding: 5px 0; background: transparent; color: inherit; font: inherit; outline: none; }
.tcs-paper-form input:focus { border-color: var(--tcs-paper-blue); }
.tcs-paper-event { display: flex; gap: 10px; align-items: baseline; color: var(--tcs-paper-muted); font-size: 12.5px; }
.tcs-paper-event time { flex: none; font-variant-numeric: tabular-nums; }
.tcs-paper-event + .tcs-paper-row { margin-top: 5px; }
.tcs-paper-quote, .tcs-paper-ghost, .tcs-paper-carry, .tcs-paper-friction, .tcs-paper-focus {
  margin: 0 0 16px; padding: 2px 0 4px 11px; border-left: 2px solid var(--tcs-paper-ink); overflow-wrap: anywhere;
}
.tcs-paper-ghost { border-left: 1px dashed var(--tcs-paper-muted); }
.tcs-paper-carry, .tcs-paper-friction { border-left-color: var(--tcs-paper-amber); }
.tcs-paper-focus { border-left-color: var(--tcs-paper-blue); }
.tcs-paper-carry { margin-bottom: 26px; }
.tcs-paper-carry .tcs-paper-row { margin-left: 0; border: 0; padding-left: 0; }
.tcs-paper-friction { display: flex; gap: 4px 12px; flex-wrap: wrap; align-items: baseline; }
.tcs-paper-direction { padding: 0 0 12px; margin-bottom: 14px; border-bottom: 1px solid var(--tcs-paper-hair); }
.tcs-paper-direction:last-child { border-bottom: 0; }
.tcs-paper-week { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); column-gap: 8px; margin-bottom: 28px; padding-bottom: 15px; border-bottom: 1px solid var(--tcs-paper-hair); }
.tcs-paper-day { display: flex; flex-direction: column; color: var(--tcs-paper-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.tcs-paper-day.is-today { color: var(--tcs-paper-ink); font-weight: 600; }
.tcs-paper-day.is-tomorrow { color: var(--tcs-paper-blue); }
.tcs-paper-day-line { height: 2px; background: var(--tcs-paper-hair); margin-top: 5px; }
.tcs-paper-day-line span { height: 100%; display: block; background: currentColor; }
.tcs-paper-sweep { margin-bottom: 24px; border-top: 1px solid var(--tcs-paper-hair); padding-top: 10px; }
.tcs-paper-sweep summary { color: var(--tcs-paper-muted); cursor: pointer; }
@keyframes tcs-paper-beacon { 0%, 65% { background: var(--tcs-paper-glow); } 100% { background: transparent; } }
.beacon-flash { animation: tcs-paper-beacon 1500ms ease-out; }
@media (prefers-reduced-motion: reduce) {
  .tcs-time-wrap *, .beacon-flash { animation: none !important; transition: none !important; }
}
`;

export function escapeStageText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const esc = escapeStageText;

export function paperButton(label: string, attribute: string, primary = false): string {
  return `<button type="button" class="tcs-paper-btn${primary ? " is-primary" : ""}" ${attribute}>${label}</button>`;
}

function paperForm(attribute: string, label: string, button = "加入", value = "", name = "title"): string {
  return `<form class="tcs-paper-form" ${attribute}><input type="text" name="${name}" aria-label="${label}" placeholder="${label}" maxlength="200" value="${esc(value)}">
    <button type="submit" class="tcs-paper-btn">${button}</button></form>`;
}

function dots(count: number, limit: number, main = false): string {
  const classes = Array.from({ length: Math.max(count, limit) }, (_, index) =>
    index >= count ? "" : index >= limit ? " over" : main ? " filled main" : " filled",
  );
  return `<span class="cap-dots" role="img" aria-label="已排 ${count} 项，容量 ${limit}">${classes.map((className) => `<span class="cap-dot${className}"></span>`).join("")}</span>`;
}

function row(input: {
  title: string;
  context?: string | undefined;
  project?: string;
  kind?: string;
  actions?: string;
  className?: string;
}): string {
  return `<div class="tcs-paper-row ${input.className ?? ""}">
    <div><div class="tcs-paper-title">${esc(input.title)}${input.kind ? `<span class="tcs-paper-kind">${esc(input.kind)}</span>` : ""}</div>
    ${input.project || input.context ? `<div class="tcs-paper-context">${input.project ? `<span class="tcs-paper-project">${esc(input.project)}</span>` : ""}${input.project && input.context ? " · " : ""}${esc(input.context ?? "")}</div>` : ""}</div>
    ${input.actions ? `<span class="tcs-paper-actions is-quiet">${input.actions}</span>` : ""}
  </div>`;
}

function kindLabel(workRef: WorkRef | null | undefined, journal = false): string {
  if (journal) return "日记";
  if (workRef?.kind !== "logseq") return "";
  return workRef.sourceKind === "block" ? "块" : "页";
}

export function scheduleTabDate(time: NonNullable<StageSnapshot["time"]>, tab: StageViewTab): string {
  return tab === "tomorrow" ? time.tomorrowDate : time.today;
}

export function scheduleSlots(time: NonNullable<StageSnapshot["time"]>, tab: StageViewTab) {
  return tab === "tomorrow" ? (time.tomorrowSlots ?? []) : time.todaySlots;
}

export function scheduleProject(snapshot: StageSnapshot, key: string | null | undefined) {
  return key ? snapshot.areas.flatMap((area) => area.projects).find((project) => project.workKey === key || project.childWorks.some((child) => child.workKey === key)) : undefined;
}

function renderProposals(proposals: TimeGhostProposal[], label: string): string {
  return proposals.map((proposal) => `
    <div class="tcs-paper-ghost"><div class="tcs-paper-title">${esc(proposal.title)}</div>
      <div class="tcs-paper-context">${esc(proposal.agent)}${proposal.slotId ? ` · ${slotShortLabel(proposal.slotId)}` : ""}</div>
      <div class="tcs-paper-context">${esc(proposal.reason)}</div>
      <div class="tcs-paper-actions">
        ${paperButton(label, `data-time-accept="${esc(proposal.id)}"`, true)}
        ${paperButton("散去", `data-time-dismiss="${esc(proposal.id)}"`)}
      </div>
    </div>`).join("");
}

function calendarNotice(time: NonNullable<StageSnapshot["time"]>): string {
  if (time.calendarDiagnostics?.status !== "permission-denied") return "";
  return `<p class="tcs-paper-context" title="${esc(time.calendarDiagnostics.guidance ?? "")}">Apple 日历暂未授权</p>`;
}

function directions(snapshot: StageSnapshot) {
  const seen = new Set<string>();
  return snapshot.areas.filter((area) => !area.parked && area.focusRole !== "parked")
    .sort((a, b) => Number(b.focusRole === "main") - Number(a.focusRole === "main"))
    .flatMap((area) => area.projects.map((project) => ({ area, project })))
    .filter(({ project }) => {
      if (seen.has(project.workKey)) return false;
      seen.add(project.workKey);
      return true;
    });
}

export function renderWeekPaper(snapshot: StageSnapshot, animation: string): string {
  const time = snapshot.time;
  if (!time) return '<div class="tcs-empty">日程未连接</div>';
  const { weekCapacity: capacity } = time;
  const moves = time.weekMoves.map((move) => {
    const project = scheduleProject(snapshot, move.projectWorkKey);
    const workRef = move.workRef ?? project?.workRef;
    const id = esc(move.id);
    const planButtons = move.state === "open" ? (["today", "tomorrow"] as const).map((tab) => {
      const alreadyPlaced = scheduleSlots(time, tab).some((slot) => slot.items.some((item) => item.weekMoveId === move.id && item.state === "open"));
      return alreadyPlaced ? "" : paperButton(tab === "today" ? "放今天" : "放明天", `data-week-to-day="${id}|${tab}"`, true);
    }).join("") : "";
    return row({
      title: move.title,
      project: project?.title ?? snapshot.areas.find((area) => area.id === move.areaId)?.name ?? "",
      context: move.lastStopNote ?? (move.actualMinutes ? `已投入 ${compactMinutes(move.actualMinutes)}` : ""),
      kind: kindLabel(workRef),
      className: move.state === "done" ? "is-done" : "",
      actions: planButtons + paperButton(move.state === "done" ? "重开" : "完成", `data-week-toggle="${id}"`) + paperButton("移除", `data-week-remove="${id}"`),
    });
  }).join("");
  const choices = directions(snapshot).filter(({ area }) => area.focusRole === "main" || area.focusRole === "side")
    .filter(({ project }) => !time.weekMoves.some((move) => move.projectWorkKey === project.workKey || move.title === project.title));
  const projects = choices.map(({ area, project }) => row({
    title: project.title, context: project.annotation ?? project.subtitle, project: area.name,
    kind: kindLabel(project.workRef),
    actions: paperButton("加入本周", `data-candidate-to-week="${esc(project.workKey)}" data-schedule-area="${esc(area.id)}"`),
  })).join("");
  const advancements = snapshot.areas.filter((area) => !area.parked && (area.focusRole === "main" || area.focusRole === "side"))
    .flatMap((area) => area.areaAdvancements.filter((item) => item.state === "active" && !time.weekMoves.some((move) => move.sourceAdvancementId === item.id || move.title === item.title))
      .map((item) => row({ title: item.title, project: area.name, context: item.reason, actions: paperButton("加入本周", `data-advancement-to-week="${esc(item.id)}" data-schedule-area="${esc(area.id)}"`) }))).join("");
  const days = capacity.dailyOverview.map((day) => `
    <div class="tcs-paper-day ${day.isToday ? "is-today" : day.date === time.tomorrowDate ? "is-tomorrow" : ""}">
      <span>${esc(day.weekdayLabel)} ${Number(day.date.slice(-2))}</span>
      <span>${day.busyMinutes ? compactHours(day.busyMinutes) : "留白"}</span>
      <div class="tcs-paper-day-line" aria-hidden="true"><span style="width:${Math.min(100, day.busyMinutes / 2.4)}%"></span></div>
    </div>`).join("");
  return `<div class="tcs-time-wrap ${animation}" data-drop-week="true">
    <header class="tcs-paper-top"><h2>${esc(shortMonthDayLabel(capacity.weekKey))} – ${esc(shortMonthDayLabel(capacity.dates[6]!))}</h2>${calendarNotice(time)}</header>
    <div class="tcs-paper-week" aria-label="本周日历">${days}</div>
    <div class="tcs-paper-cols"><section>
      <h3 class="tcs-paper-head">本周推进块 ${dots(capacity.openMoveCount, capacity.recommendedMax, true)}</h3>
      ${renderProposals(time.ghostProposals.filter((proposal) => proposal.kind === "week-add-move"), "加入本周")}
      ${moves || '<p class="tcs-paper-context">暂无推进块</p>'}
      ${paperForm("data-week-add-form", "安排本周推进块")}
    </section><aside class="tcs-paper-aside">
      <h3 class="tcs-paper-head">本季方向</h3>${projects || advancements ? projects + advancements : '<p class="tcs-paper-context">暂无待排方向</p>'}
    </aside></div>
  </div>`;
}

export function readyForDay(snapshot: StageSnapshot, tab: StageViewTab): Array<DayPlanSubject & { key: string; candidateId?: string; journal?: boolean }> {
  const time = snapshot.time;
  if (!time) return [];
  const ready = (tab === "tomorrow" ? time.tomorrowCandidates : time.todayCandidates) ?? [];
  const scheduled = [...time.todaySlots, ...(time.tomorrowSlots ?? [])].flatMap((slot) => slot.items).concat(time.carryoverItems);
  const known = [...ready, ...scheduled];
  const candidates: ReturnType<typeof readyForDay> = ready.map((item) => ({ ...item, key: item.id, candidateId: item.id, journal: Boolean(item.sourceInboxId?.startsWith("logseq-block:")) }));
  for (const item of snapshot.inbox) {
    if (item.cooled || !/^(TODO|LATER|NOW|DOING)$/u.test(item.prefixDetected ?? "") || known.some((entry) => entry.sourceInboxId === item.id)) continue;
    candidates.push({
      key: item.id, title: item.text.replace(/^(TODO|LATER|NOW|DOING)\s+/u, "").slice(0, 200),
      sourceInboxId: item.id, journal: item.sourceType === "logseq-journal", workRef: item.workRef,
      areaId: item.matchAreaIds[0], projectWorkKey: item.matchProjectWorkKeys[0], context: item.sourceLabel,
    });
  }
  for (const { area, project } of directions(snapshot)) {
    for (const item of project.advancements) {
      if (item.state !== "active" || known.some((entry) => entry.title === item.title && entry.projectWorkKey === project.workKey)) continue;
      candidates.push({
        key: item.id, title: item.title, context: item.reason, areaId: area.id, projectWorkKey: project.workKey, workRef: project.workRef,
      });
    }
  }
  return candidates;
}

export interface DayPaperOptions {
  canOpenWork: boolean;
  canOpenJournal: boolean;
  finishingFocus: boolean;
  flashIds: ReadonlySet<string>;
  friction?: { slotId: TimeSlotId; openCount: number; canDefer: boolean };
  sweepTime: string;
  sweepReady: boolean;
}

function renderScheduledItem(snapshot: StageSnapshot, item: DaySlotItem, options: DayPaperOptions, today: boolean, isMain: boolean): string {
  const id = esc(item.id);
  const project = scheduleProject(snapshot, item.projectWorkKey);
  const workRef = item.workRef ?? project?.workRef;
  const entering = workRef?.kind === "logseq" ? options.canOpenWork : !workRef && options.canOpenJournal;
  const isOpen = item.state === "open";
  const active = snapshot.time?.activeFocus?.dayItemId === item.id;
  return row({
    title: item.title, project: project?.title ?? "",
    context: item.lastStopNote ?? item.context ?? (item.actualMinutes ? `已投入 ${compactMinutes(item.actualMinutes)}` : ""),
    kind: kindLabel(workRef, item.sourceInboxId?.startsWith("logseq-block:") || (!workRef && entering)),
    className: `${isMain ? "is-main" : ""} ${!isOpen ? "is-done" : ""} ${options.flashIds.has(item.id) ? "beacon-flash" : ""}`,
    actions: (entering ? paperButton("进入", `data-day-open="${id}"`, true) : "") +
      (today && isOpen && !snapshot.time?.activeFocus ? paperButton("专注", `data-day-focus="${id}"`) : "") +
      (item.slotId === "morning" && isOpen && !item.calendarShield ? paperButton("日历护盾", `data-day-shield="${id}"`) : "") +
      (!active ? paperButton(isOpen ? "完成" : "重开", `data-day-toggle="${id}"`) +
        paperButton(isOpen ? "移回" : "移除", `data-day-${isOpen ? "return" : "remove"}="${id}"`) : ""),
  });
}

export function renderDayPaper(snapshot: StageSnapshot, animation: string, options: DayPaperOptions): string {
  const time = snapshot.time;
  if (!time) return '<div class="tcs-empty">日程未连接</div>';
  const tab = snapshot.viewport.activeTab ?? "today";
  const today = tab !== "tomorrow";
  const date = scheduleTabDate(time, tab);
  const slots = scheduleSlots(time, tab);
  const main = slots[0]?.items.find((item) => item.state === "open");
  const focus = today ? time.activeFocus : null;
  const pending = options.friction;
  const ready = readyForDay(snapshot, tab);
  const planned = [...(time.todayCandidates ?? []), ...(time.tomorrowCandidates ?? []), ...time.todaySlots.flatMap((slot) => slot.items),
    ...(time.tomorrowSlots ?? []).flatMap((slot) => slot.items), ...time.carryoverItems];
  const clearPromises = snapshot.inbox.filter((item) => item.pocket === "commit" && !item.cooled && !/^(TODO|LATER|NOW|DOING)$/u.test(item.prefixDetected ?? "") &&
    !planned.some((entry) => entry.sourceInboxId === item.id));
  const sweep = snapshot.inbox.filter((item) => !item.cooled && item.pocket === "sweep");
  const friction = pending ? `<div class="tcs-paper-friction" role="status">
    <span>${slotShortLabel(pending.slotId)}已有 ${pending.openCount} 项</span>
    <span class="tcs-paper-actions">
      ${paperButton("替换", 'data-friction-resolve="replace"', true)}
      ${pending.slotId === "morning" ? paperButton("放下午", 'data-friction-resolve="afternoon"') : ""}
      ${pending.canDefer ? paperButton("顺延明天", 'data-friction-resolve="defer-tomorrow"') : ""}
      ${paperButton("叠加", 'data-friction-resolve="stack"')}
      ${paperButton("取消", 'data-friction-resolve="cancel"')}
    </span>
  </div>` : "";
  return `<div class="tcs-time-wrap ${animation}">
    <header class="tcs-paper-top"><h2>${esc(dateLabel(date))}</h2>
      ${calendarNotice(time)}
      ${today && main && !focus ? paperButton("进入上午主线", `data-day-focus="${esc(main.id)}"`, true) : ""}
    </header>
    <div class="tcs-paper-cols"><section>
      ${focus ? `<div class="tcs-paper-focus"><div>${esc(focus.title)}${focus.status === "paused" ? " · 已暂停" : ""}</div>
        ${options.finishingFocus ? paperForm("data-focus-finish-form", "留一句停点", "结束", "", "stopNote") + paperButton("取消", "data-focus-finish-cancel")
          : paperButton(focus.status === "paused" ? "继续" : "暂停", "data-focus-toggle-pause") + paperButton("结束", "data-focus-finish-open")}
      </div>` : ""}
      ${today && time.carryoverItems.length ? `<section class="tcs-paper-carry">
        <h3 class="tcs-paper-head">昨日遗留</h3>
        ${time.carryoverItems.map((item) => row({
          title: item.title, context: item.lastStopNote ?? (item.carryoverCount >= 3 ? `连续 ${item.carryoverCount} 次遗留` : item.date),
          actions: paperButton("放下午", `data-carryover="${esc(item.id)}|to-today"`) + paperButton("退回本周", `data-carryover="${esc(item.id)}|to-week"`) + paperButton("撤掉", `data-carryover="${esc(item.id)}|drop"`),
        })).join("")}
      </section>` : ""}
      ${renderProposals(time.ghostProposals.filter((proposal) => proposal.kind !== "week-add-move" && (proposal.date ?? time.today) === date), "确认安排")}
      ${slots.map((slot) => `<section class="tcs-paper-slot" data-drop-slot="${slot.spec.id}">
        <h3 class="tcs-paper-head">${esc(slot.spec.name)} ${dots(slot.items.filter((item) => item.state === "open").length, slot.spec.softCap, slot.spec.id === "morning")}</h3>
        ${slot.hardEvents.map((event) => `<div class="tcs-paper-event" title="${esc(event.calendarName)}"><time>${esc(event.startTime)}–${esc(event.endTime)}</time><span>${esc(event.title)}</span></div>`).join("")}
        ${slot.items.map((item) => renderScheduledItem(snapshot, item, options, today, item.id === main?.id)).join("")}
        ${pending?.slotId === slot.spec.id ? friction : ""}
        ${!slot.items.length && !slot.hardEvents.length ? '<div class="tcs-paper-context">留白</div>' : ""}
      </section>`).join("")}
      ${today ? `<details class="tcs-paper-sweep" ${options.sweepReady && sweep.length ? "open" : ""}><summary>清扫时刻 · ${esc(options.sweepTime)}${sweep.length ? ` · ${sweep.length} 条` : ""}</summary>
        ${sweep.map((item) => row({ title: item.text, context: item.sourceLabel, actions: paperButton("办完划掉", `data-sweep-done="${esc(item.id)}"`) +
          paperButton("留到明天", `data-sweep-tomorrow="${esc(item.id)}"`) + paperButton("转别忘", `data-move-pocket="${esc(item.id)}|commit"`) + paperButton("退回想法", `data-move-pocket="${esc(item.id)}|spark"`) })).join("")}
      </details>
      <label class="tcs-paper-context"><input type="checkbox" data-toggle-footprint ${time.footprintCalendarEnabled ? "checked" : ""}> 写入 Apple 日历专注足迹</label>` : ""}
    </section><aside class="tcs-paper-aside">
      <section class="tcs-paper-group"><h3 class="tcs-paper-head">${today ? "今日待办" : "明日候选"}</h3>
      ${ready.map((item) => row({
        title: item.title, context: item.context, project: scheduleProject(snapshot, item.projectWorkKey)?.title ?? "",
        kind: kindLabel(item.workRef, item.journal),
        className: options.flashIds.has(item.key) ? "beacon-flash" : "",
        actions: (["morning", "afternoon", "evening"] as const).map((slot, index) => paperButton(["上", "下", "晚"][index]!, `data-ready-slot="${slot}" data-ready-key="${esc(item.key)}" aria-label="放入${slotShortLabel(slot)}"`)).join("") +
          (item.candidateId ? paperButton("移除", `data-candidate-remove="${esc(item.candidateId)}"`) : ""),
      })).join("")}
      ${paperForm("data-add-day-candidate", today ? "写下今天的一件事" : "写下明天的一件事")}
      </section>
      ${today ? paperButton("去明日理清承诺与项目", 'data-schedule-tab="tomorrow"')
        : `<section class="tcs-paper-group">
            <h3 class="tcs-paper-head">承诺原话</h3>
            ${clearPromises.map((item) => `<div class="tcs-paper-quote">
              <div class="tcs-paper-context">${esc(item.sourceLabel)}</div><div>${esc(item.text)}</div>
              ${paperForm(`data-add-day-candidate data-clarify-inbox="${esc(item.id)}"`, "澄清成一个动作")}
            </div>`).join("") || '<p class="tcs-paper-context">暂无待理清承诺</p>'}
          </section><section class="tcs-paper-group">
            <h3 class="tcs-paper-head">上层项目方向</h3>
            ${directions(snapshot).map(({ area, project }) => `<div class="tcs-paper-direction">
              <div class="tcs-paper-title">${esc(project.title)}</div>
              <div class="tcs-paper-context">${esc([focusRoleLabel(area.focusRole), project.annotation ?? area.quarterGoal ?? project.subtitle].filter(Boolean).join(" · "))}</div>
              ${paperForm(`data-add-day-candidate data-plan-project="${esc(project.workKey)}" data-schedule-area="${esc(area.id)}"`, "写一条明天能做的事")}
            </div>`).join("") || '<p class="tcs-paper-context">暂无项目</p>'}
          </section>`}
    </aside></div>
  </div>`;
}
