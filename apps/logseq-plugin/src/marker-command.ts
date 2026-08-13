interface ChangedBlock { uuid?: unknown; content?: unknown }

export interface MarkerCommandHost {
  onChanged(callback: (event: { blocks?: readonly ChangedBlock[] }) => void): () => void;
}

export function registerOnlineDoneMarkerCommand(host: MarkerCommandHost, handleDone: (blockUuid: string) => Promise<void>, onError: (error: unknown) => void, delayMs = 150): () => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const off = host.onChanged((event) => {
    for (const block of event.blocks ?? []) {
      if (typeof block.uuid !== "string" || typeof block.content !== "string" || !/^DONE(?:\s|$)/u.test(block.content.trimStart())) continue;
      const existing = timers.get(block.uuid); if (existing) clearTimeout(existing);
      timers.set(block.uuid, setTimeout(() => { timers.delete(block.uuid as string); void handleDone(block.uuid as string).catch(onError); }, delayMs));
    }
  });
  return () => { off(); for (const timer of timers.values()) clearTimeout(timer); timers.clear(); };
}
