import { homedir } from "node:os";
import { join } from "node:path";

import { startKernelServer } from "./server.ts";

const stateDirectory = process.env.TASK_COPILOT_STATE_DIR ?? join(homedir(), ".task-copilot-vnext");
const service = await startKernelServer({ databasePath: join(stateDirectory, "task-copilot.sqlite"), descriptorPath: join(stateDirectory, "kernel.json") });
console.log(JSON.stringify({ event: "kernel.ready", baseUrl: service.baseUrl }));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void service.close().then(() => process.exit(0)); });
