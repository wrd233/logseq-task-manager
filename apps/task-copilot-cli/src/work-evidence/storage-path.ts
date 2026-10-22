import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, parse, resolve } from 'node:path';
const restricted = () => Object.assign(new Error('STATE_DIRECTORY_RESTRICTED'), { code: 'STATE_DIRECTORY_RESTRICTED' });

/** Check every existing ancestor before the first creation. Never mkdir recursively through a link. */
export async function privateDirectory(input: string, requirePrivate = true): Promise<string> {
  if (!isAbsolute(input) || resolve(input) !== input || input === parse(input).root) throw restricted();
  const missing: string[] = [];
  let ancestor = input;
  for (;;) {
    try {
      const stat = await lstat(ancestor);
      if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(ancestor) !== ancestor) throw restricted();
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      missing.unshift(ancestor); ancestor = dirname(ancestor);
    }
  }
  // realpath above rejects symlinks anywhere in the existing prefix, including links pointing inside.
  for (const path of missing) {
    const parent = dirname(path);
    if (await realpath(parent) !== parent || !(await lstat(parent)).isDirectory()) throw restricted();
    try { await mkdir(path, { mode: 0o700 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    if ((await lstat(path)).isSymbolicLink() || await realpath(path) !== path) throw restricted();
  }
  const stat = await lstat(input);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(input) !== input || stat.uid !== process.getuid?.() || (stat.mode & (requirePrivate ? 0o077 : 0o022))) throw restricted();
  // Persist newly created directory entries from the leaf back to the existing ancestor.
  for (const path of missing.length ? [...missing].reverse().concat(ancestor) : []) {
    const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { await handle.sync(); } finally { await handle.close(); }
  }
  return input;
}
