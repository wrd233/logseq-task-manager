import DOMPurify from "dompurify";
import { safeMarkdownURI } from "../materials/links.ts";
import { marked } from "./vendor/marked.js";
import { button, element } from "../../host/panel-host.ts";
import { reviewProblem, type ReviewChange } from "./review-port.ts";
import { textHunks } from "./text-diff.ts";
import { reportMarkdown } from "./report-body.ts";

const displayText=reportMarkdown;
export function renderMarkdown(content:string):string {
  return DOMPurify.sanitize(marked.parse(displayText(content),{breaks:true}) as string,
    {ALLOWED_URI_REGEXP:safeMarkdownURI, FORBID_TAGS:["img","iframe","style","input","button"], FORBID_ATTR:["style"]});
}

/** Decorate safe rendered text nodes without replacing links, code or emphasis. */
export function highlightReview(body:HTMLElement, change:ReviewChange | undefined, content:string):void {
  if (!change || change.before===null || change.after!==content || change.kind!=="modified") return;
  const previous=element("div"); previous.innerHTML=renderMarkdown(change.before);
  const hunks=textHunks(previous.textContent??"",body.textContent??"");
  if (!hunks) return;
  const ranges=hunks.filter(h=>h.afterEnd>h.afterStart), walker=document.createTreeWalker(body,4);
  const nodes:Text[]=[]; let node:Node|null;
  while ((node=walker.nextNode())) nodes.push(node as Text);
  let offset=0;
  for (const node of nodes) {
    const text=node.data, end=offset+text.length, overlapping=ranges.filter(h=>h.afterStart<end && h.afterEnd>offset);
    if (overlapping.length) {
      const fragment=document.createDocumentFragment(); let cursor=0;
      for (const range of overlapping) {
        const start=Math.max(0,range.afterStart-offset), stop=Math.min(text.length,range.afterEnd-offset);
        fragment.append(document.createTextNode(text.slice(cursor,start)));
        const mark=element("mark",text.slice(start,stop),"wb-review-insert"); fragment.append(mark); cursor=stop;
      }
      fragment.append(document.createTextNode(text.slice(cursor))); node.replaceWith(fragment);
    }
    offset=end;
  }
}

export function renderReviewInfo(container:HTMLElement, change:ReviewChange, options:{historical:boolean; current:string; correct:()=>void; suggest:()=>void; parentName:(uuid:string|null)=>string}):void {
  const label=element("span",change.label.split(" · ")[0]);
  const details=element("details"), summary=element("summary","旧文与说明");
  const old=change.before===null?"当时没有此块":displayText(change.before);
  details.append(summary,element("small",change.label));
  if (change.before!==null) {
    const before=element("div","","wb-review-old");before.innerHTML=renderMarkdown(change.before);details.append(before);
  } else details.append(element("p",old));
  const metadata=element("details");metadata.append(element("summary","版本与来源详情"),element("small",`正文版本：${change.version??"不可用"}`));details.append(metadata);
  container.replaceChildren(label);
  if (change.location) {
    const location=(p:{parentUuid:string|null;order:number;depth:number})=>`${options.parentName(p.parentUuid)} · 第 ${p.order+1} 块 · 深度 ${p.depth}`;
    container.append(element("small",`位置：${location(change.location.before)} → ${location(change.location.after)}`));
  }
  if (change.kind!=="removed") container.append(button(options.historical?"重新读取当前原文并纠正":"纠正",options.correct));
  if (!options.historical && change.kind!=="removed") container.append(button("原文建议",options.suggest));
  if (change.kind==="modified" && change.before!==null && change.after!==null) {
    const a=element("div"),b=element("div");a.innerHTML=renderMarkdown(change.before);b.innerHTML=renderMarkdown(change.after);
    const hunks=textHunks(a.textContent??"",b.textContent??"");
    const deleted=hunks?.filter(h=>h.beforeEnd>h.beforeStart)??[];
    if (deleted.length) {
      const excerpts=deleted.slice(0,8).map(h=>(a.textContent??"").slice(h.beforeStart,h.beforeEnd)).join(" · ");
      const removals=element("details");removals.append(element("summary",`删除或替换 ${deleted.length} 处`),element("del",excerpts));container.append(removals);
    } else if (!hunks || !hunks.length) container.append(element("small",hunks?"格式或链接目标有变化，展开旧文核对。":"文字变化较多，展开旧文核对。"));
  }
  container.append(details);
  if(change.problem){container.append(element("small",reviewProblem(change.problem),"wb-error"));metadata.append(element("pre",change.problem));}
  if((change.submitted || change.after!==options.current) && !options.historical){
    const submitted=element("details");submitted.append(element("summary","当时提交的结果"),element("pre",(change.submitted?change.submitted.content:change.after)??"当时没有可读结果"));
    container.append(element("small","当前原文已不同于当时结果；纠正将重新读取当前版本。"),submitted);
  }
}
