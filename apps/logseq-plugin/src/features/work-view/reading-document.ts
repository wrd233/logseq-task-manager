import type { ReadingUnit, VerifiedReadingPlan } from "./reading-plan.ts";

/** Portable projection of the Logseq layout for the DSH client. */
export interface ReadingDocumentUnit {
  key:string; kind:ReadingUnit["kind"]; title?:string; sourceIds?:string[]; contextSourceIds:string[];
  children?:ReadingDocumentUnit[]; columns?:Array<{key:string;title:string;contextSourceIds:string[];children:ReadingDocumentUnit[]}>; materialId?:string;
}
export function readingDocument(reading:VerifiedReadingPlan):ReadingDocumentUnit[] {
  const context=(key:string,inherited:ReadonlySet<string>)=>(reading.contexts.get(key)??[]).filter(id=>!inherited.has(id));
  const unit=(value:ReadingUnit,inherited:ReadonlySet<string>):ReadingDocumentUnit=>{
    const contextSourceIds=context(value.key,inherited),next=new Set([...inherited,...contextSourceIds]);
    const base={key:value.key,kind:value.kind,contextSourceIds};
    if(value.kind==="sequence"||value.kind==="paragraphs")return {...base,sourceIds:value.sourceIds};
    if(value.kind==="material")return {...base,materialId:value.materialId};
    if(value.kind==="group")return {...base,title:value.title,children:value.children.map(child=>unit(child,next))};
    return {...base,title:value.title,columns:value.columns.map(column=>{
      const contextSourceIds=context(column.key,next),inherited=new Set([...next,...contextSourceIds]);
      return {key:column.key,title:column.title,contextSourceIds,children:column.children.map(child=>unit(child,inherited))};
    })};
  };
  return reading.plan.layout.map(value=>unit(value,new Set()));
}
