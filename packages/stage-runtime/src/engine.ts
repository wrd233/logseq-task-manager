import type { CatalogSnapshot } from "@task-copilot/contracts";
import {
  COOLED_INBOX_DAYS,
  MAIN_MISMATCH_DAYS,
  buildColdStartAreaDrafts,
  computeTone,
  defaultAreaPosition,
  defaultAreaPositionForRole,
  flattenCatalog,
  focusRoleLabel,
  formatRecencyLabel,
  matchInboxLocally,
  recencyDays,
} from "./pulse.ts";
import type { StageViewTab, TimeSnapshot } from "./time-types.ts";
import type {
  ColdStartAreaDraft,
  StageAdvancementItem,
  StageAgentPresence,
  StageArea,
  StageAreaDomain,
  StageAreaNode,
  StageCatalogEntry,
  StageDormantArea,
  StageEdgeRadar,
  StageFocusRole,
  StageGhostProposal,
  StageHighlight,
  StageInboxDiagnostics,
  StageInboxRawItem,
  StageMismatchSignal,
  StagePoint,
  StageProjectNode,
  StageRegistryFile,
  StageResolveDecision,
  StageResolveResult,
  StageSnapshot,
  StageUnassignedWork,
  StageUserAction,
  StageViewport,
  StageViewportSource,
  StageZoomLevel,
} from "./types.ts";

const HIGHLIGHT_TTL_MS = 20_000;
const PRESENCE_TTL_MS = 35_000;
const DORMANT_DAYS = 21;

function normalizeFocusRole(value: unknown, parkedFallback: boolean): StageFocusRole {
  if (value === "main" || value === "side" || value === "maintenance" || value === "parked") {
    return value;
  }
  return parkedFallback ? "parked" : "side";
}

function normalizeDomain(value: unknown): StageAreaDomain {
  return value === "life" ? "life" : "work";
}

function cleanOptionalText(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLen) : undefined;
}

export function emptyStageRegistry(now = Date.now()): StageRegistryFile {
  return {
    schemaVersion: 1,
    areas: [],
    advancements: [],
    unassignedWorkKeys: [],
    updatedAt: now,
  };
}

export function parseStageRegistry(input: unknown): StageRegistryFile {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return emptyStageRegistry();
  }
  const raw = input as Record<string, unknown>;
  if (raw.schemaVersion !== 1 || !Array.isArray(raw.areas)) {
    return emptyStageRegistry();
  }
  const areas: StageArea[] = [];
  let hasMain = false;
  for (const item of raw.areas) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.id !== "string" || typeof rec.name !== "string") continue;
    const posRaw = rec.pos && typeof rec.pos === "object" ? (rec.pos as Record<string, unknown>) : {};
    const x = typeof posRaw.x === "number" && Number.isFinite(posRaw.x) ? posRaw.x : defaultAreaPosition(areas.length).x;
    const y = typeof posRaw.y === "number" && Number.isFinite(posRaw.y) ? posRaw.y : defaultAreaPosition(areas.length).y;
    const workKeys = Array.isArray(rec.workKeys)
      ? rec.workKeys.filter((k): k is string => typeof k === "string" && k.length > 0)
      : [];
    const createdAt = typeof rec.createdAt === "number" && Number.isFinite(rec.createdAt) ? rec.createdAt : Date.now();
    const updatedAt = typeof rec.updatedAt === "number" && Number.isFinite(rec.updatedAt) ? rec.updatedAt : createdAt;
    let focusRole = normalizeFocusRole(rec.focusRole, rec.parked === true);
    if (focusRole === "main") {
      if (hasMain) focusRole = "side";
      else hasMain = true;
    }
    const domain = normalizeDomain(rec.domain);
    const quarterGoal = cleanOptionalText(rec.quarterGoal, 200);
    const antiGoal = cleanOptionalText(rec.antiGoal, 200);
    const weeklyMinimum = cleanOptionalText(rec.weeklyMinimum, 160);
    areas.push({
      id: rec.id,
      name: rec.name.slice(0, 64),
      workKeys: [...new Set(workKeys)],
      pos: { x, y },
      focusRole,
      domain,
      ...(quarterGoal ? { quarterGoal } : {}),
      ...(antiGoal ? { antiGoal } : {}),
      ...(weeklyMinimum ? { weeklyMinimum } : {}),
      parked: focusRole === "parked",
      ...(typeof rec.parkedReason === "string" && rec.parkedReason.trim() ? { parkedReason: rec.parkedReason.slice(0, 160) } : {}),
      ...(typeof rec.annotation === "string" && rec.annotation.trim() ? { annotation: rec.annotation.slice(0, 280) } : {}),
      createdAt,
      updatedAt,
    });
  }

  const advancements: StageAdvancementItem[] = [];
  if (Array.isArray(raw.advancements)) {
    for (const item of raw.advancements) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const rec = item as Record<string, unknown>;
      if (typeof rec.id !== "string" || typeof rec.areaId !== "string" || typeof rec.title !== "string") continue;
      const createdAt = typeof rec.createdAt === "number" && Number.isFinite(rec.createdAt) ? rec.createdAt : Date.now();
      const updatedAt = typeof rec.updatedAt === "number" && Number.isFinite(rec.updatedAt) ? rec.updatedAt : createdAt;
      advancements.push({
        id: rec.id,
        areaId: rec.areaId,
        projectWorkKey: typeof rec.projectWorkKey === "string" ? rec.projectWorkKey : null,
        title: rec.title.slice(0, 200),
        reason: typeof rec.reason === "string" ? rec.reason.slice(0, 400) : "",
        state: rec.state === "done" ? "done" : "active",
        ...(typeof rec.sourceInboxId === "string" ? { sourceInboxId: rec.sourceInboxId } : {}),
        ...(typeof rec.sourceInboxText === "string" ? { sourceInboxText: rec.sourceInboxText.slice(0, 240) } : {}),
        ...(typeof rec.sourceAgent === "string" ? { sourceAgent: rec.sourceAgent.slice(0, 64) } : {}),
        createdAt,
        updatedAt,
        ...(typeof rec.promotedToLogseqAt === "number" ? { promotedToLogseqAt: rec.promotedToLogseqAt } : {}),
      });
    }
  }

  const unassignedWorkKeys = Array.isArray(raw.unassignedWorkKeys)
    ? [...new Set(raw.unassignedWorkKeys.filter((k): k is string => typeof k === "string" && k.length > 0))]
    : [];

  return {
    schemaVersion: 1,
    areas,
    advancements,
    unassignedWorkKeys,
    updatedAt: typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
  };
}

function makeId(prefix: string, seq: number, now: number): string {
  return `${prefix}-${now.toString(36)}-${seq.toString(36)}`;
}

