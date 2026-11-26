import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { ServerResponse } from "node:http";
import { WorkspaceError } from "@task-copilot/contracts";
import {
  COOLED_INBOX_DAYS,
  DEFAULT_SWEEP_WINDOW_TIME,
  StageEngine,
  classifyInboxItem,
  compactGazeSummary,
  dateKeyFromMs,
  formatRecencyLabel,
  growIdea,
  reflectToday,
  validDate,
  type GrowingIdea,
  type JournalTraceSource,
  type ReflectionAction,
  parseStageRegistry,
  recencyDays,
  type StageAreaDomain,
  type StageFocusRole,
  type StageInboxAiHint,
  type StageInboxDiagnostics,
  type StageInboxFlowDestination,
  type StageInboxFlowLedgerEntry,
  type StageInboxPocket,
  type StageInboxRawItem,
  type StageInboxSourceDiagnostic,
  type StageResolveDecision,
  type StageSnapshot,
  type StageUserAction,
  type StageViewportSource,
} from "@task-copilot/stage-runtime";
import {
  defaultIcloudInboxDirectory,
  readStageInboxState,
  scanIcloudInbox,
  watchIcloudInbox,
  writeStageInboxState,
  type IcloudInboxFsOps,
  type StageInboxCalibrationRecord,
  type StageInboxCarryoverRecord,
} from "./icloud-inbox.ts";
import {
  appendToWeeklyReview,
  formatJournalCaptureLine,
  readJournalSignals,
  readPendingJournalCaptures,
  refineInboxItemsWithFastModel,
  writeJournalSignals,
  writePendingJournalCaptures,
  type JournalInboxSignalRecord,
  type JournalSignalsFile,
  type PendingJournalCapture,
} from "./stage-inbox-store.ts";
import { readCatalog } from "./work-catalog.ts";
import { atomicJson } from "./workspace-files.ts";
import { TimeHub, type TimeHubOptions } from "./time-hub.ts";
import { resolveStageWorkspace, stageGraphLocation, type StageGraphLocation, type StageWorkspaceInfo } from "./stage-workspace.ts";

export interface StageHubOptions {
  stateDirectory: string;
  stageWorkspaceDirectory?: string;
  inboxDirectory?: string;
  icloudInboxDirectory?: string;
  icloudFsOps?: Partial<IcloudInboxFsOps>;
  watchIcloud?: boolean;
  timeHub?: TimeHub;
  appleCalendar?: TimeHubOptions["appleCalendar"];
  activateLogseq?: TimeHubOptions["activateLogseq"];
  fetchImpl?: typeof fetch;
}

interface Waiter {
  sinceVersion: number;
  resolve: (snapshot: StageSnapshot) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface PendingCapturePollWaiter {
  graphId: string | undefined;
  resolve: (captures: PendingJournalCapture[]) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface CaptureAckResult {
  blockUuid: string;
  pageName: string;
  journalDate: string;
}

const FLOW_LEDGER_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const FLOW_LEDGER_MAX_ENTRIES = 80;

const SOURCE_LABELS: Record<string, string> = {
  "ios-shortcut": "iPhone 随口记",
  "logseq-journal": "Logseq 日记",
  "agent-capture": "Agent 收录",
  manual: "手动捕获",
  flomo: "Flomo",
  logseq: "Logseq",
  dsh: "DSH 对话",
  browser: "网页摘录",
  other: "其他",
};

function defaultInboxDirectory(): string {
  const env = process.env;
  const home = homedir();
  const configured = env.PERSONAL_INBOX_HOME ?? join(env.DSH_HOME ?? join(home, ".dsh"), "personal-data", "inbox-v1");
  if (configured === "~") return home;
  if (configured.startsWith("~/") || configured.startsWith("~\\")) return join(home, configured.slice(2));
  return resolve(configured);
}

async function readPersonalInboxReadOnly(
  directory: string,
  consumedIds: ReadonlySet<string>,
  now = Date.now(),
): Promise<{ items: StageInboxRawItem[]; diagnostic: StageInboxSourceDiagnostic }> {
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return {
      items: [],
      diagnostic: {
        source: "personal-inbox",
        directory,
        status: code === "ENOENT" ? "missing" : code === "EPERM" || code === "EACCES" ? "permission-denied" : "error",
        itemCount: 0,
        cooledCount: 0,
        ...(code ? { errorCode: code } : {}),
        checkedAt: now,
      },
    };
  }
  const items: StageInboxRawItem[] = [];
  let cooledCount = 0;
  for (const name of entries) {
    if (!name.endsWith(".json") || name.startsWith(".")) continue;
    try {
      const parsed = JSON.parse(await readFile(join(directory, name), "utf8")) as { item?: Record<string, unknown> };
      const item = parsed?.item;
      if (!item || typeof item.id !== "string") continue;
      if (consumedIds.has(item.id)) continue;
      const status = typeof item.status === "string" ? item.status : "open";
      if (status === "archived" || status === "resolved") continue;
      const content =
        typeof item.editedContent === "string" && item.editedContent.trim()
          ? item.editedContent
          : typeof item.originalContent === "string"
            ? item.originalContent
            : "";
      if (!content.trim()) continue;
      const createdAt = typeof item.createdAt === "string" ? Date.parse(item.createdAt) : now;
      const updatedAt = typeof item.updatedAt === "string" ? Date.parse(item.updatedAt) : createdAt;
      const effectiveCreated = Number.isFinite(createdAt) ? createdAt : now;
      const effectiveUpdated = Number.isFinite(updatedAt) ? updatedAt : effectiveCreated;
      const srcObj = item.source && typeof item.source === "object" ? (item.source as { type?: unknown }) : null;
      const srcType = typeof srcObj?.type === "string" ? srcObj.type : "manual";
      if (recencyDays(effectiveUpdated, now) >= COOLED_INBOX_DAYS) cooledCount++;
      items.push({
        id: item.id,
        text: content.replace(/\s+/gu, " ").trim().slice(0, 400),
        status,
        createdAt: effectiveCreated,
        updatedAt: effectiveUpdated,
        sourceType: srcType,
        sourceLabel: SOURCE_LABELS[srcType] ?? "Inbox",
      });
    } catch {
      // Fail-open on any partially written or unreadable record.
    }
  }
  items.sort((a, b) => b.updatedAt - a.updatedAt);
  return {
    items,
    diagnostic: {
      source: "personal-inbox",
      directory,
      status: "ok",
      itemCount: items.length,
      cooledCount,
      checkedAt: now,
    },
  };
}

export class StageHub {
  private readonly stateDirectory: string;
  private readonly registryPath: string;
  private readonly inboxStatePath: string;
  private readonly workspacePath: string;
  private readonly configuredWorkspaceDirectory: string | undefined;
  private readonly inboxDirectory: string;
  private readonly icloudInboxDirectory: string;
  private readonly stageWorkspaceDirectory: string | undefined;
  private readonly icloudFsOps: Partial<IcloudInboxFsOps> | undefined;
  private readonly shouldWatchIcloud: boolean;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly timeHub: TimeHub;
  private readonly engine = new StageEngine();
  private readonly sseClients = new Set<ServerResponse>();
  private readonly waiters = new Set<Waiter>();
  private readonly consumedInboxIds = new Set<string>();
  private readonly archivedInboxSignatures = new Set<string>();
  private readonly latestSignatureById = new Map<string, string>();
  private readonly trackOverrides = new Map<string, StageInboxPocket>();
  private readonly tomorrowCarryover = new Map<string, StageInboxCarryoverRecord>();
  private readonly captureToBlockMap = new Map<string, string>();
  private readonly aiHints = new Map<string, StageInboxAiHint>();
  private flowLedger: StageInboxFlowLedgerEntry[] = [];
  private calibrationLog: StageInboxCalibrationRecord[] = [];
  private sweepWindowTime = DEFAULT_SWEEP_WINDOW_TIME;
  private journalSignals: JournalSignalsFile | null = null;
  private reflectionJournal: { date: string; graphId: string; blocks: JournalTraceSource[] } | undefined;
  private growingIdeas: GrowingIdea[] = [];
  private pendingCaptures: PendingJournalCapture[] = [];
  private readonly pendingPollWaiters = new Set<PendingCapturePollWaiter>();
  private readonly pendingCaptureAckWaiters = new Map<string, (ack: CaptureAckResult) => void>();
  private lastPluginHeartbeatAt = 0;
  private icloudWatcher: { close(): void } | null = null;
  private loadPromise: Promise<void> | undefined;
  private writeQueue: Promise<unknown> = Promise.resolve();
  private workspaceQueue: Promise<unknown> = Promise.resolve();
  private activeGraph: StageGraphLocation | undefined;
  private resolvedWorkspace: StageWorkspaceInfo | undefined;
  private appUrl: string | undefined;

