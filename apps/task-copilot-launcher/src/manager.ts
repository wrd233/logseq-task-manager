import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";

import type { ServiceDescriptor } from "@task-copilot/service-client";
import type { LauncherRestoreRecoveryStatus } from "@task-copilot/service-client/launcher";
import {
  assertRestoreRecoveryInterlockClear,
  readRestoreRecoveryInterlock,
} from "@task-copilot/shared/node";

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
  assertServiceStartAllowed?: (databasePath: string, graphId: string) => Promise<void>;
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
  private readonly lifecycleTails = new Map<string, Promise<void>>();
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
    return this.serializeGraphLifecycle(graph.graphKey, async () => {
      if (this.closed) throw new Error("LAUNCHER_CLOSED");
      try {
        await (this.config.assertServiceStartAllowed ?? assertRestoreRecoveryInterlockClear)(
          graph.databasePath,
          graph.graphId,
        );
      } catch (error) {
        throw new Error(
          error instanceof Error && error.message === "RESTORE_RECOVERY_ARMED"
            ? "LAUNCHER_RESTORE_RECOVERY_ARMED"
            : error instanceof Error && error.message === "RESTORE_RECOVERY_STATE_INVALID"
              ? "LAUNCHER_RESTORE_RECOVERY_STATE_INVALID"
            : "LAUNCHER_RESTORE_RECOVERY_REQUIRED",
          { cause: error },
        );
      }
      let runtime = this.runtimes.get(graph.graphKey);
      if (!runtime) {
        const digest = createHash("sha256").update(graph.graphKey).digest("hex").slice(0, 32);
        const started = await this.spawnService({
          graph,
          serviceEntryPath: this.config.serviceEntryPath,
          descriptorPath: join(this.config.runtimeRoot, `${digest}.service.json`),
          ...(this.config.provider ? { provider: this.config.provider } : {}),
        });
        if (this.closed) {
          await started.child.stop();
          throw new Error("LAUNCHER_CLOSED");
        }
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
    });
  }

  heartbeat(leaseId: string): void {
    const lease = this.leases.get(leaseId);
    if (!lease) throw new Error("LAUNCHER_LEASE_NOT_FOUND");
    lease.heartbeatAt = this.now().getTime();
  }

  async release(leaseId: string): Promise<void> {
    const observedLease = this.leases.get(leaseId);
    if (!observedLease) return;
    await this.serializeGraphLifecycle(observedLease.graphKey, async () => {
      const lease = this.leases.get(leaseId);
      if (!lease || lease.graphKey !== observedLease.graphKey) return;
      this.leases.delete(leaseId);
      const runtime = this.runtimes.get(lease.graphKey);
      if (!runtime) return;
      runtime.leaseIds.delete(leaseId);
      if (runtime.leaseIds.size > 0) return;
      this.runtimes.delete(lease.graphKey);
      await runtime.child.stop();
    });
  }

  async reapExpired(): Promise<void> {
    const cutoff = this.now().getTime() - this.config.leaseTtlMs;
    const expired = [...this.leases.entries()]
      .filter(([, lease]) => lease.heartbeatAt <= cutoff)
      .map(([leaseId, lease]) => ({ leaseId, graphKey: lease.graphKey }));
    for (const candidate of expired) {
      await this.serializeGraphLifecycle(candidate.graphKey, async () => {
        const lease = this.leases.get(candidate.leaseId);
        if (!lease || lease.graphKey !== candidate.graphKey || lease.heartbeatAt > cutoff) return;
        this.leases.delete(candidate.leaseId);
        const runtime = this.runtimes.get(candidate.graphKey);
        if (!runtime) return;
        runtime.leaseIds.delete(candidate.leaseId);
        if (runtime.leaseIds.size > 0) return;
        this.runtimes.delete(candidate.graphKey);
        await runtime.child.stop();
      });
    }
  }

  async restoreRecoveryStatus(graphKey: string): Promise<LauncherRestoreRecoveryStatus> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(graphKey)) throw new Error("LAUNCHER_GRAPH_KEY_INVALID");
    const graph = this.graphByKey.get(graphKey);
    if (!graph) throw new Error("LAUNCHER_GRAPH_NOT_CONFIGURED");
    return this.serializeGraphLifecycle(graphKey, async () => {
      try {
        const recovery = await readRestoreRecoveryInterlock(graph.databasePath);
        if (!recovery) return { state: "CLEAR", recoveryPointConfirmed: false };
        if (recovery.graphId !== graph.graphId) return { state: "INVALID", recoveryPointConfirmed: false };
        return {
          state: recovery.status,
          recoveryPointConfirmed: recovery.status === "RECOVERY_REQUIRED",
          recordedAt: recovery.createdAt,
        };
      } catch {
        return { state: "INVALID", recoveryPointConfirmed: false };
      }
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await Promise.all([...this.graphByKey.keys()].map((graphKey) => (
      this.serializeGraphLifecycle(graphKey, async () => {
        const runtime = this.runtimes.get(graphKey);
        if (!runtime) return;
        this.runtimes.delete(graphKey);
        for (const leaseId of runtime.leaseIds) this.leases.delete(leaseId);
        await runtime.child.stop();
      })
    )));
    this.leases.clear();
  }

  private forgetExitedRuntime(graphKey: string, runtime: Runtime): void {
    if (this.runtimes.get(graphKey) !== runtime) return;
    this.runtimes.delete(graphKey);
    for (const leaseId of runtime.leaseIds) this.leases.delete(leaseId);
  }

  private async serializeGraphLifecycle<T>(graphKey: string, task: () => Promise<T>): Promise<T> {
    const prior = this.lifecycleTails.get(graphKey) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const tail = prior.then(() => gate);
    this.lifecycleTails.set(graphKey, tail);
    await prior;
    try {
      return await task();
    } finally {
      release();
      if (this.lifecycleTails.get(graphKey) === tail) this.lifecycleTails.delete(graphKey);
    }
  }
}
