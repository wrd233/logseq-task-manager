import { requiredV2ProposalRevalidationScope, type V2Proposal, type V2ProposalScopeObservation } from "@task-copilot/domain";
import { StructuredError, checksum } from "@task-copilot/shared";

export interface ProposalRevalidationGraphHost {
  getBlock(id: string): Promise<unknown>;
  getPage(id: string): Promise<unknown>;
}

function revalidationError(message: string): StructuredError {
  return new StructuredError({ code: "V2_PROPOSAL_GRAPH_EVIDENCE_INVALID", message, ruleRefs: ["D-185", "D-188"] });
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function observedVersion(value: unknown): number | undefined {
  const candidate = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return Number.isSafeInteger(candidate) && Number(candidate) >= 0 ? Number(candidate) : undefined;
}

export function proposalPageEvidenceHash(value: unknown): string {
  const page = record(value);
  if (!page) throw revalidationError("Logseq Page evidence shape 无效。");
  return checksum({
    uuid: typeof page.uuid === "string" ? page.uuid : "",
    name: typeof page.name === "string" ? page.name : "",
    originalName: typeof page.originalName === "string" ? page.originalName : "",
    updatedAt: observedVersion(page.updatedAt ?? page["updated-at"]),
  });
}

export async function collectV2ProposalGraphObservations(
  proposal: V2Proposal,
  host: ProposalRevalidationGraphHost,
): Promise<V2ProposalScopeObservation[]> {
  const targets = requiredV2ProposalRevalidationScope(proposal).targets.filter((target) => target.kind !== "OBJECT");
  const observations: V2ProposalScopeObservation[] = [];
  for (const target of targets) {
    if (target.kind === "BLOCK") {
      const value = await host.getBlock(target.id);
      if (value === null || value === undefined) { observations.push({ kind: "BLOCK", id: target.id, exists: false }); continue; }
      const block = record(value);
      if (!block || typeof block.content !== "string") throw revalidationError("Logseq Block evidence shape 无效。");
      if (typeof block.uuid === "string" && block.uuid !== target.id) throw revalidationError("Logseq Block identity 与 Proposal scope 不一致。");
      const version = observedVersion(block.updatedAt ?? block["updated-at"]);
      observations.push({ kind: "BLOCK", id: target.id, exists: true, ...(version === undefined ? {} : { version }), hash: checksum(block.content) });
      continue;
    }
    const value = await host.getPage(target.id);
    if (value === null || value === undefined) { observations.push({ kind: "PAGE", id: target.id, exists: false }); continue; }
    const page = record(value);
    if (!page) throw revalidationError("Logseq Page evidence shape 无效。");
    const version = observedVersion(page.updatedAt ?? page["updated-at"]);
    observations.push({ kind: "PAGE", id: target.id, exists: true, ...(version === undefined ? {} : { version }), hash: proposalPageEvidenceHash(page) });
  }
  return observations;
}
