import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { AgentCurrentFocusResult, CurrentFocusAgent, SkillPackage } from "@task-copilot/contracts";

const skillFiles = ["manifest.json", "policy.md", "schema.json", "examples.json", "eval.json"] as const;

export async function loadCurrentFocusSkill(root = fileURLToPath(new URL("../../../", import.meta.url))): Promise<SkillPackage> {
  const directory = join(root, "skills", "current-focus-maintenance", "0.1.0");
  const contents = await Promise.all(skillFiles.map((name) => readFile(join(directory, name), "utf8")));
  const contentHash = createHash("sha256").update(skillFiles.map((name, index) => `${name}\n${contents[index]}`).join("\n")).digest("hex");
  return {
    id: "current-focus-maintenance", version: "0.1.0", contentHash,
    manifest: JSON.parse(contents[0]!), policy: contents[1]!, schema: JSON.parse(contents[2]!),
    examples: JSON.parse(contents[3]!), eval: JSON.parse(contents[4]!),
  };
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
