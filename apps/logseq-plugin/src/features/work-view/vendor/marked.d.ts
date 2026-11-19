interface ParseOptions { breaks?: boolean; gfm?: boolean }
interface InlineToken { type: string; raw: string; text: string }
interface InlineExtension {
  name: string;
  level: "inline";
  start(source: string): number;
  tokenizer(this: {lexer: {state: {inLink: boolean}}}, source: string): InlineToken | undefined;
  renderer(token: InlineToken): string;
}
export const marked: { parse(content: string, options?: ParseOptions): string | Promise<string> };
export class Marked {
  constructor(options: { extensions: InlineExtension[] });
  parse(content: string, options?: ParseOptions): string | Promise<string>;
}
