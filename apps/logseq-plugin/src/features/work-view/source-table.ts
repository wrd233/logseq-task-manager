export interface SourceTable { headers: string[]; rows: string[][] }

export function sourceTable(content: string): SourceTable | null {
  const lines = content.split("\n");
  const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim());
  for (let index = 1; index < lines.length; index++) {
    const divider = lines[index]!;
    if (!divider.includes("|") || !cells(divider).every(cell => /^:?-{3,}:?$/.test(cell))) continue;
    const headers = cells(lines[index - 1]!);
    if (headers.length < 2 || headers.length !== cells(divider).length) continue;
    const rows: string[][] = [];
    for (const line of lines.slice(index + 1)) {
      if (!line.includes("|") || cells(line).length !== headers.length) break;
      rows.push(cells(line));
    }
    if (rows.length) return { headers, rows };
  }
  return null;
}

export function numericSeries(table: SourceTable) {
  if (table.rows.length > 8 || table.headers.length > 4) return [];
  return table.headers.slice(1).flatMap((label, index) => {
    const values = table.rows.map(row => row[index + 1]!);
    const matches = values.map(value => /^(\d+(?:\.\d+)?)\s*([^\d\s]*)$/.exec(value));
    if (matches.some(match => !match) || new Set(matches.map(match => match?.[2])).size !== 1) return [];
    const numbers = matches.map(match => Number(match![1]));
    const max = Math.max(...numbers);
    return [{label, points: table.rows.map((row, rowIndex) => ({label: row[0]!, value: values[rowIndex]!, ratio: max ? numbers[rowIndex]! / max : 0}))}];
  });
}
