/* global window, localStorage, AbortController, setTimeout, clearTimeout */
import React, { useEffect, useRef, useState } from 'react';
import { compactGazeSummary, mountSharedStageView } from '@task-copilot/stage-runtime';

const STORAGE_KEY = 'tc-dsh-stage-window-v1';

function loadWindowRect() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (raw && typeof raw.x === 'number' && typeof raw.y === 'number' && typeof raw.w === 'number' && typeof raw.h === 'number') {
      return {
        x: Math.max(12, Math.min(window.innerWidth - 360, raw.x)),
        y: Math.max(12, Math.min(window.innerHeight - 240, raw.y)),
        w: Math.max(520, Math.min(window.innerWidth - 24, raw.w)),
        h: Math.max(380, Math.min(window.innerHeight - 24, raw.h)),
      };
    }
  } catch { /* ignore */ }
  const w = Math.min(920, Math.max(600, window.innerWidth - 180));
  const h = Math.min(640, Math.max(460, window.innerHeight - 130));
  return {
    x: Math.max(24, window.innerWidth - w - 28),
    y: Math.max(52, Math.round((window.innerHeight - h) / 2)),
    w,
    h,
  };
}

function saveWindowRect(rect) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rect)); } catch { /* ignore */ }
}

export const stageWindowStyles = `
.tcs-dsh-float {
  position: fixed;
  z-index: 940;
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  border: 1px solid rgba(128, 128, 128, 0.28);
  background: var(--bg-primary, #ffffff);
  box-shadow: 0 22px 54px -14px rgba(15, 20, 28, 0.36);
  overflow: hidden;
  transition: box-shadow 180ms ease;
}
.tcs-dsh-float.is-full {
  inset: 22px !important;
  width: auto !important;
  height: auto !important;
  border-radius: 16px;
}
.tcs-dsh-titlebar {
  height: 36px;
  flex-shrink: 0;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
  background: rgba(128, 128, 128, 0.06);
  cursor: move;
  font-size: 12px;
  user-select: none;
}
.tcs-dsh-titlebar-left, .tcs-dsh-titlebar-right {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.tcs-dsh-win-btn {
  border: 1px solid rgba(128, 128, 128, 0.24);
  background: transparent;
  color: inherit;
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 11.5px;
  cursor: pointer;
}
.tcs-dsh-win-btn:hover { border-color: #3b6ea5; color: #3b6ea5; }
.tcs-dsh-body { flex: 1; min-height: 0; position: relative; overflow: hidden; }
.tcs-dsh-resize {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  z-index: 20;
}
.tcs-dsh-resize::after {
  content: "";
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 7px;
  height: 7px;
  border-right: 2px solid rgba(128, 128, 128, 0.45);
  border-bottom: 2px solid rgba(128, 128, 128, 0.45);
}
.tcs-dsh-peek {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 940;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid rgba(128, 128, 128, 0.3);
  background: var(--bg-primary, #ffffff);
  color: inherit;
  box-shadow: 0 12px 32px -10px rgba(15, 20, 28, 0.32);
  font-size: 12px;
  cursor: pointer;
}
.tcs-dsh-peek:hover { border-color: #3b6ea5; }
.tcs-dsh-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #c27824;
  flex-shrink: 0;
}
.tcs-dsh-header-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #3b6ea5;
  margin-left: 4px;
  vertical-align: middle;
}
`;

/**
 * Creates DSH's independent floating Semantic-Zoom Stage window controller & components.
 * Mode: 'closed' | 'floating' | 'peek' | 'full'
 */
