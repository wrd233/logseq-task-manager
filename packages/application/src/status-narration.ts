import type { V2ManagedObject } from "@task-copilot/domain";

export type StatusNarrationScene = "NOW" | "OBJECT" | "PROJECT" | "REVIEW" | "BACKGROUND";

export interface StatusNarrationFact {
  text: string;
  sourceRefs: string[];
}

export interface StatusNarrationNextAction {
  intent: "REVIEW_WAITING" | "REVIEW_BLOCKER" | "REVIEW_PAUSE";
  label: string;
  targetObjectId: string;
}

export interface StatusNarration {
  conclusion: string;
  keyEvidence: string[];
  facts: StatusNarrationFact[];
  inferences: string[];
  unknowns: string[];
  nextActionEligible: boolean;
  nextAction?: StatusNarrationNextAction;
  evidenceScope: {
    refs: string[];
    observedAt: string;
  };
  source: {
    kind: "DETERMINISTIC_RULE";
    ruleId: string;
    version: "1.0.0";
  };
}

export interface V2ObjectStatusNarrationInput {
  observedAt: string;
  scene: StatusNarrationScene;
  object: V2ManagedObject;
  blocker?: V2ManagedObject;
}

function objectRef(object: V2ManagedObject): string {
  return `object:${object.objectId}@v${object.version}`;
}

function fact(text: string, ...sourceRefs: string[]): StatusNarrationFact {
  return { text, sourceRefs };
}

function compact(text: string, max = 160): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function isDue(value: string | undefined, observedAt: number): boolean {
  return value !== undefined && Number.isFinite(Date.parse(value)) && Date.parse(value) <= observedAt;
}

function isRelatedScene(scene: StatusNarrationScene): boolean {
  return scene !== "BACKGROUND";
}

function result(input: {
  conclusion: string;
  keyEvidence?: string[];
  facts: StatusNarrationFact[];
  unknowns?: string[];
  nextAction?: StatusNarrationNextAction;
  evidenceRefs: string[];
  observedAt: string;
  ruleId: string;
}): StatusNarration {
  return {
    conclusion: compact(input.conclusion),
    keyEvidence: (input.keyEvidence ?? []).slice(0, 2).map((value) => compact(value)),
    facts: input.facts,
    inferences: [],
    unknowns: input.unknowns ?? [],
    nextActionEligible: input.nextAction !== undefined,
    ...(input.nextAction ? { nextAction: input.nextAction } : {}),
    evidenceScope: {
      refs: [...new Set(input.evidenceRefs)].sort(),
      observedAt: input.observedAt,
    },
    source: {
      kind: "DETERMINISTIC_RULE",
      ruleId: input.ruleId,
      version: "1.0.0",
    },
  };
}

