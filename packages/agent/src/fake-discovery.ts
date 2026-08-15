import type { DiscoveryExecutor, DiscoveryJudgeInput, DiscoveryJudgment, DiscoveryMaturity } from "@task-copilot/contracts";

type CandidateKind = Extract<DiscoveryJudgment, { kind: "FORMALIZATION_CANDIDATE" }>["recommendedKind"];
type NoCandidateReason = Extract<DiscoveryJudgment, { kind: "NO_CANDIDATE" }>["reason"];

interface CandidateDraft {
  handles: string[];
  kind: CandidateKind;
  title: string | null;
  ownerId: string | null;
  maturity: DiscoveryMaturity;
  supporting: string[] | null;
}

/**
 * Deterministic discovery fixture. Textual directives are test scaffolding only.
 *
 * - `@existing:<object title>` -> ASSOCIATE_EXISTING;
 * - `@attach:<candidateId>` -> ATTACH_TO_CANDIDATE;
 * - `@candidate:<TASK|MINI_PROJECT|PROJECT|UNRESOLVED>:<title>[:KEEP_OBSERVING|READY_FOR_DECISION]`;
 * - `@candidate-owner:<workObjectId>` adds owner and source handle;
 * - `@no-candidate:<reason>`.
 *
 * Everything else defaults to NO_CANDIDATE/UNCERTAIN.
 */
export class FakeDiscoveryExecutor implements DiscoveryExecutor {
  readonly id = "fake-discovery";

  async judge(input: DiscoveryJudgeInput): Promise<DiscoveryJudgment[]> {
    if (input.profile.executor !== "FAKE") throw new Error("PROFILE_EXECUTOR_MISMATCH");
    if (input.profile.remoteEnabled) throw new Error("FAKE_EXECUTOR_PROFILE_REMOTE_MISMATCH");
    const judgments: DiscoveryJudgment[] = [];
    let currentCandidate: CandidateDraft | null = null;

    const flushCandidate = () => {
      if (!currentCandidate) return;
      judgments.push({
        kind: "FORMALIZATION_CANDIDATE", sourceHandles: currentCandidate.handles, recommendedKind: currentCandidate.kind,
        recommendedOwnerId: currentCandidate.ownerId, proposedTitle: currentCandidate.title,
        proposedWorkIntent: null, maturity: currentCandidate.maturity, supportingHandles: currentCandidate.supporting ?? [...currentCandidate.handles],
        rationaleSummary: "Fixture directive requested a restrained formalization boundary.",
      });
      currentCandidate = null;
    };

    for (const item of input.contextPack) {
      const existing = /@existing:([^\n]+)/u.exec(item.content)?.[1]?.trim();
      if (existing) {
        flushCandidate();
        const target = input.existingObjects.find((object) => object.title === existing || object.title.includes(existing) || existing.includes(object.title));
        judgments.push({ kind: "ASSOCIATE_EXISTING", sourceHandles: [item.handle], targetWorkObjectId: target?.workObjectId ?? "MISSING_TARGET_FOR_TEST", rationaleSummary: `Explicit existing-object reference: ${existing}` });
        continue;
      }
      const attach = /@attach:([^\s]+)/u.exec(item.content)?.[1];
      if (attach) {
        flushCandidate();
        judgments.push({ kind: "ATTACH_TO_CANDIDATE", candidateId: attach, sourceHandles: [item.handle], rationaleSummary: `Fixture directive attached this source to candidate ${attach}.` });
        continue;
      }
      const noCandidate = /@no-candidate:(EPHEMERAL|ONE_OFF|REFERENCE_ONLY|INSUFFICIENT_BOUNDARY|ALREADY_COVERED|UNCERTAIN)/u.exec(item.content)?.[1];
      if (noCandidate) {
        flushCandidate();
        judgments.push({ kind: "NO_CANDIDATE", sourceHandles: [item.handle], reason: noCandidate as NoCandidateReason, rationaleSummary: `Fixture directive requested suppression: ${noCandidate}` });
        continue;
      }
      const candidate = /@candidate:(TASK|MINI_PROJECT|PROJECT|UNRESOLVED):([^:\n]+)(?::(KEEP_OBSERVING|READY_FOR_DECISION|INSUFFICIENT_BOUNDARY))?/u.exec(item.content);
      if (candidate) {
        flushCandidate();
        currentCandidate = { handles: [item.handle], kind: candidate[1] as CandidateKind, title: candidate[2]!.trim() || null, ownerId: null, maturity: (candidate[3] as DiscoveryMaturity | undefined) ?? "KEEP_OBSERVING", supporting: null };
        continue;
      }
      const supporting = /@supporting:([^\s]+)/u.exec(item.content)?.[1];
      if (supporting && currentCandidate) { currentCandidate.supporting = supporting.split(",").map((handle) => handle.trim()).filter(Boolean); continue; }
      const owner = /@candidate-owner:([^\s]+)/u.exec(item.content)?.[1];
      if (owner && currentCandidate) { currentCandidate.ownerId = owner; currentCandidate.handles.push(item.handle); continue; }
      if (!currentCandidate) {
        judgments.push({ kind: "NO_CANDIDATE", sourceHandles: [item.handle], reason: "UNCERTAIN", rationaleSummary: "No deterministic existing-object or formalization-boundary signal." });
      }
    }
    flushCandidate();
    return judgments;
  }
}
