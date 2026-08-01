import { StructuredError } from "@task-copilot/shared";

import type { AgentContextTier } from "./agent-governance.ts";

export type AgentContextSectionKind =
  | "SOURCE_ROOT"
  | "SKILL_RULE"
  | "FORMAL_FACTS"
  | "COUNTER_SIGNALS"
  | "USER_FEEDBACK"
  | "PARENT_CHAIN"
  | "SUBTREE"
  | "SIBLINGS"
  | "PAGE_CONTEXT"
  | "RELATED_DECISIONS"
  | "REVIEW_SIGNALS"
  | "CANDIDATE_TARGETS"
  | "WORKSITE"
  | "BOUNDARY_INFO";

export interface AgentContextSection {
  id: string;
  kind: AgentContextSectionKind;
  content: string;
  estimatedTokens: number;
  required: boolean;
  relevance: number;
}

export interface BuildAgentDecisionContextInput {
  tier: AgentContextTier;
  tokenBudget: number;
  sections: AgentContextSection[];
}

export interface AgentDecisionContextPackage {
  tier: AgentContextTier;
  tokenBudget: number;
  sections: AgentContextSection[];
  estimatedInputTokens: number;
  contextTruncated: boolean;
  omittedSections: string[];
  requiredEvidenceOmitted: string[];
  deduplicatedSectionCount: number;
}

const kindPriority: Record<AgentContextSectionKind, number> = {
  SOURCE_ROOT: 0,
  SKILL_RULE: 1,
  FORMAL_FACTS: 2,
  COUNTER_SIGNALS: 3,
  USER_FEEDBACK: 4,
  PARENT_CHAIN: 5,
  SUBTREE: 6,
  SIBLINGS: 7,
  PAGE_CONTEXT: 8,
  CANDIDATE_TARGETS: 9,
  BOUNDARY_INFO: 10,
  WORKSITE: 11,
  REVIEW_SIGNALS: 12,
  RELATED_DECISIONS: 13,
};

function contextError(message: string): StructuredError {
  return new StructuredError({ code: "AGENT_CONTEXT_INVALID", message, ruleRefs: ["ADG-CONTEXT-01"] });
}

function validateSection(value: AgentContextSection): AgentContextSection {
  const id = value.id.trim();
  if (!id || id.length > 128) throw contextError("Context section id 必须是受控稳定标识。");
  if (!(value.kind in kindPriority)) throw contextError("Context section kind 不受支持。");
  if (!value.content.trim() || value.content.length > 256_000) throw contextError("Context section 正文为空或超出上限。");
  if (!Number.isSafeInteger(value.estimatedTokens) || value.estimatedTokens < 1 || value.estimatedTokens > 100_000) {
    throw contextError("Context section token 估算必须是受控正整数。");
  }
  if (!Number.isFinite(value.relevance) || value.relevance < 0 || value.relevance > 100) {
    throw contextError("Context section relevance 必须位于 0..100。");
  }
  return { ...value, id };
}

function compareSections(left: AgentContextSection, right: AgentContextSection): number {
  if (left.required !== right.required) return left.required ? -1 : 1;
  const kind = kindPriority[left.kind] - kindPriority[right.kind];
  if (kind !== 0) return kind;
  const relevance = right.relevance - left.relevance;
  return relevance !== 0 ? relevance : left.id.localeCompare(right.id);
}

export function buildAgentDecisionContext(input: BuildAgentDecisionContextInput): AgentDecisionContextPackage {
  if (!Number.isSafeInteger(input.tokenBudget) || input.tokenBudget < 16 || input.tokenBudget > 200_000) {
    throw contextError("Context token budget 必须位于 16..200000。");
  }
  const validated = input.sections.map(validateSection).sort(compareSections);
  const sourceRoots = validated.filter(({ kind }) => kind === "SOURCE_ROOT");
  if (sourceRoots.length !== 1) throw contextError("Context 必须包含且只包含一个 Source Root。");
  if (sourceRoots[0]!.estimatedTokens > input.tokenBudget) throw contextError("Source Root 超出 context budget，不得静默截断。");

  const seenContent = new Set<string>();
  const unique: AgentContextSection[] = [];
  const duplicateIds: string[] = [];
  for (const section of validated) {
    const fingerprint = section.content.normalize("NFKC").replace(/\s+/gu, " ").trim();
    if (seenContent.has(fingerprint)) {
      duplicateIds.push(section.id);
      continue;
    }
    seenContent.add(fingerprint);
    unique.push(section);
  }

  const selected: AgentContextSection[] = [];
  const omitted: string[] = [];
  const requiredEvidenceOmitted: string[] = [];
  let estimatedInputTokens = 0;
  for (const section of unique) {
    if (estimatedInputTokens + section.estimatedTokens <= input.tokenBudget) {
      selected.push(section);
      estimatedInputTokens += section.estimatedTokens;
    } else {
      omitted.push(section.id);
      if (section.required) requiredEvidenceOmitted.push(section.id);
    }
  }
  omitted.push(...duplicateIds);
  return {
    tier: input.tier,
    tokenBudget: input.tokenBudget,
    sections: selected,
    estimatedInputTokens,
    contextTruncated: omitted.length > 0,
    omittedSections: omitted,
    requiredEvidenceOmitted,
    deduplicatedSectionCount: duplicateIds.length,
  };
}
