// Logseq 0.10.15 desktop bridge. Keep the private host API in one adapter.
export function desktopIO(call, graphPath) {
  return {
    read: p => call('readFile', p),
    write: (p, text) => call('writeFile', graphPath(), p, text),
    mkdir: p => call('mkdir-recur', p),
    rename: (from, to) => call('rename', from, to),
    optional: async p => {
      try { await call('stat', p); }
      catch (error) {
        // A permissions/I/O error is not an empty catalog. Never overwrite it.
        if (error?.code === 'ENOENT' || /\bENOENT\b/.test(String(error?.message || error))) return null;
        throw error;
      }
      return call('readFile', p);
    }
  };
}