export function createStageWindow({ rpc, enterWork, getActiveSessionId, insertQuote, flash }) {
  let mode = 'closed';
  let latestSnapshot = null;
  const listeners = new Set();
  const emit = () => { for (const fn of listeners) fn(); };
  const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };

  const setMode = next => {
    if (mode === next) return;
    mode = next;
    void rpc('stage-visibility', { open: next === 'floating' || next === 'full' }).catch(() => {});
    emit();
  };

  const toggle = () => {
    setMode(mode === 'closed' || mode === 'peek' ? 'floating' : 'peek');
  };

  function StageHeaderButton() {
    const [, setTick] = useState(0);
    useEffect(() => subscribe(() => setTick(t => t + 1)), []);
    const hasGhosts = (latestSnapshot?.ghostProposals?.length ?? 0) > 0;
    return (
      <button
        type="button"
        className="lq-header"
        aria-label="打开全局共视活画布独立悬浮窗"
        title="全局态势与共视活画布（独立悬浮窗 · Cmd+Shift+G）"
        onClick={toggle}
      >
        ◎ 星图{hasGhosts ? <span className="tcs-dsh-header-dot" /> : null}
      </button>
    );
  }

  function StageFloatingOverlay() {
    const [curMode, setCurMode] = useState(mode);
    const [snap, setSnap] = useState(latestSnapshot);
    const [rect, setRect] = useState(() => loadWindowRect());
    const mountRef = useRef(null);
    const viewRef = useRef(null);
    const versionRef = useRef(0);
    const enterOpsRef = useRef(new Map());

    useEffect(() => subscribe(() => {
      setCurMode(mode);
      setSnap(latestSnapshot);
    }), []);

    // Global shortcut Cmd/Ctrl + Shift + G to summon/minimize independent floating window
    useEffect(() => {
      const onKey = event => {
        if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'g') {
          event.preventDefault();
          toggle();
        } else if (event.key === 'Escape' && (mode === 'floating' || mode === 'full')) {
          viewRef.current?.focusZoomOut();
        }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, []);

    // Mount shared Stage UI when in floating/full mode
    useEffect(() => {
      if ((curMode !== 'floating' && curMode !== 'full') || !mountRef.current) return;
      const mounted = mountSharedStageView(mountRef.current, {
        source: 'dsh',
        openWorkLabel: '进入此工作对话',
        showStandaloneButton: true,
        showCloseButton: false,
        dispatch: async action => {
          const out = await rpc('stage-action', { action });
          if (out?.snapshot) {
            latestSnapshot = out.snapshot;
            versionRef.current = out.snapshot.version;
            setSnap(out.snapshot);
            emit();
            return out.snapshot;
          }
          return undefined;
        },
        onOpenWork: async project => {
          try {
            await enterWork({ workRef: project.workRef, title: project.title }, enterOpsRef.current);
            setMode('peek');
            flash?.(`已切入工作「${project.title}」`);
          } catch (error) {
            flash?.(error?.message ?? '无法切入该工作', 'error');
          }
        },
        onOpenInLogseq: async project => {
          try {
            const res = await rpc('stage-open-logseq', { workRef: project.workRef });
            if (res?.url) window.open(res.url, '_blank', 'noopener');
            else flash?.('此工作暂无可直接打开的 Logseq 锚点', 'error');
          } catch {
            flash?.('打开 Logseq 失败', 'error');
          }
        },
        onQuoteToChat: text => {
          const sid = getActiveSessionId?.();
          if (sid && insertQuote) insertQuote(sid, text);
        },
        onOpenStandalone: url => {
          window.open(url, '_blank', 'noopener');
        },
        onRequestClose: () => setMode('peek'),
      });
      viewRef.current = mounted;
      if (latestSnapshot) mounted.update(latestSnapshot);
      return () => {
        mounted.dispose();
        viewRef.current = null;
      };
    }, [curMode]);

    // Sync snapshots & real-time long-wait updates while open or peeked
    useEffect(() => {
      if (curMode === 'closed') return;
      let alive = true;
      let retryTimer = null;
      const controller = new AbortController();

      const applySnap = next => {
        if (!alive || !next) return;
        latestSnapshot = next;
        versionRef.current = next.version;
        setSnap(next);
        viewRef.current?.update(next);
        emit();
      };

      const loop = async () => {
        try {
          const init = await rpc('stage-state', {}, controller.signal);
          applySnap(init?.snapshot);
          while (alive && !controller.signal.aborted) {
            const next = await rpc('stage-wait', { sinceVersion: versionRef.current }, controller.signal);
            applySnap(next?.snapshot);
          }
        } catch {
          if (alive && !controller.signal.aborted) {
            retryTimer = setTimeout(() => { void loop(); }, 1800);
          }
        }
      };
      void loop();
      return () => {
        alive = false;
        controller.abort();
        if (retryTimer) clearTimeout(retryTimer);
      };
    }, [curMode]);

    if (curMode === 'closed') return null;

    if (curMode === 'peek') {
      const gaze = snap ? compactGazeSummary(snap) : '全局共视活画布';
      const ghostCount = snap?.ghostProposals?.length ?? 0;
      return (
        <button type="button" className="tcs-dsh-peek" onClick={() => setMode('floating')}>
          <span className="tcs-dsh-dot" style={{ background: ghostCount > 0 ? '#3b6ea5' : '#c27824' }} />
          <span>{gaze}</span>
          <span style={{ color: '#3b6ea5', fontWeight: 500 }}>展开</span>
        </button>
      );
    }

    const startMove = event => {
      if (curMode === 'full' || event.target.closest('button')) return;
      event.preventDefault();
      const startX = event.clientX;
      const startY = event.clientY;
      const startRect = { ...rect };
      const onMove = e => {
        const next = {
          ...startRect,
          x: Math.max(8, Math.min(window.innerWidth - 260, startRect.x + (e.clientX - startX))),
          y: Math.max(8, Math.min(window.innerHeight - 120, startRect.y + (e.clientY - startY))),
        };
        setRect(next);
        saveWindowRect(next);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };

    const startResize = event => {
      if (curMode === 'full') return;
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startY = event.clientY;
      const startRect = { ...rect };
      const onMove = e => {
        const next = {
          ...startRect,
          w: Math.max(520, Math.min(window.innerWidth - startRect.x - 10, startRect.w + (e.clientX - startX))),
          h: Math.max(380, Math.min(window.innerHeight - startRect.y - 10, startRect.h + (e.clientY - startY))),
        };
        setRect(next);
        saveWindowRect(next);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };

    return (
      <section
        className={`tcs-dsh-float${curMode === 'full' ? ' is-full' : ''}`}
        aria-label="全局态势与共视活画布独立悬浮窗"
        style={curMode === 'floating' ? { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` } : undefined}
      >
        <div className="tcs-dsh-titlebar" onMouseDown={startMove}>
          <div className="tcs-dsh-titlebar-left">
            <span style={{ fontWeight: 600 }}>◎ 全局共视活画布</span>
            <span style={{ opacity: 0.65, fontSize: '11px' }}>与当前 DSH 对话及外部 MCP 实时同频</span>
          </div>
          <div className="tcs-dsh-titlebar-right">
            <button type="button" className="tcs-dsh-win-btn" onClick={() => setMode('peek')}>收为胶囊</button>
            <button type="button" className="tcs-dsh-win-btn" onClick={() => setMode(curMode === 'full' ? 'floating' : 'full')}>
              {curMode === 'full' ? '还原浮窗' : '全景鸟瞰'}
            </button>
            <button type="button" className="tcs-dsh-win-btn" onClick={() => setMode('closed')}>✕</button>
          </div>
        </div>
        <div className="tcs-dsh-body" ref={mountRef} />
        {curMode === 'floating' ? <div className="tcs-dsh-resize" onMouseDown={startResize} /> : null}
      </section>
    );
  }

  return { StageHeaderButton, StageFloatingOverlay, setMode, toggle };
}
