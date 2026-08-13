import type { GraphEffect, GraphSnapshot, ManagedProjection } from "@task-copilot/contracts";

type RecoveryRemovalEffect = Extract<GraphEffect, { type: "REMOVE_MANAGED_PROJECTION" }> & { expectedProjection: ManagedProjection };

export interface RecoveryVerificationReader {
  readAbsentProjection(effect: RecoveryRemovalEffect): Promise<GraphSnapshot>;
  readTargetProjection(targetId: string): Promise<GraphSnapshot>;
}

/** A create compensation deletes its WorkObject before Graph verification. */
export async function readRecoveryVerificationSnapshot(effect: GraphEffect, targetId: string | null, reader: RecoveryVerificationReader): Promise<GraphSnapshot> {
  if (effect.type === "REMOVE_MANAGED_PROJECTION") {
    if (!effect.expectedProjection) throw new Error("RECOVERY_EXPECTED_PROJECTION_REQUIRED");
    return reader.readAbsentProjection(effect as RecoveryRemovalEffect);
  }
  if (!targetId) throw new Error("RECOVERY_TARGET_REQUIRED");
  return reader.readTargetProjection(targetId);
}
