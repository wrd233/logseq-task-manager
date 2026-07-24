import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { installLauncher, LAUNCH_AGENT_LABEL, renderLaunchAgentPlist } from "../src/installer.ts";

async function fakePayload(root: string): Promise<string> {
  const payload = join(root, "payload");
  await mkdir(join(payload, "skills"), { recursive: true });
  await mkdir(join(payload, "node_modules"), { recursive: true });
  await writeFile(join(payload, "launcher.js"), "#!/usr/bin/env node\n");
  await writeFile(join(payload, "service.js"), "#!/usr/bin/env node\n");
  await writeFile(join(payload, "skills", "task-copilot-core.md"), "bounded fixture");
  return payload;
}

test("LaunchAgent is argument-only and carries no token, Graph path, or shell command", () => {
  const plist = renderLaunchAgentPlist({
    nodeExecutable: "/opt/node/bin/node",
    launcherEntryPath: "/Users/test/Task Copilot/bin/launcher.js",
    configPath: "/Users/test/Task Copilot/launcher-config.json",
    workingDirectory: "/Users/test/Task Copilot/bin",
    stdoutPath: "/Users/test/Task Copilot/logs/out.log",
    stderrPath: "/Users/test/Task Copilot/logs/err.log",
  });
  assert.match(plist, /ProgramArguments/);
  assert.match(plist, /RunAtLoad/);
  assert.match(plist, /KeepAlive/);
  assert.doesNotMatch(plist, /Program\b|Shell|token|graph-key|sqlite/);
});

test("installer creates one private Graph-bound runtime and bootstraps the exact user LaunchAgent", async () => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-installer-"));
  const home = join(root, "home");
  const launchAgents = join(home, "Library", "LaunchAgents");
  const payloadRoot = await fakePayload(root);
  const calls: Array<{ args: string[]; tolerateFailure?: boolean }> = [];
  const result = await installLauncher({
    graphPath: "/Users/test/Task Graph",
    graphId: "logseq",
    databasePath: join(root, "existing.sqlite"),
    provider: {
      providerId: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      apiKeyRef: "keychain:task-copilot/deepseek",
      timeoutMs: 60_000,
      maxOutputTokens: 4_096,
    },
  }, {
    homeDirectory: home,
    userId: 501,
    nodeExecutable: "/opt/node/bin/node",
    payloadRoot,
    launchAgentsRoot: launchAgents,
    createToken: () => "private-installer-token-at-least-32-characters",
    findPort: async () => 19_673,
    runLaunchctl: async (args, tolerateFailure) => { calls.push({ args, ...(tolerateFailure ? { tolerateFailure } : {}) }); },
    waitForReady: async (path) => { assert.equal(path, resultPath(home)); },
  });
  assert.equal(result.status, "INSTALLED");
  assert.equal(result.launchAgentLabel, LAUNCH_AGENT_LABEL);
  assert.doesNotMatch(JSON.stringify(result), /private-installer-token/);
  assert.deepEqual(calls, [
    { args: ["bootout", `gui/501/${LAUNCH_AGENT_LABEL}`], tolerateFailure: true },
    { args: ["bootstrap", "gui/501", join(launchAgents, `${LAUNCH_AGENT_LABEL}.plist`)] },
  ]);

  const appRoot = join(home, "Library", "Application Support", "Task Copilot");
  const configPath = join(appRoot, "launcher-config.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
  assert.equal((await stat(configPath)).mode & 0o777, 0o600);
  assert.equal(config.listenPort, 19_673);
  assert.equal(config.token, "private-installer-token-at-least-32-characters");
  assert.doesNotMatch(JSON.stringify(config.graphs), /Task Graph/);
  assert.deepEqual(config.provider, {
    providerId: "deepseek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    apiKeyRef: "keychain:task-copilot/deepseek",
    timeoutMs: 60_000,
    maxOutputTokens: 4_096,
  });
  assert.doesNotMatch(JSON.stringify(config), /"apiKey"|env:DEEPSEEK_API_KEY/);
  const plistPath = join(launchAgents, `${LAUNCH_AGENT_LABEL}.plist`);
  assert.equal((await stat(plistPath)).mode & 0o777, 0o600);
  assert.doesNotMatch(await readFile(plistPath, "utf8"), /private-installer-token|Task Graph|existing\.sqlite/);

  await installLauncher({
    graphPath: "/Users/test/Second Graph",
    graphId: "logseq-second",
    databasePath: join(root, "second.sqlite"),
  }, {
    homeDirectory: home,
    userId: 501,
    nodeExecutable: "/opt/node/bin/node",
    payloadRoot,
    launchAgentsRoot: launchAgents,
    createToken: () => "must-not-replace-the-existing-token",
    findPort: async () => 19_674,
    runLaunchctl: async (args, tolerateFailure) => { calls.push({ args, ...(tolerateFailure ? { tolerateFailure } : {}) }); },
    waitForReady: async () => undefined,
  });
  const updated = JSON.parse(await readFile(configPath, "utf8")) as { token: string; listenPort: number; graphs: unknown[]; provider: unknown };
  assert.equal(updated.token, "private-installer-token-at-least-32-characters");
  assert.equal(updated.listenPort, 19_673);
  assert.equal(updated.graphs.length, 2);
  assert.deepEqual(updated.provider, config.provider);
  assert.equal(calls.length, 4);
});

test("installer rejects relative authority paths before writing or invoking launchctl", async () => {
  let calls = 0;
  await assert.rejects(
    () => installLauncher({ graphPath: "relative", graphId: "logseq" }, {
      runLaunchctl: async () => { calls += 1; },
    }),
    /LAUNCHER_INSTALL_GRAPH_PATH_INVALID/,
  );
  assert.equal(calls, 0);
});

test("installer tolerates a slow launchd bootout before bootstrapping the replacement agent", async () => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-installer-retry-"));
  const home = join(root, "home");
  const launchAgents = join(home, "Library", "LaunchAgents");
  const payloadRoot = await fakePayload(root);
  let bootstrapAttempts = 0;
  const retryDelays: number[] = [];
  const result = await installLauncher({
    graphPath: "/Users/test/Task Graph",
    graphId: "logseq",
    databasePath: join(root, "existing.sqlite"),
  }, {
    homeDirectory: home,
    userId: 501,
    nodeExecutable: "/opt/node/bin/node",
    payloadRoot,
    launchAgentsRoot: launchAgents,
    createToken: () => "private-installer-token-at-least-32-characters",
    findPort: async () => 19_673,
    runLaunchctl: async (args) => {
      if (args[0] !== "bootstrap") return;
      bootstrapAttempts += 1;
      if (bootstrapAttempts <= 7) throw new Error("launchd still completing bootout");
    },
    waitForLaunchctlRetry: async (milliseconds) => { retryDelays.push(milliseconds); },
    waitForReady: async () => undefined,
  });
  assert.equal(result.status, "INSTALLED");
  assert.equal(bootstrapAttempts, 8);
  assert.deepEqual(retryDelays, [100, 125, 150, 175, 200, 225, 250]);
});

function resultPath(home: string): string {
  return join(home, "Library", "Application Support", "Task Copilot", "pairing", "task-copilot-v2-launcher-descriptor.json");
}
