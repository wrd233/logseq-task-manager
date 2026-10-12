import DOMPurify from "dompurify";
import { safeMarkdownURI } from "../materials/links.ts";
import { marked } from "./vendor/marked.js";
import { reportMarkdown } from "./report-body.ts";

/** Shared Markdown presentation; no host actions or editor state. */
export function renderMarkdown(content:string):string {
  return DOMPurify.sanitize(marked.parse(reportMarkdown(content),{breaks:true}) as string,
    {ALLOWED_URI_REGEXP:safeMarkdownURI,FORBID_TAGS:["img","iframe","style","input","button"],FORBID_ATTR:["style"]});
}
