import { open } from "node:fs/promises";

export const MAX_PROPOSAL_INPUT_BYTES = 1_048_576;
export const MAX_MIGRATION_INPUT_BYTES = 8 * 1_048_576;

async function loadJsonFile(path: string, maximumBytes: number, label: string): Promise<unknown> {
  const handle = await open(path, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error(`${label} input is not a regular file: ${path}`);
    if (stat.size > maximumBytes) throw new Error(`${label} input exceeds ${maximumBytes} bytes.`);
    const text = await handle.readFile({ encoding: "utf8" });
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error(`${label} input is not valid JSON: ${path}`);
    }
  } finally {
    await handle.close();
  }
}

export function loadProposalFile(path: string): Promise<unknown> {
  return loadJsonFile(path, MAX_PROPOSAL_INPUT_BYTES, "Proposal");
}

export function loadMigrationBundleFile(path: string): Promise<unknown> {
  return loadJsonFile(path, MAX_MIGRATION_INPUT_BYTES, "Migration bundle");
}
