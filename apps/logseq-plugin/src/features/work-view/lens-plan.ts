import { lensArray, lensHash, lensRecord, lensText, requireLens } from "./lens-input.ts";
import { readLensScope, sameLensScope, type LensScope, type LensSourceSnapshot } from "./lens-source.ts";

export interface BlockRange { sourceId: string; contentVersion: string; unit: "block" }
export interface FocusRequest { schemaVersion: 1; requestId: string; scope: LensScope; question: string }
export interface FocusPlan extends FocusRequest {
  structureVersion: string;
  sourceSetVersion?: string;
  sourceVersions: Array<{ sourceId: string; contentVersion: string }>;
  visibleRanges: BlockRange[];
  emphasisRanges?: BlockRange[];
  gaps?: string[];
  temporaryInference?: string | null;
}
export interface VerifiedFocus {
  plan: FocusPlan;
  selected: ReadonlySet<string>;
  ancestors: ReadonlySet<string>;
  emphasis: ReadonlySet<string>;
  basis: LensSourceSnapshot;
}
function ranges(value: unknown): BlockRange[] {
  return lensArray(value, 2000, 1).map(value => {
    const range = lensRecord(value, ["sourceId", "contentVersion", "unit"], "invalid-range");
    requireLens(range.unit === "block", "unsupported-range-unit");
    return { sourceId: lensText(range.sourceId, 4096), contentVersion: lensHash(range.contentVersion), unit: "block" };
  });
}
export function decodeFocusPlan(value: unknown): FocusPlan {
  const raw = lensRecord(value, ["schemaVersion", "requestId", "scope", "question", "structureVersion", "sourceSetVersion", "sourceVersions", "visibleRanges", "emphasisRanges", "gaps", "temporaryInference"], "invalid-plan");
  requireLens(raw.schemaVersion === 1, "unsupported-plan-schema");
  const plan: FocusPlan = {
    schemaVersion: 1, requestId: lensText(raw.requestId, 128), scope: readLensScope(raw.scope),
    question: lensText(raw.question, 240), structureVersion: lensHash(raw.structureVersion),
    sourceVersions: lensArray(raw.sourceVersions, 10_000, 1).map(value => {
      const version = lensRecord(value, ["sourceId", "contentVersion"]);
      return { sourceId: lensText(version.sourceId, 4096), contentVersion: lensHash(version.contentVersion) };
    }),
    visibleRanges: ranges(raw.visibleRanges),
  };
  if (raw.sourceSetVersion !== undefined) plan.sourceSetVersion = lensHash(raw.sourceSetVersion);
  if (raw.emphasisRanges !== undefined) plan.emphasisRanges = lensArray(raw.emphasisRanges, 2000).length ? ranges(raw.emphasisRanges) : [];
  if (raw.gaps !== undefined) plan.gaps = lensArray(raw.gaps, 8).map(value => lensText(value, 240));
  if (raw.temporaryInference !== undefined) plan.temporaryInference = raw.temporaryInference === null ? null : lensText(raw.temporaryInference, 300);
  return plan;
}
export function validateFocusPlan(plan: FocusPlan, source: LensSourceSnapshot, request: FocusRequest): VerifiedFocus {
  requireLens(plan.requestId === request.requestId && plan.question === request.question, "superseded-request");
  requireLens(sameLensScope(plan.scope, request.scope) && sameLensScope(source.scope, request.scope), "scope-mismatch");
  requireLens(plan.structureVersion === source.structureVersion, "stale-structure");
  requireLens(plan.sourceSetVersion === undefined || plan.sourceSetVersion === source.sourceSetVersion, "stale-source-set");
  const byId = new Map(source.blocks.map(block => [block.sourceId, block])), byUuid = new Map(source.blocks.map(block => [block.target.blockUuid, block]));
  const versions = new Map<string, string>();
  for (const version of plan.sourceVersions) {
    requireLens(!versions.has(version.sourceId), "duplicate-source-version");
    const block = byId.get(version.sourceId);
    requireLens(block, "source-not-in-scope"); requireLens(block.availability === "available", "source-unavailable");
    requireLens(block.contentVersion === version.contentVersion, "stale-content");
    versions.set(version.sourceId, version.contentVersion);
  }
  const selected = new Set<string>(), ancestors = new Set<string>(), emphasis = new Set<string>();
  for (const range of plan.visibleRanges) {
    const block = byId.get(range.sourceId); requireLens(block, "source-not-in-scope");
    requireLens(!selected.has(block.target.blockUuid), "duplicate-range");
    requireLens(block.availability === "available", "source-unavailable");
    requireLens(block.contentVersion === range.contentVersion && versions.get(range.sourceId) === range.contentVersion, "stale-content");
    selected.add(block.target.blockUuid);
    let parent = block.parentUuid;
    while (parent !== null) {
      const ancestor = byUuid.get(parent); requireLens(ancestor?.availability === "available", "source-unavailable");
      requireLens(versions.get(ancestor.sourceId) === ancestor.contentVersion, "ancestor-version-required");
      ancestors.add(parent); parent = ancestor.parentUuid;
    }
  }
  for (const range of plan.emphasisRanges ?? []) {
    const block = byId.get(range.sourceId);
    requireLens(block && selected.has(block.target.blockUuid), "emphasis-not-visible");
    requireLens(range.contentVersion === block.contentVersion && versions.get(range.sourceId) === range.contentVersion, "stale-content");
    requireLens(!emphasis.has(block.target.blockUuid), "duplicate-range"); emphasis.add(block.target.blockUuid);
  }
  return { plan, selected, ancestors, emphasis, basis: source };
}
export function focusBasisChanged(focus: VerifiedFocus, source: LensSourceSnapshot): boolean {
  if (!sameLensScope(focus.plan.scope, source.scope) || focus.plan.structureVersion !== source.structureVersion) return true;
  if (focus.plan.sourceSetVersion && focus.plan.sourceSetVersion !== source.sourceSetVersion) return true;
  const current = new Map(source.blocks.map(block => [block.sourceId, block]));
  return focus.plan.sourceVersions.some(version => {
    const block = current.get(version.sourceId);
    return !block || block.availability !== "available" || block.contentVersion !== version.contentVersion;
  });
}
