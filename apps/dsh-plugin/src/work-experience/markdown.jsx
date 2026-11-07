import React from 'react';

/* Markdown is rendered from the server's Marked tokens. Raw HTML is always text,
   and every text run that can be mapped to source Markdown carries UTF-16 offsets. */

const allowedHref = href => typeof href === 'string' && /^(https?:|mailto:|logseq:|\/|#|\.{1,2}\/)/iu.test(href);

function positionOf(token, source, cursor) {
  if (cursor === null || cursor === undefined || typeof token?.raw !== 'string' || !token.raw) return null;
  const at = source.indexOf(token.raw, cursor);
  return at < 0 ? null : { start: at, end: at + token.raw.length };
}

function mappedText(token, position, key, skipBefore = 0) {
  let text = typeof token.text === 'string' ? token.text : typeof token.raw === 'string' ? token.raw : '';
  if (position === null) return text;
  const inside = typeof token.raw === 'string' && typeof token.text === 'string' ? token.raw.indexOf(token.text) : -1;
  let start = inside >= 0 ? position.start + inside : position.start;
  if (skipBefore > start) { const drop = Math.min(text.length, skipBefore - start); text = text.slice(drop); start += drop; }
  if (!text) return null;
  return <span key={key} data-ms={start} data-me={start + text.length}>{text}</span>;
}

function renderSequence(tokens, source, base, prefix, skipBefore = 0) {
  let cursor = base;
  const output = [];
  (tokens ?? []).forEach((token, index) => {
    const position = positionOf(token, source, cursor);
    if (position) cursor = position.end;
    if (skipBefore && position && position.end <= skipBefore) return;
    output.push(renderToken(token, source, position, `${prefix}.${index}`, skipBefore));
  });
  return output;
}

function renderChildren(token, source, position, key, skipBefore = 0) {
  return (token.tokens?.length ? renderSequence(token.tokens, source, position?.start ?? null, key, skipBefore)
    : typeof token.text === 'string' ? mappedText(token, position, `${key}.text`, skipBefore) : null);
}

function renderToken(token, source, position, key, skipBefore = 0) {
  if (!token) return null;
  const children = () => renderChildren(token, source, position, key, skipBefore);
  switch (token.type) {
    case 'space':
    case 'def':
      return null;
    case 'paragraph':
      return <p key={key}>{children()}</p>;
    case 'text':
      return token.tokens?.length ? <React.Fragment key={key}>{renderSequence(token.tokens, source, position?.start ?? null, `${key}.i`, skipBefore)}</React.Fragment> : mappedText(token, position, key, skipBefore);
    case 'escape':
      return mappedText(token, position, key, skipBefore);
    case 'strong':
      return <strong key={key}>{children()}</strong>;
    case 'em':
      return <em key={key}>{children()}</em>;
    case 'del':
      return <del key={key}>{children()}</del>;
    case 'link': {
      const content = children();
      if (!allowedHref(token.href)) return <span key={key} className="wx-md-link">{content}</span>;
      return <a key={key} href={token.href} title={token.title ?? undefined}
        {...(/^https?:/iu.test(token.href) ? { target: '_blank', rel: 'noreferrer noopener' } : {})}>{content}</a>;
    }
    case 'logseqPage':
      return <span key={key} className="wx-md-page" data-ms={position ? position.start + 2 : undefined}
        data-me={position ? position.start + 2 + String(token.page ?? '').length : undefined}>{token.page}</span>;
    case 'codespan':
      return <code key={key} className="wx-md-code">{mappedText({ ...token, raw: token.raw, text: token.text }, position ? { start: position.start + Math.max(0, token.raw.indexOf(token.text)), end: position.end } : null, `${key}.code`, skipBefore)}</code>;
    case 'br':
      return <br key={key} />;
    case 'image':
      return <span key={key} className="wx-md-image" role="img" aria-label={token.text || '图片'}>图片{token.text ? ` · ${token.text}` : ''}</span>;
    case 'hr':
      return <hr key={key} />;
    case 'heading':
      return <h3 key={key} className="wx-md-heading">{children()}</h3>;
    case 'blockquote':
      return <blockquote key={key}>{renderSequence(token.tokens, source, position?.start ?? null, `${key}.q`, skipBefore)}</blockquote>;
    case 'list': {
      const items = (token.items ?? []).map((item, index) => renderToken(item, source, positionOf(item, source, position?.start ?? null), `${key}.li${index}`, skipBefore));
      return token.ordered ? <ol key={key} start={token.start || undefined}>{items}</ol> : <ul key={key}>{items}</ul>;
    }
    case 'list_item':
      return <li key={key}>{token.task ? <input type="checkbox" checked={Boolean(token.checked)} readOnly tabIndex={-1} /> : null}{children()}</li>;
    case 'code': {
      const text = typeof token.text === 'string' ? token.text : '';
      const at = position && typeof token.raw === 'string' ? token.raw.indexOf(text) : -1;
      const body = at >= 0 ? <span data-ms={position.start + at} data-me={position.start + at + text.length}>{text}</span> : text;
      return <pre key={key}><code>{body}</code></pre>;
    }
    case 'table':
      return renderTable(token, source, position, key);
    case 'html': {
      const text = typeof token.text === 'string' ? token.text : token.raw ?? '';
      return <span key={key} className="wx-md-html">{mappedText({ ...token, text }, position, `${key}.html`, skipBefore)}</span>;
    }
    default:
      if (token.tokens?.length) return <React.Fragment key={key}>{renderSequence(token.tokens, source, position?.start ?? null, `${key}.d`, skipBefore)}</React.Fragment>;
      if (typeof token.text === 'string') return mappedText(token, position, key, skipBefore);
      if (typeof token.raw === 'string') return token.raw;
      return null;
  }
}

function renderTable(token, source, position, key) {
  let cursor = position?.start ?? null;
  const cell = (value, prefix) => {
    if (!value) return null;
    let start = null;
    if (cursor !== null && typeof value.text === 'string' && value.text) {
      const at = source.indexOf(value.text, cursor);
      if (at >= 0) { start = at; cursor = at + value.text.length; }
    }
    return renderSequence(value.tokens?.length ? value.tokens : [{ type: 'text', text: value.text ?? '', raw: value.text ?? '' }], source, start, prefix);
  };
  return <table key={key}><thead><tr>{(token.header ?? []).map((value, index) => <th key={index}>{cell(value, `${key}.h${index}`)}</th>)}</tr></thead>
    <tbody>{(token.rows ?? []).map((row, rowIndex) => <tr key={rowIndex}>{row.map((value, index) => <td key={index}>{cell(value, `${key}.r${rowIndex}c${index}`)}</td>)}</tr>)}</tbody></table>;
}

export function Markdown({ tokens, source, className = '', skip = 0 }) {
  if (!Array.isArray(tokens) || !tokens.length) {
    return <div className={`wx-md wx-md-empty ${className}`}>{String(source ?? '').slice(skip)}</div>;
  }
  return <div className={`wx-md ${className}`}>{renderSequence(tokens, source, 0, 'md', skip)}</div>;
}

/** Extract source ranges from a DOM selection. Unmapped text is never guessed. */
export function rangesFromSelection(root, range, nodeByUuid) {
  if (!root || !range) return [];
  const spans = [...root.querySelectorAll('[data-ms]')].filter(span => {
    try { return range.intersectsNode(span); } catch { return false; }
  });
  const blocks = new Map();
  for (const span of spans) {
    const block = span.closest('[data-block-uuid]');
    if (!block || !root.contains(block)) continue;
    const uuid = block.dataset.blockUuid, node = nodeByUuid.get(uuid);
    if (!node || node.availability !== 'available') continue;
    const start = Number(span.dataset.ms), end = Number(span.dataset.me);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    let from = start, to = end;
    if (span.firstChild && span.firstChild.nodeType === 3) {
      if (range.startContainer === span.firstChild) from = start + range.startOffset;
      if (range.endContainer === span.firstChild) to = start + range.endOffset;
    }
    if (to <= from) continue;
    const value = blocks.get(uuid) ?? { start: Infinity, end: -Infinity };
    value.start = Math.min(value.start, from);
    value.end = Math.max(value.end, to);
    blocks.set(uuid, value);
  }
  return [...blocks].map(([uuid, value]) => {
    const node = nodeByUuid.get(uuid);
    const start = Math.max(0, Math.min(value.start, node.body.markdown.length));
    const end = Math.max(start, Math.min(value.end, node.body.markdown.length));
    return { blockUuid: uuid, sourceId: node.sourceId, contentVersion: node.contentVersion, range: end > start ? { start, end } : null };
  }).filter(item => item.range);
}
