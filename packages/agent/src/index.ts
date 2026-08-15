import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { AgentCurrentFocusResult, AgentEngagementResult, CurrentFocusAgent, EngagementAgent, SkillPackage, TasteProfile } from "@task-copilot/contracts";

export { FakeContextAwareExecutor } from "./fake-context-cognition.ts";
export { DeepSeekV4FlashExecutor, extractStructuredJudgmentText, parseDeepSeekJudgmentText, parseSemanticJudgment } from "./deepseek-executor.ts";

const skillFiles = ["manifest.json", "policy.md", "schema.json", "examples.json", "eval.json"] as const;

async function loadSkill(directory: string): Promise<SkillPackage> {
  const contents = await Promise.all(skillFiles.map((name) => readFile(join(directory, name), "utf8")));
  const contentHash = createHash("sha256").update(skillFiles.map((name, index) => `${name}\n${contents[index]}`).join("\n")).digest("hex");
  const manifest = JSON.parse(contents[0]!) as { id: string; version: string };
  return { id: manifest.id, version: manifest.version, contentHash, manifest, policy: contents[1]!, schema: JSON.parse(contents[2]!), examples: JSON.parse(contents[3]!), eval: JSON.parse(contents[4]!) };
}

export async function loadCurrentFocusSkill(root = fileURLToPath(new URL("../../../", import.meta.url))): Promise<SkillPackage> {
  const directory = join(root, "skills", "current-focus-maintenance", "0.1.0");
  return loadSkill(directory);
}

export async function loadEngagementReconciliationSkill(root = fileURLToPath(new URL("../../../", import.meta.url))): Promise<SkillPackage> {
  return loadSkill(join(root, "skills", "engagement-reconciliation", "0.1.1"));
}

export async function loadMiniProjectGovernanceSkill(root = fileURLToPath(new URL("../../../", import.meta.url))): Promise<SkillPackage> {
  return loadSkill(join(root, "skills", "miniproject-governance", "0.1.0"));
}

export async function loadWorkIntentMaintenanceSkill(root = fileURLToPath(new URL("../../../", import.meta.url))): Promise<SkillPackage> {
  return loadSkill(join(root, "skills", "work-intent-maintenance", "0.1.0"));
}

export async function loadMiniProjectTaste(root = fileURLToPath(new URL("../../../", import.meta.url))): Promise<TasteProfile> {
  const directory = join(root, "taste", "miniproject-governance", "0.1.0");
  const [profileRaw, evalRaw] = await Promise.all([readFile(join(directory, "profile.json"), "utf8"), readFile(join(directory, "eval.json"), "utf8")]);
  const profile = JSON.parse(profileRaw) as Omit<TasteProfile, "contentHash">;
  const contentHash = createHash("sha256").update(`profile.json\n${profileRaw}\neval.json\n${evalRaw}`).digest("hex");
  return { ...profile, contentHash };
}

function evidenceClause(content: string, term: RegExp): string | null {
  return content.split(/[。；;，,]|(?:但(?:是)?)/u).map((clause) => clause.trim()).find((clause) => term.test(clause)) ?? null;
}

function clauseConfirms(clause: string | null, positive: RegExp): boolean {
  return Boolean(clause && positive.test(clause) && !/(?:尚未|还未|仍未|没有|未能|不能|无法|待)(?:\S{0,8})/u.test(clause));
}

function waitingConditionSatisfied(description: string, content: string): boolean {
  const networkTerms = [/(?:VLAN)/iu, /网关/iu, /地址规划/iu].filter((term) => term.test(description));
  if (networkTerms.length > 0) return networkTerms.every((term) => clauseConfirms(evidenceClause(content, term), /(?:已经|已|完成|确认|分配)/u));
  if (/业务方|上线/iu.test(description)) return clauseConfirms(evidenceClause(content, /业务方|上线/iu), /(?:已经|已|确认|同意)/u);
  if (/采购|审批/iu.test(description)) return clauseConfirms(evidenceClause(content, /采购|审批/iu), /(?:已经|已|通过|完成)/u);
  return false;
}

function explicitReviewDate(content: string): string | null {
  const value = /(?:复查|review(?:\s+on)?)[：:\s]+(\d{4}-\d{2}-\d{2})\b/iu.exec(content)?.[1] ?? null;
  if (!value || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))) return null;
  return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value ? value : null;
}

export class DeterministicCurrentFocusAgent implements CurrentFocusAgent {
  readonly id = "fake-current-focus-agent";

