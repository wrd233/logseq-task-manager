import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";

import type { ServiceDescriptor } from "@task-copilot/service-client";

import type { LauncherGraphConfig, LauncherProviderConfig } from "./contracts.ts";

export interface ManagedChild {
  readonly pid: number;
  onExit(listener: () => void): void;
  stop(): Promise<void>;
}

export interface SpawnServiceInput {
  graph: LauncherGraphConfig;
  serviceEntryPath: string;
  descriptorPath: string;
  provider?: LauncherProviderConfig;
}

export interface SpawnedService {
  child: ManagedChild;
  descriptor: ServiceDescriptor;
}

export type ServiceSpawner = (input: SpawnServiceInput) => Promise<SpawnedService>;

interface ManagerConfig {
  graphs: LauncherGraphConfig[];
  serviceEntryPath: string;
  runtimeRoot: string;
  leaseTtlMs: number;
  provider?: LauncherProviderConfig;
}

interface Runtime {
  child: ManagedChild;
  descriptor: ServiceDescriptor;
  leaseIds: Set<string>;
}

interface Lease {
  graphKey: string;
  clientInstanceId: string;
  heartbeatAt: number;
}

export interface EnsureServiceInput {
  graphKey: string;
  clientInstanceId: string;
}

export interface EnsureServiceResult {
  leaseId: string;
  serviceDescriptor: ServiceDescriptor;
}

function id(prefix: string): string {
  return `${prefix}_${randomBytes(18).toString("hex")}`;
}

export class GraphServiceManager {
  private readonly graphByKey: Map<string, LauncherGraphConfig>;
  private readonly runtimes = new Map<string, Runtime>();
  private readonly leases = new Map<string, Lease>();
  private closed = false;

  constructor(
    private readonly config: ManagerConfig,
    private readonly spawnService: ServiceSpawner,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.graphByKey = new Map(config.graphs.map((graph) => [graph.graphKey, graph]));
  }

  async ensure(input: EnsureServiceInput): Promise<EnsureServiceResult> {
    if (this.closed) throw new Error("LAUNCHER_CLOSED");
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(input.graphKey)) throw new Error("LAUNCHER_GRAPH_KEY_INVALID");
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(input.clientInstanceId)) throw new Error("LAUNCHER_CLIENT_INSTANCE_INVALID");
    const graph = this.graphByKey.get(input.graphKey);
    if (!graph) throw new Error("LAUNCHER_GRAPH_NOT_CONFIGURED");
    let runtime = this.runtimes.get(graph.graphKey);
    if (!runtime) {
      const digest = createHash("sha256").update(graph.graphKey).digest("hex").slice(0, 32);
      const started = await this.spawnService({
        graph,
        serviceEntryPath: this.config.serviceEntryPath,
        descriptorPath: join(this.config.runtimeRoot, `${digest}.service.json`),
        ...(this.config.provider ? { provider: this.config.provider } : {}),
      });
      runtime = { child: started.child, descriptor: started.descriptor, leaseIds: new Set() };
      this.runtimes.set(graph.graphKey, runtime);
      const ownedRuntime = runtime;
      started.child.onExit(() => this.forgetExitedRuntime(graph.graphKey, ownedRuntime));
    }
    const leaseId = id("lease");
    runtime.leaseIds.add(leaseId);
    this.leases.set(leaseId, {
      graphKey: graph.graphKey,
      clientInstanceId: input.clientInstanceId,
      heartbeatAt: this.now().getTime(),
    });
    return { leaseId, serviceDescriptor: runtime.descriptor };
  }

  heartbeat(leaseId: string): void {
    const lease = this.leases.get(leaseId);
    if (!lease) throw new Error("LAUNCHER_LEASE_NOT_FOUND");
    lease.heartbeatAt = this.now().getTime();
  }

  async release(leaseId: string): Promise<void> {
    const lease = this.leases.get(leaseId);
    if (!lease) return;
    this.leases.delete(leaseId);
    const runtime = this.runtimes.get(lease.graphKey);
    if (!runtime) return;
    runtime.leaseIds.delete(leaseId);
    if (runtime.leaseIds.size > 0) return;
    this.runtimes.delete(lease.graphKey);
    await runtime.child.stop();
  }

  async reapExpired(): Promise<void> {
    const cutoff = this.now().getTime() - this.config.leaseTtlMs;
    const expired = [...this.leases.entries()].filter(([, lease]) => lease.heartbeatAt <= cutoff).map(([leaseId]) => leaseId);
    for (const leaseId of expired) await this.release(leaseId);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const runtimes = [...this.runtimes.values()];
    this.runtimes.clear();
    this.leases.clear();
    await Promise.all(runtimes.map((runtime) => runtime.child.stop()));
  }

  private forgetExitedRuntime(graphKey: string, runtime: Runtime): void {
    if (this.runtimes.get(graphKey) !== runtime) return;
    this.runtimes.delete(graphKey);
    for (const leaseId of runtime.leaseIds) this.leases.delete(leaseId);
  }
}
