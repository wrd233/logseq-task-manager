/* global Response */
// Test-only transport gate. It still calls the production authenticated RPC/Git/store implementation.
// It is excluded from the regular bundle; only WORK_EVIDENCE_HOST_PROOF=1 selects this entry.
import { readFile, writeFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { apply as productionApply, name, inject } from '../../src/work-evidence/index.mjs';
export { name, inject };
export async function apply(ctx, config) {
  const run = dirname(config.stateDirectory), control = join(run, 'proof-control.json');
  const settings = async () => { try { return JSON.parse(await readFile(control, 'utf8')); } catch { return {}; } };
  return productionApply({ connection: { fetch: { register(route) {
    return ctx.connection.fetch.register({ ...route, fetch: async request => {
      const method = route.path.split('/').at(-1), controls = await settings();
      if (method !== 'note' || !controls.pauseNote) return route.fetch(request);
      const envelope = await request.clone().json(), requestId = envelope.payload.requestId;
      if (!/^[a-f\d-]{36}$/u.test(requestId)) return route.fetch(request);
      await writeFile(join(run, 'proof-waiting.json'), JSON.stringify({ requestId, method }), { mode: 0o600 });
      const deadline = Date.now() + 45000;
      while ((await settings()).pauseNote) {
        if (request.signal.aborted || Date.now() > deadline) throw Error('PROOF_GATE_TIMEOUT');
        await delay(50);
      }
      const response = await route.fetch(request); // Actual note publication, fsync and receipt readback.
      const result = await response.clone().json();
      await writeFile(join(run, 'proof-committed.json'), JSON.stringify(result), { mode: 0o600 });
      if (controls.dropReceipt) {
        const marker = join(run, `proof-dropped-${requestId}`);
        try { await access(marker); }
        catch {
          await writeFile(marker, 'receipt dropped once', { mode: 0o600 });
          return new Response('Controlled receipt loss after durable publication', { status: 503 });
        }
      }
      return response;
    } });
  } } } }, config);
}