export class StageEngine {
  private registry: StageRegistryFile;
  private viewport: StageViewport;
  private ghostProposals: StageGhostProposal[] = [];
  private highlights: StageHighlight[] = [];
  private edgeRadar: StageEdgeRadar | null = null;
  private presence: Map<string, StageAgentPresence> = new Map();
  private projectAnnotations: Map<string, string> = new Map();
  private undoSnapshot: { registry: StageRegistryFile; restoredProposals: StageGhostProposal[] } | null = null;
  private version = 1;
  private seq = 1;

  constructor(initialRegistry?: StageRegistryFile, now = Date.now()) {
    this.registry = initialRegistry ? structuredClone(initialRegistry) : emptyStageRegistry(now);
    this.viewport = {
      activeTab: "season",
      zoomLevel: 0,
      areaId: null,
      projectWorkKey: null,
      taskId: null,
      selectedInboxId: null,
      selectedNodeId: null,
      source: "standalone",
      updatedAt: now,
    };
  }

  getVersion(): number {
    return this.version;
  }

  touchVersion(): number {
    this.version++;
    return this.version;
  }

  getRegistry(): StageRegistryFile {
    return structuredClone(this.registry);
  }

  replaceRegistry(next: StageRegistryFile): void {
    this.registry = structuredClone(next);
    this.version++;
  }

  getViewport(): StageViewport {
    return structuredClone(this.viewport);
  }

  // ==================== LAYER 1: PRESENCE & GAZE (Never dirties durable data or undo) ====================

  setViewport(patch: Partial<StageViewport>, source?: StageViewportSource, now = Date.now()): StageViewport {
    const activeTab: StageViewTab =
      patch.activeTab === "season" || patch.activeTab === "week" || patch.activeTab === "today"
        ? patch.activeTab
        : this.viewport.activeTab ?? "season";
    const level: StageZoomLevel =
      patch.zoomLevel === 0 || patch.zoomLevel === 1 || patch.zoomLevel === 2 || patch.zoomLevel === 3
        ? patch.zoomLevel
        : this.viewport.zoomLevel;
    this.viewport = {
      activeTab,
      zoomLevel: level,
      areaId: patch.areaId !== undefined ? patch.areaId : level === 0 ? null : this.viewport.areaId,
      projectWorkKey: patch.projectWorkKey !== undefined ? patch.projectWorkKey : level <= 1 ? null : this.viewport.projectWorkKey,
      taskId: patch.taskId !== undefined ? patch.taskId : level <= 2 ? null : this.viewport.taskId,
      selectedInboxId: patch.selectedInboxId !== undefined ? patch.selectedInboxId : this.viewport.selectedInboxId,
      selectedNodeId: patch.selectedNodeId !== undefined ? patch.selectedNodeId : this.viewport.selectedNodeId,
      source: source ?? patch.source ?? this.viewport.source,
      updatedAt: now,
    };
    if (this.edgeRadar && this.viewport.areaId === this.edgeRadar.targetAreaId) {
      this.edgeRadar = null;
    }
    this.version++;
    return this.getViewport();
  }

  /**
   * Focuses the stage anchored at a specific Logseq WorkRef key (used by Logseq "拉远").
   * Starts at L1/L2 of the owning Area/Project if known, otherwise L0 with highlight.
   */
  anchorFromWorkKey(targetWorkKey: string, source: StageViewportSource = "logseq", now = Date.now()): StageViewport {
    const owningArea = this.registry.areas.find((a) => a.workKeys.includes(targetWorkKey));
    if (owningArea) {
      return this.setViewport(
        {
          zoomLevel: 1,
          areaId: owningArea.id,
          projectWorkKey: null,
          taskId: null,
          selectedNodeId: targetWorkKey,
        },
        source,
        now,
      );
    }
    return this.setViewport(
      { zoomLevel: 0, areaId: null, projectWorkKey: null, taskId: null, selectedNodeId: targetWorkKey },
      source,
      now,
    );
  }

  setPresence(agent: string, targetId: string, status: "viewing" | "thinking", now = Date.now()): void {
    this.presence.set(agent, { agent, targetId, status, updatedAt: now });
    this.version++;
  }

  clearPresence(agent: string): void {
    if (this.presence.delete(agent)) this.version++;
  }

  /**
   * Respects "never hijack user's steering wheel":
   * - Targets inside current viewport get a soft highlight ring.
   * - Targets outside current viewport automatically downgrade to a non-intrusive Edge Radar pill!
   */
  highlight(
    input: {
      targetIds: string[];
      reason: string;
      tone?: "primary" | "amber" | "teal";
      agent: string;
    },
    now = Date.now(),
  ): { highlighted: string[]; nudgedRadar: StageEdgeRadar | null } {
    this.pruneEphemeral(now);
    const tone = input.tone ?? "primary";
    const highlighted: string[] = [];
    let nudgedRadar: StageEdgeRadar | null = null;

    for (const targetId of input.targetIds) {
      const targetArea = this.findAreaOwning(targetId);
      const isOutOfView =
        this.viewport.zoomLevel > 0 &&
        this.viewport.areaId !== null &&
        targetArea !== null &&
        targetArea.id !== this.viewport.areaId;

      if (isOutOfView && targetArea) {
        nudgedRadar = {
          id: makeId("radar", this.seq++, now),
          targetAreaId: targetArea.id,
          ...(targetId !== targetArea.id ? { targetProjectWorkKey: targetId } : {}),
          label: `${targetArea.name} · ${input.reason.slice(0, 28)}`,
          reason: input.reason.slice(0, 160),
          agent: input.agent,
          createdAt: now,
        };
        this.edgeRadar = nudgedRadar;
      } else {
        this.highlights = this.highlights.filter((h) => h.targetId !== targetId);
        this.highlights.push({
          targetId,
          reason: input.reason.slice(0, 160),
          tone,
          agent: input.agent,
          expiresAt: now + HIGHLIGHT_TTL_MS,
        });
        highlighted.push(targetId);
      }
    }
    this.version++;
    return { highlighted, nudgedRadar };
  }

  annotate(input: { targetId: string; insight: string | null }, now = Date.now()): { updated: boolean; persisted: boolean } {
    const area = this.registry.areas.find((a) => a.id === input.targetId);
    if (area) {
      if (input.insight && input.insight.trim()) {
        area.annotation = input.insight.trim().slice(0, 280);
      } else {
        delete area.annotation;
      }
      area.updatedAt = now;
      this.registry.updatedAt = now;
      this.version++;
      return { updated: true, persisted: true };
    }
    if (input.insight && input.insight.trim()) {
      this.projectAnnotations.set(input.targetId, input.insight.trim().slice(0, 280));
    } else {
      this.projectAnnotations.delete(input.targetId);
    }
    this.version++;
    return { updated: true, persisted: false };
  }

  clearRadar(): void {
    if (this.edgeRadar) {
      this.edgeRadar = null;
      this.version++;
    }
  }

  // ==================== LAYER 2: GHOST STAGING (Never commits until user resolves) ====================

