import assert from "node:assert/strict";
import test from "node:test";

import type { AgentGovernanceExportPackage } from "@task-copilot/domain";

import { buildAgentGovernancePackageDownload, downloadTextFile } from "../src/download-text.ts";

test("download keeps the Blob URL alive until Electron has accepted the named file", () => {
  const actions: string[] = [];
  let scheduled: (() => void) | undefined;
  const anchor = {
    href: "",
    download: "",
    click: () => actions.push("click"),
    remove: () => actions.push("remove"),
  };
  downloadTextFile("agent-feedback.md", "evidence", "text/markdown", {
    createObjectUrl: () => {
      actions.push("create-url");
      return "blob:governance-export";
    },
    revokeObjectUrl: () => actions.push("revoke-url"),
    createAnchor: () => anchor,
    appendAnchor: () => actions.push("append"),
    schedule: (callback) => {
      actions.push("schedule-revoke");
      scheduled = callback;
    },
  });
  assert.equal(anchor.download, "agent-feedback.md");
  assert.deepEqual(actions, ["create-url", "append", "click", "remove", "schedule-revoke"]);
  scheduled?.();
  assert.deepEqual(actions, ["create-url", "append", "click", "remove", "schedule-revoke", "revoke-url"]);
});

test("governance export uses one named package so native save dialogs cannot strand a second file", () => {
  const value = {
    manifest: {
      schemaVersion: "agent-governance-export-v1",
      kind: "SKILL_FEEDBACK",
      generatedAt: "2026-08-02T04:00:00.000Z",
      since: "2026-07-03T04:00:00.000Z",
      until: "2026-08-02T04:00:00.000Z",
      sourceTotal: 1,
      includedCount: 1,
      truncated: false,
      redactionCount: 0,
      files: [],
    },
    files: { "README.md": "# Skill Feedback Package", "data/decisions.json": "[]" },
  } satisfies AgentGovernanceExportPackage;
  const download = buildAgentGovernancePackageDownload(value);
  assert.equal(download.filename, "agent-skill-feedback-2026-08-02T04-00-00-000Z.json");
  assert.equal(download.type, "application/json;charset=utf-8");
  assert.deepEqual(JSON.parse(download.content), value);
});
