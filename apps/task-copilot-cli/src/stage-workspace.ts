import { lstat, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { WorkspaceError, workText } from "@task-copilot/contracts";
import { isSensitiveMaterialName } from "@task-copilot/reading-runtime";
import { authorizedRoot, materialWritePaths } from "./workspace-files.ts";

export interface StageGraphLocation {
  graphId?: string;
  graphName?: string;
  graphPath?: string;
}

export interface StageWorkspaceInfo {
  stageWorkspaceDir: string;
  source: "configured" | "graph" | "fallback";
}

function localAbsolutePath(value: string): string | undefined {
  if (typeof value !== "string" || !isAbsolute(value) || /^[\\/]{2}/u.test(value) || Array.from(value).some(char => char.charCodeAt(0) < 32) ||
      value.split(/[\\/]/u).includes("..")) return undefined;
  return resolve(value);
}

export const stageGraphFields = ["graphId", "graphName", "graphPath"] as const;

export function stageGraphLocation(input: Record<string, unknown>): StageGraphLocation {
  const graphPath = typeof input.graphPath === "string" && input.graphPath.length <= 4096
    ? localAbsolutePath(input.graphPath) : undefined;
  return {
    ...(input.graphId !== undefined ? { graphId: workText(input.graphId, 2048) } : {}),
    ...(input.graphName !== undefined ? { graphName: workText(input.graphName, 800) } : {}),
    ...(graphPath ? { graphPath } : {}),
  };
}

function includesDirectory(root: string, directory: string): boolean {
  const offset = relative(root, directory);
  return offset === "" || (!isAbsolute(offset) && offset !== ".." && !offset.startsWith(`..${sep}`));
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/** Preflight a dedicated directory before creating it. Never use a Graph or its pages root as cwd. */
export async function ensureStageWorkspaceDirectory(directory: string, stateDirectory: string, graphPath?: string): Promise<string> {
  const path = localAbsolutePath(directory);
  const invalid = () => new WorkspaceError("STAGE_WORKSPACE_PATH_INVALID", "全局导航台需要独立的复盘目录，请检查路径。");
  if (!path || includesDirectory(path, resolve(homedir())) || includesDirectory(path, resolve(stateDirectory)) ||
      basename(path).toLowerCase() === "pages" || path.split(sep).some(isSensitiveMaterialName) ||
      (graphPath && (includesDirectory(path, graphPath) || path === join(graphPath, "pages")))) throw invalid();
  try {
    await materialWritePaths(parse(path).root, [path]);
    // Also recognize file Graph roots when no live Graph metadata is available.
    if (await exists(join(path, "pages")) || await exists(join(path, "logseq", "config.edn"))) throw invalid();
    await mkdir(path, { recursive: true, mode: 0o700 });
    return await authorizedRoot(path);
  } catch {
    throw invalid();
  }
}

export async function resolveStageWorkspace(
  stateDirectory: string, graph: StageGraphLocation = {}, configured = process.env.TASK_COPILOT_STAGE_WORKSPACE_DIR,
): Promise<StageWorkspaceInfo> {
  let graphPath: string | undefined;
  if (graph.graphPath) {
    const path = localAbsolutePath(graph.graphPath);
    if (path && path !== parse(path).root) {
      // A removed or inaccessible Graph is equivalent to having no local file Graph.
      try { graphPath = await authorizedRoot(path); } catch { /* fall back */ }
    }
  }
  if (configured?.trim()) {
    const path = configured.startsWith("~/") || configured.startsWith("~\\") ? join(homedir(), configured.slice(2)) : configured;
    return { stageWorkspaceDir: await ensureStageWorkspaceDirectory(path, stateDirectory, graphPath), source: "configured" };
  }
  if (graphPath) {
    return { stageWorkspaceDir: await ensureStageWorkspaceDirectory(join(graphPath, "pages", "stage-reviews"), stateDirectory, graphPath), source: "graph" };
  }
  return { stageWorkspaceDir: await ensureStageWorkspaceDirectory(join(stateDirectory, "stage-workspace"), stateDirectory), source: "fallback" };
}
