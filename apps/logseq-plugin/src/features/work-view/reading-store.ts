import type { SourceScope, SourceSnapshot } from "../../workspace/source-protocol.ts";
import type { ReadingPlan } from "./reading-plan.ts";
import type { ReadingMaterial } from "./reading-layout.ts";

export interface SavedReadingView { plan:ReadingPlan; revision:number; previous?:ReadingPlan; basis?:SourceSnapshot|undefined; previousBasis?:SourceSnapshot|undefined; materialBasis?:ReadingMaterial[]|undefined; previousMaterialBasis?:ReadingMaterial[]|undefined }
export interface SavedReadingViews { schemaVersion:1; mode:"report"|"structure"; selected:string|null; views:SavedReadingView[] }
export interface ReadingStorage { getItem(key:string):string|null; setItem(key:string,value:string):void }
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