  constructor(options: StageHubOptions) {
    this.stateDirectory = resolve(options.stateDirectory);
    this.registryPath = join(this.stateDirectory, "stage-areas.json");
    this.inboxStatePath = join(this.stateDirectory, "stage-inbox-state.json");
    this.workspacePath = join(this.stateDirectory, "stage-workspace.json");
    this.configuredWorkspaceDirectory = options.stageWorkspaceDirectory;
    this.inboxDirectory = resolve(options.inboxDirectory ?? defaultInboxDirectory());
    this.icloudInboxDirectory = resolve(options.icloudInboxDirectory ?? defaultIcloudInboxDirectory());
    this.stageWorkspaceDirectory = options.stageWorkspaceDirectory ? resolve(options.stageWorkspaceDirectory) : undefined;
    this.icloudFsOps = options.icloudFsOps;
    this.shouldWatchIcloud = options.watchIcloud ?? !options.icloudFsOps;
    this.fetchImpl = options.fetchImpl;
    this.timeHub =
      options.timeHub ??
      new TimeHub({
        stateDirectory: this.stateDirectory,
        ...(options.appleCalendar ? { appleCalendar: options.appleCalendar } : {}),
        ...(options.activateLogseq ? { activateLogseq: options.activateLogseq } : {}),
      });
  }

  getTimeHub(): TimeHub {
    return this.timeHub;
  }

  async notifyExternalChange(): Promise<StageSnapshot> {
    await this.ensureLoaded();
    this.engine.touchVersion();
    return this.broadcast();
  }

  setAppUrl(url: string): void {
    this.appUrl = url;
  }

  getAppUrl(): string | undefined {
    return this.appUrl;
  }

  private async readActiveGraph(): Promise<StageGraphLocation> {
    if (!this.activeGraph) {
      try {
        const saved = JSON.parse(await readFile(this.workspacePath, "utf8")) as Record<string, unknown>;
        this.activeGraph = stageGraphLocation(saved);
        if (typeof saved.stageWorkspaceDir === "string" &&
            (saved.source === "configured" || saved.source === "graph" || saved.source === "fallback")) {
          this.resolvedWorkspace = { stageWorkspaceDir: saved.stageWorkspaceDir, source: saved.source };
        }
      } catch {
        // This is derived local metadata. The next Logseq heartbeat can rebuild it.
        this.activeGraph = {};
      }
    }
    return this.activeGraph;
  }

  private async saveActiveGraph(graph: StageGraphLocation): Promise<void> {
    if (JSON.stringify(graph) === JSON.stringify(await this.readActiveGraph())) return;
    await atomicJson(this.workspacePath, graph);
    this.activeGraph = graph;
    this.resolvedWorkspace = undefined;
  }

  private withWorkspace<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.workspaceQueue.then(operation);
    this.workspaceQueue = pending.catch(() => undefined);
    return pending;
  }

  reportActiveGraph(graph: StageGraphLocation): Promise<void> {
    return this.withWorkspace(() => this.saveActiveGraph(graph));
  }

  workspace(graph?: StageGraphLocation): Promise<StageWorkspaceInfo> {
    return this.withWorkspace(async () => {
      if (graph) await this.saveActiveGraph(graph);
      const currentGraph = await this.readActiveGraph();
      const workspace = await resolveStageWorkspace(this.stateDirectory, currentGraph, this.configuredWorkspaceDirectory);
      if (workspace.stageWorkspaceDir !== this.resolvedWorkspace?.stageWorkspaceDir || workspace.source !== this.resolvedWorkspace?.source) {
        await atomicJson(this.workspacePath, { ...currentGraph, ...workspace });
        this.resolvedWorkspace = workspace;
      }
      return workspace;
    });
  }

  private ensureLoaded(): Promise<void> {
    return this.loadPromise ??= this.loadRegistry();
  }

