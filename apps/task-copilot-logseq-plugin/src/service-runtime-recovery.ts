export interface ServiceRuntimeRecoveryInput {
  refresh: () => Promise<void>;
  ready: () => boolean;
  wait?: (milliseconds: number) => Promise<void>;
  maximumAttempts?: number;
}

export async function recoverServiceRuntime(input: ServiceRuntimeRecoveryInput): Promise<boolean> {
  const maximumAttempts = input.maximumAttempts ?? 12;
  if (!Number.isSafeInteger(maximumAttempts) || maximumAttempts < 1 || maximumAttempts > 40) {
    throw new Error("Service runtime recovery attempt bound is invalid.");
  }
  const wait = input.wait ?? ((milliseconds: number) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, milliseconds)));
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    try {
      await input.refresh();
      if (input.ready()) return true;
    } catch {
      // A restarting Launcher may refuse or invalidate one discovery attempt.
    }
    if (attempt < maximumAttempts - 1) await wait(Math.min(250 * (attempt + 1), 1_500));
  }
  return false;
}