  proposeAreas(
    input: {
      agent: string;
      catalog: readonly CatalogSnapshot[];
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
    },
    now = Date.now(),
  ): StageGhostProposal {
    const entries = flattenCatalog(input.catalog);
    const byKey = new Map(entries.map((e) => [e.workKey, e]));

    let drafts: ColdStartAreaDraft[];
    let unassignedTitles: string[];

    if (input.areas && input.areas.length > 0) {
      // Enforce D-53 anti-clutter hard cap: max 7 top-level Areas; max 1 main
      const capped = input.areas.slice(0, 7);
      const claimed = new Set<string>();
      const hasMainArea = capped.some((item) => item.focusRole === "main");
      let mainAssigned = false;
      let nonMainIdx = 0;

      drafts = capped.map((item, idx) => {
        const cleanKeys = [...new Set(item.workKeys.filter((k) => byKey.has(k) && !claimed.has(k)))];
        for (const k of cleanKeys) claimed.add(k);
        let focusRole: StageFocusRole = item.focusRole ?? "side";
        if (focusRole === "main") {
          if (mainAssigned) focusRole = "side";
          else mainAssigned = true;
        }
        const domain: StageAreaDomain = item.domain ?? "work";
        const pos =
          focusRole === "main"
            ? defaultAreaPositionForRole(0, "main", true)
            : defaultAreaPositionForRole(nonMainIdx++, focusRole, hasMainArea);
        const quarterGoal = cleanOptionalText(item.quarterGoal, 200);
        const antiGoal = cleanOptionalText(item.antiGoal, 200);
        const weeklyMinimum = cleanOptionalText(item.weeklyMinimum, 160);
        return {
          id: makeId("area-draft", this.seq++, now),
          name: item.name.trim().slice(0, 48) || `领域 ${idx + 1}`,
          workKeys: cleanKeys,
          anchorTitles: cleanKeys.slice(0, 3).map((k) => byKey.get(k)?.title ?? k),
          pos,
          focusRole,
          domain,
          ...(quarterGoal ? { quarterGoal } : {}),
          ...(antiGoal ? { antiGoal } : {}),
          ...(weeklyMinimum ? { weeklyMinimum } : {}),
        };
      });
      const explicitUnassigned = input.unassignedWorkKeys ?? entries.filter((e) => !claimed.has(e.workKey)).map((e) => e.workKey);
      unassignedTitles = explicitUnassigned.slice(0, 8).map((k) => byKey.get(k)?.title ?? k);
    } else {
      const built = buildColdStartAreaDrafts(entries, 7);
      drafts = built.areas.map((d) => ({ ...d, focusRole: "side" as const, domain: "work" as const }));
      unassignedTitles = built.unassignedTitles;
    }

    // Replace any older cold-start draft so canvas stays clean
    this.ghostProposals = this.ghostProposals.filter((p) => p.kind !== "propose-areas");
    const proposal: StageGhostProposal = {
      id: makeId("ghost-areas", this.seq++, now),
      kind: "propose-areas",
      agent: input.agent,
      createdAt: now,
      title: `初始领域星图（${drafts.length} 个主领域）`,
      reason: `按防乱护栏聚合为 ${drafts.length} 个主领域，未归类零散项留入暂放池。`,
      proposedAreas: drafts,
      unassignedTitles,
    };
    this.ghostProposals.push(proposal);
    this.version++;
    return structuredClone(proposal);
  }

  proposeAreaRole(
    input: {
      agent: string;
      areaId: string;
      focusRole?: StageFocusRole;
      domain?: StageAreaDomain;
      quarterGoal?: string | null;
      antiGoal?: string | null;
      weeklyMinimum?: string | null;
      demoteCurrentMainTo?: "side" | "maintenance" | "parked";
      reason: string;
    },
    now = Date.now(),
  ): StageGhostProposal | null {
    const area = this.registry.areas.find((a) => a.id === input.areaId);
    if (!area) return null;

    // Replace older pending role proposal targeting the same Area
    this.ghostProposals = this.ghostProposals.filter(
      (p) => !(p.kind === "propose-area-role" && p.areaId === area.id),
    );

    const parts: string[] = [];
    if (input.focusRole) parts.push(`角色调整为「${focusRoleLabel(input.focusRole)}」`);
    if (input.domain) parts.push(`领域标为「${input.domain === "life" ? "生活" : "工作"}」`);
    if (input.quarterGoal !== undefined) parts.push(input.quarterGoal ? "更新季度目标" : "清除季度目标");
    if (input.antiGoal !== undefined) parts.push(input.antiGoal ? "更新反目标" : "清除反目标");
    if (input.weeklyMinimum !== undefined) parts.push(input.weeklyMinimum ? "更新每周底线" : "清除每周底线");

    const currentMain =
      input.focusRole === "main"
        ? this.registry.areas.find((a) => a.id !== area.id && a.focusRole === "main")
        : undefined;
    const demoteTarget = input.demoteCurrentMainTo ?? "side";
    const replacementNote = currentMain
      ? `（置换原主线「${currentMain.name}」为${focusRoleLabel(demoteTarget)}）`
      : "";

    const proposal: StageGhostProposal = {
      id: makeId("ghost-role", this.seq++, now),
      kind: "propose-area-role",
      agent: input.agent,
      createdAt: now,
      areaId: area.id,
      targetAreaId: area.id,
      title: `调整「${area.name}」：${parts.join("，") || "更新领域配置"}${replacementNote}`.slice(0, 160),
      reason: input.reason.trim().slice(0, 320),
      ...(input.focusRole ? { proposedRole: input.focusRole } : {}),
      ...(input.domain ? { proposedDomain: input.domain } : {}),
      ...(input.quarterGoal !== undefined
        ? { proposedQuarterGoal: input.quarterGoal === null ? null : cleanOptionalText(input.quarterGoal, 200) ?? null }
        : {}),
      ...(input.antiGoal !== undefined
        ? { proposedAntiGoal: input.antiGoal === null ? null : cleanOptionalText(input.antiGoal, 200) ?? null }
        : {}),
      ...(input.weeklyMinimum !== undefined
        ? { proposedWeeklyMinimum: input.weeklyMinimum === null ? null : cleanOptionalText(input.weeklyMinimum, 160) ?? null }
        : {}),
      ...(input.demoteCurrentMainTo ? { demoteCurrentMainTo: input.demoteCurrentMainTo } : {}),
    };
    this.ghostProposals.push(proposal);
    this.version++;
    return structuredClone(proposal);
  }