  async propose(input: Parameters<CurrentFocusAgent["propose"]>[0]): Promise<AgentCurrentFocusResult> {
    const content = input.evidence.map((item) => item.frozenContent).join("\n").trim();
    if (/等待|等候|依赖.*完成|blocked|waiting/iu.test(content)) return { outcome: "NO_PROPOSAL", reasonCode: "OUT_OF_SCOPE_WAITING", rationaleSummary: "Evidence indicates waiting state, which is outside current-focus authority." };
    if (/完成项目|取消|关闭|改名|重命名|扩大范围|新增项目/iu.test(content)) return { outcome: "NO_PROPOSAL", reasonCode: "SCOPE_EXPANSION", rationaleSummary: "Evidence asks for a lifecycle, identity, or scope change." };
    if (/可能|或者|二选一|尚不确定|也许/iu.test(content)) return { outcome: "NO_PROPOSAL", reasonCode: "AMBIGUOUS", rationaleSummary: "Evidence does not identify one unambiguous next focus." };
    const proposed = /服务器上架/iu.test(content) && /管理口网络/iu.test(content)
      ? "准备服务器上架并完成管理口网络配置"
      : /(?:下一步|接下来(?:可以)?|当前推进)[：:]?\s*([^。\n]{2,200})/u.exec(content)?.[1]?.trim() ?? null;
    if (!proposed) return { outcome: "NO_PROPOSAL", reasonCode: "INSUFFICIENT_EVIDENCE", rationaleSummary: "Evidence contains no bounded next action." };
    if (input.target.currentFocus === proposed) return { outcome: "NO_PROPOSAL", reasonCode: "ALREADY_ACCURATE", rationaleSummary: "Current focus already matches the evidence." };
    return { outcome: "PROPOSAL", currentFocus: proposed, reasonCode: "BOUNDED_NEXT_ACTION", rationaleSummary: "One low-risk current-focus field update is supported by frozen evidence." };
  }
}

export class DeterministicEngagementAgent implements EngagementAgent {
  readonly id = "fake-engagement-agent";

  async propose(input: Parameters<EngagementAgent["propose"]>[0]): Promise<AgentEngagementResult> {
    const content = input.evidence.map((item) => item.frozenContent).join("\n").trim();
    if (/先放|下季度|Q[1-4]|优先级.*低|暂时不做/iu.test(content)) return { outcome: "NO_PROPOSAL", reasonCode: "PARKING_REQUIRES_USER_DECISION", rationaleSummary: "Parking is an intentional user decision outside this Skill." };
    if (/另一个项目|其他项目/iu.test(content) && !content.includes(input.target.title)) return { outcome: "NO_PROPOSAL", reasonCode: "SCOPE_UNCLEAR", rationaleSummary: "Evidence does not clearly bind the blocker to this WorkObject." };
    if (input.target.engagement === "ACTIONABLE") {
      if (/网络组.*(?:还没有|尚未).*(?:VLAN|网关).*(?:才能|无法|不能)|业务方.*(?:还没|尚未)确认.*(?:之前不能|才能)|采购.*(?:还没|尚未).*审批.*(?:不能|无法)/iu.test(content)) {
        const description = /网络组/iu.test(content) ? "等待网络组分配 VLAN 和网关信息" : /业务方/iu.test(content) ? "等待业务方确认生产上线时间" : "等待采购流程审批完成";
        return { outcome: "PROPOSAL", transition: { from: "ACTIONABLE", to: "WAITING", waiting: { description, reviewAt: explicitReviewDate(content) } }, reasonCode: "EXTERNAL_PREREQUISITE_UNMET", rationaleSummary: "Direct Evidence identifies an unmet external prerequisite for this WorkObject." };
      }
      return { outcome: "NO_PROPOSAL", reasonCode: "NO_EXTERNAL_BLOCKER", rationaleSummary: "Evidence does not prove an external prerequisite prevents progress." };
    }
    if (input.target.engagement === "WAITING" && input.target.waitingCondition) {
      if (waitingConditionSatisfied(input.target.waitingCondition.description, content)) return { outcome: "PROPOSAL", transition: { from: "WAITING", to: "ACTIONABLE", waiting: null }, reasonCode: "WAITING_CONDITION_SATISFIED", rationaleSummary: "Direct Evidence confirms the current WaitingCondition is satisfied." };
      return { outcome: "NO_PROPOSAL", reasonCode: "WAITING_NOT_PROVEN_RESOLVED", rationaleSummary: "Evidence does not prove the current WaitingCondition has been satisfied." };
    }
    return { outcome: "NO_PROPOSAL", reasonCode: "ENGAGEMENT_OUT_OF_SCOPE", rationaleSummary: "Only ACTIONABLE and WAITING are governed by this Skill." };
  }
}
