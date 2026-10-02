import DOMPurify from "dompurify";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
const converter = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
converter.use(gfm);
export function captureMarkdown(text: string, html: string): string {
  return html && !/^\s{0,3}(#{1,6}\s|```|~~~)/m.test(text) ? converter.turndown(DOMPurify.sanitize(html)) || text : text;
}