  mergeColdStartArea(proposalId: string, sourceAreaId: string, targetAreaId: string): boolean {
    const proposal = this.ghostProposals.find((p) => p.id === proposalId && p.kind === "propose-areas");
    if (!proposal?.proposedAreas || sourceAreaId === targetAreaId) return false;
    const srcIdx = proposal.proposedAreas.findIndex((a) => a.id === sourceAreaId);
    const dst = proposal.proposedAreas.find((a) => a.id === targetAreaId);
    if (srcIdx === -1 || !dst) return false;
    const [src] = proposal.proposedAreas.splice(srcIdx, 1);
    if (!src) return false;
    dst.name = `${dst.name} / ${src.name.slice(0, 8)}`.slice(0, 48);
    dst.workKeys = [...new Set([...dst.workKeys, ...src.workKeys])];
    dst.anchorTitles = [...new Set([...dst.anchorTitles, ...src.anchorTitles])].slice(0, 4);
    proposal.title = `初始领域星图（${proposal.proposedAreas.length} 个主领域）`;
    this.version++;
    return true;
  }

  dropColdStartArea(proposalId: string, areaId: string): boolean {
    const proposal = this.ghostProposals.find((p) => p.id === proposalId && p.kind === "propose-areas");
    if (!proposal?.proposedAreas) return false;
    const idx = proposal.proposedAreas.findIndex((a) => a.id === areaId);
    if (idx === -1) return false;
    const [removed] = proposal.proposedAreas.splice(idx, 1);
    if (removed) {
      proposal.unassignedTitles = [...(proposal.unassignedTitles ?? []), `${removed.name}（移入暂放）`].slice(0, 10);
    }
    proposal.title = `初始领域星图（${proposal.proposedAreas.length} 个主领域）`;
    this.version++;
    return true;
  }

  sproutBranches(
    input: {
      agent: string;
      areaId?: string;
      projectWorkKey?: string;
      branches: Array<{
        title: string;
        reason: string;
        sourceInboxId?: string;
        sourceInboxText?: string;
      }>;
    },
    now = Date.now(),
  ): StageGhostProposal[] {
    const resolvedAreaId =
      input.areaId ??
      (input.projectWorkKey ? this.findAreaOwning(input.projectWorkKey)?.id : undefined) ??
      this.viewport.areaId ??
      this.registry.areas[0]?.id;

    const created: StageGhostProposal[] = [];
    for (const branch of input.branches.slice(0, 8)) {
      const title = branch.title.trim().slice(0, 160);
      if (!title) continue;
      const proposal: StageGhostProposal = {
        id: makeId("ghost-br", this.seq++, now),
        kind: "sprout-branch",
        agent: input.agent,
        createdAt: now,
        ...(resolvedAreaId ? { areaId: resolvedAreaId } : {}),
        ...(input.projectWorkKey ? { projectWorkKey: input.projectWorkKey } : {}),
        title,
        reason: branch.reason.trim().slice(0, 320),
        ...(branch.sourceInboxId ? { sourceInboxId: branch.sourceInboxId } : {}),
        ...(branch.sourceInboxText ? { sourceInboxText: branch.sourceInboxText.slice(0, 200) } : {}),
      };
      this.ghostProposals.push(proposal);
      created.push(structuredClone(proposal));
    }
    if (created.length > 0) this.version++;
    return created;
  }

  proposeMove(
    input: {
      agent: string;
      targetAreaId: string;
      targetProjectWorkKey?: string;
      moveWorkKey?: string;
      sourceInboxId?: string;
      sourceInboxText?: string;
      title: string;
      reason: string;
    },
    now = Date.now(),
  ): StageGhostProposal {
    const proposal: StageGhostProposal = {
      id: makeId("ghost-mv", this.seq++, now),
      kind: input.sourceInboxId ? "intake-inbox" : "propose-move",
      agent: input.agent,
      createdAt: now,
      areaId: input.targetAreaId,
      targetAreaId: input.targetAreaId,
      ...(input.targetProjectWorkKey ? { projectWorkKey: input.targetProjectWorkKey, targetProjectWorkKey: input.targetProjectWorkKey } : {}),
      ...(input.moveWorkKey ? { moveWorkKey: input.moveWorkKey } : {}),
      ...(input.sourceInboxId ? { sourceInboxId: input.sourceInboxId } : {}),
      ...(input.sourceInboxText ? { sourceInboxText: input.sourceInboxText.slice(0, 200) } : {}),
      title: input.title.trim().slice(0, 160),
      reason: input.reason.trim().slice(0, 320),
    };
    this.ghostProposals.push(proposal);
    this.version++;
    return structuredClone(proposal);
  }

  dismissAllProposals(): number {
    const count = this.ghostProposals.length;
    if (count > 0) {
      this.ghostProposals = [];
      this.version++;
    }
    return count;
  }

  // ==================== LAYER 3: COMMITTED OPERATIONAL STATE (Plan A + 1-Step Undo) ====================

  private captureUndo(restoredProposals: StageGhostProposal[] = []): void {
    this.undoSnapshot = {
      registry: structuredClone(this.registry),
      restoredProposals: structuredClone(restoredProposals),
    };
  }

