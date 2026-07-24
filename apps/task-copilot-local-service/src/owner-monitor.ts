export interface OwnerMonitor {
  stop(): void;
}

interface OwnerMonitorDependencies {
  intervalMs?: number;
  isAlive?: (pid: number) => boolean;
}

function defaultIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException)?.code === "EPERM";
  }
}

export function startOwnerMonitor(
  ownerPid: number,
  onOwnerExit: () => Promise<void>,
  dependencies: OwnerMonitorDependencies = {},
): OwnerMonitor {
  if (!Number.isSafeInteger(ownerPid) || ownerPid <= 0 || ownerPid === process.pid) {
    throw new Error("SERVICE_OWNER_PID_INVALID");
  }
  let stopped = false;
  let closing = false;
  const isAlive = dependencies.isAlive ?? defaultIsAlive;
  const timer = setInterval(() => {
    if (stopped || closing || isAlive(ownerPid)) return;
    closing = true;
    void onOwnerExit().finally(() => {
      stopped = true;
      clearInterval(timer);
    });
  }, dependencies.intervalMs ?? 1_000);
  timer.unref();
  return {
    stop(): void {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
    },
  };
}
