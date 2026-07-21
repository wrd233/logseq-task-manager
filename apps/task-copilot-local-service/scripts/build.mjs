import { chmod, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const serviceOutput = resolve(dist, "service.js");
const liveSmokeOutput = resolve(dist, "llm-live-smoke.js");
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await build({
  entryPoints: {
    service: resolve(root, "src/main.ts"),
    "llm-live-smoke": resolve(root, "src/live-smoke.ts"),
  },
  outdir: dist,
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
await Promise.all([chmod(serviceOutput, 0o755), chmod(liveSmokeOutput, 0o755)]);
