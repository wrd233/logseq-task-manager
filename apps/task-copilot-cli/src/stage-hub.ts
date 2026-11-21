import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { ServerResponse } from "node:http";
import { WorkspaceError } from "@task-copilot/contracts";
import {
  COOLED_INBOX_DAYS,
  StageEngine,
  STAGE_VIEW_CSS,
  compactGazeSummary,
  parseStageRegistry,
  recencyDays,
  type StageAreaDomain,
  type StageFocusRole,
  type StageInboxDiagnostics,
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
} from "./icloud-inbox.ts";
import { readCatalog } from "./work-catalog.ts";
import { atomicJson } from "./workspace-files.ts";
import { TimeHub, type TimeHubOptions } from "./time-hub.ts";

export interface StageHubOptions {
  stateDirectory: string;
  inboxDirectory?: string;
  icloudInboxDirectory?: string;
  icloudFsOps?: Partial<IcloudInboxFsOps>;
  watchIcloud?: boolean;
  timeHub?: TimeHub;
  appleCalendar?: TimeHubOptions["appleCalendar"];
  activateLogseq?: TimeHubOptions["activateLogseq"];
}

interface Waiter {
  sinceVersion: number;
  resolve: (snapshot: StageSnapshot) => void;
  timer: ReturnType<typeof setTimeout>;
}

