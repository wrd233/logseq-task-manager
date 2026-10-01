export interface LayoutItem { uuid: string; depth: number }
export interface SourceRow extends LayoutItem { content: string; sourceParent?: string | null; missing?: boolean; outside?: boolean }
export interface Semantics { task: string | null; role: string | null; text: string; kind: string; incomplete: boolean; references: string[] }
export function reconcile(items: LayoutItem[], source: SourceRow[]): LayoutItem[];
export function move(items: LayoutItem[], uuid: string, target: string, mode?: string): LayoutItem[];
export function indent(items: LayoutItem[], uuid: string, delta: number): LayoutItem[];
export function parse(content: string): Semantics;
