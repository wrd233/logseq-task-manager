import type { SourceScope } from "../../workspace/source-protocol.ts";
import type { ReadingPlan } from "./reading-plan.ts";

export interface SavedReadingView { plan:ReadingPlan; revision:number; previous?:ReadingPlan }
export interface SavedReadingViews { schemaVersion:1; mode:"report"|"structure"; selected:string|null; views:SavedReadingView[] }
export interface ReadingStorage { getItem(key:string):string|null; setItem(key:string,value:string):void }
/** Local presentation metadata only: source text stays in Logseq. */
export class ReadingViewStore {
  constructor(private readonly storage:ReadingStorage) {}
  private key(scope:SourceScope):string {return `workbench:reading-views:${JSON.stringify([scope.graphId,scope.rootUuid,scope.kind??"block",scope.pageName??null])}`;}
  load(scope:SourceScope):SavedReadingViews|null {
    try {const raw=this.storage.getItem(this.key(scope));if(!raw)return null;const value=JSON.parse(raw) as SavedReadingViews;
      return value.schemaVersion===1&&Array.isArray(value.views)?value:null;
    }catch{return null;}
  }
  save(scope:SourceScope,value:SavedReadingViews):void {this.storage.setItem(this.key(scope),JSON.stringify(value));}
}
