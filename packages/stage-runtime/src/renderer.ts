import {
  SCHEDULE_PAPER_CSS, escapeStageText as esc, readyForDay, renderDayPaper, renderWeekPaper,
  scheduleProject, scheduleSlots, scheduleTabDate,
} from "./schedule-paper.ts";
import { DEFAULT_SWEEP_WINDOW_TIME, pocketLabel } from "./inbox-classifier.ts";
import { areaDomainLabel, defaultAreaPositionForRole, focusRoleLabel } from "./pulse.ts";
import {
  WORK_RESUME_RESTART_DAYS,
  buildWorkRestartDeck,
  type RestartDeck,
} from "./restart-deck.ts";
import {
  buildSlotFrictionPrompt,
  slotShortLabel,
} from "./time-model.ts";
import type {
  ActiveFocusSession,
  DayPlanSubject,
  StageViewTab,
  TimeSlotId,
} from "./time-types.ts";
import type {
  StageAdvancementItem,
  StageAreaDomain,
  StageAreaNode,
  StageFocusRole,
  StageGhostProposal,
  StageInboxFlowLedgerEntry,
  StageInboxPocket,
  StageInboxViewItem,
  StageProjectNode,
  StageSnapshot,
  StageUserAction,
  StageViewportSource,
  StageWorkTarget,
  StageZoomLevel,
} from "./types.ts";

export interface StageViewPort {
  source: StageViewportSource;
  dispatch(action: StageUserAction): Promise<StageSnapshot | void> | StageSnapshot | void;
  onOpenWork?(project: StageProjectNode): void | Promise<void>;
  onOpenInLogseq?(project: StageProjectNode): void | Promise<void>;
  onOpenInDsh?(target: StageWorkTarget): void | Promise<void>;
  onOpenTargetInLogseq?(target: StageWorkTarget): void | Promise<void>;
  onDiscussInDsh?(summary: string, snapshot: StageSnapshot): void | Promise<void>;
  onPromoteTodo?(item: StageAdvancementItem, project: StageProjectNode | null): void | Promise<void>;
  onQuoteToChat?(text: string): void;
  onOpenStandalone?(url: string): void;
  onRequestClose?(): void;
  onFocusStarted?(session: ActiveFocusSession): void | Promise<void>;
  onOpenJournal?(): void | Promise<void>;
  showThemeSwitch?: boolean;
  /** Optional header label for open-work button (e.g. "在 DSH 打开" / "回到 Logseq 原文"). */
  openWorkLabel?: string;
  /** Optional label for the direct DSH handoff button (defaults to "在 DSH 打开"). */
  openDshLabel?: string;
  showStandaloneButton?: boolean;
  showCloseButton?: boolean;
}

export interface MountedStageView {
  update(snapshot: StageSnapshot): void;
  focusZoomOut(): void;
  dispose(): void;
}

export const STAGE_VIEW_CSS = `
.tcs-root {
  --tcs-bg: #f7f6f2;
  --tcs-sidebar: #f2f0ea;
  --tcs-card: #ffffff;
  --tcs-subtle: #ece9e1;
  --tcs-fg: #1f2328;
  --tcs-muted: #666c75;
  --tcs-border: #dcd8ce;
  --tcs-card-border: #e6e2d8;
  --tcs-primary: #3b6ea5;
  --tcs-primary-fg: #ffffff;
  --tcs-success: #2f8564;
  --tcs-warning: #c27824;
  --tcs-error: #c44747;
  --tcs-shadow-sm: 0 1px 2px rgba(20, 24, 31, 0.05);
  --tcs-shadow-md: 0 10px 24px -10px rgba(20, 24, 31, 0.16);
  --tcs-shadow-lg: 0 16px 38px -12px rgba(20, 24, 31, 0.22);
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: var(--tcs-bg);
  color: var(--tcs-fg);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", sans-serif;
  font-size: 13px;
  line-height: 1.5;
  overflow: hidden;
  user-select: none;
  position: relative;
}
.tcs-root[data-theme="dark"] {
  --tcs-bg: #15171a;
  --tcs-sidebar: #1a1d21;
  --tcs-card: #20242a;
  --tcs-subtle: #292e36;
  --tcs-fg: #e6e8ec;
  --tcs-muted: #969da8;
  --tcs-border: #313741;
  --tcs-card-border: #2a2f38;
  --tcs-primary: #6aa2e0;
  --tcs-primary-fg: #0f1419;
  --tcs-success: #4eb68d;
  --tcs-warning: #e09a43;
  --tcs-error: #e06c6c;
  --tcs-shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.25);
  --tcs-shadow-md: 0 10px 26px -10px rgba(0, 0, 0, 0.45);
  --tcs-shadow-lg: 0 20px 44px -12px rgba(0, 0, 0, 0.6);
}
.tcs-root *, .tcs-root *::before, .tcs-root *::after { box-sizing: border-box; }
.tcs-root button { font-family: inherit; font-size: inherit; color: inherit; }

.tcs-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 8px 14px; border-bottom: 1px solid var(--tcs-border);
  background: var(--tcs-card); flex-shrink: 0; z-index: 4;
}
.tcs-bar-left, .tcs-bar-right { display: flex; align-items: center; gap: 7px; min-width: 0; }
.tcs-bc { display: flex; align-items: center; gap: 4px; font-size: 12px; overflow: hidden; }
.tcs-bc-btn {
  border: none; background: transparent; padding: 3px 7px; border-radius: 6px;
  cursor: pointer; color: var(--tcs-muted); white-space: nowrap;
}
.tcs-bc-btn:hover { background: var(--tcs-subtle); color: var(--tcs-fg); }
.tcs-bc-btn.is-current { color: var(--tcs-fg); font-weight: 600; }

.tcs-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 10px; border-radius: 7px; border: 1px solid var(--tcs-card-border);
  background: var(--tcs-bg); color: var(--tcs-fg); font-size: 12px; font-weight: 500;
  cursor: pointer; white-space: nowrap; transition: border-color 150ms, background 150ms, opacity 150ms;
}
.tcs-btn:hover:not(:disabled) { border-color: var(--tcs-primary); }
.tcs-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.tcs-btn-ghost { background: transparent; border-color: transparent; color: var(--tcs-muted); }
.tcs-btn-ghost:hover:not(:disabled) { background: var(--tcs-subtle); color: var(--tcs-fg); border-color: transparent; }
.tcs-btn-primary { background: var(--tcs-primary); color: var(--tcs-primary-fg); border-color: var(--tcs-primary); }
.tcs-btn-primary:hover:not(:disabled) { opacity: 0.9; }
.tcs-btn-sm { padding: 3px 8px; border-radius: 6px; font-size: 11.5px; }
.tcs-btn-pill { border-radius: 999px; }

.tcs-body { flex: 1; display: flex; min-height: 0; position: relative; overflow: hidden; }
.tcs-stage-wrap {
  flex: 1; position: relative; min-width: 0; display: flex; flex-direction: column; overflow: hidden;
  background-image: radial-gradient(color-mix(in srgb, var(--tcs-fg) 11%, transparent) 1px, transparent 1px);
  background-size: 22px 22px;
}
.tcs-legend {
  padding: 6px 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px;
  font-size: 11.5px; border-bottom: 1px solid var(--tcs-card-border);
  background: color-mix(in srgb, var(--tcs-card) 82%, transparent); backdrop-filter: blur(4px);
  flex-shrink: 0; z-index: 3; color: var(--tcs-muted);
}
.tcs-legend-group { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.tcs-legend-item { display: inline-flex; align-items: center; gap: 5px; }
.tcs-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.tcs-stage { flex: 1; position: relative; overflow: auto; padding: 18px 20px; }

.tcs-inbox-pane {
  width: 292px; flex-shrink: 0; border-left: 1px solid var(--tcs-border);
  background: var(--tcs-sidebar); display: flex; flex-direction: column; min-height: 0; z-index: 3;
}
.tcs-inbox-head {
  padding: 9px 11px; border-bottom: 1px solid var(--tcs-card-border);
  display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 12px;
}
.tcs-inbox-sub {
  padding: 5px 11px; font-size: 11px; color: var(--tcs-muted);
  border-bottom: 1px solid var(--tcs-card-border);
  background: color-mix(in srgb, var(--tcs-bg) 60%, transparent);
}
.tcs-pocket-tabs {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 3px;
  padding: 6px 8px; border-bottom: 1px solid var(--tcs-card-border);
  background: color-mix(in srgb, var(--tcs-bg) 50%, var(--tcs-sidebar));
}
.tcs-pocket-tab {
  border: 1px solid transparent; background: transparent; border-radius: 7px;
  padding: 4px 3px; font-size: 11px; color: var(--tcs-muted); cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 3px; white-space: nowrap;
  transition: background 140ms, color 140ms, border-color 140ms;
}
.tcs-pocket-tab:hover { background: var(--tcs-subtle); color: var(--tcs-fg); }
.tcs-pocket-tab.is-active {
  background: var(--tcs-card); color: var(--tcs-fg); font-weight: 600;
  border-color: var(--tcs-card-border); box-shadow: var(--tcs-shadow-sm);
}
.tcs-pocket-tab.is-alert { color: var(--tcs-warning); }
.tcs-btn.is-sweep-ready {
  border-color: color-mix(in srgb, var(--tcs-warning) 55%, var(--tcs-card-border));
  background: color-mix(in srgb, var(--tcs-warning) 10%, var(--tcs-card));
  color: var(--tcs-fg);
}
.tcs-inbox-list { flex: 1; overflow-y: auto; padding: 9px; display: flex; flex-direction: column; gap: 8px; }
.tcs-inbox-card {
  border-radius: 10px; border: 1px solid var(--tcs-card-border); background: var(--tcs-card);
  padding: 9px 10px; cursor: grab; transition: all 160ms ease;
}
.tcs-inbox-card:active { cursor: grabbing; }
.tcs-inbox-card:hover { border-color: var(--tcs-warning); }
.tcs-inbox-card.is-dimmed { opacity: 0.56; }
.tcs-inbox-card.is-dimmed:hover { opacity: 1; }
.tcs-inbox-actions {
  margin-top: 7px; padding-top: 6px; border-top: 1px solid var(--tcs-card-border);
  display: flex; flex-wrap: wrap; gap: 4px;
}
.tcs-inbox-chip-btn {
  border: 1px solid var(--tcs-card-border); background: var(--tcs-bg); color: var(--tcs-muted);
  border-radius: 6px; padding: 2px 6px; font-size: 10.5px; cursor: pointer;
  transition: border-color 140ms, color 140ms, background 140ms;
}
.tcs-inbox-chip-btn:hover { border-color: var(--tcs-primary); color: var(--tcs-fg); }
.tcs-inbox-chip-btn.is-primary {
  border-color: color-mix(in srgb, var(--tcs-success) 42%, var(--tcs-card-border));
  background: color-mix(in srgb, var(--tcs-success) 10%, var(--tcs-card));
  color: var(--tcs-success);
}
.tcs-ai-hint {
  margin-top: 6px; padding: 5px 7px; border-radius: 7px; font-size: 11px;
  border: 1px dashed color-mix(in srgb, var(--tcs-primary) 50%, var(--tcs-card-border));
  background: color-mix(in srgb, var(--tcs-primary) 6%, var(--tcs-card));
  display: flex; flex-direction: column; gap: 4px;
}
.tcs-ledger-row {
  border-radius: 9px; border: 1px solid var(--tcs-card-border); background: var(--tcs-card);
  padding: 8px 9px; display: flex; flex-direction: column; gap: 4px; font-size: 11.5px;
}
.tcs-ledger-row.is-undone { opacity: 0.52; text-decoration: line-through; }
.tcs-sweep-strip {
  border-radius: 12px; border: 1px solid var(--tcs-card-border);
  background: color-mix(in srgb, var(--tcs-card) 92%, var(--tcs-sidebar));
  padding: 10px 13px;
}
.tcs-sweep-strip.is-ready {
  border-color: color-mix(in srgb, var(--tcs-warning) 48%, var(--tcs-card-border));
  background: color-mix(in srgb, var(--tcs-warning) 6%, var(--tcs-card));
}
.tcs-sweep-strip > summary {
  list-style: none; cursor: pointer; display: flex; align-items: center;
  justify-content: space-between; gap: 8px; flex-wrap: wrap;
}
.tcs-sweep-strip > summary::-webkit-details-marker { display: none; }
.tcs-sweep-body {
  margin-top: 10px; padding-top: 9px; border-top: 1px solid var(--tcs-card-border);
  display: flex; flex-direction: column; gap: 7px;
}

.tcs-tone-amber {
  background: color-mix(in srgb, var(--tcs-warning) 9%, var(--tcs-card));
  border-color: color-mix(in srgb, var(--tcs-warning) 42%, var(--tcs-card-border));
}
.tcs-tone-teal {
  background: color-mix(in srgb, var(--tcs-success) 8%, var(--tcs-card));
  border-color: color-mix(in srgb, var(--tcs-success) 40%, var(--tcs-card-border));
}
.tcs-tone-mismatch {
  background: color-mix(in srgb, var(--tcs-error) 7%, var(--tcs-card));
  border-color: color-mix(in srgb, var(--tcs-error) 46%, var(--tcs-border));
}
.tcs-tone-ghost {
  background: color-mix(in srgb, var(--tcs-primary) 8%, var(--tcs-card));
  border: 1.5px dashed color-mix(in srgb, var(--tcs-primary) 64%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--tcs-primary) 12%, transparent),
              0 8px 20px -10px color-mix(in srgb, var(--tcs-primary) 28%, transparent);
}
.tcs-role-main {
  border-color: color-mix(in srgb, var(--tcs-primary) 54%, var(--tcs-border));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--tcs-primary) 18%, transparent), var(--tcs-shadow-md);
}
.tcs-role-maintenance {
  background: color-mix(in srgb, var(--tcs-bg) 72%, var(--tcs-card));
  border-color: var(--tcs-card-border);
}
.tcs-domain-life {
  border-left: 3px solid color-mix(in srgb, var(--tcs-muted) 48%, transparent);
}

.tcs-badge {
  display: inline-flex; align-items: center; padding: 2px 7px; border-radius: 999px;
  font-size: 11px; font-weight: 500; white-space: nowrap; flex-shrink: 0;
}
.tcs-badge-amber {
  background: color-mix(in srgb, var(--tcs-warning) 15%, transparent);
  color: color-mix(in srgb, var(--tcs-warning) 88%, var(--tcs-fg));
  border: 1px solid color-mix(in srgb, var(--tcs-warning) 34%, transparent);
}
.tcs-badge-teal {
  background: color-mix(in srgb, var(--tcs-success) 14%, transparent);
  color: color-mix(in srgb, var(--tcs-success) 86%, var(--tcs-fg));
  border: 1px solid color-mix(in srgb, var(--tcs-success) 32%, transparent);
}
.tcs-badge-mismatch {
  background: color-mix(in srgb, var(--tcs-error) 13%, transparent);
  color: color-mix(in srgb, var(--tcs-error) 88%, var(--tcs-fg));
  border: 1px solid color-mix(in srgb, var(--tcs-error) 36%, transparent);
}
.tcs-badge-main {
  background: color-mix(in srgb, var(--tcs-primary) 15%, transparent);
  color: var(--tcs-primary);
  border: 1px solid color-mix(in srgb, var(--tcs-primary) 36%, transparent);
}
.tcs-badge-mist {
  background: color-mix(in srgb, var(--tcs-muted) 12%, transparent);
  color: var(--tcs-muted);
  border: 1px solid color-mix(in srgb, var(--tcs-muted) 26%, transparent);
}
.tcs-badge-ghost {
  background: color-mix(in srgb, var(--tcs-primary) 14%, transparent);
  color: var(--tcs-primary);
  border: 1px solid color-mix(in srgb, var(--tcs-primary) 34%, transparent);
}
.tcs-meta-line {
  font-size: 11.5px; color: var(--tcs-muted); line-height: 1.4;
  margin-top: 5px; padding-top: 5px; border-top: 1px solid var(--tcs-card-border);
}
.tcs-mismatch-note {
  margin-top: 6px; padding: 5px 8px; border-radius: 7px; font-size: 11.5px; line-height: 1.4;
  background: color-mix(in srgb, var(--tcs-error) 9%, transparent);
  color: color-mix(in srgb, var(--tcs-error) 86%, var(--tcs-fg));
  border: 1px solid color-mix(in srgb, var(--tcs-error) 28%, transparent);
}
.tcs-diag-notice {
  margin: 8px 9px 0; padding: 8px 10px; border-radius: 9px; font-size: 11.5px; line-height: 1.45;
  background: color-mix(in srgb, var(--tcs-warning) 9%, var(--tcs-card));
  border: 1px solid color-mix(in srgb, var(--tcs-warning) 32%, var(--tcs-card-border));
  color: var(--tcs-fg);
}
.tcs-cooled-box {
  margin-top: 8px; border-top: 1px solid var(--tcs-card-border); padding-top: 8px;
}
.tcs-cooled-box summary {
  cursor: pointer; font-size: 11.5px; color: var(--tcs-muted);
  display: flex; align-items: center; justify-content: space-between; gap: 6px; list-style: none;
  padding: 4px 2px;
}
.tcs-cooled-box summary::-webkit-details-marker { display: none; }
.tcs-cooled-list { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
.tcs-role-bar { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; margin-top: 8px; }
.tcs-btn.is-active {
  background: color-mix(in srgb, var(--tcs-primary) 14%, var(--tcs-card));
  border-color: var(--tcs-primary);
  color: var(--tcs-primary);
}
.tcs-tabs {
  display: inline-flex; align-items: center; padding: 2px; border-radius: 8px;
  background: var(--tcs-bg); border: 1px solid var(--tcs-card-border); gap: 2px;
}
.tcs-tab {
  border: none; background: transparent; padding: 3px 10px; border-radius: 6px;
  font-size: 12px; font-weight: 500; color: var(--tcs-muted); cursor: pointer; white-space: nowrap;
  transition: background 140ms, color 140ms;
}
.tcs-tab:hover { color: var(--tcs-fg); }
.tcs-tab.is-active {
  background: var(--tcs-card); color: var(--tcs-fg); font-weight: 600;
  box-shadow: var(--tcs-shadow-sm);
}
.tcs-inbox-pane.is-collapsed { display: none; }
${SCHEDULE_PAPER_CSS}
.tcs-amber-resonate {
  border-color: var(--tcs-warning) !important;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--tcs-warning) 32%, transparent),
              0 10px 24px -10px color-mix(in srgb, var(--tcs-warning) 45%, transparent) !important;
  transform: translateY(-2px);
}
.tcs-drop-active {
  border-color: var(--tcs-warning) !important;
  background: color-mix(in srgb, var(--tcs-warning) 16%, var(--tcs-card)) !important;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tcs-warning) 36%, transparent) !important;
  transform: scale(1.02);
}
.tcs-highlight-ring {
  border-color: var(--tcs-primary) !important;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--tcs-primary) 55%, transparent),
              0 10px 24px -8px color-mix(in srgb, var(--tcs-primary) 38%, transparent) !important;
}

.tcs-l0-shell { display: flex; flex-direction: column; min-width: 640px; min-height: 100%; padding-bottom: 16px; }
.tcs-l0-board { position: relative; min-width: 640px; min-height: 460px; flex: 1 0 auto; }
.tcs-area-card {
  position: absolute; width: 274px; border-radius: 13px; border: 1px solid var(--tcs-border);
  background: var(--tcs-card); padding: 13px; cursor: pointer;
  transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
  box-shadow: var(--tcs-shadow-sm);
}
.tcs-area-card:hover { transform: translateY(-2px); box-shadow: var(--tcs-shadow-md); }
.tcs-drag-handle { cursor: grab; color: var(--tcs-muted); padding: 0 3px; font-size: 12px; }
.tcs-drag-handle:hover { color: var(--tcs-fg); }
.tcs-mini-row {
  display: flex; align-items: center; justify-content: space-between; gap: 7px;
  padding: 5px 9px; border-radius: 7px; margin-top: 6px;
  background: color-mix(in srgb, var(--tcs-bg) 86%, transparent);
  border: 1px solid var(--tcs-card-border); transition: border-color 140ms;
}
.tcs-mini-row:hover { border-color: var(--tcs-primary); }

.tcs-dormant-bar {
  margin-top: 16px;
  display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;
  padding: 8px 12px; border-radius: 10px; border: 1px solid var(--tcs-card-border);
  background: color-mix(in srgb, var(--tcs-card) 86%, transparent);
  font-size: 11.5px; color: var(--tcs-muted);
}

.tcs-l1-wrap { max-width: 840px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; padding-bottom: 72px; }
.tcs-l1-hero {
  position: relative; border-radius: 14px; border: 1px solid var(--tcs-border);
  background: var(--tcs-card); padding: 15px 18px; box-shadow: var(--tcs-shadow-sm);
}
.tcs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.tcs-proj-card {
  position: relative; border-radius: 13px; border: 1px solid var(--tcs-border);
  background: var(--tcs-card); padding: 14px; cursor: pointer;
  transition: all 170ms ease; box-shadow: var(--tcs-shadow-sm);
  display: flex; flex-direction: column; justify-content: space-between;
}
.tcs-proj-card:hover { transform: translateY(-2px); box-shadow: var(--tcs-shadow-md); }
.tcs-card-sub {
  font-size: 11.5px; color: var(--tcs-muted); line-height: 1.45; margin-bottom: 8px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.tcs-secondary-row {
  display: flex; align-items: center; gap: 5px; flex-wrap: wrap; margin-bottom: 8px;
}
.tcs-secondary-chip {
  font-size: 11px; padding: 1px 7px; border-radius: 999px;
  background: color-mix(in srgb, var(--tcs-primary) 8%, var(--tcs-bg));
  border: 1px solid color-mix(in srgb, var(--tcs-primary) 24%, var(--tcs-card-border));
  color: var(--tcs-muted); cursor: pointer;
}
.tcs-secondary-chip:hover { color: var(--tcs-primary); border-color: var(--tcs-primary); }
.tcs-card-foot {
  display: flex; align-items: center; justify-content: space-between; gap: 6px;
  font-size: 11.5px; color: var(--tcs-muted); padding-top: 8px;
  border-top: 1px solid var(--tcs-card-border);
}
.tcs-cross-box {
  margin-top: 4px; padding: 12px 14px; border-radius: 13px;
  border: 1px dashed var(--tcs-border);
  background: color-mix(in srgb, var(--tcs-card) 68%, var(--tcs-bg));
}
.tcs-cross-card {
  border-radius: 11px; border: 1px dashed var(--tcs-border); background: var(--tcs-card);
  padding: 11px 13px; cursor: pointer; transition: border-color 150ms, transform 150ms;
  display: flex; flex-direction: column; justify-content: space-between; gap: 6px;
}
.tcs-cross-card:hover { border-color: var(--tcs-primary); transform: translateY(-1px); }
.tcs-branch-section {
  font-size: 11.5px; font-weight: 600; color: var(--tcs-muted);
  padding: 2px 2px 0; display: flex; align-items: center; justify-content: space-between; gap: 8px;
}

.tcs-l2-wrap { position: relative; min-width: 520px; max-width: 880px; margin: 10px auto 0; padding-bottom: 80px; }
.tcs-l2-flex { position: relative; z-index: 2; display: flex; align-items: flex-start; gap: 42px; }
.tcs-l2-parent {
  width: 230px; flex-shrink: 0; border-radius: 14px; border: 1px solid var(--tcs-border);
  background: var(--tcs-card); padding: 14px; box-shadow: var(--tcs-shadow-sm); position: relative;
}
.tcs-l2-children { flex: 1; display: flex; flex-direction: column; gap: 10px; min-width: 240px; }
.tcs-l2-node {
  border-radius: 11px; border: 1px solid var(--tcs-border); background: var(--tcs-card);
  padding: 11px 13px; transition: all 160ms ease;
}
.tcs-l2-node:hover { border-color: var(--tcs-primary); }
.tcs-l2-svg { pointer-events: none; position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; z-index: 1; }

.tcs-presence {
  position: absolute; top: -11px; right: 10px; padding: 2px 9px; border-radius: 999px;
  font-size: 11px; font-weight: 500; background: var(--tcs-primary); color: var(--tcs-primary-fg);
  box-shadow: var(--tcs-shadow-md); display: inline-flex; align-items: center; gap: 5px; z-index: 8;
}
.tcs-radar { position: absolute; top: 44px; right: 14px; z-index: 12; }
.tcs-change-pill {
  position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%); z-index: 12;
  display: flex; align-items: center; gap: 9px; padding: 6px 13px; border-radius: 999px;
  background: var(--tcs-card); border: 1px solid var(--tcs-border); box-shadow: var(--tcs-shadow-lg);
  font-size: 12px; white-space: nowrap;
}
.tcs-toast {
  position: absolute; bottom: 14px; right: 14px; z-index: 14;
  display: flex; align-items: center; gap: 9px; padding: 7px 13px; border-radius: 10px;
  background: var(--tcs-card); border: 1px solid var(--tcs-border); box-shadow: var(--tcs-shadow-lg);
  font-size: 12px;
}
.tcs-l3-overlay {
  position: absolute; inset: 0; z-index: 15; display: flex; align-items: center; justify-content: center;
  padding: 20px; background: color-mix(in srgb, var(--tcs-bg) 78%, transparent); backdrop-filter: blur(4px);
}
.tcs-l3-card {
  max-width: 490px; width: 100%; border-radius: 16px; border: 1px solid var(--tcs-border);
  background: var(--tcs-card); padding: 20px; box-shadow: var(--tcs-shadow-lg);
  display: flex; flex-direction: column; gap: 14px;
}
.tcs-restart-overlay {
  position: absolute; inset: 0; z-index: 18; display: flex; align-items: center; justify-content: center;
  padding: 24px; background: color-mix(in srgb, var(--tcs-bg) 92%, transparent); backdrop-filter: blur(4px);
}
.tcs-restart-card {
  max-width: 560px; width: 100%; min-height: 292px; border-radius: 14px;
  border: 1px solid var(--tcs-border); background: #ffffff; color: #14171a;
  padding: 28px 32px 24px; box-shadow: var(--tcs-shadow-lg);
  display: flex; flex-direction: column; justify-content: space-between; gap: 22px;
}
.tcs-root[data-theme="dark"] .tcs-restart-card {
  background: #1b1f25; color: #eceff4; border-color: #343b46;
}
.tcs-restart-meta {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  font-size: 11.5px; color: var(--tcs-muted);
}
.tcs-restart-main {
  display: flex; flex-direction: column; gap: 14px;
}
.tcs-restart-heading {
  font-size: 18px; font-weight: 600; line-height: 1.38; letter-spacing: -0.01em;
}
.tcs-restart-lines {
  display: flex; flex-direction: column; gap: 9px; font-size: 13.5px; line-height: 1.65;
}
.tcs-restart-line {
  padding-left: 11px; border-left: 2px solid var(--tcs-border);
}
.tcs-restart-link {
  align-self: flex-start; border: none; background: transparent; padding: 0;
  color: var(--tcs-primary); font-size: 12.5px; cursor: pointer; text-decoration: underline;
  text-underline-offset: 3px;
}
.tcs-restart-link:hover { opacity: 0.8; }
.tcs-restart-foot {
  display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;
  padding-top: 14px; border-top: 1px solid var(--tcs-card-border);
}
.tcs-restart-actions {
  display: flex; align-items: center; gap: 7px; flex-wrap: wrap; justify-content: flex-end;
}
.tcs-restart-kbd {
  font-size: 11.5px; color: var(--tcs-muted);
}
.tcs-tether-svg { pointer-events: none; position: absolute; inset: 0; width: 100%; height: 100%; z-index: 10; overflow: visible; }
.tcs-empty {
  max-width: 520px; margin: 44px auto; text-align: center; padding: 26px;
  border-radius: 16px; border: 1px dashed var(--tcs-border); background: var(--tcs-card);
  display: flex; flex-direction: column; align-items: center; gap: 10px;
}

@keyframes tcsZoomIn { 0% { opacity: 0; transform: scale(0.93); } 100% { opacity: 1; transform: scale(1); } }
@keyframes tcsZoomOut { 0% { opacity: 0; transform: scale(1.06); } 100% { opacity: 1; transform: scale(1); } }
@keyframes tcsSprout { 0% { opacity: 0; transform: translateX(-16px) scale(0.94); } 100% { opacity: 1; transform: translateX(0) scale(1); } }
@keyframes tcsSolidify {
  0% { transform: scale(0.98); box-shadow: 0 0 0 0 color-mix(in srgb, var(--tcs-success) 52%, transparent); }
  50% { transform: scale(1.02); box-shadow: 0 0 0 7px color-mix(in srgb, var(--tcs-success) 0%, transparent); }
  100% { transform: scale(1); box-shadow: none; }
}
@keyframes tcsPulse { 0%, 100% { opacity: 0.45; transform: scale(0.92); } 50% { opacity: 1; transform: scale(1.2); } }
@keyframes tcsDash { to { stroke-dashoffset: -18; } }
.tcs-anim-in { animation: tcsZoomIn 300ms cubic-bezier(0.22, 1, 0.36, 1) forwards; }
.tcs-anim-out { animation: tcsZoomOut 300ms cubic-bezier(0.22, 1, 0.36, 1) forwards; }
.tcs-anim-sprout { opacity: 0; animation: tcsSprout 380ms cubic-bezier(0.22, 1, 0.36, 1) forwards; }
.tcs-anim-solidify { animation: tcsSolidify 480ms cubic-bezier(0.22, 1, 0.36, 1) forwards; }
.tcs-pulse { animation: tcsPulse 2s ease-in-out infinite; }
.tcs-dash-flow { stroke-dasharray: 5 4; animation: tcsDash 1.15s linear infinite; }

@media (prefers-reduced-motion: reduce) {
  .tcs-root *, .tcs-root *::before, .tcs-root *::after {
    animation-duration: 0.01ms !important; transition-duration: 0.01ms !important;
  }
}
`;



