import { deterministicUuid, type ManagedProjection } from "@task-copilot/contracts";

import { renderManagedField, type ManagedFieldKind } from "./writing-convention.ts";

export interface ProjectionFieldModel {
  kind: ManagedFieldKind;
  uuid: string;
  value: string;
}

export interface ProjectionBlockIntent extends ProjectionFieldModel {
  content: string;
  order: number;
}

export const reviewFieldUuid = (waitingUuid: string): string => deterministicUuid(`review:${waitingUuid}`);

export function projectPresentation(projection: ManagedProjection): ProjectionFieldModel[] {
  const fields: ProjectionFieldModel[] = [];
  const focus = projection.currentFocus?.trim();
  if (focus) fields.push({ kind: "CURRENT_FOCUS", uuid: projection.focusUuid, value: focus });
  if (projection.engagement === "WAITING" && projection.waitingCondition) {
    const description = projection.waitingCondition.description.trim();
    if (description) fields.push({ kind: "WAITING", uuid: projection.waitingUuid, value: description });
    const reviewAt = projection.waitingCondition.reviewAt?.trim();
    if (reviewAt) fields.push({ kind: "REVIEW", uuid: reviewFieldUuid(projection.waitingUuid), value: reviewAt });
  }
  if (projection.lifecycle === "COMPLETED" && projection.closure?.type === "COMPLETED") {
    const outcome = projection.closure.outcomeSummary.trim();
    if (outcome && outcome !== projection.title.trim()) fields.push({ kind: "COMPLETION", uuid: projection.stateUuid, value: outcome });
  }
  if (projection.lifecycle === "CANCELLED" && projection.closure?.type === "CANCELLED") {
    const reason = projection.closure.reason.trim();
    if (reason) fields.push({ kind: "CANCELLATION", uuid: projection.stateUuid, value: reason });
  }
  return fields;
}

export function renderProjection(projection: ManagedProjection): ProjectionBlockIntent[] {
  return projectPresentation(projection).map((field, order) => ({ ...field, order, content: renderManagedField(field.kind, field.value) }));
}
