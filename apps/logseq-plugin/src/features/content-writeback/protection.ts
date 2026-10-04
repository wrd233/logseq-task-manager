import { parseFormalAnchor, TASK_MARKERS } from "../../canonical-writing.ts";
import { managedLabels } from "../../writing-convention.ts";
import type { Operation, ProtectedRange, Protection, TextOperation } from "./protocol.ts";
import { fail } from "./validation.ts";

export function propertyLines(content: string): string[] {
  return content.split(/(?<=\n)/u).filter(line => /^\s*[^\s:]+::/u.test(line));
}
export function formalSyntax(content: string): boolean {
  return !!parseFormalAnchor(content) || /^\s*(?:(?:TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+)?(?:\*\*)?\[(?:任务|事务|MiniProject|Project)\]/u.test(content);
}
export function managedSyntax(content: string, properties: Record<string, unknown> = {}): boolean {
  return Object.keys(properties).some(key => key.toLowerCase().startsWith("task-copilot")) ||
    /(?:^|\n)\s*task-copilot[\w-]*::/iu.test(content) ||
    /^\s*>\s*\[Task Copilot\]/u.test(content) ||
    Object.values(managedLabels).some(label => content.trimStart().startsWith(`**[${label}]**`)) ||
    /^\s*(?:标题|状态|当前推进|等待|复查|完成|取消)：/u.test(content);
}
const todoPattern = new RegExp(`^\\s*(?:[-*+]\\s+)?(?:${[...TASK_MARKERS,"WAITING"].join("|")})\\b|^\\s*[-*+]\\s+\\[[ xX]\\]`, "u");
export function todoRanges(content: string): ProtectedRange[] {
  const lines = [...content.matchAll(/[^\n]*(?:\n|$)/gu)].filter(match => match[0]);
  const ranges: ProtectedRange[] = []; let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!, marker = /^\s*(`{3,}|~{3,})/u.exec(line[0]);
    if (marker) { if (!fence) fence = marker[1]![0]!; else if (fence === marker[1]![0]) fence = null; continue; }
    if (fence || !todoPattern.test(line[0])) continue;
    let end = line.index! + line[0].length;
    // A task owns its continuation until an explicit paragraph break or next item.
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j]!;
      if (!next[0].trim() || /^\s*[-*+]\s/u.test(next[0]) || todoPattern.test(next[0])) break;
      end = next.index! + next[0].length;
    }
    ranges.push({ start: line.index!, end, reason: "todo" });
  }
  return ranges;
}
export function protectionFor(content: string, context: { formal: boolean; managed: boolean; ambiguous: boolean; todoAncestor: boolean }): Protection {
  if (context.managed || context.ambiguous) return {
    ranges: [{ start: 0, end: content.length, reason: context.managed ? "managed" : "ambiguous-formal-field" }], insertAllowed: false,
  };
  const ranges: ProtectedRange[] = [];
  let offset = 0;
  for (const line of content.split(/(?<=\n)/u)) {
    if (/^\s*[^\s:]+::/u.test(line)) ranges.push({ start: offset, end: offset + line.length, reason: "property" });
    offset += line.length;
  }
  if (context.formal) ranges.push({ start: 0, end: content.indexOf("\n") < 0 ? content.length : content.indexOf("\n") + 1, reason: "formal-title" });
  if (context.todoAncestor) ranges.push({ start: 0, end: content.length, reason: "todo" });
  const todos = todoRanges(content).filter(range => !context.formal || range.start !== 0);
  ranges.push(...todos);
  return { ranges, insertAllowed: !context.todoAncestor && !todos.length };
}
function touches(op: TextOperation, range: ProtectedRange): boolean {
  return op.range.start === op.range.end ? op.range.start >= range.start && op.range.start < range.end : op.range.start < range.end && op.range.end > range.start;
}
export function assertProtected(base: string, next: string, protection: Protection, operations: readonly TextOperation[], todoAllowed: (op: Operation) => boolean): void {
  for (const op of operations) for (const range of protection.ranges) {
    if (touches(op, range) && !(range.reason === "todo" && todoAllowed(op))) fail(`PROTECTED_${range.reason.toUpperCase().replaceAll("-", "_")}`);
  }
  if (JSON.stringify(propertyLines(base)) !== JSON.stringify(propertyLines(next))) fail("PROTECTED_PROPERTY");
  if (protection.ranges.some(range => range.reason === "formal-title") && base.split("\n")[0] !== next.split("\n")[0]) fail("PROTECTED_FORMAL_TITLE");
  if ((!formalSyntax(base) && formalSyntax(next)) || (!managedSyntax(base) && managedSyntax(next))) fail("FORMAL_PATH_REQUIRED");
  const formal = protection.ranges.some(range => range.reason === "formal-title");
  const beforeTodos = todoRanges(base).filter(range => !formal || range.start !== 0).map(range => base.slice(range.start, range.end));
  const afterTodos = todoRanges(next).filter(range => !formal || range.start !== 0).map(range => next.slice(range.start, range.end));
  if (JSON.stringify(beforeTodos) !== JSON.stringify(afterTodos) && !operations.every(todoAllowed)) fail("TODO_AUTHORIZATION_REQUIRED");
}
export function assertChildContent(content: string, allowTodo: boolean): void {
  if (propertyLines(content).length || formalSyntax(content) || managedSyntax(content)) fail("ORDINARY_CHILD_REQUIRED");
  if (todoRanges(content).length && !allowTodo) fail("TODO_AUTHORIZATION_REQUIRED");
}
