export const levels: string[];
export function displayLevel(content: string, override?: string, options?: {root?: boolean; missing?: boolean}): {level: string; reason: string};
export function savedLevels(value: unknown): Record<string, string>;
