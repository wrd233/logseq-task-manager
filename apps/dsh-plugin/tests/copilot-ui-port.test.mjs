/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedUiPort, sameWorkUiContext } from '../../logseq-plugin/src/workspace/copilot-ui-port.ts';

// Synthetic native actions test the adapter boundary, not DSH or physical input.
const context = { scope: null, binding: null, workObject: null, sessionId: 'port-session', generation: 1 };
function fixture() {
  let active = structuredClone(context), revision = 1, locked = false;
  const events = [], span = { revision, start: 3, end: 3 }, target = { isConnected: true, focus: value => events.push(['focus', value]) };
  const options = {
    readContext: () => active, returnTarget: target,
    nativeInput: {
      captureInsertion: () => { events.push(['capture']); return { ...span }; },
      insertText: (text, captured) => {
        events.push(['insert', text, captured]);
        return !locked && captured.revision === revision;
      },
    },
    openSource: async (source, expected) => { events.push(['source', source, expected]); },
  };
  return { options, events, target, setContext: value => { active = value; }, type: () => { revision++; }, lock: () => { locked = true; } };
}
test('span capture is synchronous and subsequent native typing is never replaced', async () => {
  const f = fixture(), port = createSharedUiPort(f.options);
  assert.deepEqual(f.events, [['capture']]);
  await Promise.resolve(); f.type();
  assert.equal(await port.insertDraft('quote', context), 'busy');
  assert.deepEqual(f.events[1], ['insert', 'quote', { revision: 1, start: 3, end: 3 }]);
});
test('native insertion uses one original span once and does not access replace or submit', async () => {
  const f = fixture();
  Object.defineProperty(f.options.nativeInput, 'setDraft', { get() { return assert.fail('must never replace native draft'); } });
  Object.defineProperty(f.options.nativeInput, 'submit', { get() { return assert.fail('must never submit native draft'); } });
  const port = createSharedUiPort(f.options);
  assert.equal(await port.insertDraft('quote', context), 'inserted');
  assert.equal(await port.insertDraft('quote', context), 'busy');
  assert.equal(f.events.filter(event => event[0] === 'insert').length, 1);
});
test('session, generation and formal version changes reject late insertion and focus return', async () => {
  for (const changed of [{ ...context, sessionId: 'other' }, { ...context, generation: 2 }, { ...context, workObject: { id: 'work', version: 2 } }]) {
    const f = fixture(), port = createSharedUiPort(f.options); f.setContext(changed);
    assert.equal(await port.insertDraft('quote', context), 'stale'); port.returnFocus(context);
    assert.deepEqual(f.events, [['capture']]);
  }
});
test('complete page scope and binding fields participate in the UI fence', () => {
  const scope = { graphId: 'graph', rootUuid: 'root', kind: 'page', pageName: 'before' };
  const full = { ...context, scope, binding: { scope, directory: '/work', provider: 'workspace', organization: 'flat', workspaceId: 'workspace' }, workObject: { id: 'work', version: 1 } };
  for (const changed of [
    { ...full, scope: { ...scope, pageName: 'after' } },
    { ...full, binding: { ...full.binding, directory: '/other' } },
    { ...full, binding: { ...full.binding, workspaceId: 'other' } },
    { ...full, binding: { ...full.binding, scope: { ...scope, kind: undefined, pageName: undefined } } },
    { ...full, workObject: { id: 'work', version: 2 } },
  ]) assert.equal(sameWorkUiContext(full, changed), false);
  assert.equal(sameWorkUiContext(full, structuredClone(full)), true);
});
test('locked or unavailable native editor preserves the caller quote', async () => {
  const f = fixture(), port = createSharedUiPort(f.options); f.lock();
  assert.equal(await port.insertDraft('keep this quote', context), 'busy');
  const unavailable = createSharedUiPort({ ...f.options, nativeInput: { captureInsertion() { throw Error('disposed'); }, insertText() { assert.fail(); } } });
  assert.equal(await unavailable.insertDraft('keep this quote', context), 'unavailable');
});
test('return focuses only the original connected control while context is still current', () => {
  const f = fixture(), port = createSharedUiPort(f.options); port.returnFocus(context);
  assert.deepEqual(f.events[1], ['focus', { preventScroll: true }]);
  f.target.isConnected = false; port.returnFocus(context);
  f.setContext(null); port.returnFocus(context);
  assert.equal(f.events.length, 2); assert.equal(sameWorkUiContext(port.context(), context), false);
});
test('source requests delegate to host verification and a stale context never reaches the opener', async () => {
  const f = fixture(), port = createSharedUiPort(f.options);
  const source = { sourceId: 'synthetic-source', target: { kind: 'logseq-block', graphId: 'graph', blockUuid: 'block' }, contentVersion: null };
  await port.openSource(source, context); assert.deepEqual(f.events[1], ['source', source, context]);
  f.setContext({ ...context, generation: 2 });
  await assert.rejects(port.openSource(source, context), /WORK_UI_STALE/);
  assert.equal(f.events.length, 2);
});
test('host teardown and an untrusted stale argument cannot revive an interaction', async () => {
  const f = fixture(), port = createSharedUiPort(f.options);
  assert.equal(await port.insertDraft('quote', { ...context, generation: 0 }), 'stale');
  f.setContext(null); assert.equal(await port.insertDraft('quote', context), 'stale');
  assert.deepEqual(f.events, [['capture']]);
  assert.throws(() => createSharedUiPort(f.options), /WORK_UI_UNAVAILABLE/);
});
