/* global document, setInterval, clearInterval */
import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { createSharedUiPort } from '../../../logseq-plugin/src/workspace/copilot-ui-port.ts';
import { CaptureInboxController } from './controller.mjs';
import { CaptureInboxView } from './view.jsx';

/** Real DSH slots + authenticated host RPC; never reads or replaces chat text. */
export function installCaptureInbox(ctx, rpc) {
  const entries = new Map(), listeners = new Set();
  let active = null, error = '', notice = '', disposed = false, epoch = 0;
  const emit = () => { for (const listener of listeners) listener(); };
  const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  const mounted = () => ctx.sidebarRight.mounted.getSnapshot();
  const current = entry => !disposed && mounted() === entry.context.sessionId && entry.valid ? entry.context : null;
  const port = (entry, inputActions, returnTarget) => {
    const native = createSharedUiPort({ readContext: () => current(entry), nativeInput: inputActions, returnTarget });
    return { ...native, insertDraft: async (text, context) => {
      try {
        const info = await rpc('capture/context', { sessionId: entry.context.sessionId });
        if (info.lease !== entry.lease) { entry.valid = false; return 'stale'; }
      } catch { return 'unavailable'; }
      return native.insertDraft(text, context);
    } };
  };
  async function open(sessionId, mode, target) {
    const token = ++epoch;
    error = ''; emit();
    try {
      const info = await rpc('capture/context', { sessionId });
      if (disposed || token !== epoch || mounted() !== sessionId) return;
      let entry = entries.get(info.lease);
      if (!entry) {
        entry = { ...info, valid: true, inputActions: null };
        const call = (method, payload = {}) => rpc(`capture/${method}`, { sessionId, lease: info.lease, ...payload });
        entry.controller = new CaptureInboxController({ context: info.context, origin: info.origin,
          store: { list: () => call('list'), readDraft: () => call('readDraft'), execute: (_c, command) => call('execute', { command }),
            saveDraft: (_c, expectedVersion, draft) => call('saveDraft', { expectedVersion, draft }) },
          createPort: () => port(entry, entry.inputActions) });
        entry.unsubscribe = entry.controller.subscribe(() => {
          if (entry.controller.state.captureStatus === 'saved') { notice = '已保存到 Inbox'; emit(); }
        });
        entries.set(info.lease, entry);
      }
      // A transient RPC failure may have fenced this instance without changing
      // its host lease. Revalidation resumes the same local draft, never a new one.
      if (!entry.valid) { entry.valid = true; entry.controller.stale = false; }
      active = entry; emit();
      await entry.controller.open(mode, port(entry, undefined, target));
    } catch { if (token === epoch) { error = '记录暂不可用，请检查 DSH 连接后重试。'; emit(); } }
  }
  function Entry({ sessionId }) {
    const returnTarget = useRef(null);
    const rememberFocus = () => { returnTarget.current = document.activeElement; };
    const launch = (mode, event) => { const target = returnTarget.current ?? event.currentTarget; returnTarget.current = null; void open(sessionId, mode, target); };
    useSyncExternalStore(subscribe, () => error + notice, () => '');
    return <><button className="lq-header" type="button" onPointerDown={rememberFocus} onClick={event => launch('capture', event)}>记一下</button>
      <button className="lq-header" type="button" onPointerDown={rememberFocus} onClick={event => launch('inbox', event)}>Inbox</button>{(error || notice) && <span role="status">{error || notice}</span>}</>;
  }
  function Panel({ sessionId, inputActions }) {
    const entry = active;
    if (!entry || sessionId !== entry.context.sessionId) return null;
    return <BoundPanel entry={entry} inputActions={inputActions} />;
  }
  function BoundPanel({ entry, inputActions }) {
    entry.inputActions = inputActions;
    const state = useSyncExternalStore(entry.controller.subscribe, entry.controller.getSnapshot);
    useEffect(() => () => { entry.inputActions = null; }, [entry, inputActions]);
    return state.visible ? <div style={{ position: 'fixed', right: 24, bottom: 24, width: state.mode === 'capture' ? 'min(480px, calc(100vw - 32px))' : 'min(920px, calc(100vw - 32px))', maxHeight: '85vh', overflow: 'auto', pointerEvents: 'auto', boxShadow: '0 8px 40px #0003', borderRadius: 10 }}>
      {[...entries.values()].filter(old => old !== entry && old.context.sessionId === entry.context.sessionId && (old.controller.state.text || old.controller.state.edit)).map(old => <details key={old.lease}><summary>先前工作现场仍有未处理输入（仅供取回）</summary><p>{old.context.binding?.directory ?? '未关联工作'} · {old.context.sessionId}</p><textarea aria-label="先前现场的记录草稿" readOnly value={old.controller.state.text} />{old.controller.state.edit && <textarea aria-label="先前现场的编辑草稿" readOnly value={old.controller.state.edit.text} />}</details>)}
      <CaptureInboxView state={state} actions={entry.controller.actions} />
    </div> : null;
  }
  function Overlay(props) {
    const entry = useSyncExternalStore(subscribe, () => active, () => null);
    const session = useSyncExternalStore(listener => ctx.sidebarRight.mounted.subscribe(listener), mounted);
    useEffect(() => {
      if (!entry) return;
      let stopped = false;
      const verify = async () => {
        try {
          const info = await rpc('capture/context', { sessionId: entry.context.sessionId });
          if (!stopped && info.lease !== entry.lease) { entry.valid = false; void entry.controller.connectionChanged(); }
        } catch { if (!stopped) { entry.valid = false; void entry.controller.connectionChanged(); } }
      };
      const timer = setInterval(() => { void verify(); }, 2000);
      return () => { stopped = true; clearInterval(timer); };
    }, [entry]);
    return entry && session === entry.context.sessionId ? props.renderSlot('logseq.capture.inbox', {}) : null;
  }
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'logseq-capture-inbox', children: { 'logseq.capture.inbox': { kind: 'single', scope: 'session' } } }, Overlay));
  ctx.slots.inject('logseq.capture.inbox', () => ctx.slots.register({ name: 'logseq.capture.inbox', id: 'logseq-capture-inbox' }, Panel));
  ctx.on('connection/reset', () => { epoch++; for (const entry of entries.values()) { entry.valid = false; void entry.controller.connectionChanged(); } });
  ctx.on('dispose', () => { disposed = true; epoch++; for (const entry of entries.values()) { entry.unsubscribe(); void entry.controller.dispose(); } listeners.clear(); });
  return Entry;
}
