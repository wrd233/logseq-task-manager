import { installLauncher } from "./installer.ts";

function parse(args: string[]): { graphPath: string; graphId: string; databasePath?: string } {
  if (args[0] !== "install") {
    throw new Error("Usage: task-copilot-launcher-install install --graph-path <absolute-path> --graph-id <id> [--database <absolute-path>]");
  }
  const values = new Map<string, string>();
  for (let index = 1; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key || !value || !["--graph-path", "--graph-id", "--database"].includes(key) || values.has(key)) {
      throw new Error("LAUNCHER_INSTALL_ARGUMENTS_INVALID");
    }
    values.set(key, value);
  }
  const graphPath = values.get("--graph-path");
  const graphId = values.get("--graph-id");
  if (!graphPath || !graphId) throw new Error("LAUNCHER_INSTALL_ARGUMENTS_INVALID");
  const databasePath = values.get("--database");
  return { graphPath, graphId, ...(databasePath ? { databasePath } : {}) };
}

try {
  const result = await installLauncher(parse(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const code = error instanceof Error && /^[A-Z][A-Z0-9_:.-]{2,160}$/.test(error.message)
    ? error.message
    : error instanceof Error && error.message.startsWith("Usage:")
      ? error.message
      : "LAUNCHER_INSTALL_FAILED";
  process.stderr.write(`${JSON.stringify({ status: "FAILED", code })}\n`);
  process.exitCode = 2;
}
