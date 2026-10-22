import process from 'node:process';
import console from 'node:console';
import { execFileSync, spawn } from 'node:child_process';
import { readFile, writeFile, lstat, rename, unlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { privateDirectory } from '../../task-copilot-cli/src/work-evidence/storage-path.ts';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const base = join(root, 'tmp/work-evidence-ux');
const [command, runId, option] = process.argv.slice(2);
const owner = 'task-copilot-work-evidence-ux-v1';
const preview = join(root, 'apps/dsh-plugin/scripts/work-evidence-preview.mjs');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const save = (path, value) => writeFile(path, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });
const git = (directory, args) => execFileSync('git', ['--no-optional-locks', ...args], { cwd: directory, env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))), GIT_TERMINAL_PROMPT: '0' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
async function changed(repo) {
  if (git(repo, ['status', '--porcelain']).trim()) throw Error('FIXTURE_ALREADY_CHANGED_USE_NEW_RUN');
  for (const file of ['work.txt', '旧 名称.txt', '删除.txt']) if (!(await lstat(join(repo, file))).isFile()) throw Error('FIXTURE_FILE_RESTRICTED');
  await writeFile(join(repo, 'work.txt'), 'staged change\n'); git(repo, ['add', '--', 'work.txt']);
  await writeFile(join(repo, 'work.txt'), 'unstaged change\n');
  await rename(join(repo, '旧 名称.txt'), join(repo, '新 名称.txt')); git(repo, ['add', '-A', '--', '旧 名称.txt', '新 名称.txt']);
  await unlink(join(repo, '删除.txt'));
  await writeFile(join(repo, '新增 文件.txt'), 'Synthetic untracked text is not auto-read.\n', { flag: 'wx' });
  await writeFile(join(repo, '.env'), 'SYNTHETIC_SECRET=excluded-fixture\n', { flag: 'wx' });
}
function identity(run, info) {
  try {
    const actual = execFileSync('ps', ['-p', String(info.parentPid), '-o', 'command='], { encoding: 'utf8' }).trim();
    return actual.includes(preview) && actual.includes(`--work-evidence-run ${run}`);
  } catch { return false; }
}
try {
  if (command === 'new') {
    if (runId && runId !== '--clean') throw Error('USE_NEW_OR_NEW_CLEAN');
    await privateDirectory(base);
    const id = `run-${randomUUID()}`, run = join(base, id); await privateDirectory(run);
    const repo = join(run, '体验 仓库'), other = join(run, '另一 仓库'), unborn = join(run, '空 仓库');
    await save(join(run, 'owned.json'), { owner, root, id });
    for (const directory of [repo, other, unborn]) { await privateDirectory(directory); git(directory, ['init', '-q', '-b', 'main']); }
    for (const directory of [repo, other]) {
      for (const file of ['work.txt', '旧 名称.txt', '删除.txt', '说明 文档.md']) await writeFile(join(directory, file), 'initial content\n', { flag: 'wx' });
      git(directory, ['add', '.']); git(directory, ['-c', 'user.name=Work Evidence Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Synthetic baseline']);
    }
    if (runId !== '--clean') await changed(repo);
    console.log(JSON.stringify({ runId: id, runDirectory: run, repo, other, unborn, start: `node apps/dsh-plugin/scripts/work-evidence-playground.mjs start ${id}` }, null, 2));
  } else {
    if (!/^run-[a-f\d-]{36}$/u.test(runId ?? '')) throw Error('EXPLICIT_OWNED_RUN_ID_REQUIRED');
    const run = join(base, runId); await lstat(run); await privateDirectory(run);
    const marker = await json(join(run, 'owned.json'));
    if (marker.owner !== owner || marker.root !== root || marker.id !== runId) throw Error('NOT_THIS_WORKTREE_OWNED_RUN');
    const repo = join(run, '体验 仓库');
    const info = await json(join(run, 'process.json')).catch(() => null), live = info && identity(run, info);
    // A launcher may have exited abnormally while DSH survives. Refuse removal/restart conservatively.
    let hostPidAlive = false;
    if (Number.isSafeInteger(info?.hostPid) && info.hostPid > 0) { try { process.kill(info.hostPid, 0); hostPidAlive = true; } catch (error) { hostPidAlive = error.code !== 'ESRCH'; } }
    if (command === 'start') {
      if (live || hostPidAlive) throw Error('THIS_RUN_ALREADY_RUNNING_OR_HOST_PID_NEEDS_INSPECTION');
      if (option && option !== '--faults') throw Error('UNKNOWN_START_OPTION');
      const child = spawn(process.execPath, [preview, '--work-evidence-run', run], { cwd: root, stdio: 'inherit', env: { ...process.env, WORK_EVIDENCE_RUN_DIRECTORY: run, WORK_EVIDENCE_HOST_PROOF: option === '--faults' ? '1' : '' } });
      for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
      child.on('exit', code => { process.exitCode = code ?? 1; });
    } else if (command === 'stop') {
      if (!live) throw Error('NO_MATCHING_LIVE_OWNED_HOST');
      process.kill(info.parentPid, 'SIGTERM'); console.log('Stop requested for this owned run only.');
    } else if (command === 'status') console.log(JSON.stringify({ runDirectory: run, live: !!live, hostPidAlive, address: await json(join(run, 'address.json')).catch(() => null), info }, null, 2));
    else if (command === 'change') {
      if (git(repo, ['rev-parse', '--show-toplevel']).trim() !== repo) throw Error('NOT_OWNED_FIXTURE_ROOT');
      await changed(repo); console.log('Synthetic changes prepared.');
    } else if (command === 'corrupt') {
      const cli = args => JSON.parse(execFileSync(process.execPath, [join(run, 'cli.mjs'), join(run, 'state'), ...args], { encoding: 'utf8' }));
      const scope = cli(['scopes']).items.map(s => s.value).find(s => s.directory === repo);
      if (!scope) throw Error('OBSERVE_FIXTURE_FIRST');
      const observation = cli(['history', scope.id]).items[0]; if (!observation) throw Error('OBSERVE_FIXTURE_FIRST');
      const name = `observation-${scope.id}-${observation.value.id}.json`, path = join(run, 'state', name);
      if (!(await lstat(path)).isFile()) throw Error('FIXTURE_RECORD_RESTRICTED');
      await save(join(run, 'corruption-backup.json'), { name, raw: await readFile(path, 'utf8') });
      await writeFile(path, '{controlled-corruption'); console.log('One owned observation corrupted; backup retained. Use repair.');
    } else if (command === 'repair') {
      const backup = await json(join(run, 'corruption-backup.json'));
      if (!/^observation-[a-f\d-]+\.json$/u.test(backup.name) || JSON.parse(backup.raw).value.directory !== repo) throw Error('INVALID_BACKUP');
      const path = join(run, 'state', backup.name);
      if (!(await lstat(path)).isFile() || await readFile(path, 'utf8') !== '{controlled-corruption') throw Error('RECORD_CHANGED_DO_NOT_OVERWRITE');
      await writeFile(path, backup.raw); await unlink(join(run, 'corruption-backup.json')); console.log('Original owned record restored.');
    } else if (['pause', 'release', 'lose-receipt', 'normal'].includes(command)) {
      if (!live || !info.proofMode) throw Error('START_THIS_RUN_WITH_FAULTS_FIRST');
      await writeFile(join(run, 'proof-control.json'), JSON.stringify({ pauseNote: command === 'pause' || command === 'lose-receipt', dropReceipt: command === 'lose-receipt' || command === 'release' }), { mode: 0o600 });
      console.log(command === 'release' ? 'Released; one successful receipt may be replaced by HTTP 503.' : 'Fault control updated for this run only.');
    } else if (command === 'remove') {
      if (live || hostPidAlive || option !== `--confirm=${runId}`) throw Error('STOP_AND_CONFIRM_EXACT_RUN_ID_FIRST');
      await rm(run, { recursive: true }); console.log('Removed this marked owned run.');
    } else throw Error('Commands: new [--clean], start RUN_ID [--faults], status/stop/change/corrupt/repair/pause/release/lose-receipt/normal RUN_ID, remove RUN_ID --confirm=RUN_ID');
  }
} catch (error) { console.error(error.code ?? error.message); process.exitCode = 1; }
