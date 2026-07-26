import {
  projectV2ProjectReentry,
  type UnifiedUxFactAuthority,
  type UnifiedUxNextActionAuthority,
  type V2ReentryCommitFact,
  type V2ReentryProjection,
} from "@task-copilot/application";
import type {
  FocusSelection,
  V2Anchor,
  V2Association,
  V2ManagedObject,
  V2PrimaryOwnership,
} from "@task-copilot/domain";
import { checksum, stableJson } from "@task-copilot/shared";

import type { ServiceContextPackage } from "./context-package.ts";
import type { UxOutputGenerationRequest } from "./llm-ux-output.ts";
import type { TaskCopilotSkillDocument } from "./skill-catalog.ts";

export interface ProjectContextRecoverySource {
  observedAt: string;
  project: V2ManagedObject;
  objects: readonly V2ManagedObject[];
  ownerships: readonly V2PrimaryOwnership[];
  associations: readonly V2Association[];
  focus: readonly FocusSelection[];
  anchors: readonly V2Anchor[];
  commits: readonly V2ReentryCommitFact[];
  contextPackage: ServiceContextPackage;
  contextFingerprint: string;
  coreSkill: TaskCopilotSkillDocument;
  recoverySkill: TaskCopilotSkillDocument;
}

export interface ProjectContextRecoveryGeneration {
  request: UxOutputGenerationRequest;
  projection: V2ReentryProjection;
}

function projectRef(project: V2ManagedObject): string {
  return `object:${project.objectId}@v${project.version}`;
}

function nextAction(projection: V2ReentryProjection): UnifiedUxNextActionAuthority[] {
  const action = projection.primaryAction;
  if (!action) return [];
  if (action.intent === "OPEN_PRIMARY_ANCHOR") {
    return [{
      actionId: "project-primary-action",
      intent: "OPEN_SOURCE",
      label: action.label,
      targetRef: `anchor:${action.targetAnchorId}`,
      evidenceRefs: [`object:${action.targetObjectId}`, `anchor:${action.targetAnchorId}`],
    }];
  }
  return [{
    actionId: "project-primary-action",
    intent: "OPEN_REVIEW",
    label: action.label,
    targetRef: `commit:${action.targetCommitId}`,
    evidenceRefs: [`commit:${action.targetCommitId}`],
  }];
}

function facts(project: V2ManagedObject, projection: V2ReentryProjection): UnifiedUxFactAuthority[] {
  const summaryRef = projectRef(project);
  return [{
    factId: "project-recovery-summary",
    text: projection.summary,
    sourceRefs: [summaryRef],
  }, ...projection.facts.map((fact, index) => ({
    factId: `project-fact-${index + 1}`,
    text: fact.text,
    sourceRefs: [...fact.sourceRefs],
  }))];
}

export function buildProjectContextRecoveryGeneration(
  source: ProjectContextRecoverySource,
): ProjectContextRecoveryGeneration {
  const projection = projectV2ProjectReentry({
    observedAt: source.observedAt,
    project: source.project,
    objects: source.objects.filter(({ objectId }) => objectId !== source.project.objectId),
    ownerships: source.ownerships,
    associations: source.associations,
    focus: source.focus,
    anchors: source.anchors,
    commits: source.commits,
  });
  const packageFiles = Object.fromEntries(
    Object.entries(source.contextPackage.files)
      .filter(([path]) => !path.startsWith("skills/") && path !== "workspace-semantics.md" && path !== "writing-profile.md"),
  );
  const userSemantics = [
    source.contextPackage.files["workspace-semantics.md"],
    source.contextPackage.files["writing-profile.md"],
  ].filter((value): value is string => value !== undefined).join("\n");
  const authorityFacts = facts(source.project, projection);
  const authorityActions = nextAction(projection);
  return {
    projection,
    request: {
      observedAt: source.observedAt,
      frontstageLanguage: "zh-CN",
      core: {
        version: source.coreSkill.version,
        content: source.coreSkill.content,
      },
      skill: {
        name: source.recoverySkill.name,
        version: source.recoverySkill.version,
        content: source.recoverySkill.content,
      },
      userSemantics: {
        version: checksum(userSemantics),
        content: userSemantics,
      },
      runtimeContext: {
        version: `context:${source.contextFingerprint}`,
        content: stableJson({
          authority: "READ_ONLY_DERIVATIVE",
          contextFingerprint: source.contextFingerprint,
          manifest: source.contextPackage.manifest,
          files: packageFiles,
          deterministicProjection: projection,
          uxAuthority: {
            facts: authorityFacts.map(({ factId, sourceRefs }) => ({ factId, sourceRefs })),
            allowedNextActions: authorityActions.map(({ actionId, intent, label, evidenceRefs }) => ({ actionId, intent, label, evidenceRefs })),
          },
        }),
      },
      minimumRiskLevel: ["PENDING", "RECOVERY_REQUIRED"].includes(projection.safetyState) ? "HIGH" : "NONE",
      requiresDiscussion: projection.sufficiency === "INSUFFICIENT",
      requiresReview: false,
      facts: authorityFacts,
      allowedNextActions: authorityActions,
    },
  };
}
