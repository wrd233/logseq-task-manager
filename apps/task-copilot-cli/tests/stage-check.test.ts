import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, rm, type readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatStageSelfCheckText, runStageSelfCheck } from "../src/stage-check.ts";

test("runStageSelfCheck reports all-ok when Node 20, Companion LaunchAgent, iCloud, Calendar, and Skill are ready", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tc-stage-check-ok-"));
  const icloudDir = join(dir, "TaskCopilotInbox");
  const skillFile = join(dir, "SKILL.md");
  try {
    await mkdir(icloudDir, { recursive: true });
    await writeFile(join(icloudDir, "20261121-093000.md"), "记录一条语音想法\n", "utf8");
    await writeFile(skillFile, "# Attention Navigator\n", "utf8");
    const report = await runStageSelfCheck({
      stateDirectory: dir,
      icloudInboxDirectory: icloudDir,
      skillPath: skillFile,
      nodeVersion: "20.20.2",
      readServiceStatus: async (stateDir) => ({
        running: true,
        pid: 4242,
        baseUrl: "http://127.0.0.1:41234",
        stateDir,
        launchAgentInstalled: true,
        plistPath: join(dir, "com.task-copilot.workspace-companion.plist"),
        providersPath: join(dir, "providers.json"),
        staleLock: false,
      }),
      appleCalendar: {
        platform: "darwin",
        runOsascript: async () =>
          JSON.stringify([
            {
              id: "ev-1",
              title: "产品对齐会",
              calendarName: "Work",
              date: "2026-11-21",
              startTime: "14:00",
              endTime: "15:00",
              durationMinutes: 60,
            },
          ]),
      },
    });

    assert.equal(report.ok, true);
    assert.equal(report.items.length, 5);
    assert.ok(report.items.every((item) => item.status === "ok"));

    const text = formatStageSelfCheckText(report);
    assert.match(text, /\[OK\]/);
    assert.match(text, /核心链路就绪/);
    assert.doesNotMatch(text, /\p{Extended_Pictographic}/u, "Self-check output must stay zero-emoji");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runStageSelfCheck fails open with readable macOS TCC guidance when iCloud or Calendar permissions are denied", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tc-stage-check-tcc-"));
  try {
    const eperm = Object.assign(new Error("Operation not permitted"), { code: "EPERM" });
    const report = await runStageSelfCheck({
      stateDirectory: dir,
      icloudInboxDirectory: join(dir, "icloud"),
      skillPath: join(dir, "missing-skill.md"),
      nodeVersion: "25.6.1",
      readServiceStatus: async (stateDir) => ({
        running: false,
        pid: null,
        baseUrl: null,
        stateDir,
        launchAgentInstalled: false,
        plistPath: join(dir, "plist"),
        providersPath: join(dir, "providers.json"),
        staleLock: false,
      }),
      icloudFsOps: {
        readdir: (async () => {
          throw eperm;
        }) as unknown as typeof readdir,
      },
      appleCalendar: {
        platform: "darwin",
        runOsascript: async () => {
          throw new Error("Not authorized to send Apple events to Calendar. (-1743)");
        },
      },
    });

    assert.equal(report.ok, false);
    const byId = new Map(report.items.map((i) => [i.id, i]));
    assert.equal(byId.get("node")?.status, "warn");
    assert.equal(byId.get("companion")?.status, "action");
    assert.equal(byId.get("icloud-inbox")?.status, "action");
    assert.equal(byId.get("apple-calendar")?.status, "action");
    assert.equal(byId.get("attention-navigator-skill")?.status, "warn");

    const text = formatStageSelfCheckText(report);
    assert.match(text, /\[ACTION\]/);
    assert.match(text, /隐私与安全性/);
    assert.match(text, /workspace service install/);
    assert.doesNotMatch(text, /\p{Extended_Pictographic}/u, "Self-check output must stay zero-emoji");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