  resolveProposals(decisions: readonly StageResolveDecision[], now = Date.now()): StageResolveResult {
    const committedIds: string[] = [];
    const dismissedIds: string[] = [];
    const archivedInboxIds: string[] = [];
    const createdAdvancements: StageAdvancementItem[] = [];
    const affectedProposals: StageGhostProposal[] = [];

    for (const d of decisions) {
      const p = this.ghostProposals.find((g) => g.id === d.proposalId);
      if (p) affectedProposals.push(p);
    }
    if (affectedProposals.some((p) => decisions.find((d) => d.proposalId === p.id)?.action === "accept")) {
      this.captureUndo(affectedProposals);
    }

    for (const decision of decisions) {
      const idx = this.ghostProposals.findIndex((g) => g.id === decision.proposalId);
      if (idx === -1) continue;
      const [proposal] = this.ghostProposals.splice(idx, 1);
      if (!proposal) continue;

      if (decision.action === "dismiss") {
        dismissedIds.push(proposal.id);
        continue;
      }

      if (proposal.kind === "propose-areas" && proposal.proposedAreas) {
        let mainSeen = false;
        this.registry.areas = proposal.proposedAreas.slice(0, 7).map((draft, i) => {
          let focusRole: StageFocusRole = draft.focusRole ?? "side";
          if (focusRole === "main") {
            if (mainSeen) focusRole = "side";
            else mainSeen = true;
          }
          const domain: StageAreaDomain = draft.domain ?? "work";
          return {
            id: draft.id.startsWith("area-draft-") ? `area-${i + 1}-${now.toString(36)}` : draft.id,
            name: draft.name,
            workKeys: [...new Set(draft.workKeys)],
            pos: draft.pos ?? defaultAreaPosition(i),
            focusRole,
            domain,
            ...(draft.quarterGoal ? { quarterGoal: draft.quarterGoal } : {}),
            ...(draft.antiGoal ? { antiGoal: draft.antiGoal } : {}),
            ...(draft.weeklyMinimum ? { weeklyMinimum: draft.weeklyMinimum } : {}),
            parked: focusRole === "parked",
            createdAt: now,
            updatedAt: now,
          };
        });
        const claimed = new Set(this.registry.areas.flatMap((a) => a.workKeys));
        this.registry.unassignedWorkKeys = this.registry.unassignedWorkKeys.filter((k) => !claimed.has(k));
        this.registry.updatedAt = now;
        committedIds.push(proposal.id);
        continue;
      }

      if (proposal.kind === "propose-area-role" && proposal.areaId) {
        const applied = this.applyAreaMetaPatch(
          {
            areaId: proposal.areaId,
            ...(proposal.proposedRole ? { focusRole: proposal.proposedRole } : {}),
            ...(proposal.proposedDomain ? { domain: proposal.proposedDomain } : {}),
            ...(proposal.proposedQuarterGoal !== undefined ? { quarterGoal: proposal.proposedQuarterGoal } : {}),
            ...(proposal.proposedAntiGoal !== undefined ? { antiGoal: proposal.proposedAntiGoal } : {}),
            ...(proposal.proposedWeeklyMinimum !== undefined ? { weeklyMinimum: proposal.proposedWeeklyMinimum } : {}),
            ...(proposal.demoteCurrentMainTo ? { demoteCurrentMainTo: proposal.demoteCurrentMainTo } : {}),
          },
          now,
        );
        if (applied) {
          committedIds.push(proposal.id);
        }
        continue;
      }

      if (proposal.kind === "propose-move" && proposal.moveWorkKey && proposal.targetAreaId) {
        const target = this.registry.areas.find((a) => a.id === proposal.targetAreaId);
        if (target) {
          for (const area of this.registry.areas) {
            area.workKeys = area.workKeys.filter((k) => k !== proposal.moveWorkKey);
          }
          target.workKeys.push(proposal.moveWorkKey);
          target.updatedAt = now;
          this.registry.unassignedWorkKeys = this.registry.unassignedWorkKeys.filter((k) => k !== proposal.moveWorkKey);
          this.registry.updatedAt = now;
          committedIds.push(proposal.id);
        }
        continue;
      }

      // sprout-branch or intake-inbox -> Plan A lightweight operational advancement item
      const targetAreaId = proposal.targetAreaId ?? proposal.areaId ?? this.registry.areas[0]?.id ?? "area-default";
      if (!this.registry.areas.some((a) => a.id === targetAreaId) && this.registry.areas.length === 0) {
        this.registry.areas.push({
          id: targetAreaId,
          name: "默认工作领域",
          workKeys: proposal.projectWorkKey ? [proposal.projectWorkKey] : [],
          pos: defaultAreaPosition(0),
          focusRole: "side",
          domain: "work",
          parked: false,
          createdAt: now,
          updatedAt: now,
        });
      }

      const item: StageAdvancementItem = {
        id: makeId("adv", this.seq++, now),
        areaId: targetAreaId,
        projectWorkKey: proposal.targetProjectWorkKey ?? proposal.projectWorkKey ?? null,
        title: (decision.title?.trim() || proposal.title).slice(0, 200),
        reason: proposal.reason,
        state: "active",
        ...(proposal.sourceInboxId ? { sourceInboxId: proposal.sourceInboxId } : {}),
        ...(proposal.sourceInboxText ? { sourceInboxText: proposal.sourceInboxText } : {}),
        sourceAgent: proposal.agent,
        createdAt: now,
        updatedAt: now,
      };
      this.registry.advancements.push(item);
      this.registry.updatedAt = now;
      createdAdvancements.push(structuredClone(item));
      committedIds.push(proposal.id);
      if (proposal.sourceInboxId) archivedInboxIds.push(proposal.sourceInboxId);
    }

    if (committedIds.length > 0 || dismissedIds.length > 0) this.version++;
    return {
      committedIds,
      dismissedIds,
      archivedInboxIds,
      createdAdvancements,
      canUndo: this.undoSnapshot !== null,
    };
  }

  dropInboxToTarget(
    input: { inboxId: string; inboxText: string; areaId: string; projectWorkKey?: string | null },
    now = Date.now(),
  ): StageAdvancementItem {
    this.captureUndo();
    const targetArea = this.registry.areas.find((a) => a.id === input.areaId);
    const areaId = targetArea?.id ?? this.registry.areas[0]?.id ?? "area-default";
    const resolvedProjectKey = input.projectWorkKey !== undefined ? input.projectWorkKey : (targetArea?.workKeys[0] ?? null);
    const item: StageAdvancementItem = {
      id: makeId("adv", this.seq++, now),
      areaId,
      projectWorkKey: resolvedProjectKey,
      title: input.inboxText.trim().slice(0, 120),
      reason: "由你从 Inbox 拖拽安放",
      state: "active",
      sourceInboxId: input.inboxId,
      sourceInboxText: input.inboxText.trim().slice(0, 240),
      createdAt: now,
      updatedAt: now,
    };
    this.registry.advancements.push(item);
    this.registry.updatedAt = now;
    if (this.viewport.selectedInboxId === input.inboxId) {
      this.viewport.selectedInboxId = null;
    }
    this.version++;
    return structuredClone(item);
  }

  moveAreaPosition(areaId: string, pos: StagePoint, now = Date.now()): boolean {
    const area = this.registry.areas.find((a) => a.id === areaId);
    if (!area) return false;
    area.pos = { x: Math.max(8, Math.round(pos.x)), y: Math.max(8, Math.round(pos.y)) };
    area.updatedAt = now;
    this.registry.updatedAt = now;
    this.version++;
    return true;
  }

  private applyAreaMetaPatch(
    input: {
      areaId: string;
      focusRole?: StageFocusRole;
      domain?: StageAreaDomain;
      quarterGoal?: string | null;
      antiGoal?: string | null;
      weeklyMinimum?: string | null;
      demoteCurrentMainTo?: "side" | "maintenance" | "parked";
    },
    now: number,
  ): boolean {
    const area = this.registry.areas.find((a) => a.id === input.areaId);
    if (!area) return false;

    if (input.focusRole !== undefined) {
      if (input.focusRole === "main") {
        const demoteTo = input.demoteCurrentMainTo ?? "side";
        for (const other of this.registry.areas) {
          if (other.id !== area.id && other.focusRole === "main") {
            other.focusRole = demoteTo;
            other.parked = demoteTo === "parked";
            other.updatedAt = now;
          }
        }
      }
      area.focusRole = input.focusRole;
      area.parked = input.focusRole === "parked";
      if (!area.parked) delete area.parkedReason;
    }
    if (input.domain !== undefined) {
      area.domain = input.domain;
    }
    if (input.quarterGoal !== undefined) {
      const cleaned = input.quarterGoal === null ? undefined : cleanOptionalText(input.quarterGoal, 200);
      if (cleaned) area.quarterGoal = cleaned;
      else delete area.quarterGoal;
    }
    if (input.antiGoal !== undefined) {
      const cleaned = input.antiGoal === null ? undefined : cleanOptionalText(input.antiGoal, 200);
      if (cleaned) area.antiGoal = cleaned;
      else delete area.antiGoal;
    }
    if (input.weeklyMinimum !== undefined) {
      const cleaned = input.weeklyMinimum === null ? undefined : cleanOptionalText(input.weeklyMinimum, 160);
      if (cleaned) area.weeklyMinimum = cleaned;
      else delete area.weeklyMinimum;
    }
    area.updatedAt = now;
    this.registry.updatedAt = now;
    return true;
  }

