import {
  projectV2ProjectReentry,
  projectV2TaskReentry,
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
  action: "v2-open-primary-anchor" | "v2-project-worksite-open" | "view";
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

export interface PluginTaskReentryCard {
  objectVersion: number;
  projection: V2ReentryProjection;
  primaryRoute?: PluginReentryRoute;
}

function proposalTargets(record: ServiceStoredProposal): {
  objectIds: string[];
  blockExternalIds: string[];
} {
  const objectIds = new Set<string>();
  const blockExternalIds = new Set<string>();
  for (const target of record.proposal.scope.modify) {
    if (target.kind === "OBJECT") objectIds.add(target.id);
    if (target.kind === "BLOCK") blockExternalIds.add(target.id);
  }
  for (const group of record.proposal.groups) {
    for (const operation of group.semanticOperations) {
      if (operation.target.kind === "OBJECT") objectIds.add(operation.target.id);
      if (operation.target.kind === "BLOCK") blockExternalIds.add(operation.target.id);
    }
  }
  return {
    objectIds: [...objectIds].sort(),
    blockExternalIds: [...blockExternalIds].sort(),
  };
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

function commitFacts(
  proposals: readonly ServiceStoredProposal[],
  commits: readonly ServiceSemanticCommit[],
  anchors: readonly V2Anchor[],
) {
  const targetsByProposalId = new Map(
    proposals.map((record) => [record.proposal.proposalId, proposalTargets(record)]),
  );
  const objectIdByActiveBlock = new Map<string, string>();
  for (const anchor of anchors) {
    if (anchor.role !== "primary_text" || anchor.status !== "active") continue;
    if (objectIdByActiveBlock.has(anchor.externalId)) {
      throw new Error("Reentry contains duplicate active Primary Anchor external identity.");
    }
    objectIdByActiveBlock.set(anchor.externalId, anchor.objectId);
  }
  return commits.map((commit) => ({
    semanticCommitId: commit.semanticCommitId,
    status: commit.status,
    objectIds: commit.proposalId
      ? [...new Set([
          ...(targetsByProposalId.get(commit.proposalId)?.objectIds ?? []),
          ...(targetsByProposalId.get(commit.proposalId)?.blockExternalIds
            .map((externalId) => objectIdByActiveBlock.get(externalId))
            .filter((objectId): objectId is string => objectId !== undefined) ?? []),
        ])].sort()
      : [],
    updatedAt: commit.updatedAt,
  }));
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
  const commits = commitFacts(input.proposals, input.commits, input.anchors);
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

export function projectPluginV2TaskReentry(input: {
  observedAt: string;
  objects: readonly V2ManagedObject[];
  ownerships: readonly V2PrimaryOwnership[];
  anchors: readonly V2Anchor[];
  proposals: readonly ServiceStoredProposal[];
  commits: readonly ServiceSemanticCommit[];
}): Record<string, PluginTaskReentryCard> {
  const objectsById = new Map<string, V2ManagedObject>();
  for (const object of input.objects) {
    if (objectsById.has(object.objectId)) {
      throw new Error("Task reentry contains duplicate Object identity.");
    }
    objectsById.set(object.objectId, object);
  }
  const ownerByTaskId = new Map<string, V2ManagedObject>();
  const tasksWithOwnership = new Set<string>();
  for (const ownership of input.ownerships) {
    const child = objectsById.get(ownership.childObjectId);
    if (child?.objectType !== "TASK") continue;
    if (tasksWithOwnership.has(child.objectId)) {
      throw new Error("Task reentry contains duplicate Primary Ownership.");
    }
    tasksWithOwnership.add(child.objectId);
    const owner = objectsById.get(ownership.ownerObjectId);
    if (!owner) throw new Error("Task reentry Primary Ownership references a missing owner.");
    if (!["MINI_PROJECT", "PROJECT", "AREA"].includes(owner.objectType)) {
      throw new Error("Task reentry Primary Ownership contains an invalid owner type.");
    }
    ownerByTaskId.set(child.objectId, owner);
  }
  const activeAnchorByTaskId = new Map<string, V2Anchor>();
  for (const anchor of input.anchors) {
    if (anchor.role !== "primary_text" || anchor.status !== "active") continue;
    const object = objectsById.get(anchor.objectId);
    if (object?.objectType !== "TASK") continue;
    if (activeAnchorByTaskId.has(object.objectId)) {
      throw new Error("Task reentry contains duplicate active Primary Anchors.");
    }
    activeAnchorByTaskId.set(object.objectId, anchor);
  }
  const commits = commitFacts(input.proposals, input.commits, input.anchors);
  const anchorsById = new Map(input.anchors.map((anchor) => [anchor.anchorId, anchor]));
  return Object.fromEntries(input.objects
    .filter((object) => object.objectType === "TASK")
    .map((task) => {
      const projection = projectV2TaskReentry({
        observedAt: input.observedAt,
        task,
        ...(ownerByTaskId.get(task.objectId)
          ? { owner: ownerByTaskId.get(task.objectId)! }
          : {}),
        ...(activeAnchorByTaskId.get(task.objectId)
          ? { anchor: activeAnchorByTaskId.get(task.objectId)! }
          : {}),
        commits,
      });
      const primaryRoute = routeForAction(projection.primaryAction, anchorsById);
      return [task.objectId, {
        objectVersion: task.version,
        projection,
        ...(primaryRoute ? { primaryRoute } : {}),
      }];
    }));
}
