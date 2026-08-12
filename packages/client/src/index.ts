import { readFile } from "node:fs/promises";

import { parseKernelDescriptor, type KernelDescriptor } from "./browser.ts";
export * from "./browser.ts";

export async function readKernelDescriptor(path: string): Promise<KernelDescriptor> {
  return parseKernelDescriptor(JSON.parse(await readFile(path, "utf8")));
}