  updateAreaMeta(
    input: {
      areaId: string;
      focusRole?: StageFocusRole;
      domain?: StageAreaDomain;
      quarterGoal?: string | null;
      antiGoal?: string | null;
      weeklyMinimum?: string | null;
      demoteCurrentMainTo?: "side" | "maintenance" | "parked";
    },
    now = Date.now(),
  ): boolean {
    if (!this.registry.areas.some((a) => a.id === input.areaId)) return false;
    this.captureUndo();
    const ok = this.applyAreaMetaPatch(input, now);
    if (ok) this.version++;
    return ok;
  }

  toggleParkArea(areaId: string, parked: boolean, reason?: string, now = Date.now()): boolean {
    const area = this.registry.areas.find((a) => a.id === areaId);
    if (!area) return false;
    this.captureUndo();
    area.parked = parked;
    if (parked) {
      area.focusRole = "parked";
      if (reason?.trim()) {
        area.parkedReason = reason.trim().slice(0, 160);
      }
    } else {
      if (area.focusRole === "parked") area.focusRole = "side";
      delete area.parkedReason;
    }
    area.updatedAt = now;
    this.registry.updatedAt = now;
    this.version++;
    return true;
  }

  renameArea(areaId: string, name: string, now = Date.now()): boolean {
    const clean = name.trim().slice(0, 48);
    const area = this.registry.areas.find((a) => a.id === areaId);
    if (!area || !clean) return false;
    this.captureUndo();
    area.name = clean;
    area.updatedAt = now;
    this.registry.updatedAt = now;
    this.version++;
    return true;
  }

  toggleAdvancementDone(advancementId: string, now = Date.now()): boolean {
    const item = this.registry.advancements.find((a) => a.id === advancementId);
    if (!item) return false;
    this.captureUndo();
    item.state = item.state === "done" ? "active" : "done";
    item.updatedAt = now;
    this.registry.updatedAt = now;
    this.version++;
    return true;
  }

  markAdvancementPromoted(advancementId: string, now = Date.now()): boolean {
    const item = this.registry.advancements.find((a) => a.id === advancementId);
    if (!item) return false;
    item.promotedToLogseqAt = now;
    item.updatedAt = now;
    this.registry.updatedAt = now;
    this.version++;
    return true;
  }

  undoLastCommit(): boolean {
    if (!this.undoSnapshot) return false;
    this.registry = structuredClone(this.undoSnapshot.registry);
    for (const p of this.undoSnapshot.restoredProposals) {
      if (!this.ghostProposals.some((g) => g.id === p.id)) {
        this.ghostProposals.push(structuredClone(p));
      }
    }
    this.undoSnapshot = null;
    this.version++;
    return true;
  }

  applyUserAction(
    action: StageUserAction,
    context: { catalog: readonly CatalogSnapshot[]; inbox: readonly StageInboxRawItem[]; now?: number },
  ): { mutatedRegistry: boolean; archivedInboxIds: string[]; resolved?: StageResolveResult } {
    const now = context.now ?? Date.now();
    switch (action.type) {
      case "set-viewport":
        this.setViewport(action.viewport, action.source, now);
        return { mutatedRegistry: false, archivedInboxIds: [] };
      case "move-area":
        return { mutatedRegistry: this.moveAreaPosition(action.areaId, action.pos, now), archivedInboxIds: [] };
      case "toggle-park-area":
        return { mutatedRegistry: this.toggleParkArea(action.areaId, action.parked, action.reason, now), archivedInboxIds: [] };
      case "rename-area":
        return { mutatedRegistry: this.renameArea(action.areaId, action.name, now), archivedInboxIds: [] };
      case "update-area-meta":
        return {
          mutatedRegistry: this.updateAreaMeta(
            {
              areaId: action.areaId,
              ...(action.focusRole !== undefined ? { focusRole: action.focusRole } : {}),
              ...(action.domain !== undefined ? { domain: action.domain } : {}),
              ...(action.quarterGoal !== undefined ? { quarterGoal: action.quarterGoal } : {}),
              ...(action.antiGoal !== undefined ? { antiGoal: action.antiGoal } : {}),
              ...(action.weeklyMinimum !== undefined ? { weeklyMinimum: action.weeklyMinimum } : {}),
              ...(action.demoteCurrentMainTo !== undefined ? { demoteCurrentMainTo: action.demoteCurrentMainTo } : {}),
            },
            now,
          ),
          archivedInboxIds: [],
        };
      case "trigger-cold-start":
        this.proposeAreas({ agent: action.agent ?? "stage-assistant", catalog: context.catalog }, now);
        return { mutatedRegistry: false, archivedInboxIds: [] };
      case "merge-cold-start-area":
        this.mergeColdStartArea(action.proposalId, action.sourceAreaId, action.targetAreaId);
        return { mutatedRegistry: false, archivedInboxIds: [] };
      case "drop-cold-start-area":
        this.dropColdStartArea(action.proposalId, action.areaId);
        return { mutatedRegistry: false, archivedInboxIds: [] };
      case "resolve-proposals": {
        const resolved = this.resolveProposals(action.decisions, now);
        return { mutatedRegistry: resolved.committedIds.length > 0, archivedInboxIds: resolved.archivedInboxIds, resolved };
      }
      case "dismiss-all-proposals":
        this.dismissAllProposals();
        return { mutatedRegistry: false, archivedInboxIds: [] };
      case "drop-inbox": {
        const found = context.inbox.find((i) => i.id === action.inboxId);
        if (!found) return { mutatedRegistry: false, archivedInboxIds: [] };
        this.dropInboxToTarget(
          {
            inboxId: found.id,
            inboxText: found.text,
            areaId: action.areaId,
            ...(action.projectWorkKey !== undefined ? { projectWorkKey: action.projectWorkKey } : {}),
          },
          now,
        );
        return { mutatedRegistry: true, archivedInboxIds: [found.id] };
      }
      case "archive-inbox-items": {
        const validSet = new Set(context.inbox.map((i) => i.id));
        const archivedIds = [...new Set(action.inboxIds.filter((id) => validSet.has(id)))];
        if (archivedIds.length > 0) {
          if (this.viewport.selectedInboxId && archivedIds.includes(this.viewport.selectedInboxId)) {
            this.viewport.selectedInboxId = null;
          }
          this.version++;
        }
        return { mutatedRegistry: false, archivedInboxIds: archivedIds };
      }
      case "archive-cooled-inbox": {
        const cooledIds = context.inbox
          .filter((item) => item.status !== "archived" && item.status !== "deleted")
          .filter((item) => recencyDays(item.updatedAt || item.createdAt, now) >= COOLED_INBOX_DAYS)
          .map((item) => item.id);
        if (cooledIds.length > 0) {
          if (this.viewport.selectedInboxId && cooledIds.includes(this.viewport.selectedInboxId)) {
            this.viewport.selectedInboxId = null;
          }
          this.version++;
        }
        return { mutatedRegistry: false, archivedInboxIds: cooledIds };
      }
      case "toggle-advancement-done":
        return { mutatedRegistry: this.toggleAdvancementDone(action.advancementId, now), archivedInboxIds: [] };
      case "mark-promoted-logseq":
        return { mutatedRegistry: this.markAdvancementPromoted(action.advancementId, now), archivedInboxIds: [] };
      case "clear-radar":
        this.clearRadar();
        return { mutatedRegistry: false, archivedInboxIds: [] };
      case "time":
        return { mutatedRegistry: false, archivedInboxIds: [] };
      case "undo":
        return { mutatedRegistry: this.undoLastCommit(), archivedInboxIds: [] };
    }
  }

