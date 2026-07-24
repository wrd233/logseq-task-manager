import assert from "node:assert/strict";
import test from "node:test";

import {
  serviceFailureLine,
  serviceMigrationLine,
  serviceReadyLine,
} from "../src/process-output.ts";

test("Local Service process output excludes descriptor, database, backup, and error text", () => {
  const ready = serviceReadyLine(321, {
    formalWrites: true,
    migration: true,
    provider: false,
    backup: true,
  });
  assert.deepEqual(JSON.parse(ready), {
    status: "READY",
    pid: 321,
    capabilities: {
      formalWrites: true,
      migration: true,
      provider: false,
      backup: true,
    },
  });

  const migration = serviceMigrationLine({
    migrated: true,
    fromVersion: 11,
    schemaVersion: 12,
    backupPath: "/private/graph/backup.db",
  });
  assert.deepEqual(JSON.parse(migration), {
    status: "MIGRATED",
    fromVersion: 11,
    schemaVersion: 12,
    backupCreated: true,
  });

  const privateError = Object.assign(new Error("private graph path and provider response"), {
    code: "V2_DATABASE_OPEN_FAILED",
  });
  assert.deepEqual(JSON.parse(serviceFailureLine(privateError)), {
    status: "FAILED",
    code: "V2_DATABASE_OPEN_FAILED",
  });
  const combined = `${ready}\n${migration}\n${serviceFailureLine(new Error("private key"))}`;
  for (const privateValue of ["/private/graph", "provider response", "private key", "descriptorPath", "backupPath"]) {
    assert.doesNotMatch(combined, new RegExp(privateValue));
  }
});
