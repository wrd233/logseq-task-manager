import { spawnSync } from "node:child_process";

const workspaces = ["@wrd233/logseq-plugin-capability-lab", "@task-copilot/logseq-plugin"];
for (const workspace of workspaces) {
  const result = spawnSync("npm", ["run", "build", "--workspace", workspace], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("All plugin builds passed.");
