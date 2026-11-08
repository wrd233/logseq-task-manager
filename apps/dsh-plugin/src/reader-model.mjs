import { marked } from '../../logseq-plugin/src/features/work-view/vendor/marked.js';
import { WorkspaceError } from '@task-copilot/contracts';

const labels = new Map([['注', 'note'], ['结论', 'conclusion'], ['待确认', 'pending'], ['风险', 'risk']]);
const statusPattern = /^(TODO|DOING|DONE|NOW|LATER|WAITING|CANCELED|CANCELLED)(?=\s|$)[ \t]*/u;

export function readerBody(content) {
  const properties = [], lines = [];
  let fence;
  for (const line of (content ?? '').split(/\r?\n/u)) {
    const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    if (delimiter) {
      if (!fence) fence = delimiter[1];
      else if (delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length && !delimiter[2].trim()) fence = undefined;
      lines.push(line);
      continue;
    }
    const property = !fence && /^ {0,3}([\p{L}\p{N}_-]+)::[ \t]*(.*)$/u.exec(line);
    if (!property) lines.push(line);
    else if (property[1].toLowerCase() !== 'id') properties.push({ name: property[1], value: property[2] });
  }
  const status = statusPattern.exec(lines[0]);
  if (status) lines[0] = lines[0].slice(status[0].length);
  const marker = /^(?:\*\*\[([^\]]+)\]\*\*|\[([^\]]+)\](?![([]))[ \t]*/u.exec(lines[0]);
  const label = marker?.[1] ?? marker?.[2];
  const semantic = labels.has(label) ? { kind: labels.get(label), label } : null;
  if (semantic) lines[0] = lines[0].slice(marker[0].length);
  return { markdown: lines.join('\n'), properties, status: status?.[1] ?? null, semantic };
}

const lexerOptions = {
  ...marked.defaults,
  extensions: {
    inline: [function (source) {
      const match = /^\[\[([^\][\n]+)\]\]/u.exec(source);
      if (match) return { type: 'logseqPage', raw: match[0], page: match[1] };
    }],
    startInline: [source => source.indexOf('[[')],
  },
};

function tokens(markdown) {
  // A fresh lexer owns reference links and other per-document state.
  return marked.Lexer.lex(markdown, {...lexerOptions});
}

export const blockUrl = (graphId, blockUuid) => `logseq://graph/${encodeURIComponent(graphId.split(':')[0])}?block-id=${encodeURIComponent(blockUuid)}`;

export function readerModel(snapshot, workRef, { includeTokens = true } = {}) {
  const { scope, capturedAt, sourceSetVersion, structureVersion } = snapshot;
  return { scope, workRef, capturedAt, sourceSetVersion, structureVersion,
    nodes: snapshot.blocks.map(({ content, ...block }) => {
      const body = readerBody(content);
      return { ...block, blockUuid: block.target.blockUuid, logseqUrl: blockUrl(scope.graphId, block.target.blockUuid),
        body: includeTokens ? { ...body, tokens: tokens(body.markdown) } : body };
    }) };
}

export function readerReferences(reader, selections) {
  if (!Array.isArray(selections) || selections.length < 1 || selections.length > 64) throw new WorkspaceError('REFERENCE_SELECTION_INVALID');
  const nodes = new Map(reader.nodes.map(node => [node.sourceId, node]));
  let total = 0;
  return selections.map(selection => {
    if (!selection || typeof selection !== 'object') throw new WorkspaceError('REFERENCE_SELECTION_INVALID');
    const { sourceId, contentVersion, range } = selection;
    const node = nodes.get(sourceId);
    if (!node || node.availability !== 'available') throw new WorkspaceError('SOURCE_OUTSIDE_SCOPE');
    if (contentVersion !== node.contentVersion) throw new WorkspaceError('REFERENCE_SOURCE_CHANGED');
    const markdown = node.body.markdown;
    if (range !== undefined && (!range || !Number.isInteger(range.start) || !Number.isInteger(range.end) ||
        range.start < 0 || range.end <= range.start || range.end > markdown.length)) throw new WorkspaceError('REFERENCE_SELECTION_INVALID');
    const excerpt = range ? markdown.slice(range.start, range.end) : markdown;
    total += excerpt.length;
    if (total > 64_000) throw new WorkspaceError('REFERENCE_SELECTION_INVALID');
    const workTitle = reader.nodes.find(item => item.blockUuid === reader.scope.rootUuid)?.body.markdown.replace(/^\[[^\]]+\]\s*/u, '').split('\n')[0] ?? '当前工作';
    return { workTitle, sourceId, blockUuid: node.blockUuid, graphId: reader.scope.graphId, workRef: reader.workRef, contentVersion,
      logseqUrl: node.logseqUrl, range: range ? {start: range.start, end: range.end} : null, excerpt };
  });
}
