import { copyFile, cp, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { build } from "esbuild";

await mkdir(fileURLToPath(new URL("../dist/", import.meta.url)), { recursive: true });
await build({ entryPoints: [fileURLToPath(new URL("../src/index.ts", import.meta.url))], bundle: true, format: "iife", platform: "browser", target: "chrome110", outfile: fileURLToPath(new URL("../dist/index.js", import.meta.url)) });
await copyFile(fileURLToPath(new URL("../../../node_modules/@logseq/libs/dist/lsplugin.user.js", import.meta.url)), fileURLToPath(new URL("../dist/logseq-sdk.js", import.meta.url)));
await cp(fileURLToPath(new URL("../../../node_modules/vditor/dist/", import.meta.url)), fileURLToPath(new URL("../dist/vditor/dist/", import.meta.url)), { recursive: true, mode: constants.COPYFILE_FICLONE });
await writeFile(fileURLToPath(new URL("../dist/index.html", import.meta.url)), "<!doctype html><html><head><meta charset=\"utf-8\"></head><body><script src=\"./logseq-sdk.js\"></script><script src=\"./index.js\"></script></body></html>\n");
