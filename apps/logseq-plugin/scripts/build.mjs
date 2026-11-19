import { copyFile, cp, mkdir, writeFile, access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import { resolve, sep } from "node:path";
import { build } from "esbuild";
import process from "node:process";

const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const buildVersion = process.env.TASK_COPILOT_WORKBENCH_BUILD ?? version;
const dist = process.argv[2] ? pathToFileURL(resolve(process.argv[2]) + sep) : new URL("../dist/", import.meta.url);

await mkdir(fileURLToPath(dist), { recursive: true });
const pluginBuild = await build({ entryPoints: [fileURLToPath(new URL("../src/index.ts", import.meta.url))], bundle: true, format: "iife", platform: "browser", target: "chrome110", metafile: true, define: { __WORKBENCH_BUILD__: JSON.stringify(buildVersion) }, outfile: fileURLToPath(new URL("index.js", dist)) });
await mkdir(fileURLToPath(new URL("../../../tmp/material-preview-build/", import.meta.url)), {recursive: true});
await writeFile(fileURLToPath(new URL("../../../tmp/material-preview-build/browser-metafile.json", import.meta.url)), JSON.stringify(pluginBuild.metafile, null, 2) + "\n");
await build({entryPoints:[fileURLToPath(new URL("../../task-copilot-cli/src/workspace-launcher.ts",import.meta.url))],bundle:true,format:"esm",platform:"node",target:"node20",outfile:fileURLToPath(new URL("workspace.mjs", dist))});
await copyFile(fileURLToPath(new URL("../../../node_modules/@logseq/libs/dist/lsplugin.user.js", import.meta.url)), fileURLToPath(new URL("logseq-sdk.js", dist)));
await mkdir(fileURLToPath(new URL("licenses/", dist)),{recursive:true});
for(const [input,output] of [["@logseq/libs/dist/lsplugin.user.js.LICENSE.txt","logseq-sdk.txt"],["vditor/LICENSE","vditor.txt"],["dompurify/LICENSE","dompurify.txt"],["turndown/LICENSE","turndown.txt"],["mammoth/LICENSE","mammoth.txt"],["pdfjs-dist/LICENSE","pdfjs.txt"],["xlsx/LICENSE","sheetjs.txt"],["fflate/LICENSE","fflate.txt"]])await copyFile(fileURLToPath(new URL(`../../../node_modules/${input}`,import.meta.url)),fileURLToPath(new URL(`licenses/${output}`,dist)));
await mkdir(fileURLToPath(new URL("pdfjs/", dist)), {recursive: true});
await copyFile(fileURLToPath(new URL("../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url)), fileURLToPath(new URL("pdfjs/pdf.worker.min.mjs", dist)));
for (const name of ["cmaps", "standard_fonts", "wasm"]) {
  const source = fileURLToPath(new URL(`../../../node_modules/pdfjs-dist/${name}/`, import.meta.url));
  try {await access(source);} catch (error) {if (name === "wasm" && error.code === "ENOENT") continue; throw error;}
  await cp(source, fileURLToPath(new URL(`pdfjs/${name}/`, dist)), {recursive: true});
}
await cp(fileURLToPath(new URL("../../../node_modules/vditor/dist/", import.meta.url)), fileURLToPath(new URL("vditor/dist/", dist)), { recursive: true, mode: constants.COPYFILE_FICLONE });
await writeFile(fileURLToPath(new URL("index.html", dist)), "<!doctype html><html><head><meta charset=\"utf-8\"></head><body><script src=\"./logseq-sdk.js\"></script><script src=\"./index.js\"></script></body></html>\n");

await writeFile(new URL("build-version.json", dist), JSON.stringify({ version: buildVersion }) + "\n");
