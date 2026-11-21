import { execFile, execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import process from "node:process";

export interface RunningLogseqApp {
  pid: number;
  appPath: string;
  userDataDir: string | null;
}

function extractGraphPath(graphId?: string): string | null {
  if (!graphId || typeof graphId !== "string") return null;
  const marker = "logseq_local_";
  const idx = graphId.indexOf(marker);
  if (idx < 0) return null;
  const candidate = graphId.slice(idx + marker.length).trim();
  return candidate.startsWith("/") ? resolve(candidate) : null;
}

export function pickRunningLogseqApp(
  psOutput: string,
  options: { stateDirectory?: string; graphId?: string; homeDirectory?: string } = {}
): RunningLogseqApp | null {
  const home = resolve(options.homeDirectory ?? homedir());
  const stateParent = options.stateDirectory ? dirname(resolve(options.stateDirectory)) : null;
  const isolatedStateParent = stateParent && stateParent !== home ? stateParent : null;
  const graphPath = extractGraphPath(options.graphId);
  const graphParent = graphPath ? dirname(graphPath) : null;

  const candidates: Array<RunningLogseqApp & { score: number }> = [];
  for (const rawLine of psOutput.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) continue;
    const space = line.search(/\s/u);
    if (space < 1) continue;
    const pid = Number(line.slice(0, space));
    const command = line.slice(space).trim();
    if (!Number.isInteger(pid) || pid <= 0) continue;
    if (command.includes("Helper") || command.includes("--type=")) continue;
    const appMatch = /^(.+?\.app)\/Contents\/MacOS\/Logseq(?:\s|$)/u.exec(command);
    if (!appMatch) continue;
    const appPath = resolve(appMatch[1]!);
    const dataDirMatch = /--user-data-dir=(?:"([^"]+)"|'([^']+)'|(\S+))/u.exec(command);
    const userDataDir = dataDirMatch ? resolve(dataDirMatch[1] ?? dataDirMatch[2] ?? dataDirMatch[3]!) : null;

    let score = 0;
    if (isolatedStateParent) {
      if (userDataDir && (userDataDir === isolatedStateParent || userDataDir.startsWith(`${isolatedStateParent}/`))) {
        score += 120;
      }
      if (appPath.startsWith(`${isolatedStateParent}/`)) {
        score += 100;
      }
    }
    if (graphParent && graphParent !== home) {
      if (userDataDir && (userDataDir === graphParent || userDataDir.startsWith(`${graphParent}/`))) {
        score += 110;
      }
      if (appPath.startsWith(`${graphParent}/`)) {
        score += 90;
      }
    }
    if (!isolatedStateParent && !userDataDir && appPath === "/Applications/Logseq.app") {
      score += 30;
    } else if (!isolatedStateParent && score === 0) {
      score += 10;
    }
    // Never fall back to daily /Applications/Logseq.app when targeting an isolated lab/sandbox!
    if (isolatedStateParent && score === 0) continue;
    candidates.push({ pid, appPath, userDataDir, score });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score || b.pid - a.pid);
  const chosen = candidates[0]!;
  return { pid: chosen.pid, appPath: chosen.appPath, userDataDir: chosen.userDataDir };
}

const BROWSER_SIGNATURES: Array<{ test: (ua: string) => boolean; appNames: string[] }> = [
  { test: (ua) => /\bEdg\//u.test(ua), appNames: ["Microsoft Edge.app"] },
  { test: (ua) => /\bArc\//u.test(ua), appNames: ["Arc.app"] },
  { test: (ua) => /\bBrave\b/iu.test(ua), appNames: ["Brave Browser.app"] },
  { test: (ua) => /\bFirefox\//u.test(ua), appNames: ["Firefox.app"] },
  {
    test: (ua) => /\bChrome\//u.test(ua) && !/\bEdg\//u.test(ua),
    appNames: ["Google Chrome.app", "Arc.app", "Brave Browser.app", "Chromium.app"],
  },
  { test: (ua) => /\bSafari\//u.test(ua) && !/\bChrome\//u.test(ua), appNames: ["Safari.app"] },
];

export function pickRunningBrowserApp(psOutput: string, userAgent?: string | null): string | null {
  const ua = typeof userAgent === "string" ? userAgent : "";
  const preferredNames =
    BROWSER_SIGNATURES.find((sig) => sig.test(ua))?.appNames ??
    ["Google Chrome.app", "Safari.app", "Arc.app", "Microsoft Edge.app", "Firefox.app"];

  const runningApps: string[] = [];
  for (const rawLine of psOutput.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.includes("Helper") || line.includes("--type=")) continue;
    const match = /(\/[^\n]*?\.app)\/Contents\/MacOS\//u.exec(line);
    if (match) runningApps.push(match[1]!);
  }
  for (const name of preferredNames) {
    const found = runningApps.find((appPath) => appPath.endsWith(`/${name}`));
    if (found) return found;
  }
  return null;
}

function readMacProcessTable(): string | null {
  if (process.platform !== "darwin" || process.env.TASK_COPILOT_SKIP_WINDOW_ACTIVATE === "1") {
    return null;
  }
  try {
    return execFileSync("/bin/ps", ["-ww", "-eo", "pid=,command="], {
      encoding: "utf8",
      timeout: 1500,
      env: { ...process.env, LC_ALL: "en_US.UTF-8", LANG: "en_US.UTF-8" },
    });
  } catch {
    return null;
  }
}

function activateAppBundle(appPath: string): Promise<boolean> {
  return new Promise((resolveDone) => {
    execFile("/usr/bin/open", ["-a", appPath], { timeout: 2000 }, (error) => {
      resolveDone(!error);
    });
  });
}

export async function activateRunningLogseq(options: {
  stateDirectory?: string;
  graphId?: string;
}): Promise<{ activated: boolean; appPath: string | null; pid: number | null }> {
  const table = readMacProcessTable();
  if (!table) return { activated: false, appPath: null, pid: null };
  const target = pickRunningLogseqApp(table, options);
  if (!target) return { activated: false, appPath: null, pid: null };
  const activated = await activateAppBundle(target.appPath);
  return { activated, appPath: target.appPath, pid: target.pid };
}

export async function activateRunningBrowser(
  userAgent?: string | null
): Promise<{ activated: boolean; appPath: string | null }> {
  const table = readMacProcessTable();
  if (!table) return { activated: false, appPath: null };
  const appPath = pickRunningBrowserApp(table, userAgent);
  if (!appPath) return { activated: false, appPath: null };
  const activated = await activateAppBundle(appPath);
  return { activated, appPath };
}
