import type { KernelClient } from "@task-copilot/client";

export interface CliIO { out: (line: string) => void; err: (line: string) => void }

export async function runCli(argv: string[], client: Pick<KernelClient, "status" | "listObjects" | "showObject" | "showCommit" | "listRecovery">, io: CliIO): Promise<number> {
  const json = argv.includes("--json");
  const args = argv.filter((argument) => argument !== "--json");
  let value: unknown;
  try {
    if (args.length === 1 && args[0] === "status") value = await client.status();
    else if (args.length === 2 && args[0] === "object" && args[1] === "list") value = await client.listObjects();
    else if (args.length === 3 && args[0] === "object" && args[1] === "show") value = await client.showObject(args[2]!);
    else if (args.length === 3 && args[0] === "commit" && args[1] === "show") value = await client.showCommit(args[2]!);
    else if (args.length === 2 && args[0] === "recovery" && args[1] === "list") value = await client.listRecovery();
    else { io.err("Usage: task-copilot status|object list|object show <id>|commit show <id>|recovery list [--json]"); return 2; }
    if (json) io.out(JSON.stringify(value));
    else if (args[0] === "status") io.out(`Kernel: ${(value as { status: string }).status}`);
    else if (args[0] === "object" && args[1] === "list") {
      const objects = (value as Awaited<ReturnType<KernelClient["listObjects"]>>).objects;
      io.out(objects.length ? objects.map((object) => `${object.id}\t${object.kind}\t${object.title}`).join("\n") : "No work objects.");
    } else if (args[0] === "recovery") {
      const recovery = (value as Awaited<ReturnType<KernelClient["listRecovery"]>>).recovery;
      io.out(recovery.length ? recovery.map((item) => `${item.commit.id}\t${item.commit.status}\t${item.action}`).join("\n") : "No recovery work.");
    } else io.out(JSON.stringify(value, null, 2));
    return 0;
  } catch (error) { io.err(error instanceof Error ? error.message : String(error)); return 1; }
}
