import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, mkdir, symlink, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const script = join(root, 'apps/dsh-plugin/scripts/work-evidence-playground.mjs');
const cli = args => execFileSync(process.execPath, ['--import', 'tsx', script, ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
test('personal fixture can be recreated, changed, checked and removed only by exact owned run identity', async () => {
  const one = JSON.parse(cli(['new', '--clean'])), two = JSON.parse(cli(['new']));
  try {
    assert.notEqual(one.runId, two.runId);
    assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: one.repo, encoding: 'utf8' }), '');
    cli(['change', one.runId]);
    const status = execFileSync('git', ['status', '--porcelain', '-z'], { cwd: one.repo, encoding: 'utf8' });
    assert(status.includes('MM work.txt')); assert(status.includes('新增 文件.txt')); assert(status.includes('新 名称.txt'));
    assert.throws(() => cli(['change', one.runId]));
    assert.throws(() => cli(['remove', one.runId, '--confirm=wrong']));
    assert.equal(JSON.parse(cli(['status', one.runId])).live, false);
    assert.equal(JSON.parse(await readFile(join(one.runDirectory, 'owned.json'), 'utf8')).id, one.runId);
    const outside = join(two.runDirectory, 'outside'); await mkdir(outside);
    await symlink(outside, join(one.runDirectory, 'bundle'));
    assert.throws(() => execFileSync(process.execPath, ['--import', 'tsx', join(root, 'apps/dsh-plugin/scripts/work-evidence-build.mjs')], { cwd: root, env: { ...process.env, WORK_EVIDENCE_RUN_DIRECTORY: one.runDirectory }, stdio: 'pipe' }));
    assert.deepEqual(await readdir(outside), []);
    await rm(join(one.runDirectory, 'bundle'));
    const home = join(one.runDirectory, 'dsh-home-v1'); await mkdir(home, { mode: 0o700 });
    await symlink(outside, join(home, 'profiles'));
    assert.throws(() => execFileSync(process.execPath, ['--import', 'tsx', join(root, 'apps/dsh-plugin/scripts/work-evidence-preview.mjs')], { cwd: root, env: { ...process.env, WORK_EVIDENCE_RUN_DIRECTORY: one.runDirectory }, stdio: 'pipe' }));
    assert.deepEqual(await readdir(outside), []);
  } finally { cli(['remove', one.runId, `--confirm=${one.runId}`]); cli(['remove', two.runId, `--confirm=${two.runId}`]); }
});