const SOURCE_LABELS: Record<string, string> = {
  "ios-shortcut": "iPhone 随口记",
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
  private readonly inboxDirectory: string;
  private readonly icloudInboxDirectory: string;
  private readonly icloudFsOps: Partial<IcloudInboxFsOps> | undefined;
  private readonly shouldWatchIcloud: boolean;
  private readonly timeHub: TimeHub;
  private readonly engine = new StageEngine();
  private readonly sseClients = new Set<ServerResponse>();
  private readonly waiters = new Set<Waiter>();
  private readonly consumedInboxIds = new Set<string>();
  private readonly archivedInboxSignatures = new Set<string>();
  private readonly latestSignatureById = new Map<string, string>();
  private icloudWatcher: { close(): void } | null = null;
  private loaded = false;
  private writeQueue: Promise<unknown> = Promise.resolve();
  private appUrl: string | undefined;

  constructor(options: StageHubOptions) {
    this.stateDirectory = resolve(options.stateDirectory);
    this.registryPath = join(this.stateDirectory, "stage-areas.json");
    this.inboxStatePath = join(this.stateDirectory, "stage-inbox-state.json");
    this.inboxDirectory = resolve(options.inboxDirectory ?? defaultInboxDirectory());
    this.icloudInboxDirectory = resolve(options.icloudInboxDirectory ?? defaultIcloudInboxDirectory());
    this.icloudFsOps = options.icloudFsOps;
    this.shouldWatchIcloud = options.watchIcloud ?? !options.icloudFsOps;
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

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
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
    const inboxState = await readStageInboxState(this.inboxStatePath);
    for (const id of inboxState.archivedIds) this.consumedInboxIds.add(id);
    for (const sig of inboxState.archivedSignatures) this.archivedInboxSignatures.add(sig);

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
    const state = {
      schemaVersion: 1 as const,
      archivedIds: [...this.consumedInboxIds],
      archivedSignatures: [...this.archivedInboxSignatures],
      updatedAt: Date.now(),
    };
    const pending = this.writeQueue.then(() => writeStageInboxState(this.inboxStatePath, state));
    this.writeQueue = pending.catch(() => undefined);
    return pending;
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
    }
    return changed;
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
        now,
        ...(this.icloudFsOps ? { fsOps: this.icloudFsOps } : {}),
      }),
    ]);
    for (const [id, sig] of icloud.signatureById) {
      this.latestSignatureById.set(id, sig);
    }
    const seen = new Set<string>();
    const inbox: StageInboxRawItem[] = [];
    for (const item of [...icloud.items, ...personal.items]) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      inbox.push(item);
    }
    inbox.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
    const inboxDiagnostics: StageInboxDiagnostics = {
      icloud: icloud.diagnostic,
      personalInbox: personal.diagnostic,
    };
    return { catalog, inbox, inboxDiagnostics };
  }

  async inboxStatus(): Promise<StageInboxDiagnostics> {
    const { inboxDiagnostics } = await this.loadSources();
    return inboxDiagnostics;
  }

  async snapshot(): Promise<StageSnapshot> {
    const now = Date.now();
    const [{ catalog, inbox, inboxDiagnostics }, timeSnapshot] = await Promise.all([
      this.loadSources(now),
      this.timeHub.snapshot(now),
    ]);
    return this.engine.buildSnapshot(catalog, inbox, now, this.appUrl, inboxDiagnostics, timeSnapshot);
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

  async applyAction(action: StageUserAction): Promise<{
    snapshot: StageSnapshot;
    archivedInboxIds: string[];
    warning?: string;
    activatedLogseq?: { activated: boolean; appPath: string | null; pid: number | null };
  }> {
    if (action.type === "time") {
      await this.ensureLoaded();
      const timeResult = await this.timeHub.applyAction(action.action, Date.now());
      this.engine.touchVersion();
      const snapshot = await this.broadcast();
      return {
        snapshot,
        archivedInboxIds: [],
        ...(timeResult.warning ? { warning: timeResult.warning } : {}),
        ...(timeResult.activatedLogseq ? { activatedLogseq: timeResult.activatedLogseq } : {}),
      };
    }
    const { catalog, inbox } = await this.loadSources();
    const prevAdvInboxIds =
      action.type === "undo"
        ? new Set(this.engine.getRegistry().advancements.map((a) => a.sourceInboxId).filter((id): id is string => Boolean(id)))
        : null;
    const result = this.engine.applyUserAction(action, { catalog, inbox, now: Date.now() });
    let inboxStateChanged = this.recordArchivedInboxIds(result.archivedInboxIds);
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

  async anchorWork(workKey: string, source: StageViewportSource = "logseq"): Promise<StageSnapshot> {
    await this.ensureLoaded();
    this.engine.anchorFromWorkKey(workKey, source, Date.now());
    return this.broadcast();
  }

  // ==================== STAGE MCP OPERATIONS ====================

  async mcpGetView(agent: string) {
    const snap = await this.snapshot();
    const { zoomLevel, areaId, projectWorkKey, selectedInboxId } = snap.viewport;
    const focusedArea = areaId ? snap.areas.find((a) => a.id === areaId) ?? null : null;
    const focusedProject =
      focusedArea && projectWorkKey
        ? focusedArea.projects.find((p) => p.workKey === projectWorkKey) ?? null
        : null;
    const selectedInbox = selectedInboxId ? snap.inbox.find((i) => i.id === selectedInboxId) ?? null : null;

    if (focusedProject) this.engine.setPresence(agent, focusedProject.workKey, "viewing");
    else if (focusedArea) this.engine.setPresence(agent, focusedArea.id, "viewing");

    return {
      gazeSummary: compactGazeSummary(snap),
      viewport: snap.viewport,
      focusedArea: focusedArea
        ? {
            id: focusedArea.id,
            name: focusedArea.name,
            focusRole: focusedArea.focusRole,
            domain: focusedArea.domain,
            quarterGoal: focusedArea.quarterGoal ?? null,
            antiGoal: focusedArea.antiGoal ?? null,
            weeklyMinimum: focusedArea.weeklyMinimum ?? null,
            mismatch: focusedArea.mismatch ?? null,
            pulseLabel: focusedArea.pulseLabel,
            signalLabel: focusedArea.signalLabel,
            projectCount: focusedArea.projects.length,
            projects: focusedArea.projects.map((p) => ({
              workKey: p.workKey,
              title: p.title,
              objectType: p.objectType,
              pulseLabel: p.pulseLabel,
              signalLabel: p.signalLabel,
              advancementCount: p.advancements.length,
            })),
          }
        : null,
      focusedProject: focusedProject
        ? {
            workKey: focusedProject.workKey,
            title: focusedProject.title,
            objectType: focusedProject.objectType,
            location: focusedProject.location,
            pulseLabel: focusedProject.pulseLabel,
            signalLabel: focusedProject.signalLabel,
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
              quarterGoal: a.quarterGoal ?? null,
              antiGoal: a.antiGoal ?? null,
              weeklyMinimum: a.weeklyMinimum ?? null,
              mismatch: a.mismatch ?? null,
              pulseLabel: a.pulseLabel,
              tone: a.tone,
              signalLabel: a.signalLabel,
              projectCount: a.projects.length,
              inboxMatchCount: a.inboxMatchCount,
            }))
          : undefined,
      mismatchSignals: snap.mismatchSignals,
      cooledInboxCount: snap.cooledInboxCount,
      inboxDiagnostics: snap.inboxDiagnostics ?? null,
      pendingGhostProposals: snap.ghostProposals,
      needsColdStart: snap.needsColdStart,
      appUrl: snap.appUrl,
    };
  }

  async mcpGetPulse() {
    const snap = await this.snapshot();
    return {
      version: snap.version,
      gazeSummary: compactGazeSummary(snap),
      needsColdStart: snap.needsColdStart,
      mismatchSignals: snap.mismatchSignals,
      areas: snap.areas.map((a) => ({
        id: a.id,
        name: a.name,
        focusRole: a.focusRole,
        domain: a.domain,
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
        projects: a.projects.map((p) => ({
          workKey: p.workKey,
          title: p.title,
          objectType: p.objectType,
          pulseLabel: p.pulseLabel,
          tone: p.tone,
          signalLabel: p.signalLabel,
          advancements: p.advancements,
        })),
        areaAdvancements: a.areaAdvancements,
      })),
      dormantAreas: snap.dormantAreas,
      unassignedWorks: snap.unassignedWorks.slice(0, 30),
      inbox: snap.inbox,
      cooledInboxCount: snap.cooledInboxCount,
      inboxDiagnostics: snap.inboxDiagnostics ?? null,
      pendingGhostProposals: snap.ghostProposals,
      appUrl: snap.appUrl,
    };
  }

  async mcpHighlight(input: { targetIds: string[]; reason: string; tone?: "primary" | "amber" | "teal"; agent: string }) {
    await this.ensureLoaded();
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
    const proposal = this.engine.proposeAreaRole(input, Date.now());
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
    const snap = await this.broadcast();
    return { proposal, version: snap.version, writesFormalState: false };
  }

  async mcpResolveProposals(decisions: readonly StageResolveDecision[]) {
    await this.ensureLoaded();
    const result = this.engine.resolveProposals(decisions, Date.now());
    const inboxChanged = this.recordArchivedInboxIds(result.archivedInboxIds);
    if (result.committedIds.length > 0) await this.persistRegistry();
    if (inboxChanged) await this.persistInboxState();
    const snap = await this.broadcast();
    return { ...result, version: snap.version, operationalLayer: "companion-plan-a" };
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
  }
}

