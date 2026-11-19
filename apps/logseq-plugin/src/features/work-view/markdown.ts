import DOMPurify from "dompurify";
import { safeMarkdownURI } from "../materials/links.ts";
import { Marked, marked } from "./vendor/marked.js";
import { reportMarkdown } from "./report-body.ts";

const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const pageMarkdown = new Marked({ extensions: [{
  name: "logseqPageReference",
  level: "inline",
  start: source => source.indexOf("[["),
  tokenizer(source) {
    if (this.lexer.state.inLink) return;
    const match = /^\[\[([^\[\]\r\n]+)\]\]/u.exec(source);
    const name = match?.[1]?.trim();
    if (match && name) return { type: "logseqPageReference", raw: match[0], text: name };
  },
  renderer(token) {
    const name = token.text.replace(/[&<>"']/gu, char => entities[char]!);
    return `<a href="#logseq-page" data-wb-page-reference="${name}">${name}</a>`;
  },
}] });

/** Markdown is sanitized before use. The work view owns page-reference navigation. */
export function renderMarkdown(content: string, pageReferences = false): string {
  const parser = pageReferences && content.includes("[[") ? pageMarkdown : marked;
  return DOMPurify.sanitize(parser.parse(reportMarkdown(content), { breaks: true }) as string,
    { ALLOWED_URI_REGEXP: safeMarkdownURI, FORBID_TAGS: ["img", "iframe", "style", "input", "button"], FORBID_ATTR: ["style"] });
}
