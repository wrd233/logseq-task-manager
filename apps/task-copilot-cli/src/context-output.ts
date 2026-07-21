import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

import type { ServiceContextExportResult } from "@task-copilot/service-client";

function safeFile(root: string, path: string): string {
  const components = path.split("/");
  if (path.length > 512 || components.length > 16 || components.some((component) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(component) || component === "." || component === "..")) {
    throw new Error(`Context Package contains an unsafe path: ${path}`);
  }
  const target = resolve(root, path);
  if (!target.startsWith(`${resolve(root)}${sep}`)) throw new Error(`Context Package path escapes output directory: ${path}`);
  return target;
}

export async function writeContextPackage(outPath: string, result: ServiceContextExportResult): Promise<void> {
  const root = resolve(outPath);
  let created = false;
  try {
    await mkdir(root, { mode: 0o700 });
    created = true;
    const manifestPaths = new Set(result.contextPackage.manifest.files.map(({ path }) => path));
    if (manifestPaths.size !== result.contextPackage.manifest.files.length || manifestPaths.size !== Object.keys(result.contextPackage.files).length) throw new Error("Context Package manifest and file set differ.");
    for (const entry of result.contextPackage.manifest.files) {
      const content = result.contextPackage.files[entry.path];
      if (content === undefined || Buffer.byteLength(content) !== entry.bytes || createHash("sha256").update(content).digest("hex") !== entry.sha256) throw new Error(`Context Package file verification failed: ${entry.path}`);
      const target = safeFile(root, entry.path);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
    }
    await writeFile(join(root, "manifest.json"), `${JSON.stringify({ ...result.contextPackage.manifest, fingerprint: result.fingerprint }, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  } catch (error) {
    if (created) await rm(root, { recursive: true, force: true });
    throw error;
  }
}
