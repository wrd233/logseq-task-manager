// Personal convenience wrapper; lifecycle and ownership remain in playground.
import process from 'node:process';
import console from 'node:console';
import { execFileSync, spawn } from 'node:child_process';
import { readFile, writeFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { privateDirectory } from '../../task-copilot-cli/src/work-evidence/storage-path.ts';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const script = join(root, 'apps/dsh-plugin/scripts/work-evidence-playground.mjs');
const base = join(root, 'tmp/work-evidence-ux');
const pointer = join(base, 'personal-experience.json');
const action = process.argv[2] ?? 'start';
const call = (...args) => execFileSync(process.execPath, ['--import', 'tsx', script, ...args], { cwd: root, encoding: 'utf8' });
const sleep = ms => new Promise(resolve => globalThis.setTimeout(resolve, ms));
const open = url => spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore' }).on('error', () => console.error('请手动打开显示的本机地址。'));
async function current() {
  try { return JSON.parse(await readFile(pointer, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
try {
  if (Number(process.versions.node.split('.')[0]) !== 24) throw Error('请使用 Node 24，或双击配套 .command 入口。');
  await privateDirectory(base);
  try { if (!(await lstat(pointer)).isFile()) throw Error('PERSONAL_POINTER_RESTRICTED'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  let run = await current();
  if (action === 'reset' && run) {
    const previous = JSON.parse(call('status', run.runId));
    if (!previous.live && previous.hostPidAlive) throw Error('旧宿主进程需要检查；未新建运行。');
    if (previous.live) {
      call('stop', run.runId);
      for (let i = 0; i < 50; i++) { if (!JSON.parse(call('status', run.runId)).hostPidAlive) break; await sleep(100); }
      if (JSON.parse(call('status', run.runId)).hostPidAlive) throw Error('旧运行尚未退出，请稍后重试。');
    }
  }
  if (action === 'reset' || (!run && action === 'start')) {
    // Keep every previous profile, fixture, record and browser origin intact.
    run = JSON.parse(call('new', '--clean'));
    await writeFile(pointer, JSON.stringify(run, null, 2), { mode: 0o600 });
    console.log('已创建新样例，旧运行和记录保留。');
  }
  if (!run) throw Error('请先选择“启动 / 继续”。');
  const status = () => JSON.parse(call('status', run.runId));
  if (action === 'change') console.log(call('change', run.runId, '--with-commit').trim());
  else if (action === 'stop') {
    const info = status();
    if (info.live) {
      call('stop', run.runId);
      for (let i = 0; i < 50; i++) { if (!status().hostPidAlive) break; await sleep(100); }
      if (status().hostPidAlive) throw Error('宿主尚未退出；请稍后查看状态，不要重复启动。');
    } else if (info.hostPidAlive) throw Error('宿主仍存在但启动器已失联，请检查状态；不会停止不明进程。');
    console.log('本轮已停止，记录保留。');
  } else if (['start', 'reset', 'open'].includes(action)) {
    let info = status();
    if (!info.live) {
      if (info.hostPidAlive) throw Error('宿主进程仍在，请先检查状态。');
      // Capture output in memory only: authentication URLs never enter a log/file.
      const child = spawn(process.execPath, ['--import', 'tsx', script, 'start', run.runId], { cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WORK_EVIDENCE_PERSONAL_LAUNCH: '1' } });
      let pending = '', failure = '', ready = false, ended = false;
      for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => {
        pending += bytes.toString();
        let end;
        while ((end = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, end); pending = pending.slice(end + 1);
          failure = line.replace(/([?&]token=)[^\s]+/gu, '$1[redacted]');
          const url = line.match(/http:\/\/127\.0\.0\.1:\d+\/[^\s]*\?token=[^\s]+/u)?.[0];
          if (url && !ready) { ready = true; open(url); }
        }
      });
      child.on('error', error => { failure = error.message; ended = true; });
      child.on('exit', () => { ended = true; });
      for (let i = 0; i < 600 && !ready && !ended; i++) await sleep(100);
      if (!ready) throw Error(`启动未就绪，请检查本轮 host.log。${failure}`);
      // Host owns its own sanitized log and process receipt. Pipes are no longer needed.
      child.stdout.destroy(); child.stderr.destroy(); child.unref();
      info = status();
    } else open(info.address.address);
    console.log(`已打开独立 DSH：${info.address?.address ?? '地址正在写入，请查看状态'}\n点击“工作变化”，选择下方目录并先同步一次。`);
  } else if (action !== 'status' && action !== 'change' && action !== 'stop') throw Error('支持 start / stop / status / change / reset / open');
  const info = status();
  console.log(`运行：${run.runId}\n样例目录：${run.repo}\n地址：${info.address?.address ?? '尚未启动'}\n状态：${info.live ? '运行中' : '已停止'}\n模型：未配置时分析不可用；观察、Diff、交接和引用可用。在独立 DSH 内自行配置，分析前需勾选允许。`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
