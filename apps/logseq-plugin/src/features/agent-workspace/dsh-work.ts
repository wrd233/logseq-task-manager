import type { SourceScope } from "../../workspace/source-protocol.ts";
import type { ContextReading } from "../../workspace/context-service.ts";
import type { WorkspaceBinding } from "../../workspace/registry.ts";

/** Only the explicit collaboration click calls this. Reading creates no folders. */
export async function ensureDshWork(scope: SourceScope, ports: {
  resolve(scope: SourceScope): Promise<WorkspaceBinding | null>;
  directory(scope: SourceScope): Promise<string>;
  bind(input: {scope: SourceScope; directory: string; organization: "flat"}): Promise<ContextReading>;
  check(): Promise<void>;
}): Promise<WorkspaceBinding> {
  await ports.check();
  const existing = await ports.resolve(scope); await ports.check();
  if (existing) return existing;
  const directory = await ports.directory(scope); await ports.check();
  const result = await ports.bind({scope, directory, organization: "flat"}); await ports.check();
  if (!result.binding || result.freshness !== "checked") throw new Error(result.problem ?? "工作原文暂不可读，请保存当前输入后再试。");
  return result.binding;
}
