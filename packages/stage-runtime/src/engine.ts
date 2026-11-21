import type { CatalogSnapshot } from "@task-copilot/contracts";
import {
  buildColdStartAreaDrafts,
  computeTone,
  defaultAreaPosition,
  flattenCatalog,
  formatRecencyLabel,
  matchInboxLocally,
  recencyDays,
} from "./pulse.ts";
import type {
  ColdStartAreaDraft,
  StageAdvancementItem,
  StageAgentPresence,
  StageArea,
  StageAreaNode,
  StageCatalogEntry,
  StageDormantArea,
  StageEdgeRadar,
  StageGhostProposal,
  StageHighlight,
  StageInboxRawItem,
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
    areas.push({
      id: rec.id,
      name: rec.name.slice(0, 64),
      workKeys: [...new Set(workKeys)],
      pos: { x, y },
      parked: rec.parked === true,
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
    const level: StageZoomLevel =
      patch.zoomLevel === 0 || patch.zoomLevel === 1 || patch.zoomLevel === 2 || patch.zoomLevel === 3
        ? patch.zoomLevel
        : this.viewport.zoomLevel;
    this.viewport = {
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
   * Focuses the stage anchored at a specific Logseq WorkRef key (used by Logseq "拉远 ↖").
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
      areas?: Array<{ name: string; workKeys: string[] }>;
      unassignedWorkKeys?: string[];
    },
    now = Date.now(),
  ): StageGhostProposal {
    const entries = flattenCatalog(input.catalog);
    const byKey = new Map(entries.map((e) => [e.workKey, e]));

    let drafts: ColdStartAreaDraft[];
    let unassignedTitles: string[];

    if (input.areas && input.areas.length > 0) {
      // Enforce D-53 anti-clutter hard cap: max 7 top-level Areas
      const capped = input.areas.slice(0, 7);
      const claimed = new Set<string>();
      drafts = capped.map((item, idx) => {
        const cleanKeys = [...new Set(item.workKeys.filter((k) => byKey.has(k) && !claimed.has(k)))];
        for (const k of cleanKeys) claimed.add(k);
        return {
          id: makeId("area-draft", this.seq++, now),
          name: item.name.trim().slice(0, 48) || `领域 ${idx + 1}`,
          workKeys: cleanKeys,
          anchorTitles: cleanKeys.slice(0, 3).map((k) => byKey.get(k)?.title ?? k),
          pos: defaultAreaPosition(idx),
        };
      });
      const explicitUnassigned = input.unassignedWorkKeys ?? entries.filter((e) => !claimed.has(e.workKey)).map((e) => e.workKey);
      unassignedTitles = explicitUnassigned.slice(0, 8).map((k) => byKey.get(k)?.title ?? k);
    } else {
      const built = buildColdStartAreaDrafts(entries, 7);
      drafts = built.areas;
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
        this.registry.areas = proposal.proposedAreas.slice(0, 7).map((draft, i) => ({
          id: draft.id.startsWith("area-draft-") ? `area-${i + 1}-${now.toString(36)}` : draft.id,
          name: draft.name,
          workKeys: [...new Set(draft.workKeys)],
          pos: draft.pos ?? defaultAreaPosition(i),
          parked: false,
          createdAt: now,
          updatedAt: now,
        }));
        const claimed = new Set(this.registry.areas.flatMap((a) => a.workKeys));
        this.registry.unassignedWorkKeys = this.registry.unassignedWorkKeys.filter((k) => !claimed.has(k));
        this.registry.updatedAt = now;
        committedIds.push(proposal.id);
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

  toggleParkArea(areaId: string, parked: boolean, reason?: string, now = Date.now()): boolean {
    const area = this.registry.areas.find((a) => a.id === areaId);
    if (!area) return false;
    this.captureUndo();
    area.parked = parked;
    if (parked && reason?.trim()) {
      area.parkedReason = reason.trim().slice(0, 160);
    } else if (!parked) {
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
      case "toggle-advancement-done":
        return { mutatedRegistry: this.toggleAdvancementDone(action.advancementId, now), archivedInboxIds: [] };
      case "mark-promoted-logseq":
        return { mutatedRegistry: this.markAdvancementPromoted(action.advancementId, now), archivedInboxIds: [] };
      case "clear-radar":
        this.clearRadar();
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
  ): StageSnapshot {
    this.pruneEphemeral(now);
    const entries = flattenCatalog(catalogSnapshots);
    const byKey = new Map<string, StageCatalogEntry>(entries.map((e) => [e.workKey, e]));

    // Build effective areas (use committed registry; if empty, show unassigned pool + needsColdStart)
    const effectiveAreas = this.registry.areas;
    const inboxView = matchInboxLocally(inboxItems, effectiveAreas, byKey);

    const activeAreas: StageAreaNode[] = [];
    const dormantAreas: StageDormantArea[] = [];
    const assignedKeys = new Set<string>();

    for (const area of effectiveAreas) {
      const projects: StageProjectNode[] = [];
      let newestMs = area.updatedAt;
      let recentCount = 0;

      for (const pKey of area.workKeys) {
        const entry = byKey.get(pKey);
        if (!entry) continue;
        assignedKeys.add(pKey);
        const pAdv = this.registry.advancements.filter((a) => a.areaId === area.id && a.projectWorkKey === pKey);
        const pLastMs = Math.max(entry.updatedAt, ...pAdv.map((a) => a.updatedAt));
        if (pLastMs > newestMs) newestMs = pLastMs;
        const pDays = recencyDays(pLastMs, now);
        if (pDays <= 7) recentCount++;

        const pInboxCount = inboxView.filter((i) => i.matchProjectWorkKeys.includes(pKey)).length;
        const pTone = computeTone({
          recencyDays: pDays,
          inboxMatchCount: pInboxCount,
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
        newestMs = Math.max(newestMs, ...areaAdv.map((a) => a.updatedAt));
      }
      const aDays = recencyDays(newestMs, now);
      const aInboxCount = inboxView.filter((i) => i.matchAreaIds.includes(area.id)).length;
      const isDormant =
        area.parked ||
        (aDays >= DORMANT_DAYS &&
          aInboxCount === 0 &&
          !areaAdv.some((a) => a.state === "active") &&
          !this.ghostProposals.some((g) => g.areaId === area.id || g.targetAreaId === area.id));

      if (isDormant) {
        dormantAreas.push({
          id: area.id,
          name: area.name,
          recencyDays: aDays,
          parked: area.parked,
          ...(area.parkedReason ? { parkedReason: area.parkedReason } : {}),
          projectCount: projects.length,
        });
      } else {
        const aTone = computeTone({
          recencyDays: aDays,
          inboxMatchCount: aInboxCount,
          parked: area.parked,
          hasActiveAdvancement: areaAdv.some((a) => a.state === "active") || projects.some((p) => p.tone === "teal"),
        });
        activeAreas.push({
          id: area.id,
          name: area.name,
          pos: area.pos,
          parked: area.parked,
          ...(area.parkedReason ? { parkedReason: area.parkedReason } : {}),
          ...(area.annotation ? { annotation: area.annotation } : {}),
          recencyDays: aDays,
          pulseLabel: formatRecencyLabel(aDays, recentCount),
          tone: aTone.tone,
          signalLabel: aTone.signalLabel,
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
  const { zoomLevel, areaId, projectWorkKey, selectedInboxId } = snapshot.viewport;
  const area = areaId ? snapshot.areas.find((a) => a.id === areaId) : undefined;
  const proj = area && projectWorkKey ? area.projects.find((p) => p.workKey === projectWorkKey) : undefined;
  const inbox = selectedInboxId ? snapshot.inbox.find((i) => i.id === selectedInboxId) : undefined;

  const parts: string[] = [];
  if (snapshot.ghostProposals.some((g) => g.kind === "propose-areas")) {
    parts.push("L0 冷启动虚态星图");
  } else if (zoomLevel === 0) {
    parts.push(`L0 全局星区（${snapshot.areas.length} 个活跃领域，${snapshot.unassignedWorks.length} 项待归位）`);
  } else if (zoomLevel === 1) {
    parts.push(`L1 领域「${area?.name ?? areaId ?? "未知"}」`);
  } else if (zoomLevel === 2) {
    parts.push(`L2 结构「${area?.name ?? ""} / ${proj?.title ?? projectWorkKey ?? ""}」`);
  } else {
    parts.push(`L3 执行入口「${proj?.title ?? ""}」`);
  }

  if (inbox) {
    parts.push(`已选 Inbox「${inbox.text.slice(0, 24)}」`);
  }
  if (snapshot.ghostProposals.length > 0) {
    parts.push(`待拍板虚态推演 ${snapshot.ghostProposals.length} 条`);
  }
  return parts.join(" · ");
}
