import { mkdir } from "node:fs/promises";
import { URL } from "node:url";
import { build } from "esbuild";

for (const [entry, output] of [
  ["apps/kernel-service/src/main.ts", "apps/kernel-service/dist/main.js"],
  ["apps/task-copilot-cli/src/main.ts", "apps/task-copilot-cli/dist/main.js"],
]) {
  await mkdir(new URL(`../${output.split("/").slice(0, -1).join("/")}/`, import.meta.url), { recursive: true });
  await build({ entryPoints: [new URL(`../${entry}`, import.meta.url).pathname], bundle: true, platform: "node", format: "esm", target: "node20", outfile: new URL(`../${output}`, import.meta.url).pathname, external: output.includes("kernel-service") ? ["better-sqlite3"] : [] });
}

await import(new URL("../apps/logseq-plugin/scripts/build.mjs", import.meta.url));
