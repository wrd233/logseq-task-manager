import { assertSupportedInstallerNodeVersion, installLauncher } from "./installer.ts";

function parse(args: string[]): { graphPath: string; graphId: string; databasePath?: string; provider?: { providerId: "deepseek"; baseUrl: string; model: string; apiKeyRef: string; timeoutMs?: number; maxOutputTokens?: number } } {
  if (args[0] !== "install") {
    throw new Error("Usage: task-copilot-launcher-install install --graph-path <absolute-path> --graph-id <id> [--database <absolute-path>] [--provider-base-url <url> --provider-model <id> --provider-api-key-ref <keychain:service/account> [--provider-timeout-ms <ms>] [--provider-max-output-tokens <count>]]");
  }
  const values = new Map<string, string>();
  for (let index = 1; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key || !value || !["--graph-path", "--graph-id", "--database", "--provider-base-url", "--provider-model", "--provider-api-key-ref", "--provider-timeout-ms", "--provider-max-output-tokens"].includes(key) || values.has(key)) {
      throw new Error("LAUNCHER_INSTALL_ARGUMENTS_INVALID");
    }
    values.set(key, value);
  }
  const graphPath = values.get("--graph-path");
  const graphId = values.get("--graph-id");
  if (!graphPath || !graphId) throw new Error("LAUNCHER_INSTALL_ARGUMENTS_INVALID");
  const databasePath = values.get("--database");
  const providerValues = [values.get("--provider-base-url"), values.get("--provider-model"), values.get("--provider-api-key-ref")];
  if (providerValues.some(Boolean) && !providerValues.every(Boolean)) throw new Error("LAUNCHER_INSTALL_ARGUMENTS_INVALID");
  if ((values.has("--provider-timeout-ms") || values.has("--provider-max-output-tokens")) && !providerValues.every(Boolean)) {
    throw new Error("LAUNCHER_INSTALL_ARGUMENTS_INVALID");
  }
  return {
    graphPath,
    graphId,
    ...(databasePath ? { databasePath } : {}),
    ...(providerValues.every(Boolean) ? {
      provider: {
        providerId: "deepseek" as const,
        baseUrl: providerValues[0]!,
        model: providerValues[1]!,
        apiKeyRef: providerValues[2]!,
        ...(values.has("--provider-timeout-ms") ? { timeoutMs: Number(values.get("--provider-timeout-ms")) } : {}),
        ...(values.has("--provider-max-output-tokens") ? { maxOutputTokens: Number(values.get("--provider-max-output-tokens")) } : {}),
      },
    } : {}),
  };
}

try {
  assertSupportedInstallerNodeVersion(process.versions.node);
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
