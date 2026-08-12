import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { URL } from "node:url";
import { build } from "esbuild";

await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
await build({ entryPoints: [new URL("../src/index.ts", import.meta.url).pathname], bundle: true, format: "iife", platform: "browser", target: "chrome110", outfile: new URL("../dist/index.js", import.meta.url).pathname });
await copyFile(new URL("../../../node_modules/@logseq/libs/dist/lsplugin.user.js", import.meta.url), new URL("../dist/logseq-sdk.js", import.meta.url));
await writeFile(new URL("../dist/index.html", import.meta.url), "<!doctype html><html><head><meta charset=\"utf-8\"></head><body><script src=\"./logseq-sdk.js\"></script><script src=\"./index.js\"></script></body></html>\n");