  private async loadRegistry(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.registryPath, "utf8")) as unknown;
      const parsed = parseStageRegistry(raw);
      for (const adv of parsed.advancements) {
        if (adv.sourceInboxId) this.consumedInboxIds.add(adv.sourceInboxId);
      }
      this.engine.replaceRegistry(parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        // Corrupt registry falls back cleanly to empty operational state; never blocks Companion.
      }
    }
    const [inboxState, journalSignals, pendingCaptures, growingIdeas] = await Promise.all([
      readStageInboxState(this.inboxStatePath),
      readJournalSignals(this.stateDirectory),
      readPendingJournalCaptures(this.stateDirectory),
      readFile(join(this.stateDirectory, "stage-growing-ideas.json"), "utf8").then(text => JSON.parse(text) as GrowingIdea[]).catch(() => []),
    ]);
    for (const id of inboxState.archivedIds) this.consumedInboxIds.add(id);
    for (const sig of inboxState.archivedSignatures) this.archivedInboxSignatures.add(sig);
    for (const [k, v] of Object.entries(inboxState.trackOverrides ?? {})) this.trackOverrides.set(k, v);
    for (const [k, v] of Object.entries(inboxState.tomorrowCarryover ?? {})) this.tomorrowCarryover.set(k, v);
    for (const [k, v] of Object.entries(inboxState.captureToBlockMap ?? {})) this.captureToBlockMap.set(k, v);
    for (const [k, v] of Object.entries(inboxState.aiHints ?? {})) this.aiHints.set(k, v);
    this.flowLedger = inboxState.flowLedger ?? [];
    this.calibrationLog = inboxState.calibrationLog ?? [];
    this.sweepWindowTime = inboxState.sweepWindowTime ?? DEFAULT_SWEEP_WINDOW_TIME;
    this.journalSignals = journalSignals;
    this.pendingCaptures = pendingCaptures;
    if (Array.isArray(growingIdeas)) this.growingIdeas = growingIdeas;

    if (this.shouldWatchIcloud && !this.icloudWatcher) {
      this.icloudWatcher = watchIcloudInbox(this.icloudInboxDirectory, () => {
        this.engine.touchVersion();
        void this.broadcast();
      });
    }
  }

  private persistRegistry(): Promise<void> {
    const snapshot = this.engine.getRegistry();
    const pending = this.writeQueue.then(() => atomicJson(this.registryPath, snapshot));
    this.writeQueue = pending.catch(() => undefined);
    return pending;
  }

  private persistInboxState(): Promise<void> {
    const cutoff = Date.now() - FLOW_LEDGER_RETENTION_MS;
    this.flowLedger = this.flowLedger
      .filter((entry) => entry.at >= cutoff)
      .slice(0, FLOW_LEDGER_MAX_ENTRIES);
    const state = {
      schemaVersion: 2 as const,
      archivedIds: [...this.consumedInboxIds],
      archivedSignatures: [...this.archivedInboxSignatures],
      trackOverrides: Object.fromEntries(this.trackOverrides.entries()),
      tomorrowCarryover: Object.fromEntries(this.tomorrowCarryover.entries()),
      captureToBlockMap: Object.fromEntries(this.captureToBlockMap.entries()),
      flowLedger: this.flowLedger,
      calibrationLog: this.calibrationLog.slice(-200),
      aiHints: Object.fromEntries(this.aiHints.entries()),
      sweepWindowTime: this.sweepWindowTime,
      updatedAt: Date.now(),
    };
    const pending = this.writeQueue.then(() => writeStageInboxState(this.inboxStatePath, state));
    this.writeQueue = pending.catch(() => undefined);
    return pending;
  }

  private persistPendingCaptures(): Promise<void> {
    const copy = structuredClone(this.pendingCaptures);
    const pending = this.writeQueue.then(() => writePendingJournalCaptures(this.stateDirectory, copy));
    this.writeQueue = pending.catch(() => undefined);
    return pending;
  }

  private persistJournalSignals(): Promise<void> {
    if (!this.journalSignals) return Promise.resolve();
    const copy = structuredClone(this.journalSignals);
    const pending = this.writeQueue.then(() => writeJournalSignals(this.stateDirectory, copy));
    this.writeQueue = pending.catch(() => undefined);
    return pending;
  }

  private appendLedgerEntry(input: {
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
    now: number;
  }): StageInboxFlowLedgerEntry {
    const entry: StageInboxFlowLedgerEntry = {
      id: `flow-${input.now.toString(36)}-${randomUUID().slice(0, 6)}`,
      inboxId: input.inboxId,
      text: input.text.slice(0, 200),
      sourceType: input.sourceType,
      sourceLabel: input.sourceLabel,
      fromPocket: input.fromPocket,
      destination: input.destination,
      destinationLabel: input.destinationLabel,
      ...(input.targetId ? { targetId: input.targetId } : {}),
      ...(input.targetTitle ? { targetTitle: input.targetTitle.slice(0, 80) } : {}),
      ...(input.reviewFilePath ? { reviewFilePath: input.reviewFilePath } : {}),
      ...(input.originRef ? { originRef: input.originRef } : {}),
      at: input.now,
    };
    this.flowLedger.unshift(entry);
    if (this.flowLedger.length > FLOW_LEDGER_MAX_ENTRIES) {
      this.flowLedger = this.flowLedger.slice(0, FLOW_LEDGER_MAX_ENTRIES);
    }
    return entry;
  }

  private recordArchivedInboxIds(ids: readonly string[]): boolean {
    if (ids.length === 0) return false;
    let changed = false;
    for (const id of ids) {
      if (!this.consumedInboxIds.has(id)) {
        this.consumedInboxIds.add(id);
        changed = true;
      }
      const sig = this.latestSignatureById.get(id);
      if (sig && !this.archivedInboxSignatures.has(sig)) {
        this.archivedInboxSignatures.add(sig);
        changed = true;
      }
      if (this.tomorrowCarryover.delete(id)) {
        changed = true;
      }
    }
    return changed;
  }

  private buildJournalInboxItems(): StageInboxRawItem[] {
    if (!this.journalSignals) return [];
    const out: StageInboxRawItem[] = [];
    for (const sig of this.journalSignals.signals) {
      const id = `logseq-block:${sig.blockUuid}`;
      if (this.consumedInboxIds.has(id)) continue;
      const carryover = this.tomorrowCarryover.get(id);
      const hint = this.aiHints.get(id);
      out.push({
        id,
        text: sig.text,
        status: "open",
        createdAt: sig.updatedAt,
        updatedAt: sig.updatedAt,
        sourceType: "logseq-journal",
        sourceLabel: sig.journalDate ? `Logseq 日记 · ${sig.journalDate}` : "Logseq 日记",
        blockUuid: sig.blockUuid,
        workRef: { kind: "logseq", sourceKind: "block", rootUuid: sig.blockUuid, graphId: this.journalSignals.graphId },
        ...(sig.journalDate ? { journalDate: sig.journalDate } : {}),
        ...(sig.pageName ? { pageName: sig.pageName } : {}),
        ...(sig.links && sig.links.length > 0 ? { links: sig.links } : {}),
        originRef: `logseq-block:${sig.blockUuid}`,
        ...(carryover ? { carryoverDays: carryover.days } : {}),
        ...(hint ? { aiHint: hint } : {}),
      });
    }
    return out;
  }

  private buildPendingCaptureItems(): StageInboxRawItem[] {
    const out: StageInboxRawItem[] = [];
    for (const cap of this.pendingCaptures) {
      if (cap.captureId.startsWith("evening:")) continue;
      // Anti-echo: if already flushed to a known blockUuid, skip pending shadow
      if (this.captureToBlockMap.has(cap.captureId)) continue;
      const id = `capture:${cap.captureId}`;
      if (this.consumedInboxIds.has(id)) continue;
      const carryover = this.tomorrowCarryover.get(id);
      const hint = this.aiHints.get(id);
      out.push({
        id,
        text: cap.text,
        status: "open",
        createdAt: cap.createdAt,
        updatedAt: cap.createdAt,
        sourceType: "agent-capture",
        sourceLabel: `${cap.sourceAgent} 收录（待落日记）`,
        journalDate: cap.journalDate,
        ...(cap.pocketHint ? { pocketHint: cap.pocketHint } : {}),
        pendingJournalFlush: true,
        originRef: `capture:${cap.captureId}`,
        ...(carryover ? { carryoverDays: carryover.days } : {}),
        ...(hint ? { aiHint: hint } : {}),
      });
    }
    return out;
  }

  private async loadSources(now = Date.now()) {
    await this.ensureLoaded();
    const [catalog, personal, icloud] = await Promise.all([
      readCatalog(this.stateDirectory),
      readPersonalInboxReadOnly(this.inboxDirectory, this.consumedInboxIds, now),
      scanIcloudInbox({
        directory: this.icloudInboxDirectory,
        archivedIds: this.consumedInboxIds,
        archivedSignatures: this.archivedInboxSignatures,
        collectTodayVoice: this.engine.getViewport().activeTab === "reflect",
        now,
        ...(this.icloudFsOps ? { fsOps: this.icloudFsOps } : {}),
      }),
    ]);
    for (const [id, sig] of icloud.signatureById) {
      this.latestSignatureById.set(id, sig);
    }
    const journalItems = this.buildJournalInboxItems();
    const pendingCaptureItems = this.buildPendingCaptureItems();
    const seen = new Set<string>();
    const inbox: StageInboxRawItem[] = [];
    for (const item of [...pendingCaptureItems, ...icloud.items, ...journalItems, ...personal.items]) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      const carryover = this.tomorrowCarryover.get(item.id);
      const hint = this.aiHints.get(item.id);
      inbox.push({
        ...item,
        ...(carryover && !item.carryoverDays ? { carryoverDays: carryover.days } : {}),
        ...(hint && !item.aiHint ? { aiHint: hint } : {}),
      });
    }
    inbox.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
    const inboxDiagnostics: StageInboxDiagnostics = {
      icloud: icloud.diagnostic,
      personalInbox: personal.diagnostic,
      logseqJournal: {
        source: "logseq-journal",
        directory: this.journalSignals?.graphPath ?? this.journalSignals?.graphName ?? "Logseq",
        status: this.journalSignals ? "ok" : "missing",
        itemCount: journalItems.length,
        checkedAt: this.journalSignals?.updatedAt ?? now,
        ...(this.journalSignals
          ? {}
          : { message: "等待 Logseq 插件上报最近 30 天日记回捞信号。" }),
      },
      agentSpool: {
        source: "agent-spool",
        directory: join(this.stateDirectory, "stage-pending-journal.json"),
        status: "ok",
        itemCount: pendingCaptureItems.length,
        checkedAt: now,
        ...(pendingCaptureItems.length > 0
          ? { message: `有 ${pendingCaptureItems.length} 条离线 Agent 收录待 Logseq 上线后自动补写进日记。` }
          : {}),
      },
    };
    return { catalog, inbox, inboxDiagnostics, voice: icloud.todayVoice ?? [] };
  }

  async inboxStatus(): Promise<StageInboxDiagnostics> {
    const { inboxDiagnostics } = await this.loadSources();
    return inboxDiagnostics;
  }

  async snapshot(): Promise<StageSnapshot> {
    const now = Date.now();
    const [{ catalog, inbox, inboxDiagnostics, voice }, timeSnapshot] = await Promise.all([
      this.loadSources(now),
      this.timeHub.snapshot(now),
    ]);
    const cutoff = now - FLOW_LEDGER_RETENTION_MS;
    const recentLedger = this.flowLedger.filter((entry) => entry.at >= cutoff).slice(0, 50);
    const snapshot = this.engine.buildSnapshot(catalog, inbox, now, this.appUrl, inboxDiagnostics, timeSnapshot, {
      trackOverrides: Object.fromEntries(this.trackOverrides.entries()),
      flowLedger: recentLedger,
      sweepWindowTime: this.sweepWindowTime,
    });
    if (snapshot.viewport.activeTab === "reflect") {
      const date = timeSnapshot.today;
      const graphId = (await this.readActiveGraph()).graphId ?? this.journalSignals?.graphId;
      const journal = this.reflectionJournal?.date === date && this.reflectionJournal.graphId === graphId ? this.reflectionJournal : undefined;
      snapshot.reflection = reflectToday({
        date, focus: await this.timeHub.reflectionFocus(date), voice, ledger: recentLedger,
        ...(graphId ? { graphId } : {}),
        ...(journal ? { journal } : {}),
        ideas: this.growingIdeas,
        pendingNoteIds: this.pendingCaptures.filter(item => item.captureId.startsWith("evening:") && item.graphId === graphId && !this.captureToBlockMap.has(item.captureId))
          .map(item => item.captureId.slice("evening:".length)),
      });
    }
    return snapshot;
  }

  private async broadcast(): Promise<StageSnapshot> {
    const snap = await this.snapshot();
    const payload = `event: stage\ndata: ${JSON.stringify(snap)}\n\n`;
    for (const res of [...this.sseClients]) {
      if (res.destroyed || res.writableEnded) {
        this.sseClients.delete(res);
        continue;
      }
      try {
        res.write(payload);
      } catch {
        this.sseClients.delete(res);
      }
    }
    for (const waiter of [...this.waiters]) {
      if (snap.version > waiter.sinceVersion) {
        clearTimeout(waiter.timer);
        this.waiters.delete(waiter);
        waiter.resolve(snap);
      }
    }
    return snap;
  }

  async subscribeSse(response: ServerResponse): Promise<void> {
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-store",
      connection: "keep-alive",
    });
    this.sseClients.add(response);
    response.on("close", () => {
      this.sseClients.delete(response);
    });
    const initial = await this.snapshot();
    if (!response.destroyed && !response.writableEnded) {
      response.write(`event: stage\ndata: ${JSON.stringify(initial)}\n\n`);
    }
  }

  async waitForUpdate(sinceVersion: number, signal?: AbortSignal, timeoutMs = 25_000): Promise<StageSnapshot> {
    const current = await this.snapshot();
    if (current.version > sinceVersion) return current;
    return await new Promise<StageSnapshot>((resolveWait) => {
      const waiter: Waiter = {
        sinceVersion,
        resolve: resolveWait,
        timer: setTimeout(() => {
          this.waiters.delete(waiter);
          void this.snapshot().then(resolveWait);
        }, timeoutMs),
      };
      this.waiters.add(waiter);
      signal?.addEventListener(
        "abort",
        () => {
          if (this.waiters.delete(waiter)) {
            clearTimeout(waiter.timer);
            resolveWait(current);
          }
        },
        { once: true },
      );
    });
  }

  private async applyReflection(action: ReflectionAction, now: number): Promise<void> {
    await this.ensureLoaded();
    const text = action.text;
    if (typeof text !== "string" || !text.trim() || (action.type === "append-idea-note" && text.length > 600)) {
      throw new WorkspaceError("INVALID_INPUT", "请填写要保存的文字");
    }
    const id = action.type === "save-evening-note" ? action.requestId : action.entryId;
    if (typeof id !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(id)) {
      throw new WorkspaceError("INVALID_INPUT", "保存标识无效");
    }
    const date = dateKeyFromMs(now);
    if (action.type === "append-idea-note") {
      this.growingIdeas = growIdea(this.growingIdeas, {
        id, date, text, ...(action.ideaId ? { ideaId: action.ideaId } : {}),
      });
      const next = this.growingIdeas;
      const pending = this.writeQueue.then(() => atomicJson(join(this.stateDirectory, "stage-growing-ideas.json"), next));
      this.writeQueue = pending.catch(() => undefined);
      await pending;
      return;
    }
    const captureId = `evening:${id}`;
    const graphId = (await this.readActiveGraph()).graphId ?? this.journalSignals?.graphId;
    if (action.graphId !== undefined && action.graphId !== graphId) throw new WorkspaceError("INVALID_INPUT", "当前图谱已切换，请重新保存");
    if (this.captureToBlockMap.has(captureId)) return;
    if (this.pendingCaptures.some(item => item.captureId === captureId)) {
      await this.persistPendingCaptures();
      this.wakePendingPollWaiters();
      return;
    }
    if (!graphId) throw new WorkspaceError("INVALID_INPUT", "请先在 Logseq 打开要保存的图谱");
    if (!validDate(action.date) || action.date > date) throw new WorkspaceError("INVALID_INPUT", "日记日期无效");
    this.pendingCaptures.push({ captureId, graphId, text, formattedLine: "", sourceAgent: "user", journalDate: action.date, createdAt: now });
    await this.persistPendingCaptures();
    this.wakePendingPollWaiters();
  }

  async applyAction(action: StageUserAction): Promise<{
    snapshot: StageSnapshot;
    archivedInboxIds: string[];
    warning?: string;
    reviewFilePath?: string;
    activatedLogseq?: { activated: boolean; appPath: string | null; pid: number | null };
  }> {
    const now = Date.now();
    if (action.type === "save-evening-note" || action.type === "append-idea-note") {
      await this.applyReflection(action, now);
      this.engine.touchVersion();
      return { snapshot: await this.broadcast(), archivedInboxIds: [] };
    }
    if (action.type === "time") {
      await this.ensureLoaded();
      const timeResult = await this.timeHub.applyAction(action.action, now);
      this.engine.touchVersion();
      const snapshot = await this.broadcast();
      return {
        snapshot,
        archivedInboxIds: [],
        ...(timeResult.warning ? { warning: timeResult.warning } : {}),
        ...(timeResult.activatedLogseq ? { activatedLogseq: timeResult.activatedLogseq } : {}),
      };
    }

    const { catalog, inbox } = await this.loadSources(now);
    const overridesObj = Object.fromEntries(this.trackOverrides.entries());

    if (action.type === "set-inbox-pocket") {
      const target = inbox.find((i) => i.id === action.inboxId);
      if (!target) {
        return { snapshot: await this.snapshot(), archivedInboxIds: [], warning: "未找到对应的随想条目。" };
      }
      const prevCls = classifyInboxItem(target, this.trackOverrides.get(target.id));
      this.trackOverrides.set(target.id, action.pocket);
      this.calibrationLog.push({
        inboxId: target.id,
        fromPocket: prevCls.pocket,
        toPocket: action.pocket,
        ...(prevCls.prefixDetected ? { prefixDetected: prevCls.prefixDetected } : {}),
        sourceType: target.sourceType ?? "manual",
        at: now,
      });
      if (this.calibrationLog.length > 200) this.calibrationLog = this.calibrationLog.slice(-200);
      await this.persistInboxState();
      this.engine.touchVersion();
      const snapshot = await this.broadcast();
      return { snapshot, archivedInboxIds: [] };
    }

    if (action.type === "sweep-complete") {
      const target = inbox.find((i) => i.id === action.inboxId);
      if (!target) {
        return { snapshot: await this.snapshot(), archivedInboxIds: [], warning: "未找到对应的小尾巴条目。" };
      }
      const cls = classifyInboxItem(target, this.trackOverrides.get(target.id));
      if (action.disposition === "done") {
        this.recordArchivedInboxIds([target.id]);
        this.appendLedgerEntry({
          inboxId: target.id,
          text: target.text,
          sourceType: target.sourceType ?? "manual",
          sourceLabel: target.sourceLabel ?? "Inbox",
          fromPocket: cls.pocket,
          destination: "sweep-done",
          destinationLabel: "清扫完成",
          ...(target.originRef ? { originRef: target.originRef } : {}),
          now,
        });
        await this.persistInboxState();
        this.engine.touchVersion();
        const snapshot = await this.broadcast();
        return { snapshot, archivedInboxIds: [target.id] };
      }
      const todayKey = dateKeyFromMs(now);
      const prevCarry = this.tomorrowCarryover.get(target.id);
      const nextDays = prevCarry
        ? prevCarry.lastDeferredDate === todayKey
          ? prevCarry.days
          : prevCarry.days + 1
        : 1;
      this.tomorrowCarryover.set(target.id, {
        inboxId: target.id,
        firstDeferredDate: prevCarry?.firstDeferredDate ?? todayKey,
        lastDeferredDate: todayKey,
        days: nextDays,
      });
      this.appendLedgerEntry({
        inboxId: target.id,
        text: target.text,
        sourceType: target.sourceType ?? "manual",
        sourceLabel: target.sourceLabel ?? "Inbox",
        fromPocket: cls.pocket,
        destination: "sweep-tomorrow",
        destinationLabel: nextDays >= 2 ? `已顺延 ${nextDays} 天` : "锁进明日",
        ...(target.originRef ? { originRef: target.originRef } : {}),
        now,
      });
      await this.persistInboxState();
      this.engine.touchVersion();
      const snapshot = await this.broadcast();
      return { snapshot, archivedInboxIds: [] };
    }

    if (action.type === "archive-to-review") {
      const target = inbox.find((i) => i.id === action.inboxId);
      if (!target) {
        return { snapshot: await this.snapshot(), archivedInboxIds: [], warning: "未找到对应的随想条目。" };
      }
      const cls = classifyInboxItem(target, this.trackOverrides.get(target.id));
      const snap = await this.snapshot();
      const matchedArea = action.areaId
        ? snap.areas.find((a) => a.id === action.areaId)
        : snap.inbox.find((i) => i.id === target.id)?.matchAreaIds[0]
          ? snap.areas.find((a) => a.id === snap.inbox.find((i) => i.id === target.id)?.matchAreaIds[0])
          : undefined;
      const matchedProj = action.projectWorkKey
        ? snap.areas.flatMap((a) => a.projects).find((p) => p.workKey === action.projectWorkKey)
        : undefined;

      const written = await appendToWeeklyReview({
        stateDirectory: this.stateDirectory,
        graphPath: this.journalSignals?.graphPath,
        configuredDir: this.stageWorkspaceDirectory,
        summary: action.summary?.trim() || target.text,
        sourceLabel: target.sourceLabel ?? "Inbox",
        areaName: matchedArea?.name,
        projectTitle: matchedProj?.title,
        now,
      });
      this.recordArchivedInboxIds([target.id]);
      this.appendLedgerEntry({
        inboxId: target.id,
        text: target.text,
        sourceType: target.sourceType ?? "manual",
        sourceLabel: target.sourceLabel ?? "Inbox",
        fromPocket: cls.pocket,
        destination: "weekly-review",
        destinationLabel: `沉淀至 ${written.pageTitle}`,
        ...(matchedArea ? { targetId: matchedArea.id, targetTitle: matchedArea.name } : {}),
        reviewFilePath: written.filePath,
        ...(target.originRef ? { originRef: target.originRef } : {}),
        now,
      });
      await this.persistInboxState();
      this.engine.touchVersion();
      const nextSnap = await this.broadcast();
      return { snapshot: nextSnap, archivedInboxIds: [target.id], reviewFilePath: written.filePath };
    }

    if (action.type === "undo-ledger-entry") {
      const entry = this.flowLedger.find((e) => e.id === action.entryId && !e.undone);
      if (!entry) {
        return { snapshot: await this.snapshot(), archivedInboxIds: [], warning: "未找到可撤销的流转记录。" };
      }
      entry.undone = true;
      this.consumedInboxIds.delete(entry.inboxId);
      const sig = this.latestSignatureById.get(entry.inboxId);
      if (sig) this.archivedInboxSignatures.delete(sig);
      if (entry.destination === "sweep-tomorrow") {
        this.tomorrowCarryover.delete(entry.inboxId);
      }
      await this.persistInboxState();
      this.engine.touchVersion();
      const snapshot = await this.broadcast();
      return { snapshot, archivedInboxIds: [] };
    }

    if (action.type === "refine-inbox-ai") {
      const currentSnap = await this.snapshot();
      const targets =
        action.inboxIds && action.inboxIds.length > 0
          ? currentSnap.inbox.filter((i) => action.inboxIds!.includes(i.id))
          : currentSnap.inbox;
      const refined = await refineInboxItemsWithFastModel({
        stateDirectory: this.stateDirectory,
        items: targets,
        ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}),
        now,
      });
      if ("error" in refined) {
        return { snapshot: currentSnap, archivedInboxIds: [], warning: refined.error };
      }
      for (const [id, hint] of Object.entries(refined.hints)) {
        this.aiHints.set(id, hint);
      }
      await this.persistInboxState();
      this.engine.touchVersion();
      const snapshot = await this.broadcast();
      return { snapshot, archivedInboxIds: [] };
    }

    const prevAdvInboxIds =
      action.type === "undo"
        ? new Set(this.engine.getRegistry().advancements.map((a) => a.sourceInboxId).filter((id): id is string => Boolean(id)))
        : null;
    const result = this.engine.applyUserAction(action, {
      catalog,
      inbox,
      now,
      trackOverrides: overridesObj,
    });
    let inboxStateChanged = this.recordArchivedInboxIds(result.archivedInboxIds);

    // Log processed inbox items to the 7-day Flow Ledger
    if (result.archivedInboxIds.length > 0) {
      const inboxById = new Map(inbox.map((i) => [i.id, i]));
      const areasById = new Map(this.engine.getRegistry().areas.map((a) => [a.id, a]));
      for (const id of result.archivedInboxIds) {
        const rawItem = inboxById.get(id);
        if (!rawItem) continue;
        const cls = classifyInboxItem(rawItem, this.trackOverrides.get(id));
        if (action.type === "drop-inbox") {
          const areaName = areasById.get(action.areaId)?.name;
          this.appendLedgerEntry({
            inboxId: id,
            text: rawItem.text,
            sourceType: rawItem.sourceType ?? "manual",
            sourceLabel: rawItem.sourceLabel ?? "Inbox",
            fromPocket: cls.pocket,
            destination: "area-advancement",
            destinationLabel: areaName ? `安放至「${areaName}」` : "已安放至星区",
            targetId: action.areaId,
            ...(areaName ? { targetTitle: areaName } : {}),
            ...(rawItem.originRef ? { originRef: rawItem.originRef } : {}),
            now,
          });
          inboxStateChanged = true;
        } else if (action.type === "archive-inbox-items" || action.type === "archive-cooled-inbox") {
          this.appendLedgerEntry({
            inboxId: id,
            text: rawItem.text,
            sourceType: rawItem.sourceType ?? "manual",
            sourceLabel: rawItem.sourceLabel ?? "Inbox",
            fromPocket: cls.pocket,
            destination: "released",
            destinationLabel: action.type === "archive-cooled-inbox" ? "已释怀冷却项" : "已归档释怀",
            ...(rawItem.originRef ? { originRef: rawItem.originRef } : {}),
            now,
          });
          inboxStateChanged = true;
        }
      }
    }

    if (action.type === "undo" && prevAdvInboxIds) {
      const nextAdvInboxIds = new Set(
        this.engine.getRegistry().advancements.map((a) => a.sourceInboxId).filter((id): id is string => Boolean(id)),
      );
      for (const oldId of prevAdvInboxIds) {
        if (!nextAdvInboxIds.has(oldId)) {
          if (this.consumedInboxIds.delete(oldId)) inboxStateChanged = true;
          const sig = this.latestSignatureById.get(oldId);
          if (sig && this.archivedInboxSignatures.delete(sig)) inboxStateChanged = true;
        }
      }
      for (const id of nextAdvInboxIds) {
        if (!this.consumedInboxIds.has(id)) {
          this.consumedInboxIds.add(id);
          inboxStateChanged = true;
        }
      }
    }
    if (result.mutatedRegistry) {
      await this.persistRegistry();
    }
    if (inboxStateChanged) {
      await this.persistInboxState();
    }
    const snapshot = await this.broadcast();
    return { snapshot, archivedInboxIds: result.archivedInboxIds };
  }

  // ==================== LOGSEQ JOURNAL RECALL & AGENT CAPTURE SPOOL ====================

  async publishJournalSignals(input: {
    graphId: string;
    graphName: string;
    graphPath?: string;
    signals: JournalInboxSignalRecord[];
    todayJournal?: { date: string; blocks: JournalTraceSource[] };
  }): Promise<{ accepted: number; pendingCaptures: number }> {
    await this.ensureLoaded();
    this.lastPluginHeartbeatAt = Date.now();
    const prevSig = this.journalSignals ? JSON.stringify(this.journalSignals.signals) : "";
    const prevJournal = JSON.stringify(this.reflectionJournal);
    if (input.todayJournal) this.reflectionJournal = { ...input.todayJournal, graphId: input.graphId };
    const normalized: JournalSignalsFile = {
      schemaVersion: 1,
      graphId: input.graphId.slice(0, 2048),
      graphName: input.graphName.slice(0, 128),
      ...(input.graphPath && input.graphPath.startsWith("/") ? { graphPath: input.graphPath } : {}),
      updatedAt: Date.now(),
      signals: input.signals.slice(0, 200).map((s) => ({
        blockUuid: s.blockUuid.slice(0, 128),
        journalDate: s.journalDate.slice(0, 16),
        pageName: s.pageName.slice(0, 128),
        text: s.text.replace(/\s+/gu, " ").trim().slice(0, 400),
        ...(s.links && s.links.length > 0 ? { links: s.links.slice(0, 12) } : {}),
        updatedAt: Number.isFinite(s.updatedAt) ? s.updatedAt : Date.now(),
      })),
    };
    this.journalSignals = normalized;
    await this.persistJournalSignals();
    if (JSON.stringify(normalized.signals) !== prevSig || JSON.stringify(this.reflectionJournal) !== prevJournal) {
      this.engine.touchVersion();
      void this.broadcast();
    }
    return {
      accepted: normalized.signals.length,
      pendingCaptures: this.pendingForGraph(input.graphId).length,
    };
  }

  private pendingForGraph(graphId?: string): PendingJournalCapture[] {
    return this.pendingCaptures.filter(item => !this.captureToBlockMap.has(item.captureId) && (!item.graphId || item.graphId === graphId));
  }

  async getPendingJournalCaptures(graphId?: string): Promise<PendingJournalCapture[]> {
    await this.ensureLoaded();
    this.lastPluginHeartbeatAt = Date.now();
    return structuredClone(this.pendingForGraph(graphId));
  }

  async waitForPendingJournalCaptures(signal?: AbortSignal, timeoutMs = 20_000, graphId?: string): Promise<PendingJournalCapture[]> {
    await this.ensureLoaded();
    this.lastPluginHeartbeatAt = Date.now();
    const immediate = this.pendingForGraph(graphId);
    if (immediate.length > 0) return structuredClone(immediate);
    return await new Promise<PendingJournalCapture[]>((resolveWait) => {
      const waiter: PendingCapturePollWaiter = {
        graphId,
        resolve: resolveWait,
        timer: setTimeout(() => {
          this.pendingPollWaiters.delete(waiter);
          resolveWait([]);
        }, timeoutMs),
      };
      this.pendingPollWaiters.add(waiter);
      signal?.addEventListener(
        "abort",
        () => {
          if (this.pendingPollWaiters.delete(waiter)) {
            clearTimeout(waiter.timer);
            resolveWait([]);
          }
        },
        { once: true },
      );
    });
  }

  private wakePendingPollWaiters(): void {
    for (const waiter of [...this.pendingPollWaiters]) {
      const active = this.pendingForGraph(waiter.graphId);
      if (!active.length) continue;
      clearTimeout(waiter.timer);
      this.pendingPollWaiters.delete(waiter);
      waiter.resolve(structuredClone(active));
    }
  }

  async ackPendingJournalCapture(input: {
    captureId: string;
    blockUuid: string;
    pageName: string;
    journalDate: string;
    graphId?: string;
  }): Promise<{ acknowledged: boolean; remaining: number }> {
    await this.ensureLoaded();
    this.lastPluginHeartbeatAt = Date.now();
    const idx = this.pendingCaptures.findIndex((c) => c.captureId === input.captureId);
    if (input.captureId.startsWith("evening:")) {
      if (this.captureToBlockMap.get(input.captureId) === input.blockUuid) {
        return { acknowledged: true, remaining: this.pendingForGraph(input.graphId).length };
      }
      const note = this.pendingCaptures[idx];
      if (!note || note.graphId !== input.graphId || note.journalDate !== input.journalDate ||
          input.blockUuid !== input.captureId.slice("evening:".length)) {
        throw new WorkspaceError("INVALID_INPUT", "手记写入回执不匹配");
      }
      this.captureToBlockMap.set(input.captureId, input.blockUuid);
      this.consumedInboxIds.add(`logseq-block:${input.blockUuid}`);
      await this.persistInboxState();
      const current = this.pendingCaptures.indexOf(note);
      if (current >= 0) this.pendingCaptures.splice(current, 1);
      await this.persistPendingCaptures();
      this.engine.touchVersion();
      void this.broadcast();
      return { acknowledged: true, remaining: this.pendingForGraph(input.graphId).length };
    }

    const oldInboxId = `capture:${input.captureId}`;
    const newInboxId = `logseq-block:${input.blockUuid}`;
    this.captureToBlockMap.set(input.captureId, input.blockUuid);

    // Carry over any offline user triage decisions seamlessly to the canonical Logseq block ID
    if (this.consumedInboxIds.has(oldInboxId)) {
      this.consumedInboxIds.add(newInboxId);
    }
    const oldOverride = this.trackOverrides.get(oldInboxId);
    if (oldOverride && !this.trackOverrides.has(newInboxId)) {
      this.trackOverrides.set(newInboxId, oldOverride);
    }
    const oldCarry = this.tomorrowCarryover.get(oldInboxId);
    if (oldCarry && !this.tomorrowCarryover.has(newInboxId)) {
      this.tomorrowCarryover.set(newInboxId, { ...oldCarry, inboxId: newInboxId });
      this.tomorrowCarryover.delete(oldInboxId);
    }
    const oldHint = this.aiHints.get(oldInboxId);
    if (oldHint && !this.aiHints.has(newInboxId)) {
      this.aiHints.set(newInboxId, oldHint);
    }

    const removed = idx >= 0 ? this.pendingCaptures.splice(idx, 1)[0] : undefined;
    // Also proactively insert into local journalSignals cache so the stage reflects canonical block immediately
    if (removed && this.journalSignals && !this.journalSignals.signals.some((s) => s.blockUuid === input.blockUuid)) {
      this.journalSignals.signals.unshift({
        blockUuid: input.blockUuid,
        journalDate: input.journalDate || removed.journalDate,
        pageName: input.pageName || removed.journalDate,
        text: removed.formattedLine,
        updatedAt: removed.createdAt,
      });
      await this.persistJournalSignals();
    }

    await Promise.all([this.persistPendingCaptures(), this.persistInboxState()]);

    const ackWaiter = this.pendingCaptureAckWaiters.get(input.captureId);
    if (ackWaiter) {
      this.pendingCaptureAckWaiters.delete(input.captureId);
      ackWaiter({
        blockUuid: input.blockUuid,
        pageName: input.pageName,
        journalDate: input.journalDate,
      });
    }

    this.engine.touchVersion();
    void this.broadcast();
    return {
      acknowledged: true,
      remaining: this.pendingCaptures.filter((c) => !this.captureToBlockMap.has(c.captureId)).length,
    };
  }

  async mcpCaptureInbox(input: {
    text: string;
    sourceAgent: string;
    contextTitle?: string;
    contextWorkKey?: string;
    pocketHint?: StageInboxPocket;
    prefixHint?: "想法" | "注" | "急" | "承诺";
    waitOnlineMs?: number;
  }) {
    await this.ensureLoaded();
    const now = Date.now();
    const cleanText = input.text.replace(/\s+/gu, " ").trim().slice(0, 360);
    if (!cleanText) {
      throw new WorkspaceError("INVALID_INPUT", "收录内容不可为空。");
    }
    const captureId = `cap-${now.toString(36)}-${randomUUID().slice(0, 8)}`;
    const journalDate = dateKeyFromMs(now);
    const formattedLine = formatJournalCaptureLine({
      text: cleanText,
      sourceAgent: input.sourceAgent,
      ...(input.contextTitle ? { contextTitle: input.contextTitle } : {}),
      ...(input.pocketHint ? { pocketHint: input.pocketHint } : {}),
      ...(input.prefixHint ? { prefixHint: input.prefixHint } : {}),
    });

    const record: PendingJournalCapture = {
      captureId,
      text: cleanText,
      formattedLine,
      sourceAgent: input.sourceAgent.slice(0, 64),
      ...(input.contextTitle ? { contextTitle: input.contextTitle.slice(0, 120) } : {}),
      ...(input.contextWorkKey ? { contextWorkKey: input.contextWorkKey.slice(0, 512) } : {}),
      ...(input.pocketHint ? { pocketHint: input.pocketHint } : {}),
      journalDate,
      createdAt: now,
    };

    this.pendingCaptures.push(record);
    await this.persistPendingCaptures();

    const cls = classifyInboxItem({
      id: `capture:${captureId}`,
      text: formattedLine,
      sourceType: "agent-capture",
      ...(input.pocketHint ? { pocketHint: input.pocketHint } : {}),
    });

    // If Logseq plugin is actively polling/connected, wake it immediately and wait briefly for direct Journal append
    const pluginLikelyOnline =
      this.pendingPollWaiters.size > 0 || (this.lastPluginHeartbeatAt > 0 && now - this.lastPluginHeartbeatAt < 20_000);
    const waitMs = input.waitOnlineMs ?? (pluginLikelyOnline ? 2500 : 0);

    let acked: CaptureAckResult | null = null;
    if (waitMs > 0) {
      const ackPromise = new Promise<CaptureAckResult | null>((resolveAck) => {
        const timer = setTimeout(() => {
          this.pendingCaptureAckWaiters.delete(captureId);
          resolveAck(null);
        }, waitMs);
        this.pendingCaptureAckWaiters.set(captureId, (res) => {
          clearTimeout(timer);
          resolveAck(res);
        });
      });
      this.wakePendingPollWaiters();
      acked = await ackPromise;
    } else {
      this.wakePendingPollWaiters();
    }

    this.engine.touchVersion();
    const snap = await this.broadcast();

    if (acked) {
      return {
        captured: true,
        mode: "journal-appended" as const,
        captureId,
        inboxId: `logseq-block:${acked.blockUuid}`,
        blockUuid: acked.blockUuid,
        pageName: acked.pageName,
        journalDate: acked.journalDate,
        formattedLine,
        pocket: cls.pocket,
        pocketLabel: cls.pocketLabel,
        routingReason: cls.routingReason,
        immuneToCooling: cls.immuneToCooling,
        pendingJournalFlush: false,
        version: snap.version,
        message: `已直接追加至 Logseq 今日日记（${acked.pageName}），并归入「${cls.pocketLabel}」。`,
      };
    }

    return {
      captured: true,
      mode: "offline-spooled" as const,
      captureId,
      inboxId: `capture:${captureId}`,
      journalDate,
      formattedLine,
      pocket: cls.pocket,
      pocketLabel: cls.pocketLabel,
      routingReason: cls.routingReason,
      immuneToCooling: cls.immuneToCooling,
      pendingJournalFlush: true,
      version: snap.version,
      message: `Logseq 当前未在线，已安全暂存至 Companion 并同步进入活舞台「${cls.pocketLabel}」；下次打开 Logseq 将自动补写进 ${journalDate} 日记（零直接改写磁盘文件）。`,
    };
  }

  async anchorWork(workKey: string, source: StageViewportSource = "logseq"): Promise<StageSnapshot> {
    await this.ensureLoaded();
    this.engine.anchorFromWorkKey(workKey, source, Date.now());
    return this.broadcast();
  }

  // ==================== STAGE MCP OPERATIONS ====================

  async mcpGetView(agent: string, options: { projectLimit?: number; projectOffset?: number } = {}) {
    const snap = await this.snapshot();
    const { zoomLevel, areaId, projectWorkKey, selectedInboxId } = snap.viewport;
    const focusedArea = areaId ? snap.areas.find((a) => a.id === areaId) ?? null : null;
    const focusedProject =
      projectWorkKey
        ? (focusedArea?.projects.find((p) => p.workKey === projectWorkKey) ??
          snap.areas.flatMap((a) => a.projects).find((p) => p.workKey === projectWorkKey) ??
          null)
        : null;
    const focusedProjectOwnerArea =
      focusedProject
        ? (focusedArea?.projects.some((p) => p.workKey === focusedProject.workKey)
            ? focusedArea
            : snap.areas.find((a) => a.projects.some((p) => p.workKey === focusedProject.workKey)) ?? null)
        : null;
    const selectedInbox = selectedInboxId ? snap.inbox.find((i) => i.id === selectedInboxId) ?? null : null;

    if (focusedProject) this.engine.setPresence(agent, focusedProject.workKey, "viewing");
    else if (focusedArea) this.engine.setPresence(agent, focusedArea.id, "viewing");

    const defaultLimit = zoomLevel >= 2 ? 10 : 15;
    const projectLimit = Math.max(1, Math.min(50, Math.floor(options.projectLimit ?? defaultLimit)));
    const projectOffset = Math.max(0, Math.floor(options.projectOffset ?? 0));
    const areaProjects = focusedArea ? focusedArea.projects.slice(projectOffset, projectOffset + projectLimit) : [];
    const hasMoreAreaProjects = focusedArea ? projectOffset + areaProjects.length < focusedArea.projects.length : false;

    return {
      version: snap.version,
      gazeSummary: compactGazeSummary(snap),
      viewport: snap.viewport,
      focusedArea: focusedArea
        ? {
            id: focusedArea.id,
            name: focusedArea.name,
            focusRole: focusedArea.focusRole,
            domain: focusedArea.domain,
            areaDirectory: focusedArea.areaDirectory ?? null,
            quarterGoal: focusedArea.quarterGoal ?? null,
            antiGoal: focusedArea.antiGoal ?? null,
            weeklyMinimum: focusedArea.weeklyMinimum ?? null,
            mismatch: focusedArea.mismatch ?? null,
            pulseLabel: focusedArea.pulseLabel,
            signalLabel: focusedArea.signalLabel,
            projectCount: focusedArea.projects.length,
            projectOffset,
            hasMoreProjects: hasMoreAreaProjects,
            ...(hasMoreAreaProjects ? { nextProjectOffset: projectOffset + areaProjects.length } : {}),
            projects: areaProjects.map((p) => ({
              workKey: p.workKey,
              title: p.title,
              objectType: p.objectType,
              subtitle: p.subtitle,
              directory: p.directory ?? null,
              pulseLabel: p.pulseLabel,
              signalLabel: p.signalLabel,
              childCount: p.childWorks.length,
              advancementCount: p.advancements.length,
              secondaryAreas: p.secondaryAreas,
            })),
            crossAreaProjectCount: focusedArea.crossAreaProjects.length,
            crossAreaProjects: focusedArea.crossAreaProjects.slice(0, 10).map((c) => ({
              workKey: c.workKey,
              title: c.title,
              objectType: c.objectType,
              subtitle: c.subtitle,
              primaryAreaId: c.primaryAreaId,
              primaryAreaName: c.primaryAreaName,
              directory: c.directory ?? null,
              pulseLabel: c.pulseLabel,
            })),
          }
        : null,
      focusedProject: focusedProject
        ? {
            workKey: focusedProject.workKey,
            title: focusedProject.title,
            objectType: focusedProject.objectType,
            subtitle: focusedProject.subtitle,
            location: focusedProject.location,
            directory: focusedProject.directory ?? null,
            lifecycleState: focusedProject.lifecycleState ?? null,
            parentAreaId: focusedProjectOwnerArea?.id ?? focusedArea?.id ?? null,
            parentAreaName: focusedProjectOwnerArea?.name ?? focusedArea?.name ?? null,
            secondaryAreas: focusedProject.secondaryAreas,
            pulseLabel: focusedProject.pulseLabel,
            signalLabel: focusedProject.signalLabel,
            childCount: focusedProject.childWorks.length,
            childWorks: focusedProject.childWorks.slice(0, 20).map((c) => ({
              workKey: c.workKey,
              title: c.title,
              objectType: c.objectType,
              subtitle: c.subtitle,
              directory: c.directory ?? null,
              pulseLabel: c.pulseLabel,
            })),
            advancements: focusedProject.advancements,
          }
        : null,
      selectedInbox,
      visibleAreaSummaries:
        zoomLevel === 0
          ? snap.areas.map((a) => ({
              id: a.id,
              name: a.name,
              focusRole: a.focusRole,
              domain: a.domain,
              areaDirectory: a.areaDirectory ?? null,
              quarterGoal: a.quarterGoal ?? null,
              antiGoal: a.antiGoal ?? null,
              weeklyMinimum: a.weeklyMinimum ?? null,
              mismatch: a.mismatch ?? null,
              pulseLabel: a.pulseLabel,
              tone: a.tone,
              signalLabel: a.signalLabel,
              projectCount: a.projects.length,
              crossAreaProjectCount: a.crossAreaProjects.length,
              inboxMatchCount: a.inboxMatchCount,
            }))
          : undefined,
      mismatchSignals: snap.mismatchSignals,
      cooledInboxCount: snap.cooledInboxCount,
      inboxPockets: snap.inboxPockets ?? null,
      flowLedger: (snap.flowLedger ?? []).slice(0, 10),
      inboxDiagnostics: snap.inboxDiagnostics ?? null,
      restartDeck: snap.restartDeck ?? null,
      pendingGhostProposals: snap.ghostProposals,
      activeRadar: snap.edgeRadar ?? null,
      canUndo: snap.canUndo,
      needsColdStart: snap.needsColdStart,
      appUrl: snap.appUrl,
    };
  }

  async mcpGetPulse(
    options: {
      areaId?: string;
      projectLimit?: number;
      projectOffset?: number;
      unassignedLimit?: number;
      inboxLimit?: number;
    } = {},
  ) {
    const snap = await this.snapshot();
    const isAreaDrilldown = typeof options.areaId === "string" && options.areaId.length > 0;
    const filteredAreas = isAreaDrilldown ? snap.areas.filter((a) => a.id === options.areaId) : snap.areas;
    if (isAreaDrilldown && filteredAreas.length === 0) {
      throw new WorkspaceError("INVALID_INPUT", `未找到目标领域：${options.areaId}`);
    }
    const projectLimit = Math.max(1, Math.min(50, Math.floor(options.projectLimit ?? (isAreaDrilldown ? 30 : 8))));
    const projectOffset = Math.max(0, Math.floor(options.projectOffset ?? 0));
    const unassignedLimit = Math.max(0, Math.min(50, Math.floor(options.unassignedLimit ?? 20)));
    const inboxLimit = Math.max(0, Math.min(50, Math.floor(options.inboxLimit ?? 20)));

    const unassignedSlice = snap.unassignedWorks.slice(0, unassignedLimit);
    const inboxSlice = snap.inbox.slice(0, inboxLimit);

    return {
      version: snap.version,
      gazeSummary: compactGazeSummary(snap),
      needsColdStart: snap.needsColdStart,
      mismatchSignals: snap.mismatchSignals,
      areas: filteredAreas.map((a) => {
        const slicedProjects = a.projects.slice(projectOffset, projectOffset + projectLimit);
        const hasMoreProjects = projectOffset + slicedProjects.length < a.projects.length;
        return {
          id: a.id,
          name: a.name,
          focusRole: a.focusRole,
          domain: a.domain,
          areaDirectory: a.areaDirectory ?? null,
          quarterGoal: a.quarterGoal ?? null,
          antiGoal: a.antiGoal ?? null,
          weeklyMinimum: a.weeklyMinimum ?? null,
          mismatch: a.mismatch ?? null,
          pulseLabel: a.pulseLabel,
          recencyDays: a.recencyDays,
          tone: a.tone,
          signalLabel: a.signalLabel,
          annotation: a.annotation ?? null,
          inboxMatchCount: a.inboxMatchCount,
          totalProjects: a.projects.length,
          projectOffset,
          hasMoreProjects,
          ...(hasMoreProjects ? { nextProjectOffset: projectOffset + slicedProjects.length } : {}),
          projects: slicedProjects.map((p) => ({
            workKey: p.workKey,
            title: p.title,
            objectType: p.objectType,
            subtitle: p.subtitle,
            pulseLabel: p.pulseLabel,
            tone: p.tone,
            signalLabel: p.signalLabel,
            childCount: p.childWorks.length,
            advancementCount: p.advancements.length,
            hasDirectory: Boolean(p.directory),
            ...(isAreaDrilldown
              ? {
                  directory: p.directory ?? null,
                  secondaryAreas: p.secondaryAreas,
                  advancements: p.advancements,
                }
              : {}),
          })),
          crossAreaProjectCount: a.crossAreaProjects.length,
          ...(isAreaDrilldown ? { crossAreaProjects: a.crossAreaProjects } : {}),
          areaAdvancements: a.areaAdvancements,
        };
      }),
      dormantAreas: snap.dormantAreas,
      totalUnassignedWorks: snap.unassignedWorks.length,
      hasMoreUnassigned: unassignedSlice.length < snap.unassignedWorks.length,
      unassignedWorks: unassignedSlice.map((u) => {
        const uDays = recencyDays(u.updatedAt, snap.generatedAt);
        return {
          workKey: u.workKey,
          title: u.title,
          objectType: u.objectType,
          pulseLabel: formatRecencyLabel(uDays),
          recencyDays: uDays,
        };
      }),
      totalInbox: snap.inbox.length,
      hasMoreInbox: inboxSlice.length < snap.inbox.length,
      inbox: inboxSlice,
      cooledInboxCount: snap.cooledInboxCount,
      inboxPockets: snap.inboxPockets ?? null,
      flowLedger: (snap.flowLedger ?? []).slice(0, 20),
      inboxDiagnostics: snap.inboxDiagnostics ?? null,
      restartDeck: snap.restartDeck ?? null,
      pendingGhostProposals: snap.ghostProposals,
      activeRadar: snap.edgeRadar ?? null,
      canUndo: snap.canUndo,
      appUrl: snap.appUrl,
    };
  }

  async mcpHighlight(
    input:
      | { clear: true }
      | { targetIds: string[]; reason: string; tone?: "primary" | "amber" | "teal"; agent: string; clear?: false },
  ) {
    await this.ensureLoaded();
    if (input.clear) {
      const cleared = this.engine.clearHighlightsAndRadar();
      const snap = await this.broadcast();
      return { ...cleared, version: snap.version };
    }
    const res = this.engine.highlight(input, Date.now());
    const snap = await this.broadcast();
    return { ...res, version: snap.version };
  }

  async mcpAnnotate(input: { targetId: string; insight: string | null }) {
    await this.ensureLoaded();
    const res = this.engine.annotate(input, Date.now());
    if (res.persisted) await this.persistRegistry();
    const snap = await this.broadcast();
    return { ...res, version: snap.version };
  }

  async mcpProposeAreas(input: {
    agent: string;
    areas?: Array<{
      name: string;
      workKeys: string[];
      focusRole?: StageFocusRole;
      domain?: StageAreaDomain;
      quarterGoal?: string;
      antiGoal?: string;
      weeklyMinimum?: string;
    }>;
    unassignedWorkKeys?: string[];
  }) {
    const { catalog } = await this.loadSources();
    const proposal = this.engine.proposeAreas({ ...input, catalog }, Date.now());
    const snap = await this.broadcast();
    return { proposal, version: snap.version, writesFormalState: false };
  }

  async mcpProposeAreaRole(input: {
    agent: string;
    areaId: string;
    focusRole?: StageFocusRole;
    domain?: StageAreaDomain;
    quarterGoal?: string | null;
    antiGoal?: string | null;
    weeklyMinimum?: string | null;
    demoteCurrentMainTo?: "side" | "maintenance" | "parked";
    reason: string;
  }) {
    await this.ensureLoaded();
    let proposal: ReturnType<StageEngine["proposeAreaRole"]>;
    try {
      proposal = this.engine.proposeAreaRole(input, Date.now());
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("MAIN_ROLE_CONFLICT:")) {
        const [, conflictArea, conflictProposalId] = error.message.split(":");
        throw new WorkspaceError(
          "INVALID_INPUT",
          `四态护栏：已有待确认的本季主线提议（领域「${conflictArea}」，proposalId=${conflictProposalId}），同一轮最多只能提议 1 个主线；请先确认或驳回原提议。`,
        );
      }
      throw error;
    }
    if (!proposal) {
      throw new WorkspaceError("INVALID_INPUT", `未找到目标领域：${input.areaId}`);
    }
    const snap = await this.broadcast();
    return { proposal, version: snap.version, writesFormalState: false };
  }

  async mcpSproutBranches(input: {
    agent: string;
    areaId?: string;
    projectWorkKey?: string;
    branches: Array<{ title: string; reason: string; sourceInboxId?: string; sourceInboxText?: string }>;
  }) {
    await this.ensureLoaded();
    if (input.areaId && this.engine.hasAreas() && !this.engine.hasArea(input.areaId)) {
      throw new WorkspaceError("INVALID_INPUT", `未找到目标领域：${input.areaId}`);
    }
    const proposals = this.engine.sproutBranches(input, Date.now());
    const snap = await this.broadcast();
    return { proposals, version: snap.version, writesFormalState: false };
  }

  async mcpProposeMove(input: {
    agent: string;
    targetAreaId: string;
    targetProjectWorkKey?: string;
    moveWorkKey?: string;
    sourceInboxId?: string;
    sourceInboxText?: string;
    title: string;
    reason: string;
  }) {
    await this.ensureLoaded();
    const proposal = this.engine.proposeMove(input, Date.now());
    if (!proposal) {
      throw new WorkspaceError("INVALID_INPUT", `未找到目标领域：${input.targetAreaId}`);
    }
    const snap = await this.broadcast();
    return { proposal, version: snap.version, writesFormalState: false };
  }

  async mcpResolveProposals(decisions: readonly StageResolveDecision[]) {
    await this.ensureLoaded();
    const missing = this.engine.findMissingProposalIds(decisions);
    if (missing.length > 0) {
      throw new WorkspaceError("PROPOSAL_NOT_FOUND", `未找到待确认的虚态提议：${missing.join(", ")}`);
    }
    const result = this.engine.resolveProposals(decisions, Date.now());
    const inboxChanged = this.recordArchivedInboxIds(result.archivedInboxIds);
    if (result.committedIds.length > 0) await this.persistRegistry();
    if (inboxChanged) await this.persistInboxState();
    const snap = await this.broadcast();
    return { ...result, version: snap.version, operationalLayer: "companion-plan-a" };
  }

  async mcpUndoLastCommit() {
    await this.ensureLoaded();
    if (!this.engine.canUndo()) {
      throw new WorkspaceError("NOTHING_TO_UNDO", "当前没有可撤销的上一步领域层凝固操作。");
    }
    const out = await this.applyAction({ type: "undo" });
    return {
      undone: true,
      canUndo: out.snapshot.canUndo,
      version: out.snapshot.version,
      operationalLayer: "companion-plan-a",
    };
  }

  dispose(): void {
    this.icloudWatcher?.close();
    this.icloudWatcher = null;
    for (const res of this.sseClients) {
      try {
        res.end();
      } catch {
        // ignore
      }
    }
    this.sseClients.clear();
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer);
    }
    this.waiters.clear();
    for (const waiter of this.pendingPollWaiters) {
      clearTimeout(waiter.timer);
    }
    this.pendingPollWaiters.clear();
    this.pendingCaptureAckWaiters.clear();
  }
}
