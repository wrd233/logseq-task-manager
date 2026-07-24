import { chmod, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const output = resolve(dist, "launcher.js");
const installerOutput = resolve(dist, "installer.js");
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await build({
  entryPoints: {
    launcher: resolve(root, "src/main.ts"),
    installer: resolve(root, "src/installer-main.ts"),
  },
  outdir: dist,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  banner: { js: "#!/usr/bin/env node" },
  sourcemap: false,
  minify: false,
  legalComments: "none",
});
await Promise.all([chmod(output, 0o755), chmod(installerOutput, 0o755)]);
