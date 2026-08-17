import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import { build } from "esbuild";

await mkdir(fileURLToPath(new URL("../dist/", import.meta.url)), { recursive: true });
await build({
  entryPoints: [fileURLToPath(new URL("../src/main.ts", import.meta.url))],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome110",
  outfile: fileURLToPath(new URL("../dist/app.js", import.meta.url)),
});
await copyFile(fileURLToPath(new URL("../index.html", import.meta.url)), fileURLToPath(new URL("../dist/index.html", import.meta.url)));
await writeFile(fileURLToPath(new URL("../dist/.nojekyll", import.meta.url)), "");
