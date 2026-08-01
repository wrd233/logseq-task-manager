import type { AgentGovernanceExportPackage } from "@task-copilot/domain";

interface DownloadAnchor {
  href: string;
  download: string;
  click(): void;
  remove(): void;
}

export interface TextDownloadDependencies {
  createObjectUrl(blob: Blob): string;
  revokeObjectUrl(url: string): void;
  createAnchor(): DownloadAnchor;
  appendAnchor(anchor: DownloadAnchor): void;
  schedule(callback: () => void, delayMs: number): unknown;
}

function browserDependencies(): TextDownloadDependencies {
  return {
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    createAnchor: () => document.createElement("a"),
    appendAnchor: (anchor) => document.body.append(anchor as HTMLAnchorElement),
    schedule: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  };
}

export function downloadTextFile(
  filename: string,
  content: string,
  type: string,
  dependencies: TextDownloadDependencies = browserDependencies(),
): void {
  const url = dependencies.createObjectUrl(new Blob([content], { type }));
  const anchor = dependencies.createAnchor();
  anchor.href = url;
  anchor.download = filename;
  dependencies.appendAnchor(anchor);
  anchor.click();
  anchor.remove();
  dependencies.schedule(() => dependencies.revokeObjectUrl(url), 10_000);
}

export function buildAgentGovernancePackageDownload(value: AgentGovernanceExportPackage): {
  filename: string;
  content: string;
  type: "application/json;charset=utf-8";
} {
  const prefix = value.manifest.kind === "SKILL_FEEDBACK" ? "agent-skill-feedback" : "agent-review-evidence";
  const stamp = value.manifest.generatedAt.replaceAll(":", "-").replaceAll(".", "-");
  return {
    filename: `${prefix}-${stamp}.json`,
    content: JSON.stringify(value, null, 2),
    type: "application/json;charset=utf-8",
  };
}
