import { validateV2ProposalForSubmission, type V2Proposal, type V2ProposalSemanticOperation, type V2ProposalScopeTarget } from "@task-copilot/domain";
import { checksum } from "@task-copilot/shared";

import type { GrillPreview } from "./grill-preview.ts";

export interface MiniProjectSourcePosition {
  materialId: string;
  blockUuid: string;
  parentBlockUuid: string | null;
  previousSiblingUuid: string | null;
  exactText: string;
  contentHash: string;
  isRoot: boolean;
}

export interface MiniProjectRestructureProposalInput {
  proposalId: string;
  createdAt: string;
  objectId: string;
  objectVersion: number;
  preview: GrillPreview;
  sourceScopeHash: string;
  sourcePositions: MiniProjectSourcePosition[];
  createdBlockUuids: Record<string, string>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type StructurePosition = Pick<MiniProjectSourcePosition, "blockUuid" | "parentBlockUuid" | "previousSiblingUuid" | "contentHash">;

export function miniProjectRestructureHasStructuralChange(preview: GrillPreview): boolean {
  return preview.impact.movedMaterialCount > 0
    || preview.impact.addedDerivedBlockCount > 0
    || preview.finalReading.sections.some(({ sectionId }) => sectionId !== "root");
}

export function miniProjectStructureHash(positions: readonly StructurePosition[]): string {
  return checksum(positions.map(({ blockUuid, parentBlockUuid, previousSiblingUuid, contentHash }) => ({ blockUuid, parentBlockUuid, previousSiblingUuid, contentHash })).sort((left, right) => left.blockUuid.localeCompare(right.blockUuid)));
}

function simulateStructure(positions: readonly StructurePosition[], operations: readonly V2ProposalSemanticOperation[]): { positions: StructurePosition[]; moveBeforeByOperationId: Map<string, { parentBlockUuid: string; previousSiblingUuid: string | null }> } {
  const byId = new Map(positions.map((position) => [position.blockUuid, { ...position }]));
  const children = new Map<string | null, string[]>();
  const moveBeforeByOperationId = new Map<string, { parentBlockUuid: string; previousSiblingUuid: string | null }>();
  const rebuildChildren = (parentBlockUuid: string | null): string[] => {
    const candidates = [...byId.values()].filter((position) => position.parentBlockUuid === parentBlockUuid);
    const ordered: string[] = [];
    let previous: string | null = null;
    while (ordered.length < candidates.length) {
      const next = candidates.find((candidate) => candidate.previousSiblingUuid === previous && !ordered.includes(candidate.blockUuid));
      if (!next) throw new Error("MiniProject restructure source sibling chain is invalid.");
      ordered.push(next.blockUuid);
      previous = next.blockUuid;
    }
    children.set(parentBlockUuid, ordered);
    return ordered;
  };
  for (const parent of new Set([...byId.values()].map(({ parentBlockUuid }) => parentBlockUuid))) rebuildChildren(parent);
  const insert = (blockUuid: string, parentBlockUuid: string, previousSiblingUuid: string | null): void => {
    const siblings = children.get(parentBlockUuid) ?? [];
    if (!children.has(parentBlockUuid)) children.set(parentBlockUuid, siblings);
    const index = previousSiblingUuid === null ? 0 : siblings.indexOf(previousSiblingUuid) + 1;
    if (index < 0 || previousSiblingUuid !== null && index === 0) throw new Error("MiniProject restructure target sibling is invalid.");
    siblings.splice(index, 0, blockUuid);
    siblings.forEach((uuid, siblingIndex) => { byId.get(uuid)!.previousSiblingUuid = siblingIndex > 0 ? siblings[siblingIndex - 1]! : null; });
  };
  const remove = (blockUuid: string): void => {
    const position = byId.get(blockUuid);
    if (!position) throw new Error("MiniProject restructure source Block is missing.");
    const siblings = children.get(position.parentBlockUuid) ?? rebuildChildren(position.parentBlockUuid);
    const index = siblings.indexOf(blockUuid);
    if (index < 0) throw new Error("MiniProject restructure source position is invalid.");
    siblings.splice(index, 1);
    siblings.forEach((uuid, siblingIndex) => { byId.get(uuid)!.previousSiblingUuid = siblingIndex > 0 ? siblings[siblingIndex - 1]! : null; });
  };
  for (const operation of operations) {
    if (operation.kind === "CREATE_BLOCK") {
      const { newBlockUuid, parentBlockUuid, previousSiblingUuid, contentHash } = operation.payload;
      if (typeof newBlockUuid !== "string" || typeof parentBlockUuid !== "string" || previousSiblingUuid !== null && typeof previousSiblingUuid !== "string" || typeof contentHash !== "string" || byId.has(newBlockUuid)) throw new Error("MiniProject restructure create simulation is invalid.");
      byId.set(newBlockUuid, { blockUuid: newBlockUuid, parentBlockUuid, previousSiblingUuid: previousSiblingUuid as string | null, contentHash });
      children.set(newBlockUuid, []);
      insert(newBlockUuid, parentBlockUuid, previousSiblingUuid as string | null);
    } else if (operation.kind === "MOVE_BLOCK") {
      const { toParentBlockUuid, toPreviousSiblingUuid } = operation.payload;
      const position = byId.get(operation.target.id);
      if (!position || typeof toParentBlockUuid !== "string" || toPreviousSiblingUuid !== null && typeof toPreviousSiblingUuid !== "string") throw new Error("MiniProject restructure move simulation is invalid.");
      moveBeforeByOperationId.set(operation.operationId, { parentBlockUuid: position.parentBlockUuid!, previousSiblingUuid: position.previousSiblingUuid });
      remove(operation.target.id);
      position.parentBlockUuid = toParentBlockUuid;
      position.previousSiblingUuid = toPreviousSiblingUuid as string | null;
      insert(operation.target.id, toParentBlockUuid, toPreviousSiblingUuid as string | null);
    }
  }
  return { positions: [...byId.values()], moveBeforeByOperationId };
}

function requireCreatedUuid(input: MiniProjectRestructureProposalInput, key: string, used: Set<string>): string {
  const value = input.createdBlockUuids[key];
  if (!value || !UUID.test(value) || used.has(value)) throw new Error(`MiniProject restructure created Block identity is invalid for ${key}.`);
  used.add(value);
  return value;
}

function readablePreview(preview: GrillPreview): string {
  const sections = preview.finalReading.sections.map((section) => {
    const source = section.sourceMaterials.map((material) => `- ${material.text}`).join("\n");
    const derived = section.derivedBlocks.map((block) => `- ${block.text}`).join("\n");
    return `### ${section.heading}\n${[source, derived].filter(Boolean).join("\n")}`;
  }).join("\n\n");
  const unclassified = preview.unclassified.length ? `\n\n### 待判断 / 原始材料\n${preview.unclassified.map((item) => `- ${item.text}`).join("\n")}` : "";
  return `# ${preview.finalReading.title.text}\n\n${preview.finalReading.outcome.text}\n\n${sections}${unclassified}`;
}

export function buildMiniProjectRestructureProposal(input: MiniProjectRestructureProposalInput): V2Proposal {
  if (!miniProjectRestructureHasStructuralChange(input.preview)) {
    throw new Error("MiniProject restructure proposal has no structural change.");
  }
  if (input.preview.authorityBoundary !== "SESSION_PREVIEW_ONLY" || input.preview.impact.deletedMaterialCount !== 0) throw new Error("MiniProject restructure requires a zero-delete session preview.");
  if (!Number.isSafeInteger(input.objectVersion) || input.objectVersion < 1 || !input.objectId.trim() || !Number.isFinite(Date.parse(input.createdAt))) throw new Error("MiniProject restructure subject is invalid.");
  const positions = new Map(input.sourcePositions.map((position) => [position.materialId, position]));
  if (positions.size !== input.sourcePositions.length || positions.size !== input.preview.impact.sourceMaterialCount) throw new Error("MiniProject restructure source positions are incomplete.");
  const previewMaterials = [...input.preview.finalReading.sections.flatMap((section) => section.sourceMaterials), ...input.preview.unclassified];
  if (previewMaterials.length !== positions.size || new Set(previewMaterials.map((item) => item.materialId)).size !== positions.size) throw new Error("MiniProject restructure preview material placement is invalid.");
  for (const material of previewMaterials) {
    const source = positions.get(material.materialId);
    if (!source || source.blockUuid !== material.sourceRef.slice("block:".length) || source.exactText !== material.text || source.contentHash !== material.contentHash || checksum(source.exactText) !== source.contentHash) {
      throw new Error("MiniProject restructure source evidence changed after preview.");
    }
  }
  const roots = input.sourcePositions.filter((position) => position.isRoot);
  if (roots.length !== 1) throw new Error("MiniProject restructure requires one root source Block.");
  if (!/^[0-9a-f]{8}$/.test(input.sourceScopeHash)) throw new Error("MiniProject restructure source scope hash is invalid.");
  const root = roots[0]!;
  const sourceStructureHash = miniProjectStructureHash(input.sourcePositions);
  const usedCreatedUuids = new Set<string>();
  const operations: V2ProposalSemanticOperation[] = [];
  const movedMaterialIds = new Set<string>();
  let previousSectionUuid: string | null = null;
  for (const section of input.preview.finalReading.sections) {
    const isRootSection = section.sectionId === "root";
    const sectionParentUuid = isRootSection ? root.blockUuid : requireCreatedUuid(input, `section:${section.sectionId}`, usedCreatedUuids);
    if (!isRootSection) {
      operations.push({
        operationId: `create-section-${section.sectionId}`,
        kind: "CREATE_BLOCK",
        target: { kind: "BLOCK", id: root.blockUuid, hash: root.contentHash },
        summary: `创建结构区块：${section.heading}`,
        payload: { newBlockUuid: sectionParentUuid, parentBlockUuid: root.blockUuid, previousSiblingUuid: previousSectionUuid, text: section.heading, contentHash: checksum(section.heading), sourceRootBlockUuid: root.blockUuid, sourceScopeHash: input.sourceScopeHash },
        preconditions: ["MiniProject root 与完整来源子树仍为预览版本"],
      });
      previousSectionUuid = sectionParentUuid;
    }
    let previousTargetUuid: string | null = null;
    for (const material of section.sourceMaterials) {
      const source = positions.get(material.materialId)!;
      if (source.isRoot) {
        if (!isRootSection) throw new Error("MiniProject root material cannot move out of root.");
        continue;
      }
      if (source.parentBlockUuid !== sectionParentUuid || source.previousSiblingUuid !== previousTargetUuid) {
        if (!source.parentBlockUuid) throw new Error("MiniProject restructure source material lacks an original parent.");
        operations.push({
          operationId: `move-${source.materialId}`,
          kind: "MOVE_BLOCK",
          target: { kind: "BLOCK", id: source.blockUuid, hash: source.contentHash },
          summary: `移动原材料但不改写：${source.exactText.slice(0, 80)}`,
          payload: { fromParentBlockUuid: source.parentBlockUuid, fromPreviousSiblingUuid: source.previousSiblingUuid, toParentBlockUuid: sectionParentUuid, toPreviousSiblingUuid: previousTargetUuid, contentHash: source.contentHash, sourceRootBlockUuid: root.blockUuid, sourceScopeHash: input.sourceScopeHash },
          preconditions: ["Block UUID、正文 hash、父级与相邻位置均未变化"],
        });
        movedMaterialIds.add(source.materialId);
      }
      previousTargetUuid = source.blockUuid;
    }
    section.derivedBlocks.forEach((block, index) => {
      const newBlockUuid = requireCreatedUuid(input, `derived:${section.sectionId}:${index}`, usedCreatedUuids);
      operations.push({
        operationId: `create-derived-${section.sectionId}-${index}`,
        kind: "CREATE_BLOCK",
        target: { kind: "BLOCK", id: root.blockUuid, hash: root.contentHash },
        summary: `创建有证据的新 Block：${block.text.slice(0, 80)}`,
        payload: { newBlockUuid, parentBlockUuid: sectionParentUuid, previousSiblingUuid: previousTargetUuid, text: block.text, contentHash: checksum(block.text), sourceRootBlockUuid: root.blockUuid, sourceScopeHash: input.sourceScopeHash },
        preconditions: ["引用证据仍在已审阅 scope 内"],
      });
      previousTargetUuid = newBlockUuid;
    });
  }
  if (movedMaterialIds.size !== input.preview.impact.movedMaterialCount) throw new Error("MiniProject restructure move impact does not match the preview.");
  if (usedCreatedUuids.size !== input.preview.finalReading.sections.filter((section) => section.sectionId !== "root").length + input.preview.impact.addedDerivedBlockCount) throw new Error("MiniProject restructure create impact does not match the preview.");
  if (operations.length === 0) throw new Error("MiniProject restructure proposal has no structural change.");
  const simulation = simulateStructure(input.sourcePositions, operations);
  const expectedStructureHash = miniProjectStructureHash(simulation.positions);
  const structuralOperations = operations.map((operation) => {
    const moveBefore = simulation.moveBeforeByOperationId.get(operation.operationId);
    return { ...operation, payload: { ...operation.payload, sourceStructureHash, expectedStructureHash, ...(moveBefore ? { applyFromParentBlockUuid: moveBefore.parentBlockUuid, applyFromPreviousSiblingUuid: moveBefore.previousSiblingUuid } : {}) } };
  });
  const changedBlockIds = new Set([root.blockUuid, ...operations.filter((operation) => operation.kind === "MOVE_BLOCK").map((operation) => operation.target.id)]);
  const scopeTarget = (source: MiniProjectSourcePosition): V2ProposalScopeTarget => ({ kind: "BLOCK", id: source.blockUuid, hash: source.contentHash });
  const proposal: V2Proposal = {
    proposalId: input.proposalId,
    schemaVersion: "v2",
    title: `重构 MiniProject：${input.preview.finalReading.title.text}`,
    context: "基于已完成的自适应 Grill Session 与零丢失阅读预览。",
    understanding: input.preview.finalReading.outcome.text,
    objective: "在原 MiniProject Block 下形成已审阅结构，同时保留每项原材料和稳定 Block 身份。",
    logic: "一个 HIGH 语义组包含全部创建和移动；原材料不改写、不删除，失败时必须按逆序补偿。",
    finalPreview: readablePreview(input.preview),
    unresolvedQuestions: [],
    source: { kind: "local_llm", provider: input.preview.provenance.providerId, model: input.preview.provenance.model, skillVersion: `${input.preview.provenance.skillName}@${input.preview.provenance.skillVersion}`, promptBundleVersion: input.preview.provenance.promptVersion },
    scope: {
      read: [{ kind: "OBJECT", id: input.objectId, version: input.objectVersion }, ...input.sourcePositions.filter((source) => !changedBlockIds.has(source.blockUuid)).map(scopeTarget)],
      modify: input.sourcePositions.filter((source) => changedBlockIds.has(source.blockUuid)).map(scopeTarget),
    },
    preconditions: ["Object version、Primary Anchor 与完整 Block 子树 scope hash 均未变化", "所有原材料正文、父级与顺序均与预览一致"],
    groups: [{ groupId: "restructure-mini-project", explanation: "结构创建、原材料移动和可恢复顺序不可拆分。", risk: "HIGH", independentlyAcceptable: true, dependencies: [], textPatches: [], semanticOperations: structuralOperations, disposition: "PENDING" }],
    status: "READY",
    createdAt: input.createdAt,
  };
  return validateV2ProposalForSubmission(proposal);
}
