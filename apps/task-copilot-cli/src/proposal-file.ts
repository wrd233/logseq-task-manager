import { open } from "node:fs/promises";

export const MAX_PROPOSAL_INPUT_BYTES = 1_048_576;

export async function loadProposalFile(path: string): Promise<unknown> {
  const handle = await open(path, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error(`Proposal input is not a regular file: ${path}`);
    if (stat.size > MAX_PROPOSAL_INPUT_BYTES) throw new Error(`Proposal input exceeds ${MAX_PROPOSAL_INPUT_BYTES} bytes.`);
    const text = await handle.readFile({ encoding: "utf8" });
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error(`Proposal input is not valid JSON: ${path}`);
    }
  } finally {
    await handle.close();
  }
}