  // ==================== SNAPSHOT & COMPACT GAZE PROJECTION ====================

  private findAreaOwning(idOrWorkKey: string): StageArea | null {
    return this.registry.areas.find((a) => a.id === idOrWorkKey || a.workKeys.includes(idOrWorkKey)) ?? null;
  }

  private pruneEphemeral(now: number): void {
    this.highlights = this.highlights.filter((h) => h.expiresAt > now);
    for (const [agent, p] of this.presence) {
      if (now - p.updatedAt > PRESENCE_TTL_MS) this.presence.delete(agent);
    }
  }

  buildSnapshot(
    catalogSnapshots: readonly CatalogSnapshot[],
    inboxItems: readonly StageInboxRawItem[],
    now = Date.now(),
    appUrl?: string,
    inboxDiagnostics?: StageInboxDiagnostics,
    timeSnapshot?: TimeSnapshot,
  ): StageSnapshot {
    this.pruneEphemeral(now);
    const entries = flattenCatalog(catalogSnapshots);
    const byKey = new Map<string, StageCatalogEntry>(entries.map((e) => [e.workKey, e]));

    // Build effective areas (use committed registry; if empty, show unassigned pool + needsColdStart)
    const effectiveAreas = this.registry.areas;
    const inboxView = matchInboxLocally(inboxItems, effectiveAreas, byKey, now);
    const activeInboxView = inboxView.filter((i) => !i.cooled);
    const cooledInboxCount = inboxView.length - activeInboxView.length;
    const selectedInbox = this.viewport.selectedInboxId
      ? inboxView.find((i) => i.id === this.viewport.selectedInboxId)
      : undefined;

    const assignedKeys = new Set<string>();

    // Pass 1: gather real bottom-up work progress per Area (ignoring metadata-only edits)
    const precomputed = effectiveAreas.map((area) => {
      const projects: StageProjectNode[] = [];
      let workNewestMs = 0;
      let recentCount = 0;

      for (const pKey of area.workKeys) {
        const entry = byKey.get(pKey);
        if (!entry) continue;
        assignedKeys.add(pKey);
        const pAdv = this.registry.advancements.filter((a) => a.areaId === area.id && a.projectWorkKey === pKey);
        const pLastMs = Math.max(entry.updatedAt, ...pAdv.map((a) => a.updatedAt));
        if (pLastMs > workNewestMs) workNewestMs = pLastMs;
        const pDays = recencyDays(pLastMs, now);
        if (pDays <= 7) recentCount++;

        const pInboxCount = activeInboxView.filter((i) => i.matchProjectWorkKeys.includes(pKey)).length;
        const pInboxHighlight = Boolean(selectedInbox && selectedInbox.matchProjectWorkKeys.includes(pKey));
        const pTone = computeTone({
          recencyDays: pDays,
          inboxMatchCount: pInboxCount,
          inboxHighlightActive: pInboxHighlight,
          hasActiveAdvancement: pAdv.some((a) => a.state === "active"),
        });
        const pAnn = this.projectAnnotations.get(pKey);
        projects.push({
          workKey: pKey,
          workRef: entry.workRef,
          graphId: entry.graphId,
          graphName: entry.graphName,
          title: entry.title,
          objectType: entry.objectType,
          location: entry.location,
          ...(entry.directory ? { directory: entry.directory } : {}),
          updatedAt: pLastMs,
          recencyDays: pDays,
          pulseLabel: formatRecencyLabel(pDays),
          tone: pTone.tone,
          signalLabel: pTone.signalLabel,
          ...(pAnn ? { annotation: pAnn } : {}),
          advancements: pAdv,
          inboxMatchCount: pInboxCount,
        });
      }

      const areaAdv = this.registry.advancements.filter((a) => a.areaId === area.id && a.projectWorkKey === null);
      if (areaAdv.length > 0) {
        workNewestMs = Math.max(workNewestMs, ...areaAdv.map((a) => a.updatedAt));
      }
      const hasAnyWork = projects.length > 0 || areaAdv.length > 0;
      const aDays = workNewestMs > 0 ? recencyDays(workNewestMs, now) : 999;
      const aInboxCount = activeInboxView.filter((i) => i.matchAreaIds.includes(area.id)).length;
      const aInboxHighlight = Boolean(selectedInbox && selectedInbox.matchAreaIds.includes(area.id));
      const effectiveIdleDays = hasAnyWork ? aDays : recencyDays(area.createdAt, now);

      return {
        area,
        projects,
        areaAdv,
        recentCount,
        aDays,
        effectiveIdleDays,
        aInboxCount,
        aInboxHighlight,
      };
    });

    // Pass 2: detect real main-line mismatch (declared main idle >= 7d while other non-parked areas stay active <= 3d)
    const mismatchSignals: StageMismatchSignal[] = [];
    const mismatchByAreaId = new Map<string, StageMismatchSignal>();
    for (const entry of precomputed) {
      if (entry.area.focusRole !== "main") continue;
      if (entry.effectiveIdleDays < MAIN_MISMATCH_DAYS) continue;
      const otherActive = precomputed
        .filter(
          (other) =>
            other.area.id !== entry.area.id &&
            other.area.focusRole !== "parked" &&
            !other.area.parked &&
            other.aDays <= 3,
        )
        .map((other) => ({ id: other.area.id, name: other.area.name, recencyDays: other.aDays }));
      if (otherActive.length === 0) continue;
      const daysLabel = entry.effectiveIdleDays >= 999 ? "超过 7 天无记录" : `连续 ${entry.effectiveIdleDays} 天未推进`;
      const signal: StageMismatchSignal = {
        areaId: entry.area.id,
        areaName: entry.area.name,
        daysSinceProgress: entry.effectiveIdleDays,
        otherActiveAreas: otherActive,
        summary: `宣称主线「${entry.area.name}」${daysLabel}，同期活跃领域：${otherActive.map((o) => o.name).join("、")}`,
      };
      mismatchSignals.push(signal);
      mismatchByAreaId.set(entry.area.id, signal);
    }

    const activeAreas: StageAreaNode[] = [];
    const dormantAreas: StageDormantArea[] = [];

    for (const item of precomputed) {
      const { area, projects, areaAdv, recentCount, aDays, effectiveIdleDays, aInboxCount, aInboxHighlight } = item;
      const isParked = area.parked || area.focusRole === "parked";
      const isDormant =
        isParked ||
        (area.focusRole === "side" &&
          effectiveIdleDays >= DORMANT_DAYS &&
          aInboxCount === 0 &&
          !areaAdv.some((a) => a.state === "active") &&
          !this.ghostProposals.some((g) => g.areaId === area.id || g.targetAreaId === area.id));

      if (isDormant) {
        dormantAreas.push({
          id: area.id,
          name: area.name,
          focusRole: area.focusRole,
          domain: area.domain,
          recencyDays: aDays,
          parked: isParked,
          ...(area.parkedReason ? { parkedReason: area.parkedReason } : {}),
          projectCount: projects.length,
        });
      } else {
        const mismatch = mismatchByAreaId.get(area.id);
        const aTone = computeTone({
          recencyDays: aDays,
          inboxMatchCount: aInboxCount,
          parked: isParked,
          focusRole: area.focusRole,
          mainMismatch: Boolean(mismatch),
          inboxHighlightActive: aInboxHighlight,
          hasActiveAdvancement: areaAdv.some((a) => a.state === "active") || projects.some((p) => p.tone === "teal"),
        });
        activeAreas.push({
          id: area.id,
          name: area.name,
          pos: area.pos,
          focusRole: area.focusRole,
          domain: area.domain,
          ...(area.quarterGoal ? { quarterGoal: area.quarterGoal } : {}),
          ...(area.antiGoal ? { antiGoal: area.antiGoal } : {}),
          ...(area.weeklyMinimum ? { weeklyMinimum: area.weeklyMinimum } : {}),
          parked: isParked,
          ...(area.parkedReason ? { parkedReason: area.parkedReason } : {}),
          ...(area.annotation ? { annotation: area.annotation } : {}),
          recencyDays: aDays,
          pulseLabel: formatRecencyLabel(aDays, recentCount),
          tone: aTone.tone,
          signalLabel: aTone.signalLabel,
          ...(mismatch ? { mismatch } : {}),
          projects,
          areaAdvancements: areaAdv,
          inboxMatchCount: aInboxCount,
        });
      }
    }

    const unassignedWorks: StageUnassignedWork[] = entries
      .filter((e) => !assignedKeys.has(e.workKey))
      .map((e) => ({
        workKey: e.workKey,
        workRef: e.workRef,
        title: e.title,
        objectType: e.objectType,
        location: e.location,
        updatedAt: e.updatedAt,
      }));

    return {
      version: this.version,
      generatedAt: now,
      viewport: this.getViewport(),
      areas: activeAreas,
      dormantAreas,
      unassignedWorks,
      inbox: inboxView,
      cooledInboxCount,
      mismatchSignals,
      ...(inboxDiagnostics ? { inboxDiagnostics } : {}),
      ...(timeSnapshot ? { time: timeSnapshot } : {}),
      ghostProposals: structuredClone(this.ghostProposals),
      highlights: structuredClone(this.highlights),
      edgeRadar: this.edgeRadar ? structuredClone(this.edgeRadar) : null,
      presence: [...this.presence.values()].map((p) => structuredClone(p)),
      canUndo: this.undoSnapshot !== null,
      needsColdStart: this.registry.areas.length === 0,
      catalogCount: entries.length,
      ...(appUrl ? { appUrl } : {}),
    };
  }
}

