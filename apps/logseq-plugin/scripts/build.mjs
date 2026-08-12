import { mkdir, writeFile } from "node:fs/promises";
import { URL } from "node:url";
import { build } from "esbuild";

await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
await build({ entryPoints: [new URL("../src/index.ts", import.meta.url).pathname], bundle: true, format: "iife", platform: "browser", target: "chrome110", outfile: new URL("../dist/index.js", import.meta.url).pathname });
await writeFile(new URL("../dist/index.html", import.meta.url), "<!doctype html><html><head><meta charset=\"utf-8\"></head><body><script src=\"./index.js\"></script></body></html>\n");
