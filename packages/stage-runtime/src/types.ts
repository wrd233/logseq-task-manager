import type { CatalogWork, WorkRef } from "@task-copilot/contracts";
import type { RestartDeck } from "./restart-deck.ts";
import type { StageViewTab, TimeSnapshot, TimeUserAction } from "./time-types.ts";

export type StageZoomLevel = 0 | 1 | 2 | 3;
export type StageTone = "amber" | "teal" | "mist" | "mismatch" | "none";
export type StageViewportSource = "logseq" | "dsh" | "standalone" | "agent";
export type StageFocusRole = "main" | "side" | "maintenance" | "parked";
export type StageAreaDomain = "work" | "life";

export interface StagePoint {
  x: number;
  y: number;
}

export interface StageViewport {
  activeTab?: StageViewTab;
  zoomLevel: StageZoomLevel;
  areaId: string | null;
  projectWorkKey: string | null;
  taskId: string | null;
  selectedInboxId: string | null;
  selectedNodeId: string | null;
  source: StageViewportSource;
  updatedAt: number;
}

export interface StageArea {
  id: string;
  name: string;
  workKeys: string[];
  pos: StagePoint;
  focusRole: StageFocusRole;
  domain: StageAreaDomain;
  quarterGoal?: string;
  antiGoal?: string;
  weeklyMinimum?: string;
  parked: boolean;
  parkedReason?: string;
  annotation?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Plan A (方案 A) lightweight operational advancement node stored in Companion.
 * Never impersonates Formal Kernel truth; user can explicitly promote to Logseq TODO.
 */
export interface StageAdvancementItem {
  id: string;
  areaId: string;
  projectWorkKey: string | null;
  title: string;
  reason: string;
  state: "active" | "done";
  sourceInboxId?: string;
  sourceInboxText?: string;
  sourceAgent?: string;
  createdAt: number;
  updatedAt: number;
  promotedToLogseqAt?: number;
}

export interface StageRegistryFile {
  schemaVersion: 1;
  areas: StageArea[];
  advancements: StageAdvancementItem[];
  unassignedWorkKeys: string[];
  updatedAt: number;
}

export type StageInboxPocket = "sweep" | "commit" | "spark";

export type StageInboxFlowDestination =
  | "sweep-done"
  | "sweep-tomorrow"
  | "area-advancement"
  | "week-move"
  | "day-slot"
  | "weekly-review"
  | "released"
  | "reclassified";

export interface StageInboxAiHint {
  suggestedPocket?: StageInboxPocket;
  summary?: string;
  splitCandidates?: string[];
  threadTitle?: string;
  reason?: string;
  model?: string;
  updatedAt: number;
}

export interface StageInboxFlowLedgerEntry {
  id: string;
  inboxId: string;
  text: string;
  sourceType: string;
  sourceLabel: string;
  fromPocket: StageInboxPocket;
  destination: StageInboxFlowDestination;
  destinationLabel: string;
  targetId?: string;
  targetTitle?: string;
  reviewFilePath?: string;
  originRef?: string;
  at: number;
  undone?: boolean;
}

export interface StageInboxPocketCounts {
  sweepCount: number;
  commitCount: number;
  sparkCount: number;
  sproutingCount: number;
  cooledCount: number;
  pendingJournalCount: number;
  sweepWindowTime: string;
  commitOverload: boolean;
  sweepCarryoverCount: number;
}

export interface StageInboxRawItem {
  id: string;
  text: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  sourceType?: string;
  sourceLabel?: string;
  sourcePath?: string;
  blockUuid?: string;
  journalDate?: string;
  pageName?: string;
  links?: string[];
  pocketHint?: StageInboxPocket;
  pendingJournalFlush?: boolean;
  originRef?: string;
  carryoverDays?: number;
  aiHint?: StageInboxAiHint;
}

export interface StageInboxViewItem {
  id: string;
  text: string;
  createdAt: number;
  updatedAt: number;
  sourceType: string;
  sourceLabel: string;
  ageDays: number;
  cooled: boolean;
  matchAreaIds: string[];
  matchProjectWorkKeys: string[];
  pocket: StageInboxPocket;
  pocketLabel: string;
  routingReason: string;
  prefixDetected?: string;
  failSafe?: boolean;
  immuneToCooling: boolean;
  isFeed?: boolean;
  sprouting?: boolean;
  threadId?: string;
  threadLabel?: string;
  threadCount?: number;
  carryoverDays?: number;
  pendingJournalFlush?: boolean;
  blockUuid?: string;
  journalDate?: string;
  originRef?: string;
  aiHint?: StageInboxAiHint;
}

export interface StageInboxSourceDiagnostic {
  source: "icloud" | "personal-inbox" | "logseq-journal" | "agent-spool";
  directory: string;
  status: "ok" | "missing" | "permission-denied" | "error";
  itemCount: number;
  cooledCount?: number;
  evictedCount?: number;
  evictedFiles?: string[];
  errorCode?: string;
  message?: string;
  guidance?: string;
  checkedAt: number;
}

export interface StageInboxDiagnostics {
  icloud: StageInboxSourceDiagnostic;
  personalInbox?: StageInboxSourceDiagnostic;
  logseqJournal?: StageInboxSourceDiagnostic;
  agentSpool?: StageInboxSourceDiagnostic;
}

export interface ColdStartAreaDraft {
  id: string;
  name: string;
  workKeys: string[];
  anchorTitles: string[];
  pos: StagePoint;
  focusRole?: StageFocusRole;
  domain?: StageAreaDomain;
  quarterGoal?: string;
  antiGoal?: string;
  weeklyMinimum?: string;
}

export interface StageGhostProposal {
  id: string;
  kind: "sprout-branch" | "propose-areas" | "propose-area-role" | "propose-move" | "intake-inbox";
  agent: string;
  createdAt: number;
  areaId?: string;
  projectWorkKey?: string;
  targetAreaId?: string;
  targetProjectWorkKey?: string;
  moveWorkKey?: string;
  title: string;
  reason: string;
  sourceInboxId?: string;
  sourceInboxText?: string;
  proposedAreas?: ColdStartAreaDraft[];
  proposedDormantAreas?: ColdStartAreaDraft[];
  unassignedTitles?: string[];
  proposedRole?: StageFocusRole;
  proposedDomain?: StageAreaDomain;
  proposedQuarterGoal?: string | null;
  proposedAntiGoal?: string | null;
  proposedWeeklyMinimum?: string | null;
  demoteCurrentMainTo?: "side" | "maintenance" | "parked";
}

export interface StageHighlight {
  targetId: string;
  reason: string;
  tone: "primary" | "amber" | "teal";
  agent: string;
  expiresAt: number;
}

export interface StageEdgeRadar {
  id: string;
  targetAreaId: string;
  targetProjectWorkKey?: string;
  label: string;
  reason: string;
  agent: string;
  createdAt: number;
}

export interface StageAgentPresence {
  agent: string;
  targetId: string;
  status: "viewing" | "thinking";
  updatedAt: number;
}

export interface StageWorkTarget {
  workRef: WorkRef;
  workKey?: string;
  title: string;
  directory?: string;
}

export interface StageAreaRef {
  areaId: string | null;
  areaName: string;
}

export interface StageChildWorkItem {
  workKey: string;
  workRef: WorkRef;
  title: string;
  objectType: string;
  location: string;
  subtitle: string;
  directory?: string;
  lifecycleState?: string;
  updatedAt: number;
  recencyDays: number;
  pulseLabel: string;
}

export interface StageCrossAreaProjectRef {
  workKey: string;
  workRef: WorkRef;
  title: string;
  objectType: string;
  subtitle: string;
  directory?: string;
  lifecycleState?: string;
  primaryAreaId: string;
  primaryAreaName: string;
  childCount: number;
  recencyDays: number;
  pulseLabel: string;
  tone: StageTone;
  signalLabel: string;
}

export interface StageProjectNode {
  workKey: string;
  workRef: WorkRef;
  graphId: string;
  graphName: string;
  title: string;
  objectType: string;
  location: string;
  subtitle: string;
  directory?: string;
  lifecycleState?: string;
  secondaryAreas: StageAreaRef[];
  childWorks: StageChildWorkItem[];
  updatedAt: number;
  recencyDays: number;
  pulseLabel: string;
  tone: StageTone;
  signalLabel: string;
  annotation?: string;
  advancements: StageAdvancementItem[];
  inboxMatchCount: number;
}

export interface StageMismatchSignal {
  areaId: string;
  areaName: string;
  daysSinceProgress: number;
  otherActiveAreas: Array<{ id: string; name: string; recencyDays: number }>;
  summary: string;
}

export interface StageAreaNode {
  id: string;
  name: string;
  pos: StagePoint;
  focusRole: StageFocusRole;
  domain: StageAreaDomain;
  areaWorkRef?: WorkRef;
  areaPageTitle?: string;
  areaDirectory?: string;
  quarterGoal?: string;
  antiGoal?: string;
  weeklyMinimum?: string;
  parked: boolean;
  parkedReason?: string;
  annotation?: string;
  recencyDays: number;
  pulseLabel: string;
  tone: StageTone;
  signalLabel: string;
  mismatch?: StageMismatchSignal;
  projects: StageProjectNode[];
  crossAreaProjects: StageCrossAreaProjectRef[];
  areaAdvancements: StageAdvancementItem[];
  inboxMatchCount: number;
}

export interface StageDormantArea {
  id: string;
  name: string;
  focusRole: StageFocusRole;
  domain: StageAreaDomain;
  recencyDays: number;
  parked: boolean;
  parkedReason?: string;
  projectCount: number;
}

export interface StageUnassignedWork {
  workKey: string;
  workRef: WorkRef;
  title: string;
  objectType: string;
  location: string;
  updatedAt: number;
}

export interface StageSnapshot {
  version: number;
  generatedAt: number;
  viewport: StageViewport;
  areas: StageAreaNode[];
  dormantAreas: StageDormantArea[];
  unassignedWorks: StageUnassignedWork[];
  inbox: StageInboxViewItem[];
  cooledInboxCount: number;
  inboxPockets?: StageInboxPocketCounts;
  flowLedger?: StageInboxFlowLedgerEntry[];
  mismatchSignals: StageMismatchSignal[];
  inboxDiagnostics?: StageInboxDiagnostics;
  time?: TimeSnapshot;
  restartDeck?: RestartDeck | null;
  ghostProposals: StageGhostProposal[];
  highlights: StageHighlight[];
  edgeRadar: StageEdgeRadar | null;
  presence: StageAgentPresence[];
  canUndo: boolean;
  needsColdStart: boolean;
  catalogCount: number;
  appUrl?: string;
}

export interface StageCatalogEntry extends CatalogWork {
  workKey: string;
  graphId: string;
  graphName: string;
}

export interface StageResolveDecision {
  proposalId: string;
  action: "accept" | "dismiss";
  title?: string;
}

export interface StageResolveResult {
  committedIds: string[];
  dismissedIds: string[];
  archivedInboxIds: string[];
  createdAdvancements: StageAdvancementItem[];
  canUndo: boolean;
}

export type StageUserAction =
  | { type: "set-viewport"; viewport: Partial<StageViewport>; source?: StageViewportSource }
  | { type: "move-area"; areaId: string; pos: StagePoint }
  | { type: "toggle-park-area"; areaId: string; parked: boolean; reason?: string }
  | { type: "rename-area"; areaId: string; name: string }
  | {
      type: "update-area-meta";
      areaId: string;
      focusRole?: StageFocusRole;
      domain?: StageAreaDomain;
      quarterGoal?: string | null;
      antiGoal?: string | null;
      weeklyMinimum?: string | null;
      demoteCurrentMainTo?: "side" | "maintenance" | "parked";
    }
  | { type: "trigger-cold-start"; agent?: string }
  | { type: "merge-cold-start-area"; proposalId: string; sourceAreaId: string; targetAreaId: string }
  | { type: "drop-cold-start-area"; proposalId: string; areaId: string }
  | { type: "resolve-proposals"; decisions: StageResolveDecision[] }
  | { type: "dismiss-all-proposals" }
  | { type: "drop-inbox"; inboxId: string; areaId: string; projectWorkKey?: string | null }
  | { type: "archive-inbox-items"; inboxIds: string[] }
  | { type: "archive-cooled-inbox" }
  | { type: "set-inbox-pocket"; inboxId: string; pocket: StageInboxPocket }
  | { type: "sweep-complete"; inboxId: string; disposition: "done" | "tomorrow" }
  | { type: "archive-to-review"; inboxId: string; areaId?: string | null; projectWorkKey?: string | null; summary?: string }
  | { type: "undo-ledger-entry"; entryId: string }
  | { type: "refine-inbox-ai"; inboxIds?: string[] }
  | { type: "toggle-advancement-done"; advancementId: string }
  | { type: "mark-promoted-logseq"; advancementId: string }
  | { type: "clear-radar" }
  | { type: "time"; action: TimeUserAction }
  | { type: "undo" };

export interface StageFocusRequest {
  workRef: WorkRef;
  workKey: string;
  title: string;
  action: "open-logseq" | "open-dsh" | "promote-todo";
  todoTitle?: string;
  advancementId?: string;
}
