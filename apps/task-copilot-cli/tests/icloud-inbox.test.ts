import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MACOS_ICLOUD_TCC_GUIDANCE,
  parseShortcutFilenameTimestamp,
  scanIcloudInbox,
} from "../src/icloud-inbox.ts";
import { startWorkspaceServer } from "../src/workspace-server.ts";

test("parseShortcutFilenameTimestamp parses iPhone Shortcut yyyyMMdd-HHmmss.md filenames", () => {
  const ts = parseShortcutFilenameTimestamp("20261121-091530.md");
  assert.ok(ts !== null);
  const dt = new Date(ts);
  assert.equal(dt.getFullYear(), 2026);
  assert.equal(dt.getMonth(), 10); // November (0-indexed)
  assert.equal(dt.getDate(), 21);
  assert.equal(dt.getHours(), 9);
  assert.equal(dt.getMinutes(), 15);
  assert.equal(dt.getSeconds(), 30);

  assert.equal(parseShortcutFilenameTimestamp("random-note.md"), null);
  assert.equal(parseShortcutFilenameTimestamp("20261399-999999.md"), null);
});

test("scanIcloudInbox consumes Shortcut & Flomo notes idempotently, deduplicates conflict copies, and ignores stubs", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "tc-icloud-scan-")));
  try {
    const now = new Date(2026, 10, 21, 22, 0, 0).getTime();
    await writeFile(join(root, "20261120-183000.md"), "下班路上想到：告警降噪先只收 Top 3 噪声规则", "utf8");
    // iCloud Drive conflict copy with identical text should deduplicate
    await writeFile(join(root, "20261120-183000 2.md"), "下班路上想到：告警降噪先只收 Top 3 噪声规则", "utf8");
    // Older than 14 days -> cooled
    await writeFile(join(root, "20261101-080000.md"), "以前想买人体工学椅，有空再看", "utf8");
    // Flomo source header
    await writeFile(join(root, "20261121-100000.md"), "source: flomo\n阅读笔记：先聚焦单主线再扩展支线", "utf8");
    // Hidden iCloud evicted stub & empty file should be skipped safely
    await writeFile(join(root, ".20261121-110000.md.icloud"), "placeholder", "utf8");
    await writeFile(join(root, "20261121-120000.md"), "   \n  ", "utf8");

    const scan1 = await scanIcloudInbox({
      directory: root,
      archivedIds: new Set(),
      archivedSignatures: new Set(),
      now,
    });
    assert.equal(scan1.diagnostic.status, "ok");
    assert.equal(scan1.items.length, 3);
    assert.equal(scan1.diagnostic.cooledCount, 1);

    const shortcutItem = scan1.items.find((i) => i.text.includes("Top 3 噪声规则"))!;
    assert.equal(shortcutItem.sourceType, "ios-shortcut");
    assert.equal(shortcutItem.sourceLabel, "iPhone 随口记");

    const flomoItem = scan1.items.find((i) => i.text.includes("先聚焦单主线"))!;
    assert.equal(flomoItem.sourceType, "flomo");
    assert.equal(flomoItem.sourceLabel, "Flomo");

    // Re-scanning produces exact same IDs (idempotent)
    const scan2 = await scanIcloudInbox({
      directory: root,
      archivedIds: new Set(),
      archivedSignatures: new Set(),
      now,
    });
    assert.deepEqual(
      scan2.items.map((i) => i.id),
      scan1.items.map((i) => i.id),
    );

    // Archiving by signature suppresses both canonical file and conflict copy without touching disk
    const sig = scan1.signatureById.get(shortcutItem.id)!;
    const scan3 = await scanIcloudInbox({
      directory: root,
      archivedIds: new Set([shortcutItem.id]),
      archivedSignatures: new Set([sig]),
      now,
    });
    assert.equal(scan3.items.length, 2);
    assert.equal(scan3.items.some((i) => i.id === shortcutItem.id), false);
    await access(join(root, "20261120-183000.md"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("scanIcloudInbox fails open on macOS TCC EPERM and ENOENT with readable guidance", async () => {
  const eperm = Object.assign(new Error("EPERM: operation not permitted"), { code: "EPERM" });
  const denied = await scanIcloudInbox({
    directory: "/Users/example/Library/Mobile Documents/com~apple~CloudDocs/TaskCopilotInbox",
    archivedIds: new Set(),
    archivedSignatures: new Set(),
    fsOps: {
      readdir: async () => {
        throw eperm;
      },
    },
  });
  assert.deepEqual(denied.items, []);
  assert.equal(denied.diagnostic.status, "permission-denied");
  assert.equal(denied.diagnostic.errorCode, "EPERM");
  assert.equal(denied.diagnostic.guidance, MACOS_ICLOUD_TCC_GUIDANCE);
  assert.match(denied.diagnostic.guidance ?? "", /隐私与安全性/);

  const missing = await scanIcloudInbox({
    directory: join(tmpdir(), `tc-nonexistent-icloud-${Date.now()}`),
    archivedIds: new Set(),
    archivedSignatures: new Set(),
  });
  assert.deepEqual(missing.items, []);
  assert.equal(missing.diagnostic.status, "missing");
  assert.equal(missing.diagnostic.errorCode, "ENOENT");
});

test("Companion StageHub integrates iCloud Inbox, cools >14d fragments, archives safely without deleting backups, and exposes /stage/inbox-status", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "tc-icloud-hub-")));
  const stateDir = join(root, "state");
  const personalInboxDir = join(root, "personal-inbox");
  const icloudDir = join(root, "TaskCopilotInbox");
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  await mkdir(personalInboxDir, { recursive: true, mode: 0o700 });
  await mkdir(icloudDir, { recursive: true, mode: 0o700 });

  const oldFile = join(icloudDir, "20261001-080000.md");
  const recentFile = join(icloudDir, "20261121-200000.md");
  await writeFile(oldFile, "三周前随口记下的杂事：对比几款键盘轴体", "utf8");
  await writeFile(recentFile, "今晚随口记：把主线切口缩到 15 分钟验证步骤", "utf8");

  const server = await startWorkspaceServer({
    stateDirectory: stateDir,
    inboxDirectory: personalInboxDir,
    icloudInboxDirectory: icloudDir,
    watchIcloud: false,
    appleCalendar: { disabled: true },
  });
  const { baseUrl, token, instanceId } = server.descriptor;
  const cliHeaders = {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
    "x-workspace-instance": instanceId,
  };

  try {
    const statusRes = await fetch(`${baseUrl}/stage/inbox-status`, {
      method: "POST",
      headers: cliHeaders,
      body: JSON.stringify({}),
    });
    assert.equal(statusRes.status, 200);
    const statusBody = (await statusRes.json()) as {
      value: { icloud: { status: string; itemCount: number; cooledCount: number } };
    };
    assert.equal(statusBody.value.icloud.status, "ok");
    assert.equal(statusBody.value.icloud.itemCount, 2);
    assert.equal(statusBody.value.icloud.cooledCount, 1);

    // Snapshot reflects cooled count and source metadata
    const snapBefore = await server.stageHub.snapshot();
    assert.equal(snapBefore.inbox.length, 2);
    assert.equal(snapBefore.cooledInboxCount, 1);
    assert.equal(snapBefore.inbox.filter((i) => i.cooled).length, 1);
    assert.equal(snapBefore.inbox.every((i) => i.sourceType === "ios-shortcut"), true);

    // One-click archive cooled inbox items
    const archiveRes = await fetch(`${baseUrl}/stage/action`, {
      method: "POST",
      headers: cliHeaders,
      body: JSON.stringify({ action: { type: "archive-cooled-inbox" } }),
    });
    assert.equal(archiveRes.status, 200);
    const archiveBody = (await archiveRes.json()) as {
      value: { snapshot: { inbox: unknown[]; cooledInboxCount: number }; archivedInboxIds: string[] };
    };
    assert.equal(archiveBody.value.archivedInboxIds.length, 1);
    assert.equal(archiveBody.value.snapshot.cooledInboxCount, 0);
    assert.equal(archiveBody.value.snapshot.inbox.length, 1);

    // Original iCloud markdown backup is preserved untouched on disk!
    await access(oldFile);
    await access(recentFile);
  } finally {
    await server.close();
  }

  // Restart Companion: archived cooled item must stay archived!
  const restarted = await startWorkspaceServer({
    stateDirectory: stateDir,
    inboxDirectory: personalInboxDir,
    icloudInboxDirectory: icloudDir,
    watchIcloud: false,
    appleCalendar: { disabled: true },
  });
  try {
    const snapAfter = await restarted.stageHub.snapshot();
    assert.equal(snapAfter.inbox.length, 1);
    assert.equal(snapAfter.cooledInboxCount, 0);
  } finally {
    await restarted.close();
  }

  // EPERM Companion startup must still succeed (Fail Open) and surface guidance
  const epermStateDir = join(root, "state-eperm");
  await mkdir(epermStateDir, { recursive: true, mode: 0o700 });
  const epermServer = await startWorkspaceServer({
    stateDirectory: epermStateDir,
    inboxDirectory: personalInboxDir,
    icloudInboxDirectory: icloudDir,
    watchIcloud: false,
    appleCalendar: { disabled: true },
    icloudFsOps: {
      readdir: async () => {
        throw Object.assign(new Error("Operation not permitted"), { code: "EPERM" });
      },
    },
  });
  try {
    const diag = await epermServer.stageHub.inboxStatus();
    assert.equal(diag.icloud.status, "permission-denied");
    assert.match(diag.icloud.guidance ?? "", /隐私与安全性/);
  } finally {
    await epermServer.close();
    await rm(root, { recursive: true, force: true });
  }
});
