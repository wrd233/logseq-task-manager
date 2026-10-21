// Starts a separate DSH profile; never installs into a daily-use profile.
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, symlink, lstat, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
const plugin = fileURLToPath(new URL('../', import.meta.url));
const root = resolve(plugin, '../../tmp/capture-preview');
const env = { ...process.env, DSH_HOME: root };
const profile = join(root, 'profiles/capture');
await mkdir(root, { recursive: true });
try { await lstat(join(profile, 'package.json')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  execFileSync('dsh', ['--profile', 'capture', '--from-default-profile', 'web', '--dump-config'], { env, stdio: 'ignore' });
}
const path = join(profile, 'package.json'), manifest = JSON.parse(await readFile(path, 'utf8'));
const name = '@task-copilot/dsh-logseq-workbench';
if (!manifest.dsh.profile.bundles.includes(name)) manifest.dsh.profile.bundles.push(name);
await writeFile(path, JSON.stringify(manifest, null, 2));
await mkdir(join(profile, 'node_modules/@task-copilot'), { recursive: true });
const link = join(profile, 'node_modules', name);
try { await symlink(plugin, link); } catch (error) {
  if (error.code !== 'EEXIST') throw error;
  if (await realpath(link) !== await realpath(plugin)) throw Error('Existing preview plugin link belongs to another checkout; choose a separate preview directory.');
}
// Dedicated overlay rather than replacing the profile's user configuration.
const patch = join(root, 'capture.patch.yml');
await writeFile(patch, '- id: logseq-workbench\n  config:\n' + ['bindingStateDirectory: bindings', 'captureStateDirectory: captures', 'workspaceStateDirectory: companion'].map(item => {
  const [key, child] = item.split(': '); return `    ${key}: ${JSON.stringify(join(root, child))}\n`;
}).join(''));
const child = spawn('dsh', ['--profile', 'capture', '--patch', patch, '--no-open', '--port', '0'], { env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
child.on('exit', code => { process.exitCode = code ?? 1; });
