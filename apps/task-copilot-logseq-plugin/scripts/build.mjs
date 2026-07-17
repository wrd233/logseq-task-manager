import { build, context } from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const watch = process.argv.includes("--watch");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await Promise.all([
  copyFile(resolve(root, "index.html"), resolve(dist, "index.html")),
  copyFile(resolve(root, "src/index.css"), resolve(dist, "index.css")),
]);

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
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("Task Copilot watch build is active. Reload the plugin in Logseq after a rebuild.");
} else {
  await build(options);
}
