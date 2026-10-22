import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { EvidenceStore } from '../../../task-copilot-cli/src/work-evidence/store.ts';

test('archived real-host records replay with exact receipts and isolated corruption', async () => {
  const archive = JSON.parse(await readFile(new URL('../../../../docs/implementation/work-evidence/reliability/host-records.json', import.meta.url), 'utf8'));
  const parent = fileURLToPath(new URL('../../../../tmp/work-evidence/reliability-replay/', import.meta.url));
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, 'host-'));
  try {
    for (const file of archive.stateFiles) {
      assert.match(file.name, /^(scope|observation|note)-[a-f\d-]+\.json$/u);
      await writeFile(join(directory, file.name), file.raw, { mode: 0o600 });
    }
    const store = new EvidenceStore(directory), receipt = archive.receipts.beforeRetry;
    assert.deepEqual(archive.receipts.afterRetry, receipt);
    assert.deepEqual(await store.note(receipt.value.scopeId, receipt.value.observationId, receipt.value.text, receipt.value.id), receipt);
    assert.equal((await store.notes(receipt.value.scopeId, receipt.value.observationId)).filter(n => n.value.id === receipt.value.id).length, 1);
    for (const { value: scope } of (await store.scopesReport()).items) assert.equal((await store.historyReport(scope.id)).complete, true);
    await writeFile(join(directory, archive.corruption.name), archive.corruption.raw);
    assert.equal((await store.historyReport(receipt.value.scopeId)).complete, false);
    const other = (await store.scopes()).find(scope => scope.id !== receipt.value.scopeId);
    assert.equal((await store.historyReport(other.id)).complete, true);
    assert.deepEqual(archive.sessionsBefore, archive.sessionsAfter);
    assert.equal(archive.sessionsAfter.flatMap(s => s.events).length, 0);
    // The native editor changes line-break DOM nodes on reload; compare the cited JSON values.
    const citation = drafts => JSON.parse(drafts[0].slice(drafts[0].indexOf('{')));
    assert.deepEqual(citation(archive.nativeDraft), citation(archive.nativeDraftAfterReload));
    assert(archive.nativeDraft.some(text => text.startsWith('保留已有草稿：') && text.includes('work-evidence:v1:')));
    assert(archive.nativeDraftAfterReload.some(text => text.startsWith('保留已有草稿：') && text.includes('work-evidence:v1:')));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
