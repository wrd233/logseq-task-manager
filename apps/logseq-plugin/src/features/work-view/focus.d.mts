export interface ObjectLabel { type: string; title: string }
export interface ObjectCrumb extends ObjectLabel { uuid: string }
export interface Trace { path: string[]; objects: ObjectCrumb[]; complete: boolean }
export interface AncestryBlock { uuid?: string; content?: string; parent?: {id?: number | string; uuid?: string}; page?: {id?: number | string} }
export function workObject(content?: string): ObjectLabel | null;
export function ancestry(uuid: string, getBlock: (id: number | string) => Promise<AncestryBlock | null>, options?: {limit?: number; resolve?: (uuid: string, content: string) => ObjectLabel | null}): Promise<Trace>;
export function clickDecision(state: {root: string | null; held: string | null}, trace: Trace): {action: string; uuid?: string; reason: string; release?: boolean};
