import { createHash } from "node:crypto";

import { calculateSignals, previewLegacyStateMigration, type LegacyMigrationPreview } from "@task-copilot/domain";
import { restoreRecoveryBundle, type RecoveryBundle } from "@task-copilot/persistence";
import { StructuredError, stableJson } from "@task-copilot/shared";

export interface LegacyMigrationScanReport {
  schemaVersion: 1;
  sourceBundleSha256: string;
  sourceCreatedAt: string;
  status: "SCANNED";
  zeroFormalWrites: true;
  counts: { total: number; directBind: number; needsConfirmation: number; keepOrdinary: number; structuralError: number };
  previews: LegacyMigrationPreview[];
}

function migrationError(code: string, message: string): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-189", "D-193", "D-199", "D-208"] });
}

export function scanLegacyRecoveryBundle(bundle: RecoveryBundle): LegacyMigrationScanReport {
  const restored = restoreRecoveryBundle(bundle);
  if (restored.differences.length > 0) throw migrationError("MIGRATION_BUNDLE_ROUND_TRIP_MISMATCH", "V1 Recovery Bundle 无法无损只读恢复。");
  if (restored.state.commits.some(({ status }) => status === "PENDING" || status === "RECOVERY_REQUIRED")) throw migrationError("MIGRATION_SOURCE_RECOVERY_REQUIRED", "V1 Recovery Bundle 含未完成或待恢复 Commit；扫描已停止。");
  const sourceBundleSha256 = createHash("sha256").update(stableJson(bundle)).digest("hex");
  const previews = restored.state.objects.map((object) => {
    const anchors = restored.state.anchors.filter(({ objectId }) => objectId === object.objectId);
    const events = restored.state.events.filter(({ objectId }) => objectId === object.objectId);
    const commits = restored.state.commits.filter(({ domainChanges }) => domainChanges.some(({ entityType, entityId }) => entityType === "OBJECT" && entityId === object.objectId));
    const conflicts = [object.conflict?.message, ...anchors.filter(({ status }) => status === "conflict").map(({ anchorId }) => `Anchor conflict: ${anchorId}`)].filter((value): value is string => Boolean(value));
    const operations = events.map(({ operationType }) => operationType.toLowerCase());
    return previewLegacyStateMigration({
      legacyObjectId: object.objectId,
      sourceBundleSha256,
      objectType: object.objectType,
      phase: object.phase,
      condition: object.condition,
      signals: calculateSignals(object, restored.state.relations, new Date(bundle.createdAt)),
      evidenceRefs: [`object:${object.objectId}`, ...anchors.map(({ anchorId }) => `anchor:${anchorId}`), ...commits.map(({ semanticCommitId }) => `commit:${semanticCommitId}`), ...events.map(({ eventId }) => `event:${eventId}`)],
      ...(object.phase === "COMPLETED" ? { completionEvidenceConsistent: !object.conflict && commits.some(({ status }) => status === "COMPLETED") } : {}),
      ...(object.phase === "CANCELLED" ? { cancellationEvidence: operations.some((name) => name.includes("cancel")) } : {}),
      ...(object.phase === "ARCHIVED" ? { archiveEvidence: operations.some((name) => name.includes("archive")) } : {}),
      ...(conflicts.length > 0 ? { stateConflict: conflicts.join("; ") } : {}),
    });
  }).sort((left, right) => left.legacyObjectId.localeCompare(right.legacyObjectId));
  const count = (classification: LegacyMigrationPreview["classification"]): number => previews.filter((preview) => preview.classification === classification).length;
  return {
    schemaVersion: 1,
    sourceBundleSha256,
    sourceCreatedAt: bundle.createdAt,
    status: "SCANNED",
    zeroFormalWrites: true,
    counts: { total: previews.length, directBind: count("DIRECT_BIND"), needsConfirmation: count("NEEDS_CONFIRMATION"), keepOrdinary: count("KEEP_ORDINARY"), structuralError: count("STRUCTURAL_ERROR") },
    previews,
  };
}
