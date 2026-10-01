declare module "turndown" {
  export default class TurndownService {
    constructor(options?: {headingStyle?: string; codeBlockStyle?: string});
    use(plugin: unknown): void;
    turndown(html: string): string;
  }
}
declare module "turndown-plugin-gfm" { export const gfm: unknown; }
