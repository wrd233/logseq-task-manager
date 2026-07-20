import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { StructuredError } from "@task-copilot/shared";

import { validateServiceDescriptor, type ServiceDescriptor } from "./index.ts";

export async function readServiceDescriptor(path: string): Promise<ServiceDescriptor> {
  const absolute = resolve(path);
  const metadata = await stat(absolute);
  if ((metadata.mode & 0o077) !== 0) {
    throw new StructuredError({
      code: "SERVICE_DESCRIPTOR_INSECURE",
      message: "Local Service 描述符权限必须为 0600。",
      ruleRefs: ["D-204"],
    });
  }
  const raw = await readFile(absolute, "utf8");
  try {
    return validateServiceDescriptor(JSON.parse(raw) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new StructuredError({ code: "SERVICE_DESCRIPTOR_INVALID", message: "Local Service 描述符不是合法 JSON。", ruleRefs: ["D-216"] });
    }
    throw error;
  }
}

export async function writeServiceDescriptor(path: string, descriptor: ServiceDescriptor): Promise<string> {
  validateServiceDescriptor(descriptor);
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  const temporary = `${absolute}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, JSON.stringify(descriptor), { encoding: "utf8", flag: "wx", mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, absolute);
  await chmod(absolute, 0o600);
  return absolute;
}

export async function removeServiceDescriptor(path: string): Promise<void> {
  await rm(resolve(path), { force: true });
}