function detectDarkTheme(): boolean {
  if (typeof document !== "undefined") {
    const html = document.documentElement;
    if (html.classList.contains("dark") || html.dataset.theme === "dark") return true;
    if (html.classList.contains("light") || html.dataset.theme === "light") return false;
  }
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return false;
}

export function mountSharedStageView(container: HTMLElement, port: StageViewPort): MountedStageView {
  const root = document.createElement("div");
  root.className = "tcs-root";
  root.dataset.theme = detectDarkTheme() ? "dark" : "light";

  let styleEl: HTMLStyleElement | null = null;
  if (typeof document !== "undefined" && !document.getElementById("tcs-shared-stage-style")) {
    styleEl = document.createElement("style");
    styleEl.id = "tcs-shared-stage-style";
    styleEl.textContent = STAGE_VIEW_CSS;
    document.head.appendChild(styleEl);
  }

  root.innerHTML = `
    <div class="tcs-bar">
      <div class="tcs-bar-left">
        <div class="tcs-tabs" role="tablist" aria-label="时间视野切换">
          <button type="button" class="tcs-tab is-active" role="tab" data-tcs-tab="season">季节星区</button>
          <button type="button" class="tcs-tab" role="tab" data-tcs-tab="week">本周</button>
          <button type="button" class="tcs-tab" role="tab" data-tcs-tab="today">今日 · 早间拍板</button>
          <button type="button" class="tcs-tab" role="tab" data-tcs-tab="tomorrow">明日 · 前晚构思</button>
        </div>
        <button type="button" class="tcs-btn" data-tcs-zoom-out disabled>拉远</button>
        <div class="tcs-bc" data-tcs-bc></div>
      </div>
      <div class="tcs-bar-right">
        <button type="button" class="tcs-btn tcs-btn-ghost" data-tcs-discuss>${port.onDiscussInDsh ? "在 DSH 讨论当前画面" : "向 Agent 讨论当前画面"}</button>
        <button type="button" class="tcs-btn" data-tcs-coldstart>生成初始星图</button>
        <button type="button" class="tcs-btn tcs-btn-ghost" data-tcs-undo style="display:none">撤销</button>
        <button type="button" class="tcs-btn tcs-btn-ghost" data-tcs-toggle-inbox>小尾巴 0 · 别忘 0 · 想法 0</button>
        ${port.showThemeSwitch ? `<button type="button" class="tcs-paper-btn" data-tcs-theme>切换纸色</button>` : ""}
        ${port.showStandaloneButton ? `<button type="button" class="tcs-btn tcs-btn-ghost" data-tcs-popout title="在独立浏览器窗口打开">独立窗</button>` : ""}
        ${port.showCloseButton ? `<button type="button" class="tcs-btn tcs-btn-ghost" data-tcs-close title="关闭 / Esc">关闭</button>` : ""}
      </div>
    </div>
    <div class="tcs-body">
      <div class="tcs-stage-wrap">
        <div class="tcs-legend" data-tcs-legend>
          <div class="tcs-legend-group">
            <span class="tcs-legend-item"><span class="tcs-dot" style="background:var(--tcs-primary)"></span>本季主线</span>
            <span class="tcs-legend-item"><span class="tcs-dot" style="background:var(--tcs-error)"></span>主线错配</span>
            <span class="tcs-legend-item"><span class="tcs-dot" style="background:var(--tcs-success)"></span>近期活跃</span>
            <span class="tcs-legend-item"><span class="tcs-dot" style="border:1.5px dashed var(--tcs-primary);background:color-mix(in srgb, var(--tcs-primary) 24%, transparent)"></span>虚态推演</span>
          </div>
          <span data-tcs-hint style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
        </div>
        <div class="tcs-stage" data-tcs-stage></div>
        <div class="tcs-radar" data-tcs-radar style="display:none"></div>
        <div class="tcs-change-pill" data-tcs-pill style="display:none"></div>
        <div class="tcs-toast" data-tcs-toast style="display:none"></div>
        <div class="tcs-l3-overlay" data-tcs-l3 style="display:none"></div>
        <div class="tcs-restart-overlay" data-tcs-restart style="display:none"></div>
      </div>
      <aside class="tcs-inbox-pane" data-tcs-inbox-pane>
        <div class="tcs-inbox-head">
          <span style="font-weight:600">随想三口袋 <span data-tcs-inbox-count class="tcs-badge tcs-badge-mist" style="margin-left:4px">0</span></span>
          <button type="button" class="tcs-btn tcs-btn-sm tcs-btn-ghost" data-refine-inbox-ai title="使用已配置的轻量模型梳理拆分与归类建议（仅提示不改原笔记）">AI 轻梳理</button>
        </div>
        <div class="tcs-pocket-tabs" data-tcs-inbox-tabs></div>
        <div class="tcs-inbox-sub" data-tcs-inbox-sub>悬停照亮归属 · 拖拽直接安放</div>
        <div data-tcs-inbox-diag></div>
        <div class="tcs-inbox-list" data-tcs-inbox-list></div>
      </aside>
      <svg class="tcs-tether-svg" data-tcs-tether></svg>
    </div>
  `;

  const hostStyle = container.ownerDocument.defaultView?.getComputedStyle(container);
  const hostPaper = hostStyle?.getPropertyValue("--ls-primary-background-color").trim();
  const hostInk = hostStyle?.getPropertyValue("--ls-primary-text-color").trim();
  if (hostPaper) root.style.setProperty("--tcs-host-paper", hostPaper);
  if (hostInk) root.style.setProperty("--tcs-host-ink", hostInk);
  container.replaceChildren(root);

  const zoomOutBtn = root.querySelector<HTMLButtonElement>("[data-tcs-zoom-out]")!;
  const bcEl = root.querySelector<HTMLElement>("[data-tcs-bc]")!;
  const discussBtn = root.querySelector<HTMLButtonElement>("[data-tcs-discuss]")!;
  const coldStartBtn = root.querySelector<HTMLButtonElement>("[data-tcs-coldstart]")!;
  const undoBtn = root.querySelector<HTMLButtonElement>("[data-tcs-undo]")!;
  const inboxToggleBtn = root.querySelector<HTMLButtonElement>("[data-tcs-toggle-inbox]")!;
  const popoutBtn = root.querySelector<HTMLButtonElement>("[data-tcs-popout]");
  const closeBtn = root.querySelector<HTMLButtonElement>("[data-tcs-close]");
  const legendEl = root.querySelector<HTMLElement>("[data-tcs-legend]")!;
  const hintEl = root.querySelector<HTMLElement>("[data-tcs-hint]")!;
  const stageEl = root.querySelector<HTMLElement>("[data-tcs-stage]")!;
  const radarEl = root.querySelector<HTMLElement>("[data-tcs-radar]")!;
  const pillEl = root.querySelector<HTMLElement>("[data-tcs-pill]")!;
  const toastEl = root.querySelector<HTMLElement>("[data-tcs-toast]")!;
  const l3El = root.querySelector<HTMLElement>("[data-tcs-l3]")!;
  const restartEl = root.querySelector<HTMLElement>("[data-tcs-restart]")!;
  const inboxPaneEl = root.querySelector<HTMLElement>("[data-tcs-inbox-pane]")!;
  const inboxCountEl = root.querySelector<HTMLElement>("[data-tcs-inbox-count]")!;
  const inboxTabsEl = root.querySelector<HTMLElement>("[data-tcs-inbox-tabs]")!;
  const inboxSubEl = root.querySelector<HTMLElement>("[data-tcs-inbox-sub]")!;
  const inboxDiagEl = root.querySelector<HTMLElement>("[data-tcs-inbox-diag]")!;
  const inboxListEl = root.querySelector<HTMLElement>("[data-tcs-inbox-list]")!;
  const tetherSvg = root.querySelector<SVGSVGElement>("[data-tcs-tether]")!;
  const bodyEl = root.querySelector<HTMLElement>(".tcs-body")!;

  let snapshot: StageSnapshot | null = null;
  let lastRenderSignature = "";
  let prevViewKey = "";
  let prevZoomLevel: StageZoomLevel = 0;
  let hoveredInboxId: string | null = null;
  let draggingInboxId: string | null = null;
  let inboxCollapsed = false;
  let scheduleInboxOpen = false;
  let activeInboxTab: "sweep" | "commit" | "spark" | "ledger" = "sweep";
  let userPickedInboxTab = false;
  let refiningAi = false;
  let finishingFocusInline = false;
  type PlaceRequest = DayPlanSubject & { slotId: TimeSlotId; candidateId?: string; inboxId?: string; tab?: "today" | "tomorrow" };
  let pendingFriction: (PlaceRequest & { tab: "today" | "tomorrow"; date: string; openCount: number }) | null = null;
  let placing = false;
  let scheduleFlashIds = new Set<string>();
  let scheduleFlashTimer: ReturnType<typeof setTimeout> | undefined;
  let recentlySolidifiedIds = new Set<string>();
  let activeRestartDeck: RestartDeck | null = null;
  let restartSlideIndex = 0;
  const dismissedRestartIds = new Set<string>();
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let areaDrag: { areaId: string; startX: number; startY: number; origX: number; origY: number } | null = null;
  let disposed = false;

  const showToast = (msg: string) => {
    toastEl.textContent = msg;
    toastEl.style.display = "flex";
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.style.display = "none";
    }, 3600);
  };

  const runAction = async (action: StageUserAction, toast?: string) => {
    try {
      const res = await port.dispatch(action);
      if (res && !disposed) update(res);
      if (toast) showToast(toast);
      return true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : "操作失败，请稍后重试");
      return false;
    }
  };

  const findArea = (id: string | null): StageAreaNode | undefined =>
    id && snapshot ? snapshot.areas.find((a) => a.id === id) : undefined;
  const findProject = (areaId: string | null, projKey: string | null): StageProjectNode | undefined => {
    const area = findArea(areaId);
    if (area && projKey) return area.projects.find((p) => p.workKey === projKey);
    if (!snapshot || !projKey) return undefined;
    for (const a of snapshot.areas) {
      const found = a.projects.find((p) => p.workKey === projKey);
      if (found) return found;
    }
    return undefined;
  };

  const setZoom = (zoomLevel: StageZoomLevel, areaId: string | null = null, projectWorkKey: string | null = null, taskId: string | null = null) => {
    void runAction({
      type: "set-viewport",
      source: port.source,
      viewport: { zoomLevel, areaId, projectWorkKey, taskId },
    });
  };

  const renderRestartDeck = () => {
    if (!activeRestartDeck || activeRestartDeck.slides.length === 0) {
      restartEl.style.display = "none";
      restartEl.innerHTML = "";
      return;
    }
    const deck = activeRestartDeck;
    const clampedIndex = Math.max(0, Math.min(deck.slides.length - 1, restartSlideIndex));
    restartSlideIndex = clampedIndex;
    const slide = deck.slides[clampedIndex]!;
    const isFirst = clampedIndex === 0;
    const isLast = clampedIndex === deck.slides.length - 1;

    const linesHtml = slide.lines
      .slice(0, 3)
      .map((line) => `<div class="tcs-restart-line">${esc(line)}</div>`)
      .join("");

    const linkHtml =
      slide.directLinkLabel && deck.projectWorkKey && (port.onOpenInLogseq || port.onOpenWork)
        ? `<button type="button" class="tcs-restart-link" data-restart-open-source>${esc(slide.directLinkLabel)}</button>`
        : "";

    const actionsHtml = isLast
      ? `
        ${!isFirst ? `<button type="button" class="tcs-btn tcs-btn-sm tcs-btn-ghost" data-restart-prev>上一页</button>` : ""}
        ${deck.canSettleCarryover ? `<button type="button" class="tcs-btn tcs-btn-sm" data-restart-settle-carryover>旧遗留退回本周</button>` : ""}
        ${
          deck.exitAreaId
            ? `<button type="button" class="tcs-btn tcs-btn-sm tcs-btn-ghost" data-restart-exit="maintenance">转入维护</button>
               <button type="button" class="tcs-btn tcs-btn-sm tcs-btn-ghost" data-restart-exit="parked">不再重要 · 移入搁置</button>`
            : ""
        }
        <button type="button" class="tcs-btn tcs-btn-sm tcs-btn-primary" data-restart-start>${esc(deck.primaryActionLabel)}</button>
      `
      : `
        ${!isFirst ? `<button type="button" class="tcs-btn tcs-btn-sm tcs-btn-ghost" data-restart-prev>上一页</button>` : ""}
        <button type="button" class="tcs-btn tcs-btn-sm tcs-btn-primary" data-restart-next>下一页</button>
      `;

    restartEl.style.display = "flex";
    restartEl.innerHTML = `
      <div class="tcs-restart-card tcs-anim-in" role="dialog" aria-modal="true" aria-label="${esc(deck.title)}" data-restart-kind="${esc(deck.kind)}" data-restart-slide="${slide.index}">
        <div class="tcs-restart-meta">
          <span>${esc(slide.kicker)}</span>
          <div style="display:flex;align-items:center;gap:10px;">
            <span data-restart-counter>${slide.index} / ${slide.total}</span>
            <button type="button" class="tcs-btn tcs-btn-sm tcs-btn-ghost" data-restart-skip>Esc 跳过</button>
          </div>
        </div>
        <div class="tcs-restart-main">
          <div class="tcs-restart-heading">${esc(slide.heading)}</div>
          <div class="tcs-restart-lines">${linesHtml}</div>
          ${linkHtml}
        </div>
        <div class="tcs-restart-foot">
          <span class="tcs-restart-kbd">${isLast ? "方向左键 上一页 · Esc 跳过" : "空格 / 方向右键 下一页 · Esc 跳过"}</span>
          <div class="tcs-restart-actions">${actionsHtml}</div>
        </div>
      </div>
    `;
  };

  const openRestartDeck = (deck: RestartDeck) => {
    activeRestartDeck = deck;
    restartSlideIndex = 0;
    renderRestartDeck();
  };

  const dismissRestartDeck = (ackServer = true) => {
    const deck = activeRestartDeck;
    if (!deck) return;
    dismissedRestartIds.add(deck.id);
    activeRestartDeck = null;
    restartSlideIndex = 0;
    renderRestartDeck();
    if (ackServer && deck.kind === "workbench-gap") {
      void runAction({ type: "time", action: { type: "ack-workbench-restart" } });
    }
  };

  const zoomOut = () => {
    if (activeRestartDeck) {
      dismissRestartDeck(true);
      return;
    }
    if (!snapshot) return;
    const { zoomLevel, areaId, projectWorkKey } = snapshot.viewport;
    if (zoomLevel === 3) setZoom(2, areaId, projectWorkKey, null);
    else if (zoomLevel === 2) setZoom(1, areaId, null, null);
    else if (zoomLevel === 1) setZoom(0, null, null, null);
    else port.onRequestClose?.();
  };

  const drawL2Lines = () => {
    const svg = stageEl.querySelector<SVGSVGElement>("[data-tcs-l2-svg]");
    const wrap = stageEl.querySelector<HTMLElement>("[data-tcs-l2-wrap]");
    const parent = stageEl.querySelector<HTMLElement>("[data-tcs-l2-parent]");
    if (!svg || !wrap || !parent) return;
    const cRect = wrap.getBoundingClientRect();
    const pRect = parent.getBoundingClientRect();
    const sx = pRect.right - cRect.left;
    const sy = pRect.top + pRect.height / 2 - cRect.top;
    const nodes = wrap.querySelectorAll<HTMLElement>("[data-tcs-l2-branch]");
    const out: string[] = [];
    nodes.forEach((node) => {
      const r = node.getBoundingClientRect();
      const ex = r.left - cRect.left;
      const ey = r.top + r.height / 2 - cRect.top;
      const mx = sx + (ex - sx) * 0.52;
      const d = `M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ey}, ${ex} ${ey}`;
      const isGhost = node.dataset.tcsGhost === "true";
      out.push(
        isGhost
          ? `<path d="${d}" fill="none" stroke="var(--tcs-primary)" stroke-width="1.8" stroke-dasharray="5 4" opacity="0.86" />`
          : `<path d="${d}" fill="none" stroke="var(--tcs-border)" stroke-width="1.5" />`,
      );
    });
    svg.innerHTML = out.join("");
  };

  const drawTethers = () => {
    if (!snapshot || snapshot.viewport.zoomLevel === 3) {
      tetherSvg.innerHTML = "";
      return;
    }
    const activeId = hoveredInboxId ?? snapshot.viewport.selectedInboxId;
    if (!activeId) {
      tetherSvg.innerHTML = "";
      return;
    }
    const item = snapshot.inbox.find((i) => i.id === activeId);
    const srcEl = inboxListEl.querySelector<HTMLElement>(`[data-inbox-id="${CSS.escape(activeId)}"]`);
    if (!item || !srcEl) {
      tetherSvg.innerHTML = "";
      return;
    }
    const bodyRect = bodyEl.getBoundingClientRect();
    const srcRect = srcEl.getBoundingClientRect();
    const targets = snapshot.viewport.zoomLevel === 0 ? item.matchAreaIds : item.matchProjectWorkKeys;
    const paths: string[] = [];

    for (const targetId of targets) {
      const dstEl = stageEl.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(targetId)}"]`);
      if (!dstEl) continue;
      const dstRect = dstEl.getBoundingClientRect();
      const x1 = srcRect.left - bodyRect.left;
      const y1 = srcRect.top + srcRect.height / 2 - bodyRect.top;
      const x2 = dstRect.right - bodyRect.left;
      const y2 = dstRect.top + dstRect.height / 2 - bodyRect.top;
      const dx = Math.max(50, Math.abs(x1 - x2) * 0.42);
      const d = `M ${x1} ${y1} C ${x1 - dx} ${y1}, ${x2 + dx} ${y2}, ${x2} ${y2}`;
      paths.push(
        `<path d="${d}" fill="none" stroke="var(--tcs-warning)" stroke-width="2" opacity="0.78" class="tcs-dash-flow" />` +
          `<circle cx="${x2}" cy="${y2}" r="4" fill="var(--tcs-warning)" opacity="0.92" />` +
          `<circle cx="${x1}" cy="${y1}" r="3.5" fill="var(--tcs-warning)" opacity="0.92" />`,
      );
    }
    tetherSvg.innerHTML = paths.join("");
  };

  const applyResonanceClasses = () => {
    if (!snapshot) return;
    const activeId = hoveredInboxId ?? snapshot.viewport.selectedInboxId;
    const item = activeId ? snapshot.inbox.find((i) => i.id === activeId) : undefined;
    stageEl.querySelectorAll<HTMLElement>("[data-node-id]").forEach((el) => {
      const nid = el.dataset.nodeId ?? "";
      const hit = Boolean(item && (item.matchAreaIds.includes(nid) || item.matchProjectWorkKeys.includes(nid)));
      el.classList.toggle("tcs-amber-resonate", hit);
    });
  };

  const renderPresence = (targetId: string): string => {
    if (!snapshot) return "";
    const p = snapshot.presence.find((x) => x.targetId === targetId);
    if (!p) return "";
    const label = p.status === "thinking" ? `${p.agent} 正在看这里并思考…` : `${p.agent} 正在看这里`;
    return `<div class="tcs-presence"><span class="tcs-dot tcs-pulse" style="background:currentColor"></span><span>${esc(label)}</span></div>`;
  };

  const badgeClassForTone = (tone: StageAreaNode["tone"]): string => {
    if (tone === "mismatch") return "tcs-badge-mismatch";
    if (tone === "amber") return "tcs-badge-amber";
    if (tone === "teal") return "tcs-badge-teal";
    return "tcs-badge-mist";
  };

  const toneClassFor = (tone: StageAreaNode["tone"]): string => {
    if (tone === "mismatch") return "tcs-tone-mismatch";
    if (tone === "amber") return "tcs-tone-amber";
    if (tone === "teal") return "tcs-tone-teal";
    return "";
  };

  const renderColdStart = (proposal: StageGhostProposal) => {
    const drafts = proposal.proposedAreas ?? [];
    const dormantDrafts = proposal.proposedDormantAreas ?? [];
    const unassigned = proposal.unassignedTitles ?? [];
    hintEl.textContent = "冷启动防乱护栏：硬控 4–7 主领域 + 四态分流 · 微调后一键凝固";
    stageEl.innerHTML = `
      <div class="tcs-l1-wrap tcs-anim-out">
        <div class="tcs-tone-ghost" style="border-radius:13px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div>
            <div style="font-weight:600;color:var(--tcs-primary)">${esc(proposal.agent)} 提议初始领域星图（${drafts.length} 个主领域）</div>
            <div style="font-size:12px;color:var(--tcs-muted);margin-top:2px;">${esc(proposal.reason)}</div>
          </div>
          <div style="display:flex;gap:7px;">
            <button type="button" class="tcs-btn tcs-btn-sm" data-cs-dismiss="${esc(proposal.id)}">放弃</button>
            <button type="button" class="tcs-btn tcs-btn-sm tcs-btn-primary" data-cs-commit="${esc(proposal.id)}">✓ 一键凝固星图</button>
          </div>
        </div>
        <div class="tcs-grid">
          ${drafts
            .map(
              (d, idx) => `
            <div class="tcs-tone-ghost tcs-anim-sprout ${d.domain === "life" ? "tcs-domain-life" : ""}" style="animation-delay:${idx * 90}ms;border-radius:13px;padding:13px;display:flex;flex-direction:column;justify-content:space-between;gap:10px;">
              <div>
                <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px;flex-wrap:wrap;">
                  <strong style="font-size:13.5px">${esc(d.name)}</strong>
                  <div style="display:flex;gap:4px;flex-wrap:wrap;">
                    <span class="tcs-badge ${d.focusRole === "main" ? "tcs-badge-main" : "tcs-badge-ghost"}">${esc(focusRoleLabel(d.focusRole ?? "side"))}</span>
                    ${d.domain === "life" ? `<span class="tcs-badge tcs-badge-mist">生活</span>` : ""}
                    <span class="tcs-badge tcs-badge-mist">${d.workKeys.length} 项</span>
                  </div>
                </div>
                ${d.quarterGoal ? `<div style="font-size:11.5px;color:var(--tcs-muted);margin-bottom:4px;">目标：${esc(d.quarterGoal)}</div>` : ""}
                ${d.antiGoal ? `<div style="font-size:11.5px;color:var(--tcs-muted);margin-bottom:4px;">反目标：${esc(d.antiGoal)}</div>` : ""}
                ${d.weeklyMinimum ? `<div style="font-size:11.5px;color:var(--tcs-muted);margin-bottom:4px;">周底线：${esc(d.weeklyMinimum)}</div>` : ""}
                <div style="display:flex;flex-wrap:wrap;gap:5px;">
                  ${d.anchorTitles.map((t) => `<span style="font-size:11.5px;padding:2px 7px;border-radius:6px;background:var(--tcs-card);border:1px solid var(--tcs-card-border)">${esc(t)}</span>`).join("")}
                </div>
              </div>
              <div style="display:flex;justify-content:space-between;padding-top:7px;border-top:1px solid var(--tcs-card-border);font-size:11.5px;">
                ${
                  idx > 0 && drafts[idx - 1]
                    ? `<button type="button" class="tcs-btn-ghost" style="border:none;background:none;color:var(--tcs-primary);cursor:pointer;padding:0;" data-cs-merge="${esc(proposal.id)}|${esc(d.id)}|${esc(drafts[idx - 1]!.id)}">合并进「${esc(drafts[idx - 1]!.name.slice(0, 6))}」</button>`
                    : `<span style="color:var(--tcs-muted)">主骨架领域</span>`
                }
                <button type="button" style="border:none;background:none;color:var(--tcs-muted);cursor:pointer;padding:0;" data-cs-drop="${esc(proposal.id)}|${esc(d.id)}">移入暂放</button>
              </div>
            </div>`,
            )
            .join("")}
        </div>
        ${
          dormantDrafts.length > 0
            ? `<div style="border-radius:11px;border:1px solid var(--tcs-card-border);background:color-mix(in srgb,var(--tcs-card) 86%,transparent);padding:12px;">
                <div style="font-size:11.5px;color:var(--tcs-muted);margin-bottom:7px;">其余 Logseq 显式领域（凝固后暂放底栏休眠区，可随时一键唤醒）：</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;">
                  ${dormantDrafts.map((d) => `<span style="font-size:11.5px;padding:3px 8px;border-radius:7px;background:var(--tcs-bg);border:1px solid var(--tcs-card-border);color:var(--tcs-fg)">${esc(d.name)}${d.domain === "life" ? " · 生活" : ""}（${d.workKeys.length} 项）</span>`).join("")}
                </div>
              </div>`
            : ""
        }
        ${
          unassigned.length > 0
            ? `<div style="border-radius:11px;border:1px solid var(--tcs-card-border);background:color-mix(in srgb,var(--tcs-card) 80%,transparent);padding:12px;">
                <div style="font-size:11.5px;color:var(--tcs-muted);margin-bottom:7px;">边缘「暂放 / 未归类」池（不硬塞进牵强领域）：</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;">
                  ${unassigned.map((t) => `<span style="font-size:11.5px;padding:3px 8px;border-radius:7px;background:var(--tcs-bg);border:1px solid var(--tcs-card-border);color:var(--tcs-muted)">${esc(t)}</span>`).join("")}
                </div>
              </div>`
            : ""
        }
      </div>
    `;
  };

  const renderL0 = (snap: StageSnapshot, animCls: string) => {
    hintEl.textContent = "点击领域推近 L1 · 拖动「⋮⋮」固定空间方位 · 悬停右侧 Inbox 照亮归属";
    if (snap.areas.length === 0 && snap.dormantAreas.length === 0) {
      stageEl.innerHTML = `
        <div class="tcs-empty ${animCls}">
          <div style="font-size:15px;font-weight:600">尚未建立季节领域星图</div>
          <div style="font-size:12px;color:var(--tcs-muted)">已发现 ${snap.catalogCount} 项工作目录与 ${snap.inbox.length} 条 Inbox 线索。可先向 Agent 口述当下全景，再结合目录生成 4–7 个四态领域虚态初稿。</div>
          <button type="button" class="tcs-btn tcs-btn-primary" data-tcs-empty-coldstart>生成初始虚态星图</button>
        </div>
      `;
      return;
    }

    const highlightSet = new Set(snap.highlights.map((h) => h.targetId));
    const cards = snap.areas
      .map((area) => {
        const toneCls = toneClassFor(area.tone);
        const badgeCls = badgeClassForTone(area.tone);
        const roleCls =
          area.focusRole === "main"
            ? "tcs-role-main"
            : area.focusRole === "maintenance"
              ? "tcs-role-maintenance"
              : "";
        const domainCls = area.domain === "life" ? "tcs-domain-life" : "";
        const areaGhosts = snap.ghostProposals.filter((g) => g.areaId === area.id || g.targetAreaId === area.id);
        const roleProposal = areaGhosts.find((g) => g.kind === "propose-area-role");
        const hi = highlightSet.has(area.id) ? "tcs-highlight-ring" : "";
        return `
          <div class="tcs-area-card ${roleCls} ${domainCls} ${toneCls} ${hi}"
            data-node-id="${esc(area.id)}"
            data-area-open="${esc(area.id)}"
            data-drop-area="${esc(area.id)}"
            style="left:${area.pos.x}px;top:${area.pos.y}px;">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;margin-bottom:5px;">
              <div style="display:flex;align-items:center;gap:4px;min-width:0;">
                <span class="tcs-drag-handle" data-area-drag="${esc(area.id)}" title="拖动固定空间坐标">⋮⋮</span>
                <strong style="font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(area.name)}</strong>
              </div>
              <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
                <span class="tcs-badge ${area.focusRole === "main" ? "tcs-badge-main" : "tcs-badge-mist"}">${esc(focusRoleLabel(area.focusRole))}</span>
                ${area.domain === "life" ? `<span class="tcs-badge tcs-badge-mist">生活</span>` : ""}
              </div>
            </div>
            <div style="font-size:11.5px;color:var(--tcs-muted);display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:6px;">
              <span>${esc(area.pulseLabel)}</span>
              <span>${area.projects.length} 项${area.inboxMatchCount > 0 ? ` · Inbox ${area.inboxMatchCount}` : ""}</span>
            </div>
            ${area.signalLabel ? `<div style="margin-bottom:6px;"><span class="tcs-badge ${badgeCls}">${esc(area.signalLabel)}</span></div>` : ""}
            ${area.mismatch ? `<div class="tcs-mismatch-note">${esc(area.mismatch.summary)}</div>` : ""}
            ${area.focusRole === "main" && area.quarterGoal ? `<div class="tcs-meta-line">目标：${esc(area.quarterGoal)}</div>` : ""}
            ${area.focusRole === "maintenance" && area.weeklyMinimum ? `<div class="tcs-meta-line">周底线：${esc(area.weeklyMinimum)}</div>` : ""}
            <div>
              ${area.projects
                .slice(0, 3)
                .map((p) => {
                  const dot =
                    p.tone === "teal" ? "var(--tcs-success)" : p.tone === "amber" ? "var(--tcs-warning)" : "var(--tcs-muted)";
                  return `
                    <div class="tcs-mini-row" data-project-open="${esc(area.id)}|${esc(p.workKey)}">
                      <div style="display:flex;align-items:center;gap:6px;min-width:0;">
                        <span class="tcs-dot" style="background:${dot}"></span>
                        <span style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p.title)}</span>
                      </div>
                      <span style="font-size:11px;color:var(--tcs-muted)">查看</span>
                    </div>`;
                })
                .join("")}
              ${
                roleProposal
                  ? `<div class="tcs-tone-ghost" data-ghost-id="${esc(roleProposal.id)}" style="margin-top:7px;padding:6px 8px;border-radius:7px;font-size:11.5px;">
                      <div style="font-weight:600;color:var(--tcs-primary)">虚态角色提议</div>
                      <div style="color:var(--tcs-fg);margin-top:2px;">${esc(roleProposal.title)}</div>
                      <div style="color:var(--tcs-muted);margin-top:2px;">${esc(roleProposal.reason)}</div>
                      <div style="display:flex;justify-content:flex-end;gap:5px;margin-top:6px;">
                        <button type="button" class="tcs-btn tcs-btn-sm tcs-btn-ghost" data-dismiss-ghost="${esc(roleProposal.id)}">× 散去</button>
                        <button type="button" class="tcs-btn tcs-btn-sm tcs-btn-primary" data-accept-ghost="${esc(roleProposal.id)}">✓ 确认</button>
                      </div>
                    </div>`
                  : areaGhosts.length > 0
                    ? `<div class="tcs-tone-ghost" style="margin-top:7px;padding:4px 8px;border-radius:7px;font-size:11.5px;color:var(--tcs-primary);display:flex;justify-content:space-between;">
                        <span>${areaGhosts.length} 条虚态推演待定</span><span>进入</span>
                      </div>`
                    : ""
              }
            </div>
            ${area.annotation ? `<div class="tcs-badge-ghost" style="margin-top:8px;padding:5px 8px;border-radius:7px;font-size:11.5px;">注：${esc(area.annotation)}</div>` : ""}
            ${renderPresence(area.id)}
          </div>
        `;
      })
      .join("");

    const estimatedCardHeight = (area: StageAreaNode): number => {
      let h = 112 + Math.min(3, area.projects.length) * 38;
      if (area.signalLabel) h += 28;
      if (area.mismatch) h += 54;
      if (area.focusRole === "main" && area.quarterGoal) h += 38;
      if (area.focusRole === "maintenance" && area.weeklyMinimum) h += 38;
      if (area.annotation) h += 38;
      const areaGhosts = snap.ghostProposals.filter((g) => g.areaId === area.id || g.targetAreaId === area.id);
      if (areaGhosts.some((g) => g.kind === "propose-area-role")) h += 110;
      else if (areaGhosts.length > 0) h += 38;
      return Math.max(256, h);
    };
    const boardHeight = snap.areas.reduce(
      (maxH, area) => Math.max(maxH, Math.round(area.pos.y + estimatedCardHeight(area) + 24)),
      460,
    );
    const boardWidth = snap.areas.reduce(
      (maxW, area) => Math.max(maxW, Math.round(area.pos.x + 296)),
      640,
    );

    const dormantHtml = `
        <div class="tcs-dormant-bar">
          <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;">
            ${snap.dormantAreas.length > 0 ? `<span>搁置 / 休眠：</span>` : ""}
            ${snap.dormantAreas
              .map(
                (d) =>
                  `<button type="button" class="tcs-btn tcs-btn-sm" data-unpark-area="${esc(d.id)}" title="点击唤醒">${esc(d.name)}${d.domain === "life" ? " · 生活" : ""} · ${d.parked ? "已搁置" : `${d.recencyDays}天`}</button>`,
              )
              .join("")}
            ${snap.unassignedWorks.length > 0 ? `<span style="margin-left:${snap.dormantAreas.length > 0 ? "6px" : "0"}">暂放未归类：${snap.unassignedWorks.length} 项</span>` : ""}
            ${snap.dormantAreas.length === 0 && snap.unassignedWorks.length === 0 ? `<span>当前活跃领域：${snap.areas.length} 个</span>` : ""}
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span>空间方位已锚定</span>
            ${snap.areas.length > 0 ? `<button type="button" class="tcs-btn tcs-btn-sm tcs-btn-ghost" data-tidy-l0 title="按防重叠网格重新对齐当前领域坐标">整理排布</button>` : ""}
          </div>
        </div>`;

    stageEl.innerHTML = `<div class="tcs-l0-shell ${animCls}"><div class="tcs-l0-board" style="min-height:${boardHeight}px;min-width:${boardWidth}px;">${cards}</div>${dormantHtml}</div>`;
  };

  const renderL1 = (snap: StageSnapshot, animCls: string) => {
    const area = findArea(snap.viewport.areaId);
    if (!area) {
      renderL0(snap, animCls);
      return;
    }
    hintEl.textContent = "点击项目推近 L2 结构树 · 右侧 Inbox 已自动上浮本领域共振条";
    const highlightSet = new Set(snap.highlights.map((h) => h.targetId));
    const neighbors = snap.areas.filter((a) => a.id !== area.id);
    const areaGhosts = snap.ghostProposals.filter((g) => g.areaId === area.id && !g.projectWorkKey && g.kind !== "propose-area-role");
    const roleGhosts = snap.ghostProposals.filter((g) => g.areaId === area.id && g.kind === "propose-area-role");
    const roleOptions: Array<{ role: StageFocusRole; label: string }> = [
      { role: "main", label: "设为主线" },
      { role: "side", label: "支线" },
      { role: "maintenance", label: "维护" },
      { role: "parked", label: "搁置" },
    ];

    stageEl.innerHTML = `
      <div class="tcs-l1-wrap ${animCls}">
        ${
          neighbors.length > 0
            ? `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                <span style="font-size:11.5px;color:var(--tcs-muted)">周边领域：</span>
                ${neighbors.map((n) => `<button type="button" class="tcs-btn tcs-btn-sm tcs-btn-pill" data-area-open="${esc(n.id)}">${esc(n.name)}</button>`).join("")}
              </div>`
            : ""
        }
        <div class="tcs-l1-hero ${area.domain === "life" ? "tcs-domain-life" : ""} ${highlightSet.has(area.id) ? "tcs-highlight-ring" : ""}" data-node-id="${esc(area.id)}">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
            <div>
              <div style="font-size:11.5px;color:var(--tcs-muted)">L1 领域切面 · ${esc(areaDomainLabel(area.domain))}</div>
              <div style="font-size:17px;font-weight:600;margin-top:2px;">${esc(area.name)}</div>
              <div style="font-size:12px;color:var(--tcs-muted);margin-top:3px;">${esc(area.pulseLabel)} · ${area.projects.length} 项工作</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
              <span class="tcs-badge ${area.focusRole === "main" ? "tcs-badge-main" : "tcs-badge-mist"}">${esc(focusRoleLabel(area.focusRole))}</span>
              ${area.signalLabel ? `<span class="tcs-badge ${badgeClassForTone(area.tone)}">${esc(area.signalLabel)}</span>` : ""}
            </div>
          </div>
          ${area.mismatch ? `<div class="tcs-mismatch-note">${esc(area.mismatch.summary)}</div>` : ""}
          ${area.quarterGoal ? `<div class="tcs-meta-line">季度目标：${esc(area.quarterGoal)}</div>` : ""}
          ${area.antiGoal ? `<div class="tcs-meta-line">反目标：${esc(area.antiGoal)}</div>` : ""}
          ${area.weeklyMinimum ? `<div class="tcs-meta-line">每周底线：${esc(area.weeklyMinimum)}</div>` : ""}
          <div class="tcs-role-bar" style="justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
              ${roleOptions
                .map(
                  (opt) =>
                    `<button type="button" class="tcs-btn tcs-btn-sm ${area.focusRole === opt.role ? "is-active" : "tcs-btn-ghost"}" data-set-role="${esc(area.id)}|${opt.role}">${opt.label}</button>`,
                )
                .join("")}
              <button type="button" class="tcs-btn tcs-btn-sm tcs-btn-ghost" data-set-domain="${esc(area.id)}|${area.domain === "work" ? "life" : "work"}">切至${area.domain === "work" ? "生活" : "工作"}</button>
            </div>
            ${
              area.areaWorkRef && (port.onOpenInDsh || port.onOpenTargetInLogseq)
                ? `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    ${area.areaDirectory ? `<span class="tcs-badge tcs-badge-mist">已绑定目录</span>` : ""}
                    ${port.onOpenTargetInLogseq ? `<button type="button" class="tcs-btn tcs-btn-sm" data-open-logseq-area="${esc(area.id)}">领域原文</button>` : ""}
                    ${port.onOpenInDsh ? `<button type="button" class="tcs-btn tcs-btn-sm tcs-btn-primary" data-open-dsh-area="${esc(area.id)}">${esc(port.source === "dsh" ? "进入领域对话" : "在 DSH 打开此领域")}</button>` : ""}
                  </div>`
                : ""
            }
          </div>
          ${roleGhosts
            .map(
              (g) => `
              <div class="tcs-tone-ghost" data-ghost-id="${esc(g.id)}" style="margin-top:10px;padding:9px 11px;border-radius:9px;">
                <div style="font-size:12px;font-weight:600;color:var(--tcs-primary)">${esc(g.agent)} 提议调整：${esc(g.title)}</div>
                <div style="font-size:11.5px;color:var(--tcs-muted);margin-top:3px;">${esc(g.reason)}</div>
                <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:7px;">
                  <button type="button" class="tcs-btn tcs-btn-sm tcs-btn-ghost" data-dismiss-ghost="${esc(g.id)}">× 散去</button>
                  <button type="button" class="tcs-btn tcs-btn-sm tcs-btn-primary" data-accept-ghost="${esc(g.id)}">✓ 确认调整</button>
                </div>
              </div>`,
            )
            .join("")}
          ${area.annotation ? `<div class="tcs-badge-ghost" style="margin-top:10px;padding:6px 10px;border-radius:8px;font-size:12px;">注：${esc(area.annotation)}</div>` : ""}
          ${renderPresence(area.id)}
        </div>

        <div class="tcs-grid">
          ${area.projects
            .map((p) => {
              const toneCls = toneClassFor(p.tone);
              const badgeCls = badgeClassForTone(p.tone);
              const pGhosts = snap.ghostProposals.filter((g) => g.projectWorkKey === p.workKey);
              const hi = highlightSet.has(p.workKey) ? "tcs-highlight-ring" : "";
              const activeAdvCount = p.advancements.filter((a) => a.state === "active").length;
              const secHtml =
                p.secondaryAreas.length > 0
                  ? `<div class="tcs-secondary-row">${p.secondaryAreas
                      .map((ref) =>
                        ref.areaId && snap.areas.some((a) => a.id === ref.areaId)
                          ? `<button type="button" class="tcs-secondary-chip" data-sec-area-open="${esc(ref.areaId)}" title="切换到关联领域">另关联：${esc(ref.areaName)}</button>`
                          : `<span class="tcs-secondary-chip" style="cursor:default;">另关联：${esc(ref.areaName)}</span>`,
                      )
                      .join("")}</div>`
                  : "";
              const dshLabel = port.source === "dsh" ? "进入对话" : (port.openDshLabel ?? "在 DSH 打开");
              return `
                <div class="tcs-proj-card ${toneCls} ${hi}"
                  data-node-id="${esc(p.workKey)}"
                  data-project-open="${esc(area.id)}|${esc(p.workKey)}"
                  data-drop-project="${esc(area.id)}|${esc(p.workKey)}">
                  <div>
                    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px;">
                      <strong style="font-size:13.5px">${esc(p.title)}</strong>
                      ${p.signalLabel ? `<span class="tcs-badge ${badgeCls}">${esc(p.signalLabel)}</span>` : ""}
                    </div>
                    <div class="tcs-card-sub">${esc(p.subtitle)}</div>
                    ${secHtml}
                  </div>
                  <div>
                    <div class="tcs-card-foot">
                      <span>${esc(p.pulseLabel)}${p.childWorks.length > 0 ? ` · ${p.childWorks.length} 子项` : activeAdvCount > 0 ? ` · ${activeAdvCount} 项推进` : ""}</span>
                      ${port.onOpenInDsh ? `<button type="button" class="tcs-btn tcs-btn-sm tcs-btn-ghost" data-open-dsh-proj="${esc(area.id)}|${esc(p.workKey)}">${esc(dshLabel)}</button>` : `<span>${activeAdvCount} 项推进</span>`}
                    </div>
                    ${pGhosts.length > 0 ? `<div class="tcs-tone-ghost" style="margin-top:8px;padding:5px 8px;border-radius:7px;font-size:11.5px;color:var(--tcs-primary);display:flex;justify-content:space-between;"><span>${pGhosts.length} 条虚态分支待定</span><span>进入 L2</span></div>` : ""}
                  </div>
                  ${renderPresence(p.workKey)}
                </div>
              `;
            })
            .join("")}

          ${area.areaAdvancements
            .map(
              (adv) => `
              <div class="tcs-proj-card ${recentlySolidifiedIds.has(adv.id) ? "tcs-anim-solidify" : ""}" style="cursor:default;">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:5px;">
                  <strong style="font-size:13px;${adv.state === "done" ? "text-decoration:line-through;opacity:0.6;" : ""}">${esc(adv.title)}</strong>
                  <span class="tcs-badge ${adv.state === "done" ? "tcs-badge-mist" : "tcs-badge-teal"}">${adv.state === "done" ? "已完成" : "推进项"}</span>
                </div>
                <div style="font-size:11.5px;color:var(--tcs-muted);margin-bottom:10px;">${esc(adv.reason || "领域轻量推进项")}</div>
                <div style="display:flex;justify-content:flex-end;gap:6px;">
                  <button type="button" class="tcs-btn tcs-btn-sm tcs-btn-ghost" data-toggle-adv="${esc(adv.id)}">${adv.state === "done" ? "重新打开" : "标记完成"}</button>
                  ${port.onPromoteTodo && !adv.promotedToLogseqAt ? `<button type="button" class="tcs-btn tcs-btn-sm" data-promote-adv="${esc(adv.id)}">写入 Logseq TODO</button>` : ""}
                </div>
              </div>`,
            )
            .join("")}

          ${areaGhosts
            .map(
              (g, idx) => `
              <div class="tcs-tone-ghost tcs-anim-sprout" data-ghost-id="${esc(g.id)}" style="animation-delay:${idx * 120}ms;border-radius:13px;padding:14px;display:flex;flex-direction:column;justify-content:space-between;gap:10px;">
                <div>
                  <span class="tcs-badge tcs-badge-ghost" style="margin-bottom:6px;">${esc(g.agent)} 虚态推演</span>
                  <div style="font-weight:600;font-size:13.5px;">${esc(g.title)}</div>
                  <div style="font-size:12px;color:var(--tcs-muted);margin-top:4px;">${esc(g.reason)}</div>
                </div>
                <div style="display:flex;justify-content:flex-end;gap:6px;padding-top:8px;border-top:1px solid var(--tcs-card-border);">
                  <button type="button" class="tcs-btn tcs-btn-sm tcs-btn-ghost" data-dismiss-ghost="${esc(g.id)}">× 散去</button>
                  <button type="button" class="tcs-btn tcs-btn-sm tcs-btn-primary" data-accept-ghost="${esc(g.id)}">✓ 留下</button>
                </div>
              </div>`,
            )
            .join("")}
        </div>
        ${
          area.crossAreaProjects.length > 0
            ? `<div class="tcs-cross-box">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:9px;">
                  <span style="font-size:12px;font-weight:600;color:var(--tcs-muted)">跨领域关联（${area.crossAreaProjects.length}）</span>
                  <span style="font-size:11px;color:var(--tcs-muted)">主归属在其他领域 · 不重复计入本领域负荷 · 点击进入同一工作对象</span>
                </div>
                <div class="tcs-grid">
                  ${area.crossAreaProjects
                    .map((ref) => {
                      const dshLabel = port.source === "dsh" ? "进入对话" : (port.openDshLabel ?? "在 DSH 打开");
                      return `
                        <div class="tcs-cross-card" data-project-open="${esc(ref.primaryAreaId)}|${esc(ref.workKey)}">
                          <div>
                            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:5px;">
                              <strong style="font-size:13px">${esc(ref.title)}</strong>
                              <span class="tcs-badge tcs-badge-mist">主归：${esc(ref.primaryAreaName)}</span>
                            </div>
                            <div class="tcs-card-sub" style="margin-bottom:4px;">${esc(ref.subtitle)}</div>
                          </div>
                          <div class="tcs-card-foot" style="padding-top:6px;">
                            <span>${esc(ref.pulseLabel)}${ref.childCount > 0 ? ` · ${ref.childCount} 子项` : ""}</span>
                            ${port.onOpenInDsh ? `<button type="button" class="tcs-btn tcs-btn-sm tcs-btn-ghost" data-open-dsh-cross="${esc(ref.primaryAreaId)}|${esc(ref.workKey)}">${esc(dshLabel)}</button>` : `<span>查看 L2</span>`}
                          </div>
                        </div>`;
                    })
                    .join("")}
                </div>
              </div>`
            : ""
        }
      </div>
    `;
  };

  const renderL2 = (snap: StageSnapshot, animCls: string) => {
    const area = findArea(snap.viewport.areaId);
    const proj = findProject(snap.viewport.areaId, snap.viewport.projectWorkKey);
    if (!area || !proj) {
      renderL1(snap, animCls);
      return;
    }
    hintEl.textContent = "人机共编黄金层：展示原生嵌套子对象与 Agent 虚态推演 · 可直接跳入对应工作目录";
    const highlightSet = new Set(snap.highlights.map((h) => h.targetId));
    const ghosts = snap.ghostProposals.filter((g) => g.projectWorkKey === proj.workKey);
    const showSeparateDshBtn = Boolean(port.onOpenInDsh && port.source !== "dsh");
    const dshLabel = port.openDshLabel ?? "在 DSH 打开";
    const childDshLabel = port.source === "dsh" ? "进入对话" : dshLabel;
    const renderChildNode = (child: StageProjectNode["childWorks"][number], connected: boolean) => `
      <div class="tcs-l2-node" ${connected ? "data-tcs-l2-branch" : ""} data-node-id="${esc(child.workKey)}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
          <div style="display:flex;align-items:center;gap:7px;min-width:0;">
            <span class="tcs-dot" style="background:var(--tcs-primary)"></span>
            <span style="font-size:12.5px;font-weight:500;">${esc(child.title)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
            ${child.directory ? `<span class="tcs-badge tcs-badge-mist">已绑定目录</span>` : ""}
            <span class="tcs-badge tcs-badge-mist">${esc(child.objectType)}</span>
          </div>
        </div>
        <div style="margin-top:5px;padding-left:14px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
          <span style="font-size:11.5px;color:var(--tcs-muted);">${esc(child.subtitle)} · ${esc(child.pulseLabel)}</span>
          <div style="display:flex;align-items:center;gap:5px;">
            ${port.onOpenTargetInLogseq ? `<button type="button" class="tcs-btn tcs-btn-sm tcs-btn-ghost" data-open-logseq-child="${esc(proj.workKey)}|${esc(child.workKey)}">原文</button>` : ""}
            ${port.onOpenInDsh ? `<button type="button" class="tcs-btn tcs-btn-sm" data-open-dsh-child="${esc(proj.workKey)}|${esc(child.workKey)}">${esc(childDshLabel)}</button>` : ""}
          </div>
        </div>
      </div>`;
    const visibleChildren = proj.childWorks.slice(0, 6);
    const hiddenChildren = proj.childWorks.slice(6);
    const secHtml =
      proj.secondaryAreas.length > 0
        ? `<div class="tcs-secondary-row" style="margin-top:8px;margin-bottom:0;">${proj.secondaryAreas
            .map((ref) =>
              ref.areaId && snap.areas.some((a) => a.id === ref.areaId)
                ? `<button type="button" class="tcs-secondary-chip" data-sec-area-open="${esc(ref.areaId)}">另关联：${esc(ref.areaName)}</button>`
                : `<span class="tcs-secondary-chip" style="cursor:default;">另关联：${esc(ref.areaName)}</span>`,
            )
            .join("")}</div>`
        : "";

    stageEl.innerHTML = `
      <div class="tcs-l2-wrap ${animCls}" data-tcs-l2-wrap>
        <svg class="tcs-l2-svg" data-tcs-l2-svg></svg>
        <div class="tcs-l2-flex">
          <div class="tcs-l2-parent ${highlightSet.has(proj.workKey) ? "tcs-highlight-ring" : ""}"
            data-tcs-l2-parent
            data-node-id="${esc(proj.workKey)}"
            data-drop-project="${esc(area.id)}|${esc(proj.workKey)}">
            <div style="font-size:11px;color:var(--tcs-muted);margin-bottom:4px;">${esc(area.name)} · L2 结构</div>
            <div style="font-size:15px;font-weight:600;">${esc(proj.title)}</div>
            <div class="tcs-card-sub" style="margin-top:5px;margin-bottom:0;">${esc(proj.subtitle)}</div>
            ${secHtml}
            <div style="margin-top:10px;padding-top:9px;border-top:1px solid var(--tcs-card-border);font-size:11.5px;color:var(--tcs-muted);">${esc(proj.pulseLabel)}</div>
            <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;">
              ${showSeparateDshBtn ? `<button type="button" class="tcs-btn tcs-btn-sm tcs-btn-primary" data-l2-open-dsh>${esc(dshLabel)}</button>` : ""}
              ${port.onOpenWork ? `<button type="button" class="tcs-btn tcs-btn-sm ${showSeparateDshBtn ? "" : "tcs-btn-primary"}" data-l2-open-work>${esc(port.openWorkLabel ?? "进入此工作")}</button>` : ""}
              ${port.onOpenInLogseq ? `<button type="button" class="tcs-btn tcs-btn-sm" data-l2-open-logseq>Logseq 原文</button>` : ""}
              ${proj.recencyDays >= WORK_RESUME_RESTART_DAYS ? `<button type="button" class="tcs-btn tcs-btn-sm" data-l2-restart="${esc(proj.workKey)}">久别重启</button>` : ""}
              ${port.onQuoteToChat ? `<button type="button" class="tcs-btn tcs-btn-sm tcs-btn-ghost" data-l2-quote>引用到对话</button>` : ""}
            </div>
            ${proj.annotation ? `<div class="tcs-badge-ghost" style="margin-top:9px;padding:5px 8px;border-radius:7px;font-size:11.5px;">注：${esc(proj.annotation)}</div>` : ""}
            ${renderPresence(proj.workKey)}
          </div>

          <div class="tcs-l2-children">
            ${
              proj.childWorks.length === 0 && proj.advancements.length === 0 && ghosts.length === 0
                ? `<div class="tcs-l2-node" data-tcs-l2-branch style="color:var(--tcs-muted);font-size:12px;">
                    暂无下级推进分支。可直接点左侧「${esc(showSeparateDshBtn ? dshLabel : port.openWorkLabel ?? "进入此工作")}」进入专属工作目录，或在对话里让 Agent 帮你衍生下一步。
                  </div>`
                : ""
            }
            ${
              proj.childWorks.length > 0
                ? `<div class="tcs-branch-section"><span>原生嵌套子对象（${proj.childWorks.length}）</span><span>源自 Logseq 内部结构</span></div>
                   ${visibleChildren.map((child) => renderChildNode(child, true)).join("")}
                   ${
                     hiddenChildren.length > 0
                       ? `<details class="tcs-cooled-box" style="margin-top:2px;">
                            <summary><span>展开其余 ${hiddenChildren.length} 项嵌套子对象</span></summary>
                            <div class="tcs-cooled-list">${hiddenChildren.map((child) => renderChildNode(child, false)).join("")}</div>
                          </details>`
                       : ""
                   }`
                : ""
            }
            ${
              proj.childWorks.length > 0 && (proj.advancements.length > 0 || ghosts.length > 0)
                ? `<div class="tcs-branch-section" style="margin-top:6px;"><span>轻量推进与虚态推演</span></div>`
                : ""
            }
            ${proj.advancements
              .map(
                (adv) => `
                <div class="tcs-l2-node ${recentlySolidifiedIds.has(adv.id) ? "tcs-anim-solidify" : ""}" data-tcs-l2-branch data-l3-open="${esc(adv.id)}" style="cursor:pointer;">
                  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
                    <div style="display:flex;align-items:center;gap:7px;min-width:0;">
                      <span class="tcs-dot" style="background:${adv.state === "done" ? "var(--tcs-muted)" : "var(--tcs-success)"}"></span>
                      <span style="font-size:12.5px;font-weight:500;${adv.state === "done" ? "text-decoration:line-through;opacity:0.62;" : ""}">${esc(adv.title)}</span>
                    </div>
                    <span class="tcs-badge ${adv.promotedToLogseqAt ? "tcs-badge-teal" : adv.state === "done" ? "tcs-badge-mist" : "tcs-badge-ghost"}">
                      ${adv.promotedToLogseqAt ? "已入 Logseq" : adv.state === "done" ? "已完成" : "推进中"}
                    </span>
                  </div>
                  <div style="margin-top:5px;padding-left:14px;font-size:11.5px;color:var(--tcs-muted);display:flex;align-items:center;justify-content:space-between;gap:8px;">
                    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(adv.reason || "轻量推进项")}</span>
                    <span style="color:var(--tcs-primary);flex-shrink:0;">L3 入口</span>
                  </div>
                </div>`,
              )
              .join("")}

            ${ghosts
              .map(
                (g, idx) => `
                <div class="tcs-l2-node tcs-tone-ghost tcs-anim-sprout" data-tcs-l2-branch data-tcs-ghost="true" data-ghost-id="${esc(g.id)}" style="animation-delay:${idx * 130}ms;">
                  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:4px;">
                    <div style="display:flex;align-items:center;gap:7px;min-width:0;">
                      <span class="tcs-dot tcs-pulse" style="background:var(--tcs-primary)"></span>
                      <strong style="font-size:12.5px;">${esc(g.title)}</strong>
                    </div>
                    <span class="tcs-badge tcs-badge-ghost">${esc(g.agent)} 虚态推演</span>
                  </div>
                  <div style="padding-left:14px;font-size:11.5px;color:var(--tcs-muted);margin-bottom:9px;">${esc(g.reason)}</div>
                  <div style="padding-left:14px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                    ${
                      g.sourceInboxText
                        ? `<span class="tcs-badge tcs-badge-amber">源自 Inbox：${esc(g.sourceInboxText.slice(0, 14))}…</span>`
                        : `<span style="font-size:11px;color:var(--tcs-muted)">虚态草稿 · 尚未落盘</span>`
                    }
                    <div style="display:flex;gap:5px;">
                      <button type="button" class="tcs-btn tcs-btn-sm tcs-btn-ghost" data-dismiss-ghost="${esc(g.id)}">× 散去</button>
                      <button type="button" class="tcs-btn tcs-btn-sm tcs-btn-primary" data-accept-ghost="${esc(g.id)}">✓ 留下</button>
                    </div>
                  </div>
                </div>`,
              )
              .join("")}
          </div>
        </div>
      </div>
    `;
  };

  const isSweepWindowActive = (sweepWindowTime = DEFAULT_SWEEP_WINDOW_TIME): boolean => {
    const [hh, mm] = sweepWindowTime.split(":").map(Number);
    const nowDt = new Date();
    const curMin = nowDt.getHours() * 60 + nowDt.getMinutes();
    const targetMin = (Number.isFinite(hh) ? hh! : 17) * 60 + (Number.isFinite(mm) ? mm! : 15);
    return curMin >= Math.max(0, targetMin - 15);
  };

  const formatShortTime = (ms: number): string => {
    const d = new Date(ms);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${mm}-${dd} ${hh}:${min}`;
  };

  const renderInbox = (snap: StageSnapshot) => {
    const activeItems = snap.inbox.filter((i) => !i.cooled);
    const cooledItems = snap.inbox.filter((i) => i.cooled);
    const sweepItems = activeItems.filter((i) => i.pocket === "sweep");
    const commitItems = activeItems.filter((i) => i.pocket === "commit");
    const sparkItems = activeItems.filter((i) => i.pocket === "spark");
    const ledgerItems: StageInboxFlowLedgerEntry[] = snap.flowLedger ?? [];
    const pockets = snap.inboxPockets;
    const sweepWindowTime = pockets?.sweepWindowTime ?? DEFAULT_SWEEP_WINDOW_TIME;

    if (!userPickedInboxTab) {
      if (sweepItems.length > 0) activeInboxTab = "sweep";
      else if (commitItems.length > 0) activeInboxTab = "commit";
      else if (sparkItems.length > 0) activeInboxTab = "spark";
      else if (ledgerItems.length > 0) activeInboxTab = "ledger";
      else activeInboxTab = "sweep";
    }

    inboxCountEl.textContent = String(activeItems.length);
    const refineBtn = root.querySelector<HTMLButtonElement>("[data-refine-inbox-ai]");
    if (refineBtn) {
      refineBtn.disabled = refiningAi || activeItems.length === 0;
      refineBtn.textContent = refiningAi ? "梳理中..." : "AI 轻梳理";
    }

    inboxTabsEl.innerHTML = `
      <button type="button" class="tcs-pocket-tab ${activeInboxTab === "sweep" ? "is-active" : ""} ${isSweepWindowActive(sweepWindowTime) && sweepItems.length > 0 ? "is-alert" : ""}" data-inbox-tab="sweep">小尾巴 ${sweepItems.length}</button>
      <button type="button" class="tcs-pocket-tab ${activeInboxTab === "commit" ? "is-active" : ""} ${(pockets?.commitOverload ?? false) ? "is-alert" : ""}" data-inbox-tab="commit">别忘 ${commitItems.length}</button>
      <button type="button" class="tcs-pocket-tab ${activeInboxTab === "spark" ? "is-active" : ""}" data-inbox-tab="spark">想法 ${sparkItems.length}</button>
      <button type="button" class="tcs-pocket-tab ${activeInboxTab === "ledger" ? "is-active" : ""}" data-inbox-tab="ledger">台账 ${ledgerItems.filter((e) => !e.undone).length}</button>
    `;

    const focusedArea = findArea(snap.viewport.areaId);
    const focusedProjKey = snap.viewport.projectWorkKey;
    if (activeInboxTab === "sweep") {
      inboxSubEl.textContent = `今日小尾巴 · 平时静默，${sweepWindowTime} 清扫统一收尾`;
    } else if (activeInboxTab === "commit") {
      inboxSubEl.textContent = "别忘 / 已答应 · 硬编码免 14 天冷却，不悄悄消失";
    } else if (activeInboxTab === "spark") {
      inboxSubEl.textContent = focusedArea
        ? `随手想法 · 「${focusedArea.name}」相关项已上浮`
        : "随手想法 · 零负罪沉淀，拖拽安放或沉淀周复盘";
    } else {
      inboxSubEl.textContent = "流转台账 · 近 7 天处理去向，支持一键撤回";
    }

    const diagNotices: string[] = [];
    const icloudDiag = snap.inboxDiagnostics?.icloud;
    if (icloudDiag && icloudDiag.status === "permission-denied") {
      diagNotices.push(`
        <div class="tcs-diag-notice">
          <div style="font-weight:600">iCloud 语音目录暂未授权</div>
          <div style="color:var(--tcs-muted);margin-top:3px;">${esc(icloudDiag.guidance ?? icloudDiag.message ?? "请在系统设置开启文件与文件夹权限。")}</div>
        </div>
      `);
    } else if (icloudDiag && (icloudDiag.evictedCount ?? 0) > 0) {
      diagNotices.push(`
        <div class="tcs-diag-notice">
          <div style="font-weight:600">发现 ${icloudDiag.evictedCount} 条 iCloud 云端占位语音</div>
          <div style="color:var(--tcs-muted);margin-top:3px;">${esc(icloudDiag.guidance ?? icloudDiag.message ?? "已自动触发下载，建议在 Finder 右键 TaskCopilotInbox 选择「保持下载」。")}</div>
        </div>
      `);
    }
    if ((pockets?.pendingJournalCount ?? 0) > 0) {
      diagNotices.push(`
        <div class="tcs-diag-notice">
          <div style="font-weight:600">${pockets!.pendingJournalCount} 条离线收录待回落日记</div>
          <div style="color:var(--tcs-muted);margin-top:2px;">下次打开 Logseq 将自动补写进对应日期日记，去重不重复。</div>
        </div>
      `);
    }
    inboxDiagEl.innerHTML = diagNotices.join("");

    if (activeInboxTab === "ledger") {
      if (ledgerItems.length === 0) {
        inboxListEl.innerHTML = `<div style="padding:18px;text-align:center;font-size:12px;color:var(--tcs-muted)">近 7 天暂无随想流转记录</div>`;
        return;
      }
      inboxListEl.innerHTML = ledgerItems
        .map(
          (entry) => `
          <div class="tcs-ledger-row ${entry.undone ? "is-undone" : ""}">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
              <span class="tcs-badge tcs-badge-teal">${esc(entry.destinationLabel)}</span>
              <span style="font-size:10.5px;color:var(--tcs-muted);">${esc(formatShortTime(entry.at))}</span>
            </div>
            <div style="font-size:12px;line-height:1.4;">${esc(entry.text)}</div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:10.5px;color:var(--tcs-muted);">
              <span>${esc(entry.sourceLabel)} · 原属 ${esc(pocketLabel(entry.fromPocket))}</span>
              ${
                !entry.undone
                  ? `<button type="button" class="tcs-inbox-chip-btn" data-undo-ledger="${esc(entry.id)}">撤回</button>`
                  : `<span>已撤回</span>`
              }
            </div>
          </div>`,
        )
        .join("");
      return;
    }

    const renderAiHint = (item: StageInboxViewItem): string => {
      const hint = item.aiHint;
      if (!hint) return "";
      const suggestDiff = hint.suggestedPocket && hint.suggestedPocket !== item.pocket;
      return `
        <div class="tcs-ai-hint">
          <div style="color:var(--tcs-primary);font-weight:600;">AI 轻梳理${hint.summary ? ` · ${esc(hint.summary)}` : ""}</div>
          ${hint.reason ? `<div style="color:var(--tcs-muted);">${esc(hint.reason)}</div>` : ""}
          ${
            hint.splitCandidates && hint.splitCandidates.length >= 2
              ? `<div style="color:var(--tcs-muted);">建议拆分：${hint.splitCandidates.map((s) => esc(s)).join(" / ")}</div>`
              : ""
          }
          ${
            suggestDiff
              ? `<div><button type="button" class="tcs-inbox-chip-btn is-primary" data-move-pocket="${esc(item.id)}|${hint.suggestedPocket}">采纳建议 -> ${esc(pocketLabel(hint.suggestedPocket!))}</button></div>`
              : ""
          }
        </div>
      `;
    };

    const renderCard = (item: StageInboxViewItem, bubbled: boolean, dimmed: boolean) => {
      const selected = snap.viewport.selectedInboxId === item.id;
      const areaTags = item.matchAreaIds
        .map((id) => snap.areas.find((a) => a.id === id)?.name)
        .filter((n): n is string => Boolean(n));

      const statusBadges: string[] = [];
      if (item.immuneToCooling) statusBadges.push(`<span class="tcs-badge tcs-badge-mismatch">免 14 天冷却</span>`);
      if (item.failSafe) statusBadges.push(`<span class="tcs-badge tcs-badge-amber">兜底防漏</span>`);
      if ((item.carryoverDays ?? 0) >= 2) {
        statusBadges.push(`<span class="tcs-badge tcs-badge-mismatch">已顺延 ${item.carryoverDays} 天</span>`);
      } else if (item.carryoverDays === 1) {
        statusBadges.push(`<span class="tcs-badge tcs-badge-mist">已锁进明日</span>`);
      }
      if (item.sprouting && item.threadLabel) {
        statusBadges.push(`<span class="tcs-badge tcs-badge-teal">${esc(item.threadLabel)}${item.threadCount ? ` (${item.threadCount})` : ""}</span>`);
      }
      if (item.isFeed && !item.sprouting) {
        statusBadges.push(`<span class="tcs-badge tcs-badge-mist">项目共振</span>`);
      }
      if (item.pendingJournalFlush) {
        statusBadges.push(`<span class="tcs-badge tcs-badge-ghost">待落日记</span>`);
      }

      let actionRow = "";
      if (!item.cooled) {
        if (item.pocket === "sweep") {
          actionRow = `
            <button type="button" class="tcs-inbox-chip-btn is-primary" data-sweep-done="${esc(item.id)}">办完划掉</button>
            <button type="button" class="tcs-inbox-chip-btn" data-sweep-tomorrow="${esc(item.id)}">锁进明日</button>
            <button type="button" class="tcs-inbox-chip-btn" data-move-pocket="${esc(item.id)}|commit">转别忘</button>
            <button type="button" class="tcs-inbox-chip-btn" data-move-pocket="${esc(item.id)}|spark">退回想法</button>
          `;
        } else if (item.pocket === "commit") {
          actionRow = `
            <button type="button" class="tcs-inbox-chip-btn is-primary" data-inbox-to-week="${esc(item.id)}">装入本周</button>
            <button type="button" class="tcs-inbox-chip-btn" data-sweep-done="${esc(item.id)}">已办妥</button>
            <button type="button" class="tcs-inbox-chip-btn" data-move-pocket="${esc(item.id)}|sweep">降为小尾巴</button>
            <button type="button" class="tcs-inbox-chip-btn" data-move-pocket="${esc(item.id)}|spark">退回想法</button>
          `;
        } else {
          actionRow = `
            <button type="button" class="tcs-inbox-chip-btn is-primary" data-archive-review="${esc(item.id)}">沉淀周复盘</button>
            <button type="button" class="tcs-inbox-chip-btn" data-move-pocket="${esc(item.id)}|sweep">转小尾巴</button>
            <button type="button" class="tcs-inbox-chip-btn" data-move-pocket="${esc(item.id)}|commit">转别忘</button>
            <button type="button" class="tcs-inbox-chip-btn" data-archive-one="${esc(item.id)}">释怀</button>
          `;
        }
      }

      return `
        <div class="tcs-inbox-card ${selected ? "tcs-tone-amber tcs-amber-resonate" : bubbled ? "tcs-tone-amber" : ""} ${dimmed && !selected ? "is-dimmed" : ""}"
          draggable="true"
          data-inbox-id="${esc(item.id)}">
          ${statusBadges.length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:5px;">${statusBadges.join("")}</div>` : ""}
          <div style="font-size:12px;line-height:1.45;margin-bottom:5px;">${esc(item.text)}</div>
          <div style="display:flex;justify-content:space-between;gap:6px;font-size:10.5px;color:var(--tcs-muted);">
            <span>${esc(item.sourceLabel)}${item.ageDays > 0 ? ` · ${item.ageDays}天前` : ""}</span>
            ${selected ? `<span style="color:var(--tcs-warning);font-weight:600;">已选指代</span>` : ""}
          </div>
          ${
            areaTags.length > 0
              ? `<div style="margin-top:5px;display:flex;flex-wrap:wrap;gap:4px;">${areaTags.map((n) => `<span class="tcs-badge tcs-badge-amber">-> ${esc(n)}</span>`).join("")}</div>`
              : ""
          }
          ${renderAiHint(item)}
          ${actionRow ? `<div class="tcs-inbox-actions">${actionRow}</div>` : ""}
        </div>
      `;
    };

    const currentList =
      activeInboxTab === "sweep" ? sweepItems : activeInboxTab === "commit" ? commitItems : sparkItems;

    let topAlert = "";
    if (activeInboxTab === "commit" && (pockets?.commitOverload ?? false)) {
      topAlert = `<div class="tcs-diag-notice" style="margin:0;"><strong>待兑现承诺已有 ${commitItems.length} 条</strong><div style="color:var(--tcs-muted);margin-top:2px;">建议挑 1 条装入本周容器，或直接处理掉最轻的一条。</div></div>`;
    } else if (activeInboxTab === "sweep" && (pockets?.sweepCarryoverCount ?? 0) > 0) {
      topAlert = `<div class="tcs-diag-notice" style="margin:0;"><strong>有 ${pockets!.sweepCarryoverCount} 条小尾巴连续顺延 >= 2 天</strong><div style="color:var(--tcs-muted);margin-top:2px;">超过 15 分钟的事请直接点「转别忘」，不要长期滞留小尾巴。</div></div>`;
    }

    const matched: StageInboxViewItem[] = [];
    const others: StageInboxViewItem[] = [];
    for (const item of currentList) {
      const hit = focusedProjKey
        ? item.matchProjectWorkKeys.includes(focusedProjKey) || (focusedArea ? item.matchAreaIds.includes(focusedArea.id) : false)
        : focusedArea
          ? item.matchAreaIds.includes(focusedArea.id)
          : false;
      if (hit) matched.push(item);
      else others.push(item);
    }

    const emptyCopy =
      activeInboxTab === "sweep"
        ? "今日小尾巴为空，安心推进当前主线"
        : activeInboxTab === "commit"
          ? "暂无未兑现承诺与模糊责任"
          : "暂无近期随手想法线索";

    const listHtml =
      currentList.length === 0
        ? `<div style="padding:16px 10px;text-align:center;font-size:12px;color:var(--tcs-muted)">${emptyCopy}</div>`
        : focusedArea && matched.length > 0
          ? `<div style="font-size:11px;font-weight:600;color:var(--tcs-warning);padding:2px 4px;">本领域共振（${matched.length}）</div>` +
            matched.map((i) => renderCard(i, true, false)).join("") +
            (others.length > 0 ? `<div style="font-size:11px;color:var(--tcs-muted);padding:6px 4px 2px;">其他条目（${others.length}）</div>` : "") +
            others.map((i) => renderCard(i, false, true)).join("")
          : currentList.map((i) => renderCard(i, false, false)).join("");

    const cooledHtml =
      activeInboxTab === "spark" && cooledItems.length > 0
        ? `
        <details class="tcs-cooled-box">
          <summary>
            <span>14 天自然收起（${cooledItems.length} · 不含承诺项）</span>
            <button type="button" class="tcs-btn tcs-btn-sm tcs-btn-ghost" data-archive-cooled>一键释怀</button>
          </summary>
          <div class="tcs-cooled-list">
            ${cooledItems.map((i) => renderCard(i, false, true)).join("")}
          </div>
        </details>`
        : "";

    inboxListEl.innerHTML = topAlert + listHtml + cooledHtml;
  };

  const renderL3 = (snap: StageSnapshot) => {
    if (snap.viewport.zoomLevel !== 3 || !snap.viewport.taskId) {
      l3El.style.display = "none";
      return;
    }
    const area = findArea(snap.viewport.areaId);
    const proj = findProject(snap.viewport.areaId, snap.viewport.projectWorkKey);
    const adv = proj?.advancements.find((a) => a.id === snap.viewport.taskId);
    if (!proj || !adv) {
      l3El.style.display = "none";
      return;
    }
    const showSeparateDshBtn = Boolean(port.onOpenInDsh && port.source !== "dsh");
    const dshLabel = port.openDshLabel ?? "在 DSH 打开";
    l3El.style.display = "flex";
    l3El.innerHTML = `
      <div class="tcs-l3-card tcs-anim-in">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
          <div>
            <div style="font-size:11.5px;color:var(--tcs-muted)">L3 执行入口 · ${esc(area?.name ?? "")} / ${esc(proj.title)}</div>
            <div style="font-size:15.5px;font-weight:600;margin-top:3px;">${esc(adv.title)}</div>
          </div>
          <button type="button" class="tcs-btn tcs-btn-sm tcs-btn-ghost" data-l3-back>返回 L2</button>
        </div>
        <div style="border-radius:10px;background:var(--tcs-bg);border:1px solid var(--tcs-card-border);padding:11px 13px;">
          <div style="font-size:11px;color:var(--tcs-muted);margin-bottom:4px;">推进说明（方案 A 轻量运营态）</div>
          <div style="font-size:12.5px;">${esc(adv.reason || "轻量推进项，尚未改写正式任务库")}</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;padding-top:8px;border-top:1px solid var(--tcs-card-border);">
          <button type="button" class="tcs-btn tcs-btn-sm" data-toggle-adv="${esc(adv.id)}">${adv.state === "done" ? "重新打开" : "✓ 标记完成"}</button>
          <div style="display:flex;gap:7px;flex-wrap:wrap;">
            ${port.onPromoteTodo && !adv.promotedToLogseqAt ? `<button type="button" class="tcs-btn tcs-btn-sm" data-promote-adv="${esc(adv.id)}">写入 Logseq TODO</button>` : ""}
            ${port.onOpenInLogseq ? `<button type="button" class="tcs-btn tcs-btn-sm" data-l3-open-logseq>Logseq 原文</button>` : ""}
            ${showSeparateDshBtn ? `<button type="button" class="tcs-btn tcs-btn-sm tcs-btn-primary" data-l3-open-dsh>${esc(dshLabel)}</button>` : ""}
            ${port.onOpenWork ? `<button type="button" class="tcs-btn tcs-btn-sm ${showSeparateDshBtn ? "" : "tcs-btn-primary"}" data-l3-open-work>${esc(port.openWorkLabel ?? "进入执行")}</button>` : ""}
          </div>
        </div>
      </div>
    `;
  };

  const renderSchedule = (snap: StageSnapshot, animation = "") => {
    if (snap.viewport.activeTab === "week") {
      stageEl.innerHTML = renderWeekPaper(snap, animation);
      return;
    }
    const friction = pendingFriction?.tab === snap.viewport.activeTab ? pendingFriction : null;
    stageEl.innerHTML = renderDayPaper(snap, animation, {
      canOpenWork: Boolean(port.onOpenTargetInLogseq),
      canOpenJournal: Boolean(port.onOpenJournal),
      finishingFocus: finishingFocusInline,
      flashIds: scheduleFlashIds,
      ...(friction ? { friction: { slotId: friction.slotId, openCount: friction.openCount, canDefer: friction.tab === "today" } } : {}),
      sweepTime: snap.inboxPockets?.sweepWindowTime ?? DEFAULT_SWEEP_WINDOW_TIME,
      sweepReady: isSweepWindowActive(snap.inboxPockets?.sweepWindowTime),
    });
  };

  const renderOverlays = (snap: StageSnapshot) => {
    const activeTab: StageViewTab = snap.viewport.activeTab ?? "season";
    // Edge Radar
    if (activeTab === "season" && snap.edgeRadar && snap.viewport.zoomLevel > 0) {
      radarEl.style.display = "block";
      radarEl.innerHTML = `
        <button type="button" class="tcs-btn tcs-btn-pill tcs-anim-sprout" style="background:var(--tcs-card);border-color:var(--tcs-warning);box-shadow:var(--tcs-shadow-md);" data-radar-go="${esc(snap.edgeRadar.targetAreaId)}|${esc(snap.edgeRadar.targetProjectWorkKey ?? "")}">
          <span style="color:var(--tcs-warning)">关联</span>
          <span>${esc(snap.edgeRadar.label)}</span>
          <span style="color:var(--tcs-muted)">滑过去</span>
        </button>
      `;
    } else {
      radarEl.style.display = "none";
    }

    // Bottom Round-Change Pill
    const nonColdGhosts = snap.ghostProposals.filter((g) => g.kind !== "propose-areas");
    const timeGhosts = snap.time?.ghostProposals ?? [];
    if (activeTab === "season" && nonColdGhosts.length > 0) {
      const firstAgent = nonColdGhosts[0]?.agent ?? "Agent";
      pillEl.style.display = "flex";
      pillEl.innerHTML = `
        <span class="tcs-dot tcs-pulse" style="background:var(--tcs-primary)"></span>
        <span style="font-weight:600">${esc(firstAgent)} 刚提议：+${nonColdGhosts.length} 条虚态推演</span>
        <button type="button" class="tcs-btn tcs-btn-sm tcs-btn-pill tcs-btn-primary" data-pill-accept-all>全部留下</button>
        <button type="button" class="tcs-btn tcs-btn-sm tcs-btn-pill tcs-btn-ghost" data-pill-dismiss-all>全部散去</button>
      `;
    } else if (activeTab !== "season" && timeGhosts.length > 0) {
      const firstAgent = timeGhosts[0]?.agent ?? "Agent";
      pillEl.style.display = "flex";
      pillEl.innerHTML = `
        <span class="tcs-dot tcs-pulse" style="background:var(--tcs-primary)"></span>
        <span style="font-weight:600">${esc(firstAgent)} 提议排期：+${timeGhosts.length} 条虚态提案</span>
        <button type="button" class="tcs-btn tcs-btn-sm tcs-btn-pill tcs-btn-primary" data-time-accept-all>全部落盘</button>
        <button type="button" class="tcs-btn tcs-btn-sm tcs-btn-pill tcs-btn-ghost" data-time-dismiss-all>全部散去</button>
      `;
    } else {
      pillEl.style.display = "none";
    }
  };

  const update = (next: StageSnapshot) => {
    const sig = JSON.stringify({ ...next, generatedAt: 0 });
    if (sig === lastRenderSignature) {
      snapshot = next;
      return;
    }
    lastRenderSignature = sig;

    if (snapshot?.time && next.time) {
      const timeEntries = (time: NonNullable<StageSnapshot["time"]>) => [
        ...time.todaySlots.flatMap((slot) => slot.items),
        ...(time.tomorrowSlots ?? []).flatMap((slot) => slot.items),
        ...(time.todayCandidates ?? []), ...(time.tomorrowCandidates ?? []),
      ];
      const previous = new Map(timeEntries(snapshot.time).map((item) => [item.id, `${item.date}|${"slotId" in item ? item.slotId : ""}`]));
      const moved = timeEntries(next.time).filter((item) => previous.get(item.id) !== `${item.date}|${"slotId" in item ? item.slotId : ""}`);
      if (moved.length) {
        scheduleFlashIds = new Set(moved.map((item) => item.id));
        clearTimeout(scheduleFlashTimer);
        scheduleFlashTimer = setTimeout(() => scheduleFlashIds.clear(), 1500);
      }
    }

    const prevAdvIds = new Set(
      (snapshot?.areas ?? []).flatMap((a) => [
        ...a.areaAdvancements.map((x) => x.id),
        ...a.projects.flatMap((p) => p.advancements.map((x) => x.id)),
      ]),
    );
    const nextAdvIds = next.areas.flatMap((a) => [
      ...a.areaAdvancements.map((x) => x.id),
      ...a.projects.flatMap((p) => p.advancements.map((x) => x.id)),
    ]);
    if (snapshot) {
      const newlySolid = nextAdvIds.filter((id) => !prevAdvIds.has(id));
      if (newlySolid.length > 0) {
        recentlySolidifiedIds = new Set(newlySolid);
        setTimeout(() => {
          recentlySolidifiedIds.clear();
        }, 650);
      }
    }

    const activeTab: StageViewTab = next.viewport.activeTab ?? "season";
    const coldProposal = next.ghostProposals.find((g) => g.kind === "propose-areas");
    const nextViewKey = `${activeTab}|${next.viewport.zoomLevel}|${next.viewport.areaId ?? ""}|${next.viewport.projectWorkKey ?? ""}|${coldProposal?.id ?? ""}`;
    const viewChanged = nextViewKey !== prevViewKey;
    const prevScrollTop = stageEl.scrollTop;
    const animCls = viewChanged ? (next.viewport.zoomLevel >= prevZoomLevel ? "tcs-anim-in" : "tcs-anim-out") : "";
    prevViewKey = nextViewKey;
    prevZoomLevel = next.viewport.zoomLevel;
    snapshot = next;

    root.querySelectorAll<HTMLButtonElement>("[data-tcs-tab]").forEach((btn) => {
      const isCurrent = btn.dataset.tcsTab === activeTab;
      btn.classList.toggle("is-active", isCurrent);
      btn.setAttribute("aria-selected", String(isCurrent));
    });

    const pockets = next.inboxPockets;
    const sweepCnt = pockets?.sweepCount ?? next.inbox.filter((i) => !i.cooled && i.pocket === "sweep").length;
    const commitCnt = pockets?.commitCount ?? next.inbox.filter((i) => !i.cooled && i.pocket === "commit").length;
    const sparkCnt = pockets?.sparkCount ?? next.inbox.filter((i) => !i.cooled && i.pocket === "spark").length;
    inboxToggleBtn.textContent = `小尾巴 ${sweepCnt} · 别忘 ${commitCnt} · 想法 ${sparkCnt}`;
    inboxToggleBtn.classList.toggle(
      "is-sweep-ready",
      isSweepWindowActive(pockets?.sweepWindowTime ?? DEFAULT_SWEEP_WINDOW_TIME) && sweepCnt > 0,
    );
    inboxPaneEl.classList.toggle("is-collapsed", activeTab === "season" ? inboxCollapsed : !scheduleInboxOpen);

    // Header contextual controls
    const isSeason = activeTab === "season";
    root.toggleAttribute("data-paper-view", !isSeason);
    zoomOutBtn.style.display = isSeason ? "inline-flex" : "none";
    zoomOutBtn.disabled = next.viewport.zoomLevel === 0 && !coldProposal && !port.onRequestClose;
    coldStartBtn.style.display = isSeason ? "inline-flex" : "none";
    legendEl.style.display = isSeason ? "flex" : "none";
    undoBtn.style.display = (isSeason ? next.canUndo : Boolean(next.time?.canUndo)) ? "inline-flex" : "none";
    if (popoutBtn) popoutBtn.style.display = next.appUrl ? "inline-flex" : "none";

    if (isSeason) {
      const bcParts: string[] = [
        `<button type="button" class="tcs-bc-btn ${next.viewport.zoomLevel === 0 && !coldProposal ? "is-current" : ""}" data-bc-l0>L0 季节星区</button>`,
      ];
      if (coldProposal) {
        bcParts.push(`<span style="color:var(--tcs-muted)">/</span><span class="tcs-badge tcs-badge-ghost">冷启动虚态初稿</span>`);
      } else {
        const area = findArea(next.viewport.areaId);
        if (next.viewport.zoomLevel >= 1 && area) {
          bcParts.push(`<span style="color:var(--tcs-muted)">/</span><button type="button" class="tcs-bc-btn ${next.viewport.zoomLevel === 1 ? "is-current" : ""}" data-area-open="${esc(area.id)}">L1 ${esc(area.name)}</button>`);
        }
        const proj = findProject(next.viewport.areaId, next.viewport.projectWorkKey);
        if (next.viewport.zoomLevel >= 2 && area && proj) {
          bcParts.push(`<span style="color:var(--tcs-muted)">/</span><button type="button" class="tcs-bc-btn ${next.viewport.zoomLevel === 2 ? "is-current" : ""}" data-project-open="${esc(area.id)}|${esc(proj.workKey)}">L2 ${esc(proj.title)}</button>`);
        }
      }
      bcEl.innerHTML = bcParts.join("");
    } else {
      bcEl.innerHTML = "";
    }

    if (!isSeason) {
      renderSchedule(next, animCls);
    } else if (coldProposal) {
      renderColdStart(coldProposal);
    } else if (next.viewport.zoomLevel === 0) {
      renderL0(next, animCls);
    } else if (next.viewport.zoomLevel === 1) {
      renderL1(next, animCls);
    } else {
      renderL2(next, animCls);
    }
    if (!viewChanged) {
      stageEl.scrollTop = prevScrollTop;
    }

    renderInbox(next);
    renderOverlays(next);
    renderL3(next);

    if (!activeRestartDeck) {
      if (next.restartDeck && !dismissedRestartIds.has(next.restartDeck.id)) {
        openRestartDeck(next.restartDeck);
      } else if (activeTab === "season" && next.viewport.zoomLevel === 2 && next.viewport.projectWorkKey) {
        const area = findArea(next.viewport.areaId);
        const proj = findProject(next.viewport.areaId, next.viewport.projectWorkKey);
        if (area && proj && proj.recencyDays >= WORK_RESUME_RESTART_DAYS) {
          const deckId = `restart-work-${proj.workKey}`;
          if (!dismissedRestartIds.has(deckId)) {
            const workDeck = buildWorkRestartDeck({ project: proj, area, snapshot: next });
            if (workDeck) openRestartDeck(workDeck);
          }
        }
      }
    }
    renderRestartDeck();

    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        if (disposed) return;
        drawL2Lines();
        applyResonanceClasses();
        drawTethers();
      });
    }
  };

  // ==================== EVENT DELEGATION ====================
  const buildDiscussPrompt = (snap: StageSnapshot): string => {
    const tab: StageViewTab = snap.viewport.activeTab ?? "season";
    if (tab === "week" && snap.time) {
      return `当前在「本周容器」（${snap.time.weekCapacity.summary}，已装入 ${snap.time.weekCapacity.openMoveCount} 块）。请结合 stage_get_pulse 与 time_get_overview 帮我检视本周容量与推进块优先级。`;
    }
    if (tab === "tomorrow" && snap.time) {
      return `当前在「明日」（${snap.time.tomorrowDate}）。请结合 time_get_overview 核对具体动作与日程。`;
    }
    if (tab === "today" && snap.time) {
      const carry = snap.time.carryoverItems.length;
      return `当前在「今日容器」（${snap.time.today}，昨日遗留 ${carry} 项）。请结合 time_get_overview 帮我确认今天「上午·深潜」的主线切口并做减法。`;
    }
    const area = findArea(snap.viewport.areaId);
    const proj = findProject(snap.viewport.areaId, snap.viewport.projectWorkKey);
    if (proj) {
      return `当前在活画布关注「${area?.name ?? "领域"} / ${proj.title}」，请帮我评估下一步 15 分钟最小切口或衍生推进项。`;
    }
    if (area) {
      return `当前在活画布关注领域「${area.name}」（${focusRoleLabel(area.focusRole)}），请结合近期脉搏与 Inbox 帮我做取舍。`;
    }
    return `当前在「季节星区」，请先调用 stage_get_pulse 与 time_get_overview 帮我做一次简短事实核对。`;
  };

  const switchScheduleTab = (activeTab: StageViewTab) =>
    runAction({ type: "set-viewport", source: port.source, viewport: { activeTab } });

  const placeIntoSlot = async (
    request: PlaceRequest, date: string, tab: "today" | "tomorrow",
    overflowMode?: "replace" | "defer-tomorrow" | "stack",
  ) => {
    if (placing) return;
    placing = true;
    const { inboxId, ...input } = request;
    try {
      const ok = await runAction({
        type: "time",
        action: {
          type: "place-day-item", date, slotId: input.slotId, title: input.title,
          areaId: input.areaId, projectWorkKey: input.projectWorkKey, weekMoveId: input.weekMoveId,
          workRef: input.workRef, context: input.context, sourceInboxId: input.sourceInboxId,
          ...(input.candidateId ? { candidateId: input.candidateId } : {}),
          ...(overflowMode ? { overflowMode } : {}),
        },
      }, overflowMode === "defer-tomorrow" ? "已顺延明天" : `已排入${tab === "today" ? "今天" : "明天"}${slotShortLabel(input.slotId)}`);
      if (ok && inboxId) await runAction({ type: "archive-inbox-items", inboxIds: [inboxId] });
      const destination = overflowMode === "defer-tomorrow" ? "tomorrow" : tab;
      if (ok && snapshot?.viewport.activeTab !== destination) await switchScheduleTab(destination);
    } finally {
      placing = false;
    }
  };

  const requestPlaceIntoSlot = (input: PlaceRequest) => {
    if (!snapshot?.time || placing) return;
    const tab = input.tab ?? (snapshot.viewport.activeTab === "tomorrow" ? "tomorrow" : "today");
    const date = scheduleTabDate(snapshot.time, tab);
    const slot = scheduleSlots(snapshot.time, tab)?.find((entry) => entry.spec.id === input.slotId);
    const titles = (slot?.items ?? []).filter((item) => item.state === "open").map((item) => item.title);
    if (buildSlotFrictionPrompt(input.slotId, titles)) {
      pendingFriction = { ...input, tab, date, openCount: titles.length };
      if (snapshot.viewport.activeTab !== tab) void switchScheduleTab(tab);
      else renderSchedule(snapshot);
      return;
    }
    void placeIntoSlot(input, date, tab);
  };

  zoomOutBtn.addEventListener("click", zoomOut);
  coldStartBtn.addEventListener("click", () => void runAction({ type: "trigger-cold-start" }));
  undoBtn.addEventListener("click", () => {
    const isSeason = (snapshot?.viewport.activeTab ?? "season") === "season";
    void runAction(isSeason ? { type: "undo" } : { type: "time", action: { type: "undo-time" } }, "已撤销上一次改动");
  });
  discussBtn.addEventListener("click", () => {
    if (!snapshot) return;
    const text = buildDiscussPrompt(snapshot);
    if (port.onQuoteToChat) {
      port.onQuoteToChat(text);
      showToast("已将当前画面摘要填入对话输入框");
      return;
    }
    if (port.onDiscussInDsh) {
      void Promise.resolve(port.onDiscussInDsh(text, snapshot))
        .then(() => showToast("已在 DSH 打开当前画面共视（悬浮星图自动同步当前层次与对象）"))
        .catch((err) => showToast(err instanceof Error ? err.message : "跳转 DSH 失败"));
      return;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).then(
        () => showToast("已复制当前画面摘要，可直接粘贴给 Agent"),
        () => showToast(text),
      );
      return;
    }
    showToast(text);
  });
  inboxToggleBtn.addEventListener("click", () => {
    const isSeason = (snapshot?.viewport.activeTab ?? "season") === "season";
    if (isSeason) inboxCollapsed = !inboxCollapsed;
    else scheduleInboxOpen = !scheduleInboxOpen;
    inboxPaneEl.classList.toggle("is-collapsed", isSeason ? inboxCollapsed : !scheduleInboxOpen);
    drawTethers();
  });
  popoutBtn?.addEventListener("click", () => {
    if (snapshot?.appUrl) port.onOpenStandalone?.(snapshot.appUrl);
  });
  closeBtn?.addEventListener("click", () => port.onRequestClose?.());
  root.querySelector("[data-tcs-theme]")?.addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
  });

  root.addEventListener("submit", (event) => {
    const form = event.target as HTMLFormElement | null;
    if (!form || !snapshot) return;
    if (form.hasAttribute("data-week-add-form")) {
      event.preventDefault();
      const input = form.querySelector<HTMLInputElement>('input[name="title"]');
      const title = input?.value.trim() ?? "";
      if (!title) return;
      if (input) input.value = "";
      void runAction({ type: "time", action: { type: "add-week-move", title } }, "已装入本周容器");
      return;
    }
    if (form.hasAttribute("data-add-day-candidate") && snapshot.time) {
      event.preventDefault();
      const title = form.querySelector<HTMLInputElement>('input[name="title"]')?.value.trim();
      if (!title) return;
      const project = findProject(form.dataset.scheduleArea ?? null, form.dataset.planProject ?? null);
      const original = snapshot.inbox.find((item) => item.id === form.dataset.clarifyInbox);
      const sourceProject = scheduleProject(snapshot, original?.matchProjectWorkKeys[0]);
      const date = scheduleTabDate(snapshot.time, snapshot.viewport.activeTab ?? "today");
      void runAction({ type: "time", action: {
        type: "add-day-candidate", date, title,
        projectWorkKey: project?.workKey ?? sourceProject?.workKey,
        areaId: form.dataset.scheduleArea ?? original?.matchAreaIds[0],
        workRef: project?.workRef ?? original?.workRef ?? sourceProject?.workRef,
        context: original?.sourceLabel,
        sourceInboxId: original?.id,
      } }, date === snapshot.time.today ? "已加入今日待办" : "已加入明日候选");
      return;
    }
    if (form.hasAttribute("data-focus-finish-form")) {
      event.preventDefault();
      const input = form.querySelector<HTMLInputElement>('input[name="stopNote"]');
      const stopNote = input?.value.trim() ?? "";
      finishingFocusInline = false;
      void runAction(
        { type: "time", action: { type: "finish-focus", ...(stopNote ? { stopNote } : {}) } },
        stopNote ? "已结束专注并记录停点" : "已结束专注并累计投入时长",
      );
    }
  });

  root.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement | null;
    if (!target || !snapshot) return;
    if (target.hasAttribute("data-toggle-footprint")) {
      void runAction(
        { type: "time", action: { type: "set-footprint-calendar", enabled: target.checked } },
        target.checked ? "已开启专注结束写入 Apple 日历足迹" : "已关闭 Apple 日历足迹写入",
      );
    }
  });

  root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target || !snapshot) return;

    // Restart flip-card controls
    if (target.closest("[data-restart-skip]")) {
      dismissRestartDeck(true);
      return;
    }
    if (target.closest("[data-restart-next]") && activeRestartDeck) {
      restartSlideIndex = Math.min(activeRestartDeck.slides.length - 1, restartSlideIndex + 1);
      renderRestartDeck();
      return;
    }
    if (target.closest("[data-restart-prev]") && activeRestartDeck) {
      restartSlideIndex = Math.max(0, restartSlideIndex - 1);
      renderRestartDeck();
      return;
    }
    if (target.closest("[data-restart-open-source]") && activeRestartDeck) {
      const deck = activeRestartDeck;
      const proj = findProject(deck.areaId ?? null, deck.projectWorkKey ?? null);
      dismissRestartDeck(true);
      if (proj) {
        if (port.onOpenInLogseq) void port.onOpenInLogseq(proj);
        else if (port.onOpenWork) void port.onOpenWork(proj);
      }
      return;
    }
    if (target.closest("[data-restart-settle-carryover]") && activeRestartDeck) {
      const deck = activeRestartDeck;
      dismissedRestartIds.add(deck.id);
      activeRestartDeck = null;
      restartSlideIndex = 0;
      renderRestartDeck();
      void runAction(
        { type: "time", action: { type: "ack-workbench-restart", settleCarryoverToWeek: true } },
        "旧遗留已安静退回本周容器",
      );
      return;
    }
    const restartExitRole = target.closest<HTMLElement>("[data-restart-exit]")?.dataset.restartExit;
    if (restartExitRole && activeRestartDeck) {
      const deck = activeRestartDeck;
      const role = restartExitRole === "parked" ? "parked" : "maintenance";
      dismissedRestartIds.add(deck.id);
      activeRestartDeck = null;
      restartSlideIndex = 0;
      renderRestartDeck();
      const applyExit = async () => {
        if (deck.kind === "workbench-gap") {
          await runAction({ type: "time", action: { type: "ack-workbench-restart" } });
        }
        if (deck.exitAreaId) {
          await runAction(
            { type: "update-area-meta", areaId: deck.exitAreaId, focusRole: role },
            role === "parked" ? "已移入搁置，不再打扰" : "已转入维护模式",
          );
          if (role === "parked") setZoom(0);
        }
      };
      void applyExit();
      return;
    }
    if (target.closest("[data-restart-start]") && activeRestartDeck) {
      const deck = activeRestartDeck;
      dismissedRestartIds.add(deck.id);
      activeRestartDeck = null;
      restartSlideIndex = 0;
      renderRestartDeck();
      const launchFocus = async () => {
        if (deck.kind === "workbench-gap") {
          await port.dispatch({ type: "time", action: { type: "ack-workbench-restart" } });
        }
        const res = await port.dispatch({
          type: "time",
          action: {
            type: "start-focus",
            title: deck.suggestedActionTitle,
            slotId: "morning",
            areaId: deck.areaId ?? null,
            projectWorkKey: deck.projectWorkKey ?? null,
            workRef: deck.workRef ?? null,
            ...(deck.focusRole ? { focusRole: deck.focusRole } : {}),
          },
        });
        if (res && !disposed) update(res);
        const active = res?.time?.activeFocus ?? snapshot?.time?.activeFocus;
        if (active && port.onFocusStarted) {
          await port.onFocusStarted(active);
        } else {
          showToast(`已进入现场并开始专注：${deck.suggestedActionTitle}`);
        }
      };
      void launchFocus().catch((e) => showToast(e instanceof Error ? e.message : "启动专注失败"));
      return;
    }
    const l2RestartKey = target.closest<HTMLElement>("[data-l2-restart]")?.dataset.l2Restart;
    if (l2RestartKey) {
      const area = findArea(snapshot.viewport.areaId);
      const proj = findProject(snapshot.viewport.areaId, l2RestartKey);
      if (area && proj) {
        const deck = buildWorkRestartDeck({ project: proj, area, snapshot, force: true });
        if (deck) openRestartDeck(deck);
      }
      return;
    }

    const tabBtn = target.closest<HTMLElement>("[data-tcs-tab], [data-schedule-tab]");
    const nextTab = tabBtn?.dataset.tcsTab ?? tabBtn?.dataset.scheduleTab;
    if (nextTab) {
      pendingFriction = null;
      void switchScheduleTab(nextTab as StageViewTab);
      return;
    }
    if (target.closest("[data-bc-l0]")) {
      setZoom(0);
      return;
    }
    const frictionChoice = target.closest<HTMLElement>("[data-friction-resolve]")?.dataset.frictionResolve;
    if (frictionChoice && pendingFriction) {
      const { date, tab, ...request } = pendingFriction;
      pendingFriction = null;
      renderSchedule(snapshot);
      if (frictionChoice === "afternoon") requestPlaceIntoSlot({ ...request, tab, slotId: "afternoon" });
      if (frictionChoice === "replace" || frictionChoice === "stack" || frictionChoice === "defer-tomorrow") {
        void placeIntoSlot(request, date, tab, frictionChoice);
      }
      return;
    }
    const direction = target.closest<HTMLElement>("[data-candidate-to-week], [data-advancement-to-week]");
    if (direction) {
      const area = findArea(direction.dataset.scheduleArea ?? null);
      const project = area?.projects.find((item) => item.workKey === direction.dataset.candidateToWeek);
      const advancement = area?.areaAdvancements.find((item) => item.id === direction.dataset.advancementToWeek);
      const title = project?.title ?? advancement?.title;
      if (title) void runAction({ type: "time", action: {
        type: "add-week-move", title, areaId: area?.id ?? null,
        ...(project ? { projectWorkKey: project.workKey, workRef: project.workRef } : {}),
        ...(advancement ? { sourceAdvancementId: advancement.id } : {}),
      } }, "已加入本周");
      return;
    }
    const weekToDay = target.closest<HTMLElement>("[data-week-to-day]")?.dataset.weekToDay;
    if (weekToDay && snapshot.time) {
      const [moveId, tab] = weekToDay.split("|");
      const move = snapshot.time.weekMoves.find((item) => item.id === moveId);
      if (move && (tab === "today" || tab === "tomorrow")) {
        requestPlaceIntoSlot({ ...move, workRef: move.workRef ?? scheduleProject(snapshot, move.projectWorkKey)?.workRef,
          context: move.lastStopNote, weekMoveId: move.id, slotId: "afternoon", tab });
      }
      return;
    }
    const place = target.closest<HTMLElement>("[data-ready-slot]");
    if (place) {
      const ready = readyForDay(snapshot, snapshot.viewport.activeTab ?? "today").find((item) => item.key === place.dataset.readyKey);
      if (ready) requestPlaceIntoSlot({ ...ready, slotId: place.dataset.readySlot as TimeSlotId });
      return;
    }
    const candidateRemove = target.closest<HTMLElement>("[data-candidate-remove]")?.dataset.candidateRemove;
    if (candidateRemove) {
      void runAction({ type: "time", action: { type: "remove-day-candidate", candidateId: candidateRemove } });
      return;
    }
    const returnDay = target.closest<HTMLElement>("[data-day-return]")?.dataset.dayReturn;
    if (returnDay) {
      void runAction({ type: "time", action: { type: "return-day-item", itemId: returnDay } });
      return;
    }
    const openDay = target.closest<HTMLElement>("[data-day-open]")?.dataset.dayOpen;
    if (openDay && snapshot.time) {
      const item = scheduleSlots(snapshot.time, snapshot.viewport.activeTab ?? "today")?.flatMap((slot) => slot.items).find((entry) => entry.id === openDay);
      if (item) {
        const project = scheduleProject(snapshot, item.projectWorkKey);
        const child = project?.childWorks.find((entry) => entry.workKey === item.projectWorkKey);
        const workRef = item.workRef ?? child?.workRef ?? project?.workRef;
        const open = workRef?.kind === "logseq" ? port.onOpenTargetInLogseq?.({ workRef, title: item.title, ...(item.projectWorkKey ? { workKey: item.projectWorkKey } : {}) }) : port.onOpenJournal?.();
        void Promise.resolve(open).catch((error) => showToast(error instanceof Error ? error.message : "打开 Logseq 失败"));
      }
      return;
    }
    const weekToggle = target.closest<HTMLElement>("[data-week-toggle]")?.dataset.weekToggle;
    if (weekToggle) {
      void runAction({ type: "time", action: { type: "toggle-week-move-state", moveId: weekToggle } });
      return;
    }
    const weekRemove = target.closest<HTMLElement>("[data-week-remove]")?.dataset.weekRemove;
    if (weekRemove) {
      void runAction({ type: "time", action: { type: "remove-week-move", moveId: weekRemove } }, "已移出本周容器");
      return;
    }
    const carryover = target.closest<HTMLElement>("[data-carryover]")?.dataset.carryover;
    if (carryover) {
      const [itemId, decision] = carryover.split("|");
      if (itemId && (decision === "to-today" || decision === "to-week" || decision === "drop")) {
        const msg = decision === "to-today" ? "已放入今日" : decision === "to-week" ? "已退回本周容器" : "已撤掉该遗留项";
        void runAction({ type: "time", action: { type: "triage-carryover", itemId, decision, ...(decision === "to-today" ? { slotId: "afternoon" } : {}) } }, msg);
      }
      return;
    }
    const dayFocus = target.closest<HTMLElement>("[data-day-focus]")?.dataset.dayFocus;
    if (dayFocus && snapshot.time) {
      const found = snapshot.time.todaySlots.flatMap((s) => s.items).find((i) => i.id === dayFocus);
      if (found) {
        const area = found.areaId ? snapshot.areas.find((a) => a.id === found.areaId) : undefined;
        void Promise.resolve(
          port.dispatch({
            type: "time",
            action: {
              type: "start-focus",
              dayItemId: found.id,
              ...(area ? { focusRole: area.focusRole } : {}),
            },
          }),
        )
          .then((res) => {
            if (res && !disposed) update(res);
            const active = res?.time?.activeFocus ?? snapshot?.time?.activeFocus;
            if (active && port.onFocusStarted) void port.onFocusStarted(active);
            else showToast(`已开始专注：${found.title}`);
          })
          .catch((e) => showToast(e instanceof Error ? e.message : "启动专注失败"));
      }
      return;
    }
    const dayShield = target.closest<HTMLElement>("[data-day-shield]")?.dataset.dayShield;
    if (dayShield) {
      void runAction(
        { type: "time", action: { type: "create-calendar-shield", itemId: dayShield } },
        "已请求写入 Apple 日历主线护盾",
      );
      return;
    }
    const dayToggle = target.closest<HTMLElement>("[data-day-toggle]")?.dataset.dayToggle;
    if (dayToggle) {
      void runAction({ type: "time", action: { type: "toggle-day-item-done", itemId: dayToggle } });
      return;
    }
    const dayRemove = target.closest<HTMLElement>("[data-day-remove]")?.dataset.dayRemove;
    if (dayRemove) {
      void runAction({ type: "time", action: { type: "remove-day-item", itemId: dayRemove } }, "已移出今日槽位");
      return;
    }
    if (target.closest("[data-focus-toggle-pause]") && snapshot.time?.activeFocus) {
      const paused = snapshot.time.activeFocus.status === "paused";
      void runAction({ type: "time", action: { type: paused ? "resume-focus" : "pause-focus" } });
      return;
    }
    if (target.closest("[data-focus-finish-open]")) {
      finishingFocusInline = true;
      renderSchedule(snapshot);
      return;
    }
    if (target.closest("[data-focus-finish-cancel]")) {
      finishingFocusInline = false;
      renderSchedule(snapshot);
      return;
    }
    const timeAccept = target.closest<HTMLElement>("[data-time-accept]")?.dataset.timeAccept;
    if (timeAccept) {
      void runAction(
        { type: "time", action: { type: "resolve-time-proposals", decisions: [{ proposalId: timeAccept, action: "accept" }] } },
        "已凝固该条时间排期",
      );
      return;
    }
    const timeDismiss = target.closest<HTMLElement>("[data-time-dismiss]")?.dataset.timeDismiss;
    if (timeDismiss) {
      void runAction({ type: "time", action: { type: "resolve-time-proposals", decisions: [{ proposalId: timeDismiss, action: "dismiss" }] } });
      return;
    }
    if (target.closest("[data-time-accept-all]") && snapshot.time) {
      const decisions = snapshot.time.ghostProposals.map((g) => ({ proposalId: g.id, action: "accept" as const }));
      void runAction(
        { type: "time", action: { type: "resolve-time-proposals", decisions } },
        `已凝固 ${decisions.length} 条排期`,
      );
      return;
    }
    if (target.closest("[data-time-dismiss-all]")) {
      void runAction({ type: "time", action: { type: "dismiss-all-time-proposals" } }, "已散去本轮虚态排期");
      return;
    }
    if (target.closest("[data-tcs-empty-coldstart]")) {
      void runAction({ type: "trigger-cold-start" });
      return;
    }
    const csCommit = target.closest<HTMLElement>("[data-cs-commit]")?.dataset.csCommit;
    if (csCommit) {
      void runAction({ type: "resolve-proposals", decisions: [{ proposalId: csCommit, action: "accept" }] }, "初始领域星图已凝固落盘");
      return;
    }
    const csDismiss = target.closest<HTMLElement>("[data-cs-dismiss]")?.dataset.csDismiss;
    if (csDismiss) {
      void runAction({ type: "resolve-proposals", decisions: [{ proposalId: csDismiss, action: "dismiss" }] });
      return;
    }
    const csMerge = target.closest<HTMLElement>("[data-cs-merge]")?.dataset.csMerge;
    if (csMerge) {
      const [proposalId, sourceAreaId, targetAreaId] = csMerge.split("|");
      if (proposalId && sourceAreaId && targetAreaId) {
        void runAction({ type: "merge-cold-start-area", proposalId, sourceAreaId, targetAreaId }, "已合并虚态领域");
      }
      return;
    }
    const csDrop = target.closest<HTMLElement>("[data-cs-drop]")?.dataset.csDrop;
    if (csDrop) {
      const [proposalId, areaId] = csDrop.split("|");
      if (proposalId && areaId) void runAction({ type: "drop-cold-start-area", proposalId, areaId });
      return;
    }
    const acceptGhost = target.closest<HTMLElement>("[data-accept-ghost]")?.dataset.acceptGhost;
    if (acceptGhost) {
      event.stopPropagation();
      void runAction({ type: "resolve-proposals", decisions: [{ proposalId: acceptGhost, action: "accept" }] }, "已由虚化实落盘");
      return;
    }
    const dismissGhost = target.closest<HTMLElement>("[data-dismiss-ghost]")?.dataset.dismissGhost;
    if (dismissGhost) {
      event.stopPropagation();
      void runAction({ type: "resolve-proposals", decisions: [{ proposalId: dismissGhost, action: "dismiss" }] });
      return;
    }
    if (target.closest("[data-pill-accept-all]")) {
      const decisions = snapshot.ghostProposals
        .filter((g) => g.kind !== "propose-areas")
        .map((g) => ({ proposalId: g.id, action: "accept" as const }));
      void runAction({ type: "resolve-proposals", decisions }, `已凝固落盘 ${decisions.length} 项`);
      return;
    }
    if (target.closest("[data-pill-dismiss-all]")) {
      void runAction({ type: "dismiss-all-proposals" }, "已散去本轮虚态推演");
      return;
    }
    const radarGo = target.closest<HTMLElement>("[data-radar-go]")?.dataset.radarGo;
    if (radarGo) {
      const [areaId, projKey] = radarGo.split("|");
      if (areaId) setZoom(projKey ? 2 : 1, areaId, projKey || null, null);
      return;
    }
    const parkArea = target.closest<HTMLElement>("[data-park-area]")?.dataset.parkArea;
    if (parkArea) {
      event.stopPropagation();
      void runAction({ type: "toggle-park-area", areaId: parkArea, parked: true }, "已标为主动搁置（移入边缘休眠区）");
      setZoom(0);
      return;
    }
    const setRole = target.closest<HTMLElement>("[data-set-role]")?.dataset.setRole;
    if (setRole) {
      event.stopPropagation();
      const [areaId, role] = setRole.split("|");
      if (areaId && (role === "main" || role === "side" || role === "maintenance" || role === "parked")) {
        void runAction(
          { type: "update-area-meta", areaId, focusRole: role },
          `已调整为「${focusRoleLabel(role)}」`,
        );
        if (role === "parked") setZoom(0);
      }
      return;
    }
    const setDomain = target.closest<HTMLElement>("[data-set-domain]")?.dataset.setDomain;
    if (setDomain) {
      event.stopPropagation();
      const [areaId, dom] = setDomain.split("|");
      if (areaId && (dom === "work" || dom === "life")) {
        void runAction(
          { type: "update-area-meta", areaId, domain: dom as StageAreaDomain },
          `已切换为「${areaDomainLabel(dom as StageAreaDomain)}」领域`,
        );
      }
      return;
    }
    if (target.closest("[data-archive-cooled]")) {
      event.preventDefault();
      event.stopPropagation();
      void runAction({ type: "archive-cooled-inbox" }, "已释怀超过 14 天的自然收起项（承诺项已保留）");
      return;
    }
    const inboxTabTarget = target.closest<HTMLElement>("[data-inbox-tab]")?.dataset.inboxTab;
    if (inboxTabTarget && (inboxTabTarget === "sweep" || inboxTabTarget === "commit" || inboxTabTarget === "spark" || inboxTabTarget === "ledger")) {
      event.stopPropagation();
      activeInboxTab = inboxTabTarget;
      userPickedInboxTab = true;
      renderInbox(snapshot);
      drawTethers();
      return;
    }
    if (target.closest("[data-refine-inbox-ai]")) {
      event.stopPropagation();
      if (refiningAi) return;
      refiningAi = true;
      renderInbox(snapshot);
      void Promise.resolve(port.dispatch({ type: "refine-inbox-ai" }))
        .then((res) => {
          refiningAi = false;
          if (res && !disposed) update(res);
          showToast("AI 轻梳理完成（仅展示建议，未改动任何原笔记）");
        })
        .catch((err) => {
          refiningAi = false;
          if (snapshot && !disposed) renderInbox(snapshot);
          showToast(err instanceof Error ? err.message : "AI 轻梳理失败，已保持本地规则结果");
        });
      return;
    }
    const sweepDoneId = target.closest<HTMLElement>("[data-sweep-done]")?.dataset.sweepDone;
    if (sweepDoneId) {
      event.stopPropagation();
      void runAction({ type: "sweep-complete", inboxId: sweepDoneId, disposition: "done" }, "已完成并记入近 7 天流转台账");
      return;
    }
    const sweepTomorrowId = target.closest<HTMLElement>("[data-sweep-tomorrow]")?.dataset.sweepTomorrow;
    if (sweepTomorrowId) {
      event.stopPropagation();
      void runAction({ type: "sweep-complete", inboxId: sweepTomorrowId, disposition: "tomorrow" }, "已锁进明日小尾巴，不再在脑中挂念");
      return;
    }
    const movePocketRaw = target.closest<HTMLElement>("[data-move-pocket]")?.dataset.movePocket;
    if (movePocketRaw) {
      event.stopPropagation();
      const [inboxId, pocket] = movePocketRaw.split("|");
      if (inboxId && (pocket === "sweep" || pocket === "commit" || pocket === "spark")) {
        void runAction(
          { type: "set-inbox-pocket", inboxId, pocket: pocket as StageInboxPocket },
          `已移入「${pocketLabel(pocket as StageInboxPocket)}」`,
        );
      }
      return;
    }
    const inboxToWeekId = target.closest<HTMLElement>("[data-inbox-to-week]")?.dataset.inboxToWeek;
    if (inboxToWeekId) {
      event.stopPropagation();
      const inboxItem = snapshot.inbox.find((i) => i.id === inboxToWeekId);
      if (inboxItem) {
        void runAction(
          {
            type: "time",
            action: {
              type: "add-week-move",
              title: inboxItem.text.slice(0, 120),
              areaId: inboxItem.matchAreaIds[0] ?? null,
              projectWorkKey: inboxItem.matchProjectWorkKeys[0] ?? null,
              sourceInboxId: inboxItem.id,
            },
          },
          "已装入本周容器",
        ).then((ok) => { if (ok) void runAction({ type: "archive-inbox-items", inboxIds: [inboxItem.id] }); });
      }
      return;
    }
    const archiveReviewId = target.closest<HTMLElement>("[data-archive-review]")?.dataset.archiveReview;
    if (archiveReviewId) {
      event.stopPropagation();
      const inboxItem = snapshot.inbox.find((i) => i.id === archiveReviewId);
      void runAction(
        {
          type: "archive-to-review",
          inboxId: archiveReviewId,
          areaId: inboxItem?.matchAreaIds[0] ?? null,
          projectWorkKey: inboxItem?.matchProjectWorkKeys[0] ?? null,
        },
        "已沉淀至本周复盘文档（带领域/项目反链）",
      );
      return;
    }
    const archiveOneId = target.closest<HTMLElement>("[data-archive-one]")?.dataset.archiveOne;
    if (archiveOneId) {
      event.stopPropagation();
      void runAction({ type: "archive-inbox-items", inboxIds: [archiveOneId] }, "已释怀归档（原文安全保留，可在台账一键撤回）");
      return;
    }
    const undoLedgerId = target.closest<HTMLElement>("[data-undo-ledger]")?.dataset.undoLedger;
    if (undoLedgerId) {
      event.stopPropagation();
      void runAction({ type: "undo-ledger-entry", entryId: undoLedgerId }, "已撤回该条流转，随想已回到对应口袋");
      return;
    }
    if (target.closest("[data-tidy-l0]")) {
      const areas = snapshot.areas;
      const hasSingleMain = areas.filter((a) => a.focusRole === "main").length === 1;
      let nonMainIdx = 0;
      let mainIdx = 0;
      const moves = areas.map((area) => {
        const pos =
          area.focusRole === "main" && hasSingleMain
            ? defaultAreaPositionForRole(0, "main", true)
            : area.focusRole === "main"
              ? defaultAreaPositionForRole(mainIdx++, "side", false)
              : defaultAreaPositionForRole(nonMainIdx++, area.focusRole, hasSingleMain);
        return { areaId: area.id, pos };
      });
      void (async () => {
        let latest: StageSnapshot | void = undefined;
        for (const m of moves) {
          latest = await port.dispatch({ type: "move-area", areaId: m.areaId, pos: m.pos });
        }
        if (latest && !disposed) update(latest);
        showToast("已按防重叠网格重新排布领域坐标");
      })().catch((err) => showToast(err instanceof Error ? err.message : "整理排布失败"));
      return;
    }
    const unparkArea = target.closest<HTMLElement>("[data-unpark-area]")?.dataset.unparkArea;
    if (unparkArea) {
      void runAction({ type: "toggle-park-area", areaId: unparkArea, parked: false }, "已唤醒领域");
      return;
    }
    const toggleAdv = target.closest<HTMLElement>("[data-toggle-adv]")?.dataset.toggleAdv;
    if (toggleAdv) {
      event.stopPropagation();
      void runAction({ type: "toggle-advancement-done", advancementId: toggleAdv });
      return;
    }
    const promoteAdv = target.closest<HTMLElement>("[data-promote-adv]")?.dataset.promoteAdv;
    if (promoteAdv) {
      event.stopPropagation();
      const proj = findProject(snapshot.viewport.areaId, snapshot.viewport.projectWorkKey) ?? null;
      const area = findArea(snapshot.viewport.areaId);
      const item =
        proj?.advancements.find((a) => a.id === promoteAdv) ??
        area?.areaAdvancements.find((a) => a.id === promoteAdv);
      if (item && port.onPromoteTodo) {
        void Promise.resolve(port.onPromoteTodo(item, proj))
          .then(() => runAction({ type: "mark-promoted-logseq", advancementId: item.id }, "已写入 Logseq TODO"))
          .catch((e) => showToast(e instanceof Error ? e.message : "写入 Logseq 失败"));
      }
      return;
    }
    if (target.closest("[data-l3-back]")) {
      zoomOut();
      return;
    }
    const openDshTarget = (targetObj: StageWorkTarget) => {
      if (!port.onOpenInDsh) return;
      void Promise.resolve(port.onOpenInDsh(targetObj))
        .then(() => showToast(`已在 DSH 打开「${targetObj.title.slice(0, 28)}」工作区`))
        .catch((err) => showToast(err instanceof Error ? err.message : "打开 DSH 工作区失败"));
    };
    const openLogseqTarget = (targetObj: StageWorkTarget) => {
      if (!port.onOpenTargetInLogseq) return;
      void Promise.resolve(port.onOpenTargetInLogseq(targetObj)).catch((err) =>
        showToast(err instanceof Error ? err.message : "打开 Logseq 原文失败"),
      );
    };
    const secAreaOpen = target.closest<HTMLElement>("[data-sec-area-open]")?.dataset.secAreaOpen;
    if (secAreaOpen) {
      event.stopPropagation();
      setZoom(1, secAreaOpen, null, null);
      return;
    }
    const openDshArea = target.closest<HTMLElement>("[data-open-dsh-area]")?.dataset.openDshArea;
    if (openDshArea) {
      event.stopPropagation();
      const area = findArea(openDshArea);
      if (area?.areaWorkRef) {
        openDshTarget({
          workRef: area.areaWorkRef,
          title: area.areaPageTitle ?? area.name,
          ...(area.areaDirectory ? { directory: area.areaDirectory } : {}),
        });
      }
      return;
    }
    const openLogseqArea = target.closest<HTMLElement>("[data-open-logseq-area]")?.dataset.openLogseqArea;
    if (openLogseqArea) {
      event.stopPropagation();
      const area = findArea(openLogseqArea);
      if (area?.areaWorkRef) {
        openLogseqTarget({
          workRef: area.areaWorkRef,
          title: area.areaPageTitle ?? area.name,
          ...(area.areaDirectory ? { directory: area.areaDirectory } : {}),
        });
      }
      return;
    }
    const openDshProj =
      target.closest<HTMLElement>("[data-open-dsh-proj]")?.dataset.openDshProj ??
      target.closest<HTMLElement>("[data-open-dsh-cross]")?.dataset.openDshCross;
    if (openDshProj) {
      event.stopPropagation();
      const [areaId, projKey] = openDshProj.split("|");
      const proj = findProject(areaId ?? null, projKey ?? null);
      if (proj) {
        openDshTarget({
          workRef: proj.workRef,
          workKey: proj.workKey,
          title: proj.title,
          ...(proj.directory ? { directory: proj.directory } : {}),
        });
      }
      return;
    }
    const openDshChild = target.closest<HTMLElement>("[data-open-dsh-child]")?.dataset.openDshChild;
    if (openDshChild) {
      event.stopPropagation();
      const [projKey, childKey] = openDshChild.split("|");
      const proj = findProject(snapshot.viewport.areaId, projKey ?? null);
      const child = proj?.childWorks.find((c) => c.workKey === childKey);
      if (child) {
        openDshTarget({
          workRef: child.workRef,
          workKey: child.workKey,
          title: child.title,
          ...(child.directory ? { directory: child.directory } : {}),
        });
      }
      return;
    }
    const openLogseqChild = target.closest<HTMLElement>("[data-open-logseq-child]")?.dataset.openLogseqChild;
    if (openLogseqChild) {
      event.stopPropagation();
      const [projKey, childKey] = openLogseqChild.split("|");
      const proj = findProject(snapshot.viewport.areaId, projKey ?? null);
      const child = proj?.childWorks.find((c) => c.workKey === childKey);
      if (child) {
        openLogseqTarget({
          workRef: child.workRef,
          workKey: child.workKey,
          title: child.title,
          ...(child.directory ? { directory: child.directory } : {}),
        });
      }
      return;
    }
    if (target.closest("[data-l2-open-dsh]") || target.closest("[data-l3-open-dsh]")) {
      const proj = findProject(snapshot.viewport.areaId, snapshot.viewport.projectWorkKey);
      if (proj) {
        openDshTarget({
          workRef: proj.workRef,
          workKey: proj.workKey,
          title: proj.title,
          ...(proj.directory ? { directory: proj.directory } : {}),
        });
      }
      return;
    }
    if (target.closest("[data-l2-open-work]") || target.closest("[data-l3-open-work]")) {
      const proj = findProject(snapshot.viewport.areaId, snapshot.viewport.projectWorkKey);
      if (proj) void port.onOpenWork?.(proj);
      return;
    }
    if (target.closest("[data-l2-open-logseq]") || target.closest("[data-l3-open-logseq]")) {
      const proj = findProject(snapshot.viewport.areaId, snapshot.viewport.projectWorkKey);
      if (proj) void port.onOpenInLogseq?.(proj);
      return;
    }
    if (target.closest("[data-l2-quote]")) {
      const area = findArea(snapshot.viewport.areaId);
      const proj = findProject(snapshot.viewport.areaId, snapshot.viewport.projectWorkKey);
      if (proj) {
        port.onQuoteToChat?.(`当前在活画布关注【${area?.name ?? "领域"} / ${proj.title}】，帮我看看接下来可以衍生出哪些具体推进任务？`);
        showToast("已将当前焦点引用到对话输入框");
      }
      return;
    }
    const l3Open = target.closest<HTMLElement>("[data-l3-open]")?.dataset.l3Open;
    if (l3Open) {
      setZoom(3, snapshot.viewport.areaId, snapshot.viewport.projectWorkKey, l3Open);
      return;
    }
    const projOpen = target.closest<HTMLElement>("[data-project-open]")?.dataset.projectOpen;
    if (projOpen) {
      event.stopPropagation();
      const [areaId, projKey] = projOpen.split("|");
      if (areaId && projKey) setZoom(2, areaId, projKey, null);
      return;
    }
    const areaOpen = target.closest<HTMLElement>("[data-area-open]")?.dataset.areaOpen;
    if (areaOpen && !target.closest("[data-area-drag]")) {
      setZoom(1, areaOpen, null, null);
      return;
    }
    const inboxCard = target.closest<HTMLElement>("[data-inbox-id]");
    if (inboxCard?.dataset.inboxId) {
      const clicked = inboxCard.dataset.inboxId;
      const nextSelected = snapshot.viewport.selectedInboxId === clicked ? null : clicked;
      void runAction({
        type: "set-viewport",
        source: port.source,
        viewport: { selectedInboxId: nextSelected },
      });
    }
  });

  const hintScheduleSlot = (target: EventTarget | null) => {
    const slot = (target as HTMLElement | null)?.closest?.<HTMLElement>("[data-ready-slot]")?.dataset.readySlot;
    stageEl.querySelectorAll<HTMLElement>("[data-drop-slot]").forEach((element) =>
      element.classList.toggle("slot-target-hint", element.dataset.dropSlot === slot));
  };
  stageEl.addEventListener("mouseover", (event) => hintScheduleSlot(event.target));
  stageEl.addEventListener("mouseout", (event) => hintScheduleSlot(event.relatedTarget));
  stageEl.addEventListener("focusin", (event) => hintScheduleSlot(event.target));
  stageEl.addEventListener("focusout", (event) => hintScheduleSlot(event.relatedTarget));

  // Hover resonance on Inbox band (0ms local)
  inboxListEl.addEventListener("mouseover", (event) => {
    const card = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-inbox-id]");
    const nextHover = card?.dataset.inboxId ?? null;
    if (nextHover !== hoveredInboxId) {
      hoveredInboxId = nextHover;
      applyResonanceClasses();
      drawTethers();
    }
  });
  inboxListEl.addEventListener("mouseleave", () => {
    if (hoveredInboxId !== null) {
      hoveredInboxId = null;
      applyResonanceClasses();
      drawTethers();
    }
  });

  // Hover Bottom Pill highlights all Ghost nodes
  pillEl.addEventListener("mouseenter", () => {
    stageEl.querySelectorAll<HTMLElement>("[data-ghost-id]").forEach((el) => el.classList.add("tcs-highlight-ring"));
  });
  pillEl.addEventListener("mouseleave", () => {
    stageEl.querySelectorAll<HTMLElement>("[data-ghost-id]").forEach((el) => el.classList.remove("tcs-highlight-ring"));
  });

  // Drag-and-drop Inbox -> Area / Project
  inboxListEl.addEventListener("dragstart", (event) => {
    const card = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-inbox-id]");
    if (!card?.dataset.inboxId) return;
    draggingInboxId = card.dataset.inboxId;
    hoveredInboxId = draggingInboxId;
    event.dataTransfer?.setData("text/plain", draggingInboxId);
    applyResonanceClasses();
    drawTethers();
  });
  inboxListEl.addEventListener("dragend", () => {
    draggingInboxId = null;
    hoveredInboxId = null;
    stageEl.querySelectorAll<HTMLElement>(".tcs-drop-active").forEach((el) => el.classList.remove("tcs-drop-active"));
    applyResonanceClasses();
    drawTethers();
  });
  stageEl.addEventListener("dragover", (event) => {
    if (!draggingInboxId) return;
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-drop-area],[data-drop-project],[data-drop-slot],[data-drop-week]");
    if (!target) return;
    event.preventDefault();
    target.classList.add("tcs-drop-active");
  });
  stageEl.addEventListener("dragleave", (event) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-drop-area],[data-drop-project],[data-drop-slot],[data-drop-week]");
    target?.classList.remove("tcs-drop-active");
  });
  stageEl.addEventListener("drop", (event) => {
    const id = draggingInboxId ?? event.dataTransfer?.getData("text/plain") ?? "";
    if (!id) return;
    const slotTarget = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-drop-slot]");
    const weekTarget = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-drop-week]");
    const projTarget = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-drop-project]");
    const areaTarget = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-drop-area]");
    if (!slotTarget && !weekTarget && !projTarget && !areaTarget) return;
    event.preventDefault();
    slotTarget?.classList.remove("tcs-drop-active");
    weekTarget?.classList.remove("tcs-drop-active");
    projTarget?.classList.remove("tcs-drop-active");
    areaTarget?.classList.remove("tcs-drop-active");
    draggingInboxId = null;
    hoveredInboxId = null;

    if (slotTarget?.dataset.dropSlot && snapshot) {
      const inboxItem = snapshot.inbox.find((i) => i.id === id);
      if (inboxItem) {
        requestPlaceIntoSlot({
          slotId: slotTarget.dataset.dropSlot as TimeSlotId,
          title: inboxItem.text.slice(0, 120),
          areaId: inboxItem.matchAreaIds[0] ?? null,
          projectWorkKey: inboxItem.matchProjectWorkKeys[0] ?? null,
          inboxId: inboxItem.id,
          workRef: inboxItem.workRef,
          context: inboxItem.sourceLabel,
        });
      }
      return;
    }
    if (weekTarget && snapshot) {
      const inboxItem = snapshot.inbox.find((i) => i.id === id);
      if (inboxItem) {
        void runAction(
          {
            type: "time",
            action: {
              type: "add-week-move",
              title: inboxItem.text.slice(0, 120),
              areaId: inboxItem.matchAreaIds[0] ?? null,
              projectWorkKey: inboxItem.matchProjectWorkKeys[0] ?? null,
              sourceInboxId: inboxItem.id,
            },
          },
          "已从 Inbox 装入本周容器",
        ).then(() => void runAction({ type: "archive-inbox-items", inboxIds: [inboxItem.id] }));
      }
      return;
    }
    if (projTarget?.dataset.dropProject) {
      const [areaId, projectWorkKey] = projTarget.dataset.dropProject.split("|");
      if (areaId && projectWorkKey) {
        void runAction({ type: "drop-inbox", inboxId: id, areaId, projectWorkKey }, "已收编进该项目");
      }
      return;
    }
    if (areaTarget?.dataset.dropArea) {
      void runAction({ type: "drop-inbox", inboxId: id, areaId: areaTarget.dataset.dropArea }, "已安放到该领域");
    }
  });

  // L0 Area spatial anchor drag
  const onMouseMove = (event: MouseEvent) => {
    if (!areaDrag) return;
    const nx = Math.max(8, areaDrag.origX + (event.clientX - areaDrag.startX));
    const ny = Math.max(8, areaDrag.origY + (event.clientY - areaDrag.startY));
    const card = stageEl.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(areaDrag.areaId)}"]`);
    if (card) {
      card.style.left = `${nx}px`;
      card.style.top = `${ny}px`;
    }
    drawTethers();
  };
  const onMouseUp = (event: MouseEvent) => {
    if (!areaDrag) return;
    const { areaId, startX, startY, origX, origY } = areaDrag;
    areaDrag = null;
    const nx = Math.max(8, origX + (event.clientX - startX));
    const ny = Math.max(8, origY + (event.clientY - startY));
    void runAction({ type: "move-area", areaId, pos: { x: nx, y: ny } }, "已更新该领域的空间老家方位");
  };
  stageEl.addEventListener("mousedown", (event) => {
    const handle = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-area-drag]");
    if (!handle?.dataset.areaDrag || !snapshot) return;
    event.preventDefault();
    event.stopPropagation();
    const area = findArea(handle.dataset.areaDrag);
    if (!area) return;
    areaDrag = { areaId: area.id, startX: event.clientX, startY: event.clientY, origX: area.pos.x, origY: area.pos.y };
  });

  const onResize = () => {
    drawL2Lines();
    drawTethers();
  };
  const onRestartKeyDown = (event: KeyboardEvent) => {
    if (!activeRestartDeck) return;
    const tag = (event.target as HTMLElement | null)?.tagName ?? "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (event.key === "Escape") {
      event.preventDefault();
      dismissRestartDeck(true);
      return;
    }
    if (event.key === "ArrowRight" || event.key === " " || event.code === "Space") {
      event.preventDefault();
      if (restartSlideIndex < activeRestartDeck.slides.length - 1) {
        restartSlideIndex++;
        renderRestartDeck();
      }
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (restartSlideIndex > 0) {
        restartSlideIndex--;
        renderRestartDeck();
      }
    }
  };
  stageEl.addEventListener("scroll", drawTethers);
  inboxListEl.addEventListener("scroll", drawTethers);
  if (typeof window !== "undefined") {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onRestartKeyDown);
  }

  return {
    update,
    focusZoomOut: zoomOut,
    dispose() {
      disposed = true;
      if (toastTimer) clearTimeout(toastTimer);
      clearTimeout(scheduleFlashTimer);
      if (typeof window !== "undefined") {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        window.removeEventListener("resize", onResize);
        window.removeEventListener("keydown", onRestartKeyDown);
      }
      root.remove();
      void styleEl;
    },
  };
}
