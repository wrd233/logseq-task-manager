import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { ServiceDoctor, ServiceStatus } from "@task-copilot/service-client";

interface ZipEntry { name: string; content: Buffer }

export function crc32(input: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function createStoredZip(entries: ZipEntry[]): Buffer {
  const names = new Set<string>();
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    if (!/^[a-z0-9][a-z0-9.-]*$/.test(entry.name) || names.has(entry.name)) throw new Error(`Unsafe or duplicate diagnostic entry: ${entry.name}`);
    names.add(entry.name);
    const name = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(entry.content.length, 18); local.writeUInt32LE(entry.content.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12); central.writeUInt16LE(0x21, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(entry.content.length, 20); central.writeUInt32LE(entry.content.length, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36); central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42);
    localParts.push(local, name, entry.content);
    centralParts.push(central, name);
    offset += local.length + name.length + entry.content.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(centralDirectory.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

export async function writeDiagnosticsArchive(outPath: string, doctor: ServiceDoctor, status: ServiceStatus): Promise<void> {
  const target = resolve(outPath);
  if (!target.endsWith(".zip")) throw new Error("Diagnostic export path must end with .zip.");
  const files: Record<string, string> = {
    "doctor.json": `${JSON.stringify(doctor, null, 2)}\n`,
    "service-status.json": `${JSON.stringify(status, null, 2)}\n`,
    "readme.md": "# Task Copilot diagnostics\n\nThis archive contains sanitized Local Service status only. It contains no Graph text, SQLite rows, filesystem paths, session token, API key, prompt, or provider response. Read doctor.json limitations before treating a PASS as Desktop or live-provider evidence.\n",
  };
  const manifest = {
    schemaVersion: 1,
    authority: "READ_ONLY_DIAGNOSTIC_DERIVATIVE",
    redactions: ["graph_text", "sqlite_rows", "filesystem_paths", "service_token", "api_key", "prompt", "provider_response"],
    files: Object.entries(files).map(([name, content]) => ({ name, bytes: Buffer.byteLength(content), sha256: createHash("sha256").update(content).digest("hex") })).sort((left, right) => left.name.localeCompare(right.name)),
  };
  files["manifest.json"] = `${JSON.stringify(manifest, null, 2)}\n`;
  const archive = createStoredZip(Object.entries(files).sort(([left], [right]) => left.localeCompare(right)).map(([name, content]) => ({ name, content: Buffer.from(content, "utf8") })));
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(target, archive, { flag: "wx", mode: 0o600 });
}
