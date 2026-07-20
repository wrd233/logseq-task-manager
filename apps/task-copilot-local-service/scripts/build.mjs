import { chmod, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const output = resolve(dist, "service.js");
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await build({
  entryPoints: [resolve(root, "src/main.ts")],
  outfile: output,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  banner: { js: "#!/usr/bin/env node" },
  external: ["better-sqlite3"],
  sourcemap: false,
  minify: false,
  legalComments: "none",
});
await chmod(output, 0o755);
