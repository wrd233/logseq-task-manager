import test from "node:test";
import assert from "node:assert/strict";
import { pickRunningBrowserApp, pickRunningLogseqApp } from "../src/macos-focus.ts";

const SAMPLE_PS = [
  "65019 /Users/demo/repo/tmp/phase3-logseq-lab/Logseq Phase3 Trial.app/Contents/MacOS/Logseq --user-data-dir=/Users/demo/repo/tmp/phase3-logseq-lab/user-data",
  "65025 /Users/demo/repo/tmp/phase3-logseq-lab/Logseq Phase3 Trial.app/Contents/Frameworks/Logseq Helper (Renderer).app/Contents/MacOS/Logseq Helper (Renderer) --type=renderer",
  "72076 /Applications/Logseq.app/Contents/MacOS/Logseq",
  "72080 /Applications/Logseq.app/Contents/Frameworks/Logseq Helper (GPU).app/Contents/MacOS/Logseq Helper (GPU) --type=gpu-process",
  "50120 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "50121 /Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Helpers/Google Chrome Helper.app/Contents/MacOS/Google Chrome Helper --type=renderer",
  "50200 /Applications/Safari.app/Contents/MacOS/Safari",
  "50300 /Applications/Arc.app/Contents/MacOS/Arc",
].join("\n");

test("pickRunningLogseqApp targets exact isolated trial Logseq instead of daily Logseq", () => {
  const chosen = pickRunningLogseqApp(SAMPLE_PS, {
    stateDirectory: "/Users/demo/repo/tmp/phase3-logseq-lab/channel",
    graphId: "logseq_local_/Users/demo/repo/tmp/phase3-logseq-lab/graph",
    homeDirectory: "/Users/demo",
  });
  assert.deepEqual(chosen, {
    pid: 65019,
    appPath: "/Users/demo/repo/tmp/phase3-logseq-lab/Logseq Phase3 Trial.app",
    userDataDir: "/Users/demo/repo/tmp/phase3-logseq-lab/user-data",
  });
});

test("pickRunningLogseqApp never falls back to daily /Applications/Logseq.app when targeting an isolated lab", () => {
  const onlyDailyPs = [
    "72076 /Applications/Logseq.app/Contents/MacOS/Logseq",
    "72080 /Applications/Logseq.app/Contents/Frameworks/Logseq Helper (Renderer).app/Contents/MacOS/Logseq Helper (Renderer) --type=renderer",
  ].join("\n");
  const chosen = pickRunningLogseqApp(onlyDailyPs, {
    stateDirectory: "/Users/demo/repo/tmp/phase3-logseq-lab/channel",
    homeDirectory: "/Users/demo",
  });
  assert.equal(chosen, null);
});

test("pickRunningLogseqApp selects daily /Applications/Logseq.app for default home stateDirectory", () => {
  const chosen = pickRunningLogseqApp(SAMPLE_PS, {
    stateDirectory: "/Users/demo/.task-copilot-workspace",
    homeDirectory: "/Users/demo",
  });
  assert.deepEqual(chosen, {
    pid: 72076,
    appPath: "/Applications/Logseq.app",
    userDataDir: null,
  });
});

test("pickRunningBrowserApp matches User-Agent to running browser bundle and ignores helpers", () => {
  assert.equal(
    pickRunningBrowserApp(
      SAMPLE_PS,
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "/Applications/Google Chrome.app"
  );
  assert.equal(
    pickRunningBrowserApp(
      SAMPLE_PS,
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15"
    ),
    "/Applications/Safari.app"
  );
  assert.equal(
    pickRunningBrowserApp(SAMPLE_PS, "Mozilla/5.0 Arc/1.72"),
    "/Applications/Arc.app"
  );
});
