import DOMPurify from "dompurify";
import { marked } from "../work-view/vendor/marked.js";
import { button, element } from "../../host/panel-host.ts";
import { safeMarkdownURI } from "./links.ts";
import type { MaterialRole } from "./store.ts";
export const roleLabel = (role?: MaterialRole): string => ({reference: "参考资料", input: "原始输入", draft: "工作稿", output: "生成文档"})[role ?? "input"];
export function renderReading(text: string): HTMLElement {
  const article = element("article", "", "wb-reading");
  article.innerHTML = DOMPurify.sanitize(marked.parse(text) as string, {ALLOWED_URI_REGEXP: safeMarkdownURI});
  return article;
}
const prompts = new Map<HTMLElement, Set<(restore?: boolean) => void>>();
export function closeMaterialPrompts(parent: HTMLElement): void { for(const close of prompts.get(parent) ?? []) close(false); prompts.delete(parent); }
function promptSurface(parent: HTMLElement, title: string) {
  const dialog=element("dialog","","wb-dialog"), form=element("form","","wb-material-form"), heading=element("h3",title);
  dialog.setAttribute("aria-label",title);form.append(heading);dialog.append(form);parent.append(dialog);
  const previous=document.activeElement as HTMLElement|null;
  const owners=prompts.get(parent)??new Set<(restore?:boolean)=>void>();prompts.set(parent,owners);
  const remove=(restore:boolean)=>{owners.delete(close);if(!owners.size)prompts.delete(parent);dialog.remove();if(restore&&previous?.isConnected&&!previous.closest("[hidden]"))previous.focus({preventScroll:true});};
  let onClose=()=>{},closed=false;const close=(restore=true)=>{if(closed)return;closed=true;remove(restore);onClose();};owners.add(close);
  return {dialog,form,close,onClose:(action:()=>void)=>{onClose=action;},show:()=>{try{dialog.showModal();}catch{dialog.open=true;}}};
}
/** Multi-field decisions use the shared dialog; no form is inserted above the file list. */
export function materialPrompt(parent: HTMLElement, label: string, initial = "", multiline = false, beforeSubmit?: (text: string) => void): Promise<string | null> {
  return new Promise(resolve => {
    const surface=promptSurface(parent,label), {form,dialog}=surface, caption=element("label",label);
    const input=multiline?element("textarea"):element("input");input.value=initial;input.setAttribute("aria-label",label);
    if(input.tagName==="TEXTAREA")(input as HTMLTextAreaElement).rows=12;
    const submit=button("保存",()=>{});submit.type="submit";submit.className="wb-primary";
    const problem=element("p","","wb-error");problem.hidden=true;problem.setAttribute("role","status");
    let value:string|null=null,composing=false;
    surface.onClose(()=>resolve(value));input.addEventListener("compositionstart",()=>{composing=true;});input.addEventListener("compositionend",()=>{composing=false;});
    dialog.oncancel=event=>{event.preventDefault();if(!composing)surface.close();};
    input.addEventListener("keydown",event=>{const key=event as KeyboardEvent;if(key.key==="Enter"&&(composing||key.isComposing))event.preventDefault();});
    form.onsubmit=event=>{
      event.preventDefault();if(composing||!input.value.trim())return;
      try{beforeSubmit?.(input.value);value=input.value;surface.close();}
      catch{problem.hidden=false;problem.textContent="恢复缓存暂不可写，输入仍保留。请释放空间后重试。";}
    };
    const footer=element("footer");footer.append(button("取消",()=>surface.close()),submit);caption.append(input);form.append(caption,problem,footer);surface.show();input.focus();
  });
}
/** IO errors stay next to the retained input; a closed scope cannot steal focus later. */
export function materialAction(parent: HTMLElement, label: string, initial: string, description: string, action: (value: string) => Promise<void>, allowEmpty = false): Promise<void> {
  return new Promise(resolve => {
    const surface=promptSurface(parent,label), {form,dialog}=surface, caption=element("label",label),input=element("input");
    input.value=initial;input.setAttribute("aria-label",label);caption.append(input);
    const submit=button("保存",()=>{});submit.type="submit";submit.className="wb-primary";
    const cancel=button("取消",()=>{if(!submit.disabled)surface.close();});
    const problem=element("p","","wb-error");problem.hidden=true;problem.setAttribute("role","status");
    const footer=element("footer");footer.append(cancel,submit);form.append(caption,element("small",description),problem,footer);
    let composing=false;surface.onClose(resolve);
    input.addEventListener("compositionstart",()=>{composing=true;});input.addEventListener("compositionend",()=>{composing=false;});
    input.addEventListener("keydown",event=>{const key=event as KeyboardEvent;if(key.key==="Enter"&&(composing||key.isComposing))event.preventDefault();});
    dialog.oncancel=event=>{event.preventDefault();if(!composing&&!submit.disabled)surface.close();};
    form.onsubmit=event=>{
      event.preventDefault();if(submit.disabled||composing||!allowEmpty&&!input.value.trim())return;
      submit.disabled=cancel.disabled=input.readOnly=true;problem.hidden=true;
      void action(input.value).then(()=>surface.close()).catch(error=>{
        if(!dialog.isConnected)return;
        submit.disabled=cancel.disabled=input.readOnly=false;problem.textContent=error instanceof Error?error.message:String(error);problem.hidden=false;input.focus();
      });
    };
    surface.show();input.focus();input.select();
  });
}

/** A single-field filename edit belongs to its file row, including errors and the unsaved draft. */
export function inlineMaterialRename(parent: HTMLElement, initial: string, description: string, action: (value: string) => Promise<void>, cancelled: (restore:boolean) => void) {
  const form=element("form","","wb-material-rename"), label=element("label","文件名称（保留扩展名）"), input=element("input");
  input.value=initial; input.setAttribute("aria-label","文件名称（保留扩展名）"); input.setAttribute("title",description); label.append(input);
  const save=button("保存",()=>{});save.type="submit";save.className="wb-primary";
  const cancel=button("取消",()=>finish()), error=element("p","","wb-error");error.hidden=true;error.setAttribute("role","status");
  form.append(label,save,cancel,error);parent.prepend(form);
  let composing=false,done=false,resolve!:()=>void;
  const finished=new Promise<void>(complete=>{resolve=complete;});
  const finish=(restore=true)=>{if(done)return;done=true;form.remove();cancelled(restore);resolve();};
  input.addEventListener("compositionstart",()=>{composing=true;});input.addEventListener("compositionend",()=>{composing=false;});
  input.addEventListener("keydown",event=>{if(event.key==="Enter"&&(event.isComposing||composing))event.preventDefault();});
  form.addEventListener("keydown",event=>{if(event.key==="Escape"&&!event.isComposing&&!composing&&!(event.target as HTMLElement).closest("input,textarea")){event.preventDefault();event.stopPropagation();finish();}});
  form.onsubmit=event=>{
    event.preventDefault();if(done||composing||save.disabled||!input.value.trim())return;
    save.disabled=cancel.disabled=input.readOnly=true;error.hidden=true;
    void action(input.value).then(()=>finish()).catch(problem=>{
      if(done||!form.isConnected)return;
      save.disabled=cancel.disabled=input.readOnly=false;error.textContent=problem instanceof Error?problem.message:String(problem);error.hidden=false;input.focus({preventScroll:true});
    });
  };
  input.focus({preventScroll:true});input.select();return{finished,cancel:finish};
}
