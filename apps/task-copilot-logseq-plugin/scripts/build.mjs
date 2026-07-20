import { build, context } from "esbuild";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const watch = process.argv.includes("--watch");
const pluginCommit = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await Promise.all([
  copyFile(resolve(root, "index.html"), resolve(dist, "index.html")),
  copyFile(resolve(root, "src/index.css"), resolve(dist, "index.css")),
]);
const builtHtmlPath = resolve(dist, "index.html");
const builtHtml = await readFile(builtHtmlPath, "utf8");
await writeFile(builtHtmlPath, builtHtml.replaceAll("__TASK_COPILOT_BUILD__", pluginCommit), "utf8");

const options = {
  entryPoints: [resolve(root, "src/index.ts")],
  outfile: resolve(dist, "index.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome100",
  sourcemap: false,
  minify: !watch,
  legalComments: "none",
  logLevel: "info",
  define: { __TASK_COPILOT_COMMIT__: JSON.stringify(pluginCommit) },
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("Task Copilot watch build is active. Reload the plugin in Logseq after a rebuild.");
} else {
  await build(options);
}
