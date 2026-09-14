import test from 'node:test';
import assert from 'node:assert/strict';
import {desktopIO} from '../src/desktop-io.js';

test('only ENOENT may be interpreted as a missing catalog', async () => {
  for (const error of [Object.assign(Error('missing'),{code:'ENOENT'}), Error("Error invoking remote method: ENOENT: no such file")]) {
    const io=desktopIO(async()=>{throw error;},()=>'/graph');
    assert.equal(await io.optional('/docs/.longdoc/catalog.json'),null);
  }
  for (const message of ['EACCES: permission denied','EIO: disk error','bridge unavailable']) {
    const io=desktopIO(async()=>{throw Error(message);},()=>'/graph');
    await assert.rejects(io.optional('/docs/.longdoc/catalog.json'),new RegExp(message));
  }
});
test('existing catalog read errors propagate; absolute target and current Graph are passed intact', async () => {
  const calls=[];let graph='/graph/a';
  const io=desktopIO(async(...args)=>{calls.push(args);if(args[0]==='readFile')throw Error('unreadable');},()=>graph);
  await assert.rejects(io.optional('/docs/catalog.json'),/unreadable/);
  graph='/graph/b';await io.write('/docs/test.md','中文');
  assert.deepEqual(calls.at(-1),['writeFile','/graph/b','/docs/test.md','中文']);
});
