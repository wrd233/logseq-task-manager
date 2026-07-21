import { createHash } from "node:crypto";

import type { V2Anchor, V2ManagedObject, V2PrimaryOwnership } from "@task-copilot/domain";
import { StructuredError, checksum, stableJson } from "@task-copilot/shared";

import type { TaskCopilotSkillDocument } from "./skill-catalog.ts";

export type ContextExportScope = "object" | "project";

export interface ContextPackageManifest {
  schemaVersion: 1;
  generatedAt: string;
  scope: { kind: ContextExportScope; id: string };
  authority: "READ_ONLY_DERIVATIVE";
  formalFactsSource: "SQLITE";
  graphExcerptStatus: "NOT_AVAILABLE_IN_LOCAL_SERVICE";
  includedObjectCount: number;
  files: Array<{ path: string; sha256: string; bytes: number }>;
}

export interface ServiceContextPackage {
  manifest: ContextPackageManifest;
  files: Record<string, string>;
}

export interface ContextPackageSource {
  getObject(objectId: string): V2ManagedObject | undefined;
  listObjects(): V2ManagedObject[];
  listPrimaryOwnerships(): V2PrimaryOwnership[];
  getActivePrimaryAnchorByObject(objectId: string): V2Anchor | undefined;
  databaseSchemaVersion(): number;
}

function contextError(code: string, message: string): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-118", "D-132", "D-135", "D-190"] });
}

function pretty(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function descendants(rootId: string, ownerships: readonly V2PrimaryOwnership[]): string[] {
  const children = new Map<string, string[]>();
  for (const ownership of ownerships) children.set(ownership.ownerObjectId, [...(children.get(ownership.ownerObjectId) ?? []), ownership.childObjectId]);
  const result: string[] = [];
  const visited = new Set([rootId]);
  const queue = [...(children.get(rootId) ?? [])].sort();
  while (queue.length > 0) {
    const objectId = queue.shift()!;
    if (visited.has(objectId)) continue;
    visited.add(objectId);
    result.push(objectId);
    if (result.length > 255) throw contextError("CONTEXT_SCOPE_TOO_LARGE", "Context Package 最多包含 256 个正式对象。");
    queue.push(...(children.get(objectId) ?? []).sort());
  }
  return result;
}

export function buildContextPackage(
  source: ContextPackageSource,
  skills: readonly TaskCopilotSkillDocument[],
  scope: { kind: ContextExportScope; id: string },
  at = new Date(),
): ServiceContextPackage {
  const root = source.getObject(scope.id);
  if (!root) throw contextError("CONTEXT_OBJECT_NOT_FOUND", "Context 根对象不存在。");
  if (scope.kind === "project" && !["PROJECT", "MINI_PROJECT"].includes(root.objectType)) throw contextError("CONTEXT_PROJECT_REQUIRED", "Project Context 必须引用 Project 或 Mini Project。");
  const allObjects = source.listObjects();
  const allOwnerships = source.listPrimaryOwnerships();
  const ids = scope.kind === "project" ? [root.objectId, ...descendants(root.objectId, allOwnerships)] : [root.objectId];
  const idSet = new Set(ids);
  const objects = ids.map((id) => allObjects.find((object) => object.objectId === id)).filter((object): object is V2ManagedObject => Boolean(object));
  if (objects.length !== ids.length) throw contextError("CONTEXT_OWNERSHIP_DANGLING", "Context Ownership 引用了不存在的对象。");
  const anchors = objects.map((object) => source.getActivePrimaryAnchorByObject(object.objectId)).filter((anchor): anchor is V2Anchor => Boolean(anchor));
  const ownerships = allOwnerships.filter(({ childObjectId, ownerObjectId }) => idSet.has(childObjectId) && idSet.has(ownerObjectId));
  const modifyScope = objects.map((object) => ({ kind: "OBJECT" as const, id: object.objectId, version: object.version, hash: checksum(object) }));
  const generatedAt = at.toISOString();
  const skillVersions = skills.map((skill) => ({ name: skill.name, version: skill.version, description: skill.description, sha256: skill.sha256 }));
  const files: Record<string, string> = {
    "scope.md": `# Task Copilot Context Scope\n\n- Scope: ${scope.kind}\n- Root object: ${root.objectId}\n- Authority: read-only derivative; this package grants no write permission\n- Formal facts: SQLite\n- Graph excerpts: unavailable from Local Service; query through the approved Logseq adapter when required\n- Included objects: ${objects.length}\n\nProposal modify scope must remain explicit and is revalidated again at review/commit time.\n`,
    "objects.json": pretty({ schemaVersion: 1, formalFacts: objects }),
    "anchors.json": pretty({ schemaVersion: 1, formalFacts: anchors }),
    "relations.json": pretty({ schemaVersion: 1, formalFacts: { primaryOwnerships: ownerships } }),
    "decisions.json": pretty({ schemaVersion: 1, formalFacts: objects.filter(({ objectType }) => objectType === "DECISION") }),
    "outputs.json": pretty({ schemaVersion: 1, formalFacts: objects.filter(({ objectType }) => objectType === "OUTPUT") }),
    "graph-excerpts.json": pretty({ schemaVersion: 1, status: "NOT_AVAILABLE_IN_LOCAL_SERVICE", excerpts: [] }),
    "retrieval-candidates.json": pretty({ schemaVersion: 1, candidates: [], note: "Candidates are not formal facts." }),
    "workspace-semantics.md": "# Workspace Semantics\n\nStatus: NOT_CONFIGURED\n\nNo user semantic profile was invented for this export.\n",
    "writing-profile.md": "# Writing Profile\n\nStatus: NOT_CONFIGURED\n\nNo writing profile was invented for this export.\n",
    "versions.json": pretty({ schemaVersion: 1, contextPackageSchemaVersion: 1, domainSchemaVersion: "v2", databaseSchemaVersion: source.databaseSchemaVersion(), skills: skillVersions }),
    "modify-scope.json": pretty({ schemaVersion: 1, informationalOnly: true, targets: modifyScope }),
  };
  for (const skill of skills) files[`skills/${skill.name}/SKILL.md`] = skill.content;
  const fileEntries = Object.entries(files).sort(([left], [right]) => left.localeCompare(right)).map(([path, content]) => ({
    path,
    sha256: createHash("sha256").update(content).digest("hex"),
    bytes: Buffer.byteLength(content),
  }));
  const manifest: ContextPackageManifest = {
    schemaVersion: 1,
    generatedAt,
    scope,
    authority: "READ_ONLY_DERIVATIVE",
    formalFactsSource: "SQLITE",
    graphExcerptStatus: "NOT_AVAILABLE_IN_LOCAL_SERVICE",
    includedObjectCount: objects.length,
    files: fileEntries,
  };
  return { manifest, files: Object.fromEntries(Object.entries(files).sort(([left], [right]) => left.localeCompare(right))) };
}

export function contextPackageFingerprint(value: ServiceContextPackage): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}