/**
 * Self-contained, offline-ready standalone Floating Stage HTML page hosted by Companion at /stage/app.
 * Allows Codex, Antigravity, or any external MCP Agent to drive a real-time floating canvas with SSE sync.
 */
export function renderStandaloneStageHtml(token: string, instanceId: string): string {
  const safeToken = JSON.stringify(token);
  const safeInstance = JSON.stringify(instanceId);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Task Copilot · 全局态势活画布</title>
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
    ${STAGE_VIEW_CSS}
    .tcs-standalone-status { font-size: 11px; color: var(--tcs-muted); display: inline-flex; align-items: center; gap: 5px; }
  </style>
</head>
<body>
  <div id="stage-root" style="width:100vw;height:100vh;"></div>
  <script>
    (function () {
      const TOKEN = ${safeToken};
      const INSTANCE = ${safeInstance};
      const headers = {
        "content-type": "application/json",
        "authorization": "Bearer " + TOKEN,
        "x-workspace-instance": INSTANCE,
      };
      const rootEl = document.getElementById("stage-root");
      let snap = null;
      let hoveredInboxId = null;
      let draggingInboxId = null;
      let areaDrag = null;
      let prevZoom = 0;

      const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
      const darkPref = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      let theme = darkPref ? "dark" : "light";

      async function api(path, body) {
        const res = await fetch(path, { method: "POST", headers, body: JSON.stringify(body || {}) });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || "STAGE_FAILED");
        return data.value;
      }

      async function dispatch(action) {
        const out = await api("/stage/action", { action });
        if (out && out.snapshot) { snap = out.snapshot; render(); }
      }

      function render() {
        if (!snap) return;
        const anim = snap.viewport.zoomLevel >= prevZoom ? "tcs-anim-in" : "tcs-anim-out";
        prevZoom = snap.viewport.zoomLevel;
        const cold = snap.ghostProposals.find((g) => g.kind === "propose-areas");
        const area = snap.viewport.areaId ? snap.areas.find((a) => a.id === snap.viewport.areaId) : null;
        const proj = area && snap.viewport.projectWorkKey ? area.projects.find((p) => p.workKey === snap.viewport.projectWorkKey) : null;
        const hi = new Set(snap.highlights.map((h) => h.targetId));

        const activeTab = snap.viewport.activeTab || "season";
        const roleLabel = (r) => r === "main" ? "本季主线" : r === "maintenance" ? "维护" : r === "parked" ? "搁置" : "支线";
        const badgeCls = (tone) => tone === "mismatch" ? "tcs-badge-mismatch" : tone === "amber" ? "tcs-badge-amber" : tone === "teal" ? "tcs-badge-teal" : "tcs-badge-mist";
        const toneCls = (tone) => tone === "mismatch" ? "tcs-tone-mismatch" : tone === "amber" ? "tcs-tone-amber" : tone === "teal" ? "tcs-tone-teal" : "";

        let stageHtml = "";
        if (activeTab === "week" && snap.time) {
          const cap = snap.time.weekCapacity;
          stageHtml = '<div class="tcs-time-wrap ' + anim + '">' +
            '<div class="tcs-cal-strip"><div class="tcs-cal-days">' +
            cap.dailyOverview.map((d) => '<span class="tcs-cal-day ' + (d.isToday ? "is-today" : "") + (d.busyMinutes > 0 ? " is-busy" : "") + '">' + esc(d.summary) + '</span>').join("") +
            '</div><span>' + esc(cap.summary) + '</span></div>' +
            '<div class="tcs-panel"><div style="display:flex;justify-content:space-between;align-items:center"><strong>本周推进块（' + cap.openMoveCount + '/' + cap.recommendedMax + '）</strong><span class="tcs-badge tcs-badge-mist">' + esc(cap.weekKey) + '</span></div>' +
            (snap.time.weekMoves.length === 0 ? '<div class="tcs-blank-hint">本周尚未装入推进块</div>' : snap.time.weekMoves.map((m) =>
              '<div class="tcs-move-row ' + (m.state === "done" ? "is-done" : "") + '"><div style="display:flex;justify-content:space-between;gap:8px"><strong>' + esc(m.title) + '</strong><span style="font-size:11px;color:var(--tcs-muted)">已投入 ' + m.actualMinutes + 'm</span></div>' +
              '<div style="display:flex;gap:5px"><button class="tcs-btn tcs-btn-sm" data-sa-week-day="' + esc(m.id) + '|morning">排今日上午</button><button class="tcs-btn tcs-btn-sm tcs-btn-ghost" data-sa-week-toggle="' + esc(m.id) + '">' + (m.state === "done" ? "重开" : "完成") + '</button></div></div>'
            ).join("")) +
            '</div></div>';
        } else if (activeTab === "today" && snap.time) {
          const t = snap.time;
          const af = t.activeFocus;
          stageHtml = '<div class="tcs-time-wrap ' + anim + '">' +
            (af ? '<div class="tcs-focus-strip"><strong>专注中：' + esc(af.title) + (af.status === "paused" ? "（已暂停）" : "") + '</strong><div style="display:flex;gap:5px"><button class="tcs-btn tcs-btn-sm" data-sa-focus-pause>' + (af.status === "paused" ? "继续" : "暂停") + '</button><button class="tcs-btn tcs-btn-sm tcs-btn-primary" data-sa-focus-finish>结束</button></div></div>' : '') +
            (t.carryoverItems.length > 0 ? '<div class="tcs-carryover-tray"><strong>昨日遗留托盘（' + t.carryoverItems.length + '）</strong>' + t.carryoverItems.map((c) => '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>' + esc(c.title) + (c.carryoverCount >= 3 ? '（连续 ' + c.carryoverCount + ' 次遗留）' : '') + '</span><div style="display:flex;gap:5px"><button class="tcs-btn tcs-btn-sm" data-sa-carry="' + esc(c.id) + '|to-today">放入今日</button><button class="tcs-btn tcs-btn-sm tcs-btn-ghost" data-sa-carry="' + esc(c.id) + '|to-week">退回本周</button><button class="tcs-btn tcs-btn-sm tcs-btn-ghost" data-sa-carry="' + esc(c.id) + '|drop">撤掉</button></div></div>').join("") + '</div>' : '') +
            t.todaySlots.map((slot) =>
              '<div class="tcs-slot-card ' + (slot.spec.id === "morning" ? "is-morning" : "") + '"><div style="display:flex;justify-content:space-between"><strong>' + esc(slot.spec.name) + '</strong><span style="font-size:11.5px;color:var(--tcs-muted)">' + slot.items.filter((i) => i.state === "open").length + '/' + slot.spec.softCap + '</span></div>' +
              slot.hardEvents.map((ev) => '<div class="tcs-hard-event ' + (ev.isShield ? "is-shield" : "") + '"><span><strong>' + esc(ev.startTime) + '–' + esc(ev.endTime) + '</strong> ' + esc(ev.title) + '</span><span style="font-size:11px;color:var(--tcs-muted)">' + esc(ev.calendarName) + '</span></div>').join("") +
              (slot.items.length === 0 && slot.spec.allowEmptyHint ? '<div class="tcs-blank-hint">' + esc(slot.spec.allowEmptyHint) + '</div>' : '') +
              slot.items.map((item) => '<div class="tcs-move-row ' + (item.state === "done" ? "is-done" : "") + '"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>' + esc(item.title) + '</span><div style="display:flex;gap:5px">' + (item.state === "open" ? '<button class="tcs-btn tcs-btn-sm tcs-btn-primary" data-sa-focus="' + esc(item.id) + '">开始专注</button>' : '') + (slot.spec.id === "morning" && item.state === "open" && !item.calendarShield ? '<button class="tcs-btn tcs-btn-sm" data-sa-shield="' + esc(item.id) + '">写入日历护盾</button>' : '') + '<button class="tcs-btn tcs-btn-sm tcs-btn-ghost" data-sa-day-toggle="' + esc(item.id) + '">' + (item.state === "done" ? "重开" : "完成") + '</button></div></div></div>').join("") +
              '</div>'
            ).join("") +
            '</div>';
        } else if (cold) {
          const drafts = cold.proposedAreas || [];
          stageHtml = '<div class="tcs-l1-wrap tcs-anim-out">' +
            '<div class="tcs-tone-ghost" style="border-radius:13px;padding:14px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">' +
            '<div><strong style="color:var(--tcs-primary)">' + esc(cold.agent) + ' 初始星图（' + drafts.length + ' 领域）</strong><div style="font-size:12px;color:var(--tcs-muted)">' + esc(cold.reason) + '</div></div>' +
            '<div style="display:flex;gap:6px"><button class="tcs-btn tcs-btn-sm" data-cs-dismiss="' + esc(cold.id) + '">放弃</button><button class="tcs-btn tcs-btn-sm tcs-btn-primary" data-cs-commit="' + esc(cold.id) + '">✓ 一键凝固</button></div></div>' +
            '<div class="tcs-grid">' + drafts.map((d) =>
              '<div class="tcs-tone-ghost ' + (d.domain === "life" ? "tcs-domain-life" : "") + '" style="border-radius:12px;padding:13px"><div style="display:flex;justify-content:space-between;gap:6px"><strong>' + esc(d.name) + '</strong><span class="tcs-badge ' + (d.focusRole === "main" ? "tcs-badge-main" : "tcs-badge-ghost") + '">' + esc(roleLabel(d.focusRole || "side")) + (d.domain === "life" ? " · 生活" : "") + '</span></div>' +
              (d.quarterGoal ? '<div style="font-size:11.5px;color:var(--tcs-muted);margin-top:4px">目标：' + esc(d.quarterGoal) + '</div>' : '') +
              (d.weeklyMinimum ? '<div style="font-size:11.5px;color:var(--tcs-muted);margin-top:4px">周底线：' + esc(d.weeklyMinimum) + '</div>' : '') +
              '<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:5px">' +
              d.anchorTitles.map((t) => '<span style="font-size:11.5px;padding:2px 7px;border-radius:6px;background:var(--tcs-card);border:1px solid var(--tcs-card-border)">' + esc(t) + '</span>').join("") +
              '</div></div>').join("") + '</div></div>';
        } else if (snap.viewport.zoomLevel === 0) {
          if (snap.areas.length === 0) {
            stageHtml = '<div class="tcs-empty ' + anim + '"><strong>尚未建立季节领域星图</strong><div style="font-size:12px;color:var(--tcs-muted)">已发现 ' + snap.catalogCount + ' 项工作目录与 ' + snap.inbox.length + ' 条 Inbox。可一键生成初始虚态星图，或在 Codex / Antigravity 中调用 stage_propose_areas。</div><button class="tcs-btn tcs-btn-primary" data-coldstart>生成初始星图</button></div>';
          } else {
            stageHtml = '<div class="tcs-l0-board ' + anim + '">' + snap.areas.map((a) => {
              const tc = toneCls(a.tone);
              const bc = badgeCls(a.tone);
              const rc = a.focusRole === "main" ? "tcs-role-main" : a.focusRole === "maintenance" ? "tcs-role-maintenance" : "";
              const dc = a.domain === "life" ? "tcs-domain-life" : "";
              const roleGhost = snap.ghostProposals.find((g) => g.kind === "propose-area-role" && g.areaId === a.id);
              return '<div class="tcs-area-card ' + rc + ' ' + dc + ' ' + tc + (hi.has(a.id) ? " tcs-highlight-ring" : "") + '" data-node-id="' + esc(a.id) + '" data-drop-area="' + esc(a.id) + '" data-open-area="' + esc(a.id) + '" style="left:' + a.pos.x + 'px;top:' + a.pos.y + 'px">' +
                '<div style="display:flex;justify-content:space-between;gap:6px;margin-bottom:5px"><div style="display:flex;gap:4px;min-width:0"><span class="tcs-drag-handle" data-area-drag="' + esc(a.id) + '">⋮⋮</span><strong>' + esc(a.name) + '</strong></div>' +
                '<div style="display:flex;gap:4px;flex-shrink:0"><span class="tcs-badge ' + (a.focusRole === "main" ? "tcs-badge-main" : "tcs-badge-mist") + '">' + esc(roleLabel(a.focusRole)) + '</span>' + (a.domain === "life" ? '<span class="tcs-badge tcs-badge-mist">生活</span>' : '') + '</div></div>' +
                '<div style="font-size:11.5px;color:var(--tcs-muted);display:flex;justify-content:space-between;margin-bottom:6px"><span>' + esc(a.pulseLabel) + '</span><span>' + a.projects.length + ' 项' + (a.inboxMatchCount > 0 ? ' · Inbox ' + a.inboxMatchCount : '') + '</span></div>' +
                (a.signalLabel ? '<div style="margin-bottom:6px"><span class="tcs-badge ' + bc + '">' + esc(a.signalLabel) + '</span></div>' : '') +
                (a.mismatch ? '<div class="tcs-mismatch-note">' + esc(a.mismatch.summary) + '</div>' : '') +
                (a.focusRole === "main" && a.quarterGoal ? '<div class="tcs-meta-line">目标：' + esc(a.quarterGoal) + '</div>' : '') +
                (a.focusRole === "maintenance" && a.weeklyMinimum ? '<div class="tcs-meta-line">周底线：' + esc(a.weeklyMinimum) + '</div>' : '') +
                a.projects.slice(0, 3).map((p) => '<div class="tcs-mini-row" data-open-proj="' + esc(a.id) + '|' + esc(p.workKey) + '"><span style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p.title) + '</span><span>→</span></div>').join("") +
                (roleGhost ? '<div class="tcs-tone-ghost" style="margin-top:7px;padding:6px 8px;border-radius:7px;font-size:11.5px"><div style="font-weight:600;color:var(--tcs-primary)">' + esc(roleGhost.title) + '</div><div style="color:var(--tcs-muted);margin-top:2px">' + esc(roleGhost.reason) + '</div><div style="display:flex;justify-content:flex-end;gap:5px;margin-top:5px"><button class="tcs-btn tcs-btn-sm tcs-btn-ghost" data-dismiss="' + esc(roleGhost.id) + '">× 散去</button><button class="tcs-btn tcs-btn-sm tcs-btn-primary" data-accept="' + esc(roleGhost.id) + '">✓ 确认</button></div></div>' : '') +
                (a.annotation ? '<div class="tcs-badge-ghost" style="margin-top:8px;padding:4px 8px;border-radius:7px;font-size:11.5px">注：' + esc(a.annotation) + '</div>' : '') +
                '</div>';
            }).join("") + '</div>';
          }
        } else if (snap.viewport.zoomLevel === 1 && area) {
          stageHtml = '<div class="tcs-l1-wrap ' + anim + '"><div class="tcs-l1-hero"><strong>' + esc(area.name) + '</strong> <span class="tcs-badge ' + (area.focusRole === "main" ? "tcs-badge-main" : "tcs-badge-mist") + '">' + esc(roleLabel(area.focusRole)) + '</span><div style="font-size:12px;color:var(--tcs-muted);margin-top:3px">' + esc(area.pulseLabel) + '</div>' +
            (area.mismatch ? '<div class="tcs-mismatch-note">' + esc(area.mismatch.summary) + '</div>' : '') +
            (area.quarterGoal ? '<div class="tcs-meta-line">季度目标：' + esc(area.quarterGoal) + '</div>' : '') +
            (area.antiGoal ? '<div class="tcs-meta-line">反目标：' + esc(area.antiGoal) + '</div>' : '') +
            (area.weeklyMinimum ? '<div class="tcs-meta-line">每周底线：' + esc(area.weeklyMinimum) + '</div>' : '') +
            '</div><div class="tcs-grid">' +
            area.projects.map((p) => '<div class="tcs-proj-card" data-node-id="' + esc(p.workKey) + '" data-drop-proj="' + esc(area.id) + '|' + esc(p.workKey) + '" data-open-proj="' + esc(area.id) + '|' + esc(p.workKey) + '"><strong>' + esc(p.title) + '</strong><div style="font-size:11.5px;color:var(--tcs-muted);margin-top:4px">' + esc(p.pulseLabel) + '</div></div>').join("") +
            snap.ghostProposals.filter((g) => g.areaId === area.id && !g.projectWorkKey).map((g) => '<div class="tcs-tone-ghost tcs-anim-sprout" style="border-radius:12px;padding:13px"><strong>' + esc(g.title) + '</strong><div style="font-size:11.5px;color:var(--tcs-muted);margin:4px 0 8px">' + esc(g.reason) + '</div><div style="display:flex;justify-content:flex-end;gap:6px"><button class="tcs-btn tcs-btn-sm tcs-btn-ghost" data-dismiss="' + esc(g.id) + '">× 散去</button><button class="tcs-btn tcs-btn-sm tcs-btn-primary" data-accept="' + esc(g.id) + '">✓ 留下</button></div></div>').join("") +
            '</div></div>';
        } else if (area && proj) {
          const ghosts = snap.ghostProposals.filter((g) => g.projectWorkKey === proj.workKey);
          stageHtml = '<div class="tcs-l2-wrap ' + anim + '"><div class="tcs-l2-flex"><div class="tcs-l2-parent" data-node-id="' + esc(proj.workKey) + '" data-drop-proj="' + esc(area.id) + '|' + esc(proj.workKey) + '"><div style="font-size:11px;color:var(--tcs-muted)">' + esc(area.name) + '</div><strong style="font-size:15px">' + esc(proj.title) + '</strong><div style="font-size:11.5px;color:var(--tcs-muted);margin-top:6px">' + esc(proj.pulseLabel) + '</div></div>' +
            '<div class="tcs-l2-children">' +
            proj.advancements.map((adv) => '<div class="tcs-l2-node"><strong>' + esc(adv.title) + '</strong><div style="font-size:11.5px;color:var(--tcs-muted);margin-top:3px">' + esc(adv.reason) + '</div></div>').join("") +
            ghosts.map((g, i) => '<div class="tcs-l2-node tcs-tone-ghost tcs-anim-sprout" style="animation-delay:' + (i * 120) + 'ms"><strong>' + esc(g.title) + '</strong><div style="font-size:11.5px;color:var(--tcs-muted);margin:4px 0 8px">' + esc(g.reason) + '</div><div style="display:flex;justify-content:flex-end;gap:6px"><button class="tcs-btn tcs-btn-sm tcs-btn-ghost" data-dismiss="' + esc(g.id) + '">× 散去</button><button class="tcs-btn tcs-btn-sm tcs-btn-primary" data-accept="' + esc(g.id) + '">✓ 留下</button></div></div>').join("") +
            '</div></div></div>';
        }

        const nonCold = snap.ghostProposals.filter((g) => g.kind !== "propose-areas");
        const pillHtml = nonCold.length > 0
          ? '<div class="tcs-change-pill"><span class="tcs-dot tcs-pulse" style="background:var(--tcs-primary)"></span><strong>' + esc(nonCold[0].agent) + ' 提议 +' + nonCold.length + ' 项</strong><button class="tcs-btn tcs-btn-sm tcs-btn-pill tcs-btn-primary" data-accept-all>全部留下</button><button class="tcs-btn tcs-btn-sm tcs-btn-pill tcs-btn-ghost" data-dismiss-all>散去</button></div>'
          : "";
        const radarHtml = snap.edgeRadar && snap.viewport.zoomLevel > 0
          ? '<div class="tcs-radar"><button class="tcs-btn tcs-btn-pill" style="background:var(--tcs-card);border-color:var(--tcs-warning)" data-open-area="' + esc(snap.edgeRadar.targetAreaId) + '">→ ' + esc(snap.edgeRadar.label) + '</button></div>'
          : "";

        const activeInbox = snap.inbox.filter((i) => !i.cooled);
        const cooledInbox = snap.inbox.filter((i) => i.cooled);
        const icloudDiag = snap.inboxDiagnostics && snap.inboxDiagnostics.icloud && snap.inboxDiagnostics.icloud.status === "permission-denied"
          ? '<div class="tcs-diag-notice"><strong>iCloud 语音目录暂未授权</strong><div style="color:var(--tcs-muted);margin-top:3px">' + esc(snap.inboxDiagnostics.icloud.guidance || snap.inboxDiagnostics.icloud.message || "") + '</div></div>'
          : "";
        const renderInboxCard = (i) => '<div class="tcs-inbox-card ' + (snap.viewport.selectedInboxId === i.id ? "tcs-tone-amber tcs-amber-resonate" : "") + (i.cooled ? " is-dimmed" : "") + '" draggable="true" data-inbox-id="' + esc(i.id) + '"><div style="font-size:12px">' + esc(i.text) + '</div><div style="font-size:11px;color:var(--tcs-muted);margin-top:4px">' + esc(i.sourceLabel) + (i.cooled ? ' · ' + i.ageDays + '天前' : '') + '</div></div>';
        const cooledHtml = cooledInbox.length > 0
          ? '<details class="tcs-cooled-box"><summary><span>已冷却 · 14 天以上（' + cooledInbox.length + '）</span><button class="tcs-btn tcs-btn-sm tcs-btn-ghost" data-archive-cooled>一键归档</button></summary><div class="tcs-cooled-list">' + cooledInbox.map(renderInboxCard).join("") + '</div></details>'
          : "";

        rootEl.innerHTML =
          '<div class="tcs-root" data-theme="' + theme + '">' +
          '<div class="tcs-bar"><div class="tcs-bar-left">' +
          '<div class="tcs-tabs"><button class="tcs-tab ' + (activeTab === "season" ? "is-active" : "") + '" data-sa-tab="season">季节星区</button><button class="tcs-tab ' + (activeTab === "week" ? "is-active" : "") + '" data-sa-tab="week">本周容器</button><button class="tcs-tab ' + (activeTab === "today" ? "is-active" : "") + '" data-sa-tab="today">今日容器</button></div>' +
          (activeTab === "season" ? '<button class="tcs-btn" data-zoom-out ' + (snap.viewport.zoomLevel === 0 && !cold ? "disabled" : "") + '>← 拉远</button><span style="font-size:12px;font-weight:600">' + (area ? esc(area.name) + (proj ? " / " + esc(proj.title) : "") : "") + '</span>' : '') +
          '</div>' +
          '<div class="tcs-bar-right"><span class="tcs-standalone-status"><span class="tcs-dot" style="background:var(--tcs-success)"></span>SSE 实时共视</span>' +
          (activeTab === "season" ? '<button class="tcs-btn" data-coldstart>生成初始星图</button>' : '') +
          (snap.canUndo ? '<button class="tcs-btn tcs-btn-ghost" data-undo>↶ 撤销</button>' : '') +
          '<button class="tcs-btn tcs-btn-ghost" data-toggle-theme>' + (theme === "dark" ? "浅色" : "深色") + '</button></div></div>' +
          '<div class="tcs-body"><div class="tcs-stage-wrap"><div class="tcs-stage">' + stageHtml + '</div>' + radarHtml + pillHtml + '</div>' +
          '<aside class="tcs-inbox-pane"><div class="tcs-inbox-head"><strong>Inbox 浮带 (' + activeInbox.length + ')</strong><span style="font-size:11px;color:var(--tcs-muted)">0ms</span></div>' + icloudDiag + '<div class="tcs-inbox-list">' +
          (snap.inbox.length === 0 ? '<div style="padding:14px;font-size:12px;color:var(--tcs-muted)">暂无待处理 Inbox</div>' : (activeInbox.length === 0 ? '<div style="padding:10px;font-size:12px;color:var(--tcs-muted)">近期无未处理碎片</div>' : activeInbox.map(renderInboxCard).join("")) + cooledHtml) +
          '</div></aside></div></div>';
      }

      rootEl.addEventListener("click", (e) => {
        const t = e.target.closest("[data-sa-tab],[data-sa-week-day],[data-sa-week-toggle],[data-sa-carry],[data-sa-focus],[data-sa-shield],[data-sa-day-toggle],[data-sa-focus-pause],[data-sa-focus-finish],[data-zoom-out],[data-coldstart],[data-undo],[data-toggle-theme],[data-cs-commit],[data-cs-dismiss],[data-accept],[data-dismiss],[data-accept-all],[data-dismiss-all],[data-archive-cooled],[data-open-proj],[data-open-area],[data-inbox-id]");
        if (!t || !snap) return;
        if (t.dataset.saTab) { void dispatch({ type: "set-viewport", source: "standalone", viewport: { activeTab: t.dataset.saTab } }); return; }
        if (t.dataset.saWeekDay && snap.time) {
          const [mId, sId] = t.dataset.saWeekDay.split("|");
          const mv = snap.time.weekMoves.find((m) => m.id === mId);
          if (mv) void dispatch({ type: "time", action: { type: "place-day-item", title: mv.title, slotId: sId, weekMoveId: mv.id, areaId: mv.areaId || null, projectWorkKey: mv.projectWorkKey || null } });
          return;
        }
        if (t.dataset.saWeekToggle) { void dispatch({ type: "time", action: { type: "toggle-week-move-state", moveId: t.dataset.saWeekToggle } }); return; }
        if (t.dataset.saCarry) { const [cId, dec] = t.dataset.saCarry.split("|"); void dispatch({ type: "time", action: { type: "triage-carryover", itemId: cId, decision: dec } }); return; }
        if (t.dataset.saFocus) { void dispatch({ type: "time", action: { type: "start-focus", dayItemId: t.dataset.saFocus } }); return; }
        if (t.dataset.saShield) { void dispatch({ type: "time", action: { type: "create-calendar-shield", itemId: t.dataset.saShield } }); return; }
        if (t.dataset.saDayToggle) { void dispatch({ type: "time", action: { type: "toggle-day-item-done", itemId: t.dataset.saDayToggle } }); return; }
        if (t.hasAttribute("data-sa-focus-pause") && snap.time && snap.time.activeFocus) { void dispatch({ type: "time", action: { type: snap.time.activeFocus.status === "paused" ? "resume-focus" : "pause-focus" } }); return; }
        if (t.hasAttribute("data-sa-focus-finish")) { void dispatch({ type: "time", action: { type: "finish-focus" } }); return; }
        if (t.hasAttribute("data-archive-cooled")) { e.preventDefault(); e.stopPropagation(); void dispatch({ type: "archive-cooled-inbox" }); return; }
        if (t.hasAttribute("data-toggle-theme")) { theme = theme === "dark" ? "light" : "dark"; render(); return; }
        if (t.hasAttribute("data-coldstart")) { void dispatch({ type: "trigger-cold-start", agent: "standalone" }); return; }
        if (t.hasAttribute("data-undo")) { void dispatch({ type: "undo" }); return; }
        if (t.hasAttribute("data-zoom-out")) {
          const z = snap.viewport.zoomLevel;
          if (z > 0) void dispatch({ type: "set-viewport", source: "standalone", viewport: { zoomLevel: z - 1, areaId: z === 1 ? null : snap.viewport.areaId, projectWorkKey: z <= 2 ? null : snap.viewport.projectWorkKey } });
          return;
        }
        if (t.dataset.csCommit) { void dispatch({ type: "resolve-proposals", decisions: [{ proposalId: t.dataset.csCommit, action: "accept" }] }); return; }
        if (t.dataset.csDismiss) { void dispatch({ type: "resolve-proposals", decisions: [{ proposalId: t.dataset.csDismiss, action: "dismiss" }] }); return; }
        if (t.dataset.accept) { void dispatch({ type: "resolve-proposals", decisions: [{ proposalId: t.dataset.accept, action: "accept" }] }); return; }
        if (t.dataset.dismiss) { void dispatch({ type: "resolve-proposals", decisions: [{ proposalId: t.dataset.dismiss, action: "dismiss" }] }); return; }
        if (t.hasAttribute("data-accept-all")) {
          void dispatch({ type: "resolve-proposals", decisions: snap.ghostProposals.filter((g) => g.kind !== "propose-areas").map((g) => ({ proposalId: g.id, action: "accept" })) });
          return;
        }
        if (t.hasAttribute("data-dismiss-all")) { void dispatch({ type: "dismiss-all-proposals" }); return; }
        if (t.dataset.openProj) {
          const [aId, pKey] = t.dataset.openProj.split("|");
          void dispatch({ type: "set-viewport", source: "standalone", viewport: { zoomLevel: 2, areaId: aId, projectWorkKey: pKey } });
          return;
        }
        if (t.dataset.openArea && !e.target.closest("[data-area-drag]")) {
          void dispatch({ type: "set-viewport", source: "standalone", viewport: { zoomLevel: 1, areaId: t.dataset.openArea, projectWorkKey: null } });
          return;
        }
        if (t.dataset.inboxId) {
          const next = snap.viewport.selectedInboxId === t.dataset.inboxId ? null : t.dataset.inboxId;
          void dispatch({ type: "set-viewport", source: "standalone", viewport: { selectedInboxId: next } });
        }
      });

      rootEl.addEventListener("dragstart", (e) => {
        const card = e.target.closest("[data-inbox-id]");
        if (card) draggingInboxId = card.dataset.inboxId;
      });
      rootEl.addEventListener("dragover", (e) => {
        if (!draggingInboxId) return;
        const dst = e.target.closest("[data-drop-area],[data-drop-proj]");
        if (dst) { e.preventDefault(); dst.classList.add("tcs-drop-active"); }
      });
      rootEl.addEventListener("dragleave", (e) => {
        const dst = e.target.closest("[data-drop-area],[data-drop-proj]");
        if (dst) dst.classList.remove("tcs-drop-active");
      });
      rootEl.addEventListener("drop", (e) => {
        if (!draggingInboxId) return;
        const p = e.target.closest("[data-drop-proj]");
        const a = e.target.closest("[data-drop-area]");
        if (!p && !a) return;
        e.preventDefault();
        const id = draggingInboxId; draggingInboxId = null;
        if (p) { const [aId, pKey] = p.dataset.dropProj.split("|"); void dispatch({ type: "drop-inbox", inboxId: id, areaId: aId, projectWorkKey: pKey }); }
        else if (a) { void dispatch({ type: "drop-inbox", inboxId: id, areaId: a.dataset.dropArea }); }
      });

      rootEl.addEventListener("mouseover", (e) => {
        const card = e.target.closest("[data-inbox-id]");
        const next = card ? card.dataset.inboxId : null;
        if (next === hoveredInboxId || !snap) return;
        hoveredInboxId = next;
        const item = snap.inbox.find((i) => i.id === (hoveredInboxId || snap.viewport.selectedInboxId));
        rootEl.querySelectorAll("[data-node-id]").forEach((el) => {
          const nid = el.dataset.nodeId;
          el.classList.toggle("tcs-amber-resonate", Boolean(item && (item.matchAreaIds.includes(nid) || item.matchProjectWorkKeys.includes(nid))));
        });
      });

      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && snap && snap.viewport.zoomLevel > 0) {
          const z = snap.viewport.zoomLevel;
          void dispatch({ type: "set-viewport", source: "standalone", viewport: { zoomLevel: z - 1, areaId: z === 1 ? null : snap.viewport.areaId, projectWorkKey: z <= 2 ? null : snap.viewport.projectWorkKey } });
        }
      });

      api("/stage/state", {}).then((s) => { snap = s; render(); }).catch(() => {});
      const es = new EventSource("/stage/events?token=" + encodeURIComponent(TOKEN) + "&instanceId=" + encodeURIComponent(INSTANCE));
      es.addEventListener("stage", (ev) => {
        try { snap = JSON.parse(ev.data); render(); } catch {}
      });
    })();
  </script>
</body>
</html>`;
}
