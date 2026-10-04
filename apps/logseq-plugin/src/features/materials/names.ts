/** Names are presentation and paths; never material identity. Keep the real extension. */
export function fileName(path: string): string { return path.slice(path.lastIndexOf("/") + 1); }
export function extension(path: string): string { return /\.[^.]+$/.exec(fileName(path))?.[0] ?? ""; }
export function fileTitle(path: string): string { const name = fileName(path); return name.slice(0, name.length - extension(path).length) || name; }
export function renamedPath(path: string, name: string): string {
  if (typeof name !== "string" || name !== name.trim() || !name || name.length > 180 || /^[.]/.test(name) || Array.from(name).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || /[/\\:*?"<>|]/.test(name) || /[. ]$/.test(name)) throw new Error("请输入名称部分，不能包含路径、控制字符或末尾空格。扩展名会保留。");
  return `${path.slice(0, path.lastIndexOf("/"))}/${name}${extension(path)}`;
}
