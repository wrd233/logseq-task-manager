import process from 'node:process';
import { execFileSync, spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, symlink, access, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { output } from './work-evidence-build.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const state = join(root, 'tmp/work-evidence');
const home = join(state, 'dsh-home-v1');
const profile = join(home, 'profiles/work-evidence');
const env = { ...process.env, DSH_HOME: home, DEEPSEEK_API_KEY: '', DSH_API_KEY: '', PATH: `/opt/homebrew/opt/node@24/bin:${process.env.PATH}` };
await mkdir(home, { recursive: true, mode: 0o700 });
try { await access(join(profile, 'package.json')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  execFileSync('dsh', ['--profile', 'work-evidence', '--from-default-profile', 'web', '--dump-config'], { cwd: root, env, stdio: 'ignore' });
}
// This patch belongs only to this Goal's profile. A fresh profile contains [].
const patchPath = join(profile, 'cordis.patch.yml');
let patch = (await readFile(patchPath, 'utf8')).replace(/^\[\]\s*$/gm, '');
if (!patch.includes('# work-evidence isolation')) patch += `\n# work-evidence isolation\n- id: workspace-controller\n  config:\n    documentsDirectory: ${JSON.stringify(join(state, 'documents'))}\n`;
await writeFile(patchPath, patch);
await mkdir(join(state, 'documents'), { recursive: true });
const manifestPath = join(profile, 'package.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const name = '@task-copilot/dsh-work-evidence';
if (!manifest.dsh.profile.bundles.includes(name)) manifest.dsh.profile.bundles.push(name);
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
const parent = join(profile, 'node_modules/@task-copilot');
await mkdir(parent, { recursive: true });
try { await symlink(output, join(parent, 'dsh-work-evidence')); }
catch (error) {
  if (error.code !== 'EEXIST' || await realpath(join(parent, 'dsh-work-evidence')) !== output) throw error;
}
const child = spawn('dsh', ['--profile', 'work-evidence', '--host', '127.0.0.1', '--port', '0', '--no-open'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
await writeFile(join(state, 'process.json'), JSON.stringify({ parentPid: process.pid, hostPid: child.pid, home, profile }));
const log = createWriteStream(join(state, 'host.log'), { flags: 'a', mode: 0o600 });
for (const stream of [child.stdout, child.stderr]) {
  let pending = '';
  stream.on('data', bytes => {
    process.stdout.write(bytes);
    pending += bytes.toString();
    let end;
    while ((end = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, end + 1); pending = pending.slice(end + 1);
      log.write(line.replace(/([?&]token=)[^\s]+/gu, '$1[redacted]'));
      const address = line.match(/http:\/\/127\.0\.0\.1:\d+/u)?.[0];
      if (address) void writeFile(join(state, 'address.json'), JSON.stringify({ address }));
    }
  });
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { log.end(); process.stderr.write(`DSH startup failed: ${error.code}\n`); process.exitCode = 1; });
child.on('close', code => { log.end(); process.exitCode = code ?? 1; });
