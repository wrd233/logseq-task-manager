import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { DeepSeekProviderError, DeepSeekStructuredProvider, resolveDeepSeekProviderConfig, type ProviderSecretResolver } from "./deepseek-provider.ts";
import { LocalLlmProposalGenerator } from "./llm-proposal.ts";

const execFileAsync = promisify(execFile);
const environmentNamePattern = /^[A-Z][A-Z0-9_]{1,127}$/;
const keychainPartPattern = /^[A-Za-z0-9._@/+ -]{1,128}$/;

export class RuntimeSecretResolver implements ProviderSecretResolver {
  constructor(private readonly environment: NodeJS.ProcessEnv = process.env) {}

  async resolve(reference: string): Promise<string | undefined> {
    if (reference.startsWith("env:")) {
      const name = reference.slice(4);
      if (!environmentNamePattern.test(name)) throw new DeepSeekProviderError("LLM_SECRET_REFERENCE_INVALID", "Provider 环境变量引用无效。");
      return this.environment[name];
    }
    if (reference.startsWith("keychain:")) {
      const [service, account, ...extra] = reference.slice(9).split("/");
      if (extra.length || !service || !account || !keychainPartPattern.test(service) || !keychainPartPattern.test(account)) {
        throw new DeepSeekProviderError("LLM_SECRET_REFERENCE_INVALID", "Provider Keychain 引用必须为 keychain:<service>/<account>。");
      }
      try {
        const result = await execFileAsync("/usr/bin/security", ["find-generic-password", "-s", service, "-a", account, "-w"], {
          encoding: "utf8",
          maxBuffer: 1_024,
          timeout: 5_000,
        });
        return result.stdout.trim() || undefined;
      } catch {
        return undefined;
      }
    }
    throw new DeepSeekProviderError("LLM_SECRET_REFERENCE_INVALID", "Provider 凭据只允许 env: 或 keychain: 引用。");
  }
}

export async function loadProposalGeneratorFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  resolver: ProviderSecretResolver = new RuntimeSecretResolver(environment),
): Promise<LocalLlmProposalGenerator | undefined> {
  const provider = await loadStructuredProviderFromEnvironment(environment, resolver);
  return provider ? new LocalLlmProposalGenerator(provider) : undefined;
}

export async function loadStructuredProviderFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  resolver: ProviderSecretResolver = new RuntimeSecretResolver(environment),
): Promise<DeepSeekStructuredProvider | undefined> {
  const provider = environment.TASK_COPILOT_LLM_PROVIDER?.trim();
  if (!provider) return undefined;
  if (provider !== "deepseek") throw new DeepSeekProviderError("LLM_PROVIDER_UNSUPPORTED", "Local Service 只接受已实现的 Provider 标识。");
  const baseUrl = environment.DEEPSEEK_BASE_URL?.trim() ?? "";
  const model = environment.DEEPSEEK_MODEL?.trim() ?? "";
  const apiKeyRef = environment.TASK_COPILOT_DEEPSEEK_API_KEY_REF?.trim()
    || (environment.DEEPSEEK_API_KEY ? "env:DEEPSEEK_API_KEY" : "");
  const config = await resolveDeepSeekProviderConfig({
    baseUrl,
    model,
    apiKeyRef,
    timeoutMs: 20_000,
    maxResponseChars: 200_000,
    maxRetries: 1,
    retryBaseDelayMs: 250,
  }, resolver);
  return new DeepSeekStructuredProvider(config);
}
