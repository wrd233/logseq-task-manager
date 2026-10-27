import type { BlockSnapshot } from '../../workspace/source-protocol.ts';
// These are literal Logseq source annotations, not Kernel status/dependency facts.
export function annotations(block:BlockSnapshot):{status:string|null;dependencies:string[]}{
  const text=block.content??'';
  const status=/^(?:#{1,6}\s+)?(TODO|DOING|DONE|NOW|LATER|WAITING|CANCELED|CANCELLED)\b/u.exec(text)?.[1]??null;
  const line=/^depends-on::[ \t]*(.*)$/mu.exec(text)?.[1]??'';
  return {status,dependencies:[...new Set([...line.matchAll(/\(\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)\)/giu)].map(m=>m[1]!.toLowerCase()))].sort()};
}
