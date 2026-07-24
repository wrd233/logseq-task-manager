import {
  projectV2ProjectReentry,
  type V2ReentryAction,
  type V2ReentryProjection,
} from "@task-copilot/application";
import type {
  V2Anchor,
  V2Association,
  V2ManagedObject,
  V2PrimaryOwnership,
} from "@task-copilot/domain";
import type {
  ServiceNowWork,
  ServiceSemanticCommit,
  ServiceStoredProposal,
} from "@task-copilot/service-client";

export interface PluginReentryRoute {
  action: "v2-open-primary-anchor" | "view";
  value: string;
  label: string;
}

export interface PluginProjectReentryCard {
  project: V2ManagedObject;
  projection: V2ReentryProjection;
  focused: boolean;
  primaryRoute?: PluginReentryRoute;
  entryPointRoutes: PluginReentryRoute[];
}

function proposalObjectIds(record: ServiceStoredProposal): string[] {
  const objectIds = new Set<string>();
  for (const target of record.proposal.scope.modify) {
    if (target.kind === "OBJECT") objectIds.add(target.id);
  }
  for (const group of record.proposal.groups) {
    for (const operation of group.semanticOperations) {
      if (operation.target.kind === "OBJECT") objectIds.add(operation.target.id);
    }
  }
  return [...objectIds].sort();
}

function routeForAction(
  action: V2ReentryAction | undefined,
  anchors: ReadonlyMap<string, V2Anchor>,
): PluginReentryRoute | undefined {
  if (!action) return undefined;
  if (action.intent === "OPEN_RECOVERY_DETAILS") {
    return { action: "view", value: "audit", label: action.label };
  }
  const anchor = anchors.get(action.targetAnchorId);
  if (
    !anchor
    || anchor.objectId !== action.targetObjectId
    || anchor.status !== "active"
    || anchor.role !== "primary_text"
  ) return undefined;
  return {
    action: "v2-open-primary-anchor",
    value: anchor.externalId,
    label: action.label,
  };
}

export function projectPluginV2ProjectReentry(input: {
  observedAt: string;
  objects: readonly V2ManagedObject[];
  ownerships: readonly V2PrimaryOwnership[];
  associations: readonly V2Association[];
  anchors: readonly V2Anchor[];
  proposals: readonly ServiceStoredProposal[];
  commits: readonly ServiceSemanticCommit[];
  nowWork: ServiceNowWork;
}): PluginProjectReentryCard[] {
  const proposalTargets = new Map(
    input.proposals.map((record) => [record.proposal.proposalId, proposalObjectIds(record)]),
  );
  const commits = input.commits.map((commit) => ({
    semanticCommitId: commit.semanticCommitId,
    status: commit.status,
    objectIds: commit.proposalId ? proposalTargets.get(commit.proposalId) ?? [] : [],
    updatedAt: commit.updatedAt,
  }));
  const anchorsById = new Map(input.anchors.map((value) => [value.anchorId, value]));
  const focus = input.nowWork.focus.map((item, rank) => ({
    objectId: item.objectId,
    rank,
    selectedAt: input.nowWork.generatedAt,
  }));
  const focused = new Set(focus.map(({ objectId }) => objectId));
  return input.objects
    .filter((value) => value.objectType === "PROJECT")
    .sort((left, right) =>
      (left.lifecycle === "OPEN" ? 0 : 1) - (right.lifecycle === "OPEN" ? 0 : 1)
      || right.updatedAt.localeCompare(left.updatedAt)
      || left.objectId.localeCompare(right.objectId)
    )
    .map((project) => {
      const projection = projectV2ProjectReentry({
        observedAt: input.observedAt,
        project,
        objects: input.objects.filter(({ objectId }) => objectId !== project.objectId),
        ownerships: input.ownerships,
        associations: input.associations,
        focus,
        anchors: input.anchors,
        commits,
      });
      const entryPointRoutes = projection.entryPoints.flatMap((entry): PluginReentryRoute[] => {
        const entryAnchor = anchorsById.get(entry.anchorId);
        if (
          !entryAnchor
          || entryAnchor.objectId !== entry.objectId
          || entryAnchor.status !== "active"
          || entryAnchor.role !== "primary_text"
        ) return [];
        return [{
          action: "v2-open-primary-anchor",
          value: entryAnchor.externalId,
          label: entry.label,
        }];
      });
      const primaryRoute = routeForAction(projection.primaryAction, anchorsById);
      return {
        project,
        projection,
        focused: focused.has(project.objectId),
        ...(primaryRoute ? { primaryRoute } : {}),
        entryPointRoutes,
      };
    });
}
