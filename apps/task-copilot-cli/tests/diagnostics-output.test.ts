import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { ServiceDoctor, ServiceStatus } from "@task-copilot/service-client";

import { crc32, writeDiagnosticsArchive } from "../src/diagnostics-output.ts";

function storedEntries(archive: Buffer): Map<string, string> {
  const entries = new Map<string, string>();
  let offset = 0;
  while (archive.readUInt32LE(offset) === 0x04034b50) {
    const size = archive.readUInt32LE(offset + 18);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const contentStart = nameStart + nameLength + extraLength;
    const name = archive.subarray(nameStart, nameStart + nameLength).toString("utf8");
    entries.set(name, archive.subarray(contentStart, contentStart + size).toString("utf8"));
    offset = contentStart + size;
  }
  assert.equal(archive.readUInt32LE(offset), 0x02014b50, "central directory follows stored entries");
  return entries;
}

test("diagnostic ZIP is private, manifest-hashed, sanitized, and refuses overwrite", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-diagnostics-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const target = join(root, "nested", "diagnostics.zip");
  const doctor: ServiceDoctor = { status: "PASS", schemaVersion: 6, integrity: "ok", foreignKeyViolations: 0, objectCount: 0, limitations: ["Desktop gate required."] };
  const status: ServiceStatus = { status: "READY", protocolVersion: 1, capabilities: { formalWrites: true, migration: false, provider: false, backup: true }, databaseSchemaVersion: 6, objectCount: 0 };
  await writeDiagnosticsArchive(target, doctor, status);
  assert.equal((await stat(target)).mode & 0o777, 0o600);
  const entries = storedEntries(await readFile(target));
  assert.deepEqual([...entries.keys()].sort(), ["doctor.json", "manifest.json", "readme.md", "service-status.json"]);
  const manifest = JSON.parse(entries.get("manifest.json") ?? "") as { authority: string; redactions: string[]; files: Array<{ name: string; sha256: string }> };
  assert.equal(manifest.authority, "READ_ONLY_DIAGNOSTIC_DERIVATIVE");
  assert.ok(manifest.redactions.includes("api_key"));
  assert.equal(manifest.files.length, 3);
  assert.doesNotMatch([...entries.values()].join("\n"), /session-token|\/Users\//);
  await assert.rejects(() => writeDiagnosticsArchive(target, doctor, status), /EEXIST/);
  await assert.rejects(() => writeDiagnosticsArchive(join(root, "not-a-zip"), doctor, status), /\.zip/);
});

test("ZIP CRC32 matches the standard test vector", () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
});
