import { lstat, readFile } from "node:fs/promises";

import { parseLauncherConfig, type LauncherConfig } from "./contracts.ts";

export async function loadLauncherConfig(path: string): Promise<LauncherConfig> {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch {
    throw new Error("LAUNCHER_CONFIG_UNREADABLE");
  }
  if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o600) {
    throw new Error("LAUNCHER_CONFIG_INSECURE");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error("LAUNCHER_CONFIG_INVALID_JSON");
  }
  return parseLauncherConfig(parsed);
}