export function narrateV2ObjectStatus(input: V2ObjectStatusNarrationInput): StatusNarration {
  const observedAt = Date.parse(input.observedAt);
  if (!Number.isFinite(observedAt)) throw new Error("Status narration observedAt must be a valid timestamp.");
  const objectSource = objectRef(input.object);
  if (
    input.blocker
    && (
      input.object.condition.kind !== "BLOCKED"
      || input.object.condition.blockerObjectId !== input.blocker.objectId
    )
  ) {
    throw new Error("Status narration blocker evidence does not match the blocked object.");
  }

  if (input.object.lifecycle !== "OPEN") {
    const conclusion = input.object.lifecycle === "COMPLETED"
      ? "该事项已完成"
      : input.object.lifecycle === "CANCELLED"
        ? "该事项已取消"
        : "该事项已归档";
    return result({
      conclusion,
      facts: [fact(`正式状态记录为${conclusion.replace("该事项已", "")}`, objectSource)],
      evidenceRefs: [objectSource],
      observedAt: input.observedAt,
      ruleId: `lifecycle-${input.object.lifecycle.toLowerCase()}`,
    });
  }

  if (input.object.condition.kind === "WAITING") {
    const waiting = `正在等待${input.object.condition.waitingFor}提供${input.object.condition.expectedResult}`;
    const reviewDue = isDue(input.object.condition.reviewAt, observedAt);
    const reviewEvidence = reviewDue ? "原定复查时间已到" : "已设置后续复查时间";
    const nextAction = reviewDue && isRelatedScene(input.scene)
      ? {
          intent: "REVIEW_WAITING" as const,
          label: compact(`确认是否已收到${input.object.condition.expectedResult}`, 80),
          targetObjectId: input.object.objectId,
        }
      : undefined;
    return result({
      conclusion: reviewDue ? "该确认已到复查时间" : `正在等待${input.object.condition.waitingFor}`,
      keyEvidence: [
        reviewDue ? waiting : `等待结果是${input.object.condition.expectedResult}`,
        reviewEvidence,
      ],
      facts: [
        fact(waiting, objectSource),
        fact(reviewEvidence, objectSource),
      ],
      ...(nextAction ? { nextAction } : {}),
      evidenceRefs: [objectSource],
      observedAt: input.observedAt,
      ruleId: reviewDue ? "condition-waiting-review-due" : "condition-waiting",
    });
  }

  if (input.object.condition.kind === "BLOCKED") {
    const blockerSource = input.blocker ? objectRef(input.blocker) : undefined;
    if (input.blocker?.lifecycle === "COMPLETED") {
      const nextAction = isRelatedScene(input.scene)
        ? {
            intent: "REVIEW_BLOCKER" as const,
            label: "确认阻塞是否已解除",
            targetObjectId: input.object.objectId,
          }
        : undefined;
      return result({
        conclusion: "关联阻塞项已结束，需要重新判断是否可以继续",
        keyEvidence: [input.object.condition.reason, "关联阻塞项已完成"],
        facts: [
          fact(`当前阻塞原因：${input.object.condition.reason}`, objectSource),
          fact("关联阻塞项已完成", blockerSource!),
        ],
        ...(nextAction ? { nextAction } : {}),
        evidenceRefs: [objectSource, blockerSource!],
        observedAt: input.observedAt,
        ruleId: "condition-blocker-completed",
      });
    }
    return result({
      conclusion: "当前仍被阻塞",
      keyEvidence: [input.object.condition.reason],
      facts: [fact(`当前阻塞原因：${input.object.condition.reason}`, objectSource)],
      unknowns: input.object.condition.blockerObjectId && !input.blocker
        ? ["尚未读取关联阻塞项的当前状态"]
        : [],
      evidenceRefs: [objectSource, ...(blockerSource ? [blockerSource] : [])],
      observedAt: input.observedAt,
      ruleId: "condition-blocked",
    });
  }

  if (input.object.condition.kind === "PAUSED") {
    const reviewDue = isDue(input.object.condition.reviewAt, observedAt);
    const nextAction = reviewDue && isRelatedScene(input.scene)
      ? {
          intent: "REVIEW_PAUSE" as const,
          label: "重新判断是否继续推进",
          targetObjectId: input.object.objectId,
        }
      : undefined;
    return result({
      conclusion: reviewDue ? "该事项已到重新判断时间" : "该事项已暂停",
      keyEvidence: [
        input.object.condition.reason,
        ...(input.object.condition.reviewAt
          ? [reviewDue ? "原定重新判断时间已到" : "已设置后续重新判断时间"]
          : []),
      ],
      facts: [
        fact(`暂停原因：${input.object.condition.reason}`, objectSource),
        ...(input.object.condition.reviewAt
          ? [fact(reviewDue ? "原定重新判断时间已到" : "已设置后续重新判断时间", objectSource)]
          : []),
      ],
      unknowns: input.object.condition.reviewAt ? [] : ["尚未设置重新判断时间"],
      ...(nextAction ? { nextAction } : {}),
      evidenceRefs: [objectSource],
      observedAt: input.observedAt,
      ruleId: reviewDue ? "condition-paused-review-due" : "condition-paused",
    });
  }

  if (isDue(input.object.dueAt, observedAt)) {
    return result({
      conclusion: "明确期限已到",
      keyEvidence: ["正式期限已到", "当前状态仍可推进"],
      facts: [
        fact("正式期限已经到达", objectSource),
        fact("正式状态允许继续推进", objectSource),
      ],
      unknowns: ["正式状态没有提供足够信息来判断具体下一步"],
      evidenceRefs: [objectSource],
      observedAt: input.observedAt,
      ruleId: "condition-actionable-due",
    });
  }

  if (input.object.objectType === "PROJECT" && input.object.projectStructure) {
    const focuses = input.object.projectStructure.currentFocuses.slice(0, 2);
    return result({
      conclusion: input.object.projectStructure.currentSummary,
      keyEvidence: focuses.map((focus) => `当前推进：${focus}`),
      facts: [
        fact(`Project 当前摘要：${input.object.projectStructure.currentSummary}`, objectSource),
        ...focuses.map((focus) => fact(`Project 当前推进：${focus}`, objectSource)),
      ],
      evidenceRefs: [objectSource],
      observedAt: input.observedAt,
      ruleId: "project-current-interface",
    });
  }

  return result({
    conclusion: "当前可以继续推进",
    keyEvidence: ["正式状态允许继续推进"],
    facts: [fact("正式状态允许继续推进", objectSource)],
    unknowns: ["正式状态没有提供足够信息来判断具体下一步"],
    evidenceRefs: [objectSource],
    observedAt: input.observedAt,
    ruleId: "condition-actionable",
  });
}
