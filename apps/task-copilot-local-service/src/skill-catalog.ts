import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateAgentGovernanceSkillManifest, type AgentGovernanceSkillManifest } from "@task-copilot/domain";
import { StructuredError } from "@task-copilot/shared";

const skillNames = ["task-copilot-core", "design-project", "recover-context", "mini-project-modeling", "project-creation-modeling"] as const;
export type TaskCopilotSkillName = (typeof skillNames)[number];

export interface TaskCopilotSkillSummary {
  name: TaskCopilotSkillName;
  version: string;
  description: string;
  sha256: string;
}

export interface TaskCopilotSkillDocument extends TaskCopilotSkillSummary {
  content: string;
}

export interface AgentGovernanceSkillDocument {
  name: "agent-decision-governance";
  version: string;
  description: string;
  sha256: string;
  content: string;
  manifest: AgentGovernanceSkillManifest;
}

export function skillRootForModuleUrl(moduleUrl: string): string {
  const moduleDirectory = dirname(fileURLToPath(moduleUrl));
  return ["dist", "bin"].includes(basename(moduleDirectory))
    ? join(moduleDirectory, "skills")
    : resolve(moduleDirectory, "../../../skills");
}

function skillError(code: string, message: string): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-123", "D-132", "D-212"] });
}

export function defaultSkillRoot(): string {
  return skillRootForModuleUrl(import.meta.url);
}

export async function readTaskCopilotSkill(name: string, root = defaultSkillRoot()): Promise<TaskCopilotSkillDocument | undefined> {
  if (!skillNames.includes(name as TaskCopilotSkillName)) return undefined;
  const content = await readFile(join(root, name, "SKILL.md"), "utf8");
  if (Buffer.byteLength(content) > 64 * 1024) throw skillError("SKILL_DOCUMENT_TOO_LARGE", "Skill 文档超过 64 KiB 限制。");
  const frontmatterName = content.match(/^---\nname: ([a-z0-9-]+)\n/m)?.[1];
  const description = content.match(/^description: (.+)$/m)?.[1]?.trim();
  const version = content.match(/^Version: `([0-9]+\.[0-9]+\.[0-9]+)`$/m)?.[1];
  if (frontmatterName !== name || !description || !version) throw skillError("SKILL_DOCUMENT_INVALID", "Skill 文档缺少匹配的 name、description 或版本。");
  return { name: name as TaskCopilotSkillName, version, description, sha256: createHash("sha256").update(content).digest("hex"), content };
}

export async function listTaskCopilotSkills(root = defaultSkillRoot()): Promise<TaskCopilotSkillSummary[]> {
  const documents = await Promise.all(skillNames.map((name) => readTaskCopilotSkill(name, root)));
  return documents.map((document) => {
    if (!document) throw skillError("SKILL_DOCUMENT_MISSING", "内置 Skill 文档缺失。");
    return {
      name: document.name,
      version: document.version,
      description: document.description,
      sha256: document.sha256,
    };
  });
}

export async function readAgentGovernanceSkill(root = defaultSkillRoot()): Promise<AgentGovernanceSkillDocument> {
  const name = "agent-decision-governance" as const;
  const content = await readFile(join(root, name, "SKILL.md"), "utf8");
  if (Buffer.byteLength(content) > 64 * 1024) throw skillError("SKILL_DOCUMENT_TOO_LARGE", "Agent governance Skill 文档超过 64 KiB 限制。");
  const frontmatterName = content.match(/^---\nname: ([a-z0-9-]+)\n/m)?.[1];
  const description = content.match(/^description: (.+)$/m)?.[1]?.trim();
  const version = content.match(/^Version: `([0-9]+\.[0-9]+\.[0-9]+)`$/m)?.[1];
  const rawManifest = content.match(/^## Governance Manifest\n\n```json\n([\s\S]*?)\n```$/m)?.[1];
  if (frontmatterName !== name || !description || !version || !rawManifest) {
    throw skillError("SKILL_DOCUMENT_INVALID", "Agent governance Skill 缺少匹配的 name、description、version 或 manifest。");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawManifest) as unknown;
  } catch {
    throw skillError("SKILL_MANIFEST_INVALID_JSON", "Agent governance Skill manifest 不是合法 JSON。");
  }
  return {
    name,
    version,
    description,
    sha256: createHash("sha256").update(content).digest("hex"),
    content,
    manifest: validateAgentGovernanceSkillManifest(parsed),
  };
}
