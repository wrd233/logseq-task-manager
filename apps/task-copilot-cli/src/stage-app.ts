import { fileURLToPath } from "node:url";

import type { build as buildBrowser } from "esbuild";

declare const __TASK_COPILOT_STAGE_BROWSER__: string;
let developmentScript: Promise<string> | undefined;

async function bundleDevelopmentScript(): Promise<string> {
  const dependency = "esbuild";
  const { build } = await import(dependency) as { build: typeof buildBrowser };
  const result = await build({
    entryPoints: [fileURLToPath(new URL("./stage-app-browser.ts", import.meta.url))],
    bundle: true, platform: "browser", format: "iife", charset: "utf8",
    target: "chrome100", write: false,
  });
  return result.outputFiles[0]!.text;
}

export async function renderStandaloneStageHtml(token: string, instanceId: string): Promise<string> {
  const script = typeof __TASK_COPILOT_STAGE_BROWSER__ === "string"
    ? __TASK_COPILOT_STAGE_BROWSER__
    : await (developmentScript ??= bundleDevelopmentScript());
  const attribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Task Copilot · 全局态势活画布</title>
  <style>html, body, #stage-root { margin: 0; width: 100%; height: 100%; }</style>
</head>
<body>
  <div id="stage-root" data-token="${attribute(token)}" data-instance="${attribute(instanceId)}"></div>
  <script>${script.replace(/<\/script/gi, "<\\/script")}</script>
</body>
</html>`;
}