/** Terse 1-line Shared Gaze summary injected into DSH system prompt or shown in Agent telemetry. */
export function compactGazeSummary(snapshot: StageSnapshot): string {
  const { activeTab = "season", zoomLevel, areaId, projectWorkKey, selectedInboxId } = snapshot.viewport;
  const area = areaId ? snapshot.areas.find((a) => a.id === areaId) : undefined;
  const proj = area && projectWorkKey ? area.projects.find((p) => p.workKey === projectWorkKey) : undefined;
  const inbox = selectedInboxId ? snapshot.inbox.find((i) => i.id === selectedInboxId) : undefined;

  const parts: string[] = [];
  if (activeTab === "week" && snapshot.time) {
    const cap = snapshot.time.weekCapacity;
    parts.push(`本周容器（已排 ${cap.openMoveCount}/${cap.recommendedMax} 块，固定日程 ${cap.dailyOverview.filter((d) => d.busyMinutes > 0).length} 天）`);
  } else if (activeTab === "today" && snapshot.time) {
    const morning = snapshot.time.todaySlots.find((s) => s.spec.id === "morning");
    const morningOpen = morning ? morning.items.filter((i) => i.state === "open").length : 0;
    const carry = snapshot.time.carryoverItems.length;
    parts.push(`今日容器（上午·深潜 ${morningOpen} 项${carry > 0 ? `，昨日遗留 ${carry} 项` : ""}）`);
  } else if (snapshot.ghostProposals.some((g) => g.kind === "propose-areas")) {
    parts.push("L0 冷启动虚态星图");
  } else if (zoomLevel === 0) {
    const mainArea = snapshot.areas.find((a) => a.focusRole === "main");
    const mainTag = mainArea ? `，主线「${mainArea.name}」` : "";
    parts.push(`L0 季节星区（${snapshot.areas.length} 个活跃领域${mainTag}，${snapshot.unassignedWorks.length} 项待归位）`);
  } else if (zoomLevel === 1) {
    parts.push(`L1 领域「${area?.name ?? areaId ?? "未知"}」`);
  } else if (zoomLevel === 2) {
    parts.push(`L2 结构「${area?.name ?? ""} / ${proj?.title ?? projectWorkKey ?? ""}」`);
  } else {
    parts.push(`L3 执行入口「${proj?.title ?? ""}」`);
  }

  if (snapshot.time?.activeFocus) {
    parts.push(`专注中「${snapshot.time.activeFocus.title.slice(0, 18)}」`);
  }
  if (snapshot.mismatchSignals.length > 0 && activeTab === "season" && zoomLevel === 0) {
    parts.push(`主线错配提醒：${snapshot.mismatchSignals[0]!.areaName}`);
  }
  if (inbox) {
    parts.push(`已选 Inbox「${inbox.text.slice(0, 24)}」`);
  }
  const ghostCount = snapshot.ghostProposals.length + (snapshot.time?.ghostProposals.length ?? 0);
  if (ghostCount > 0) {
    parts.push(`待拍板虚态推演 ${ghostCount} 条`);
  }
  return parts.join(" · ");
}
