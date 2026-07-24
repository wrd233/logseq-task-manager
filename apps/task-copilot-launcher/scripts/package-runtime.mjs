import { chmod, cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workspace = resolve(root, "../..");
const payload = resolve(root, "dist/payload");
const serviceDist = resolve(workspace, "apps/task-copilot-local-service/dist");
await rm(payload, { recursive: true, force: true });
await mkdir(resolve(payload, "node_modules"), { recursive: true });
await cp(resolve(root, "dist/launcher.js"), resolve(payload, "launcher.js"));
await cp(resolve(serviceDist, "service.js"), resolve(payload, "service.js"));
await cp(resolve(serviceDist, "skills"), resolve(payload, "skills"), { recursive: true });
for (const name of ["better-sqlite3", "bindings", "file-uri-to-path"]) {
  await cp(resolve(workspace, `node_modules/${name}`), resolve(payload, `node_modules/${name}`), { recursive: true });
}
await Promise.all([
  chmod(resolve(payload, "launcher.js"), 0o755),
  chmod(resolve(payload, "service.js"), 0o755),
]);
