import { sha256 } from "./workspace/source-protocol.ts";
import { readOptionalPrivateItem } from "./private-storage.ts";

interface Storage { getItem(key:string):Promise<unknown>;setItem(key:string,text:string):Promise<unknown> }
const prefix="task-copilot-scoped-v1-";
export class PrivateWriteUnconfirmedError extends Error { constructor(cause?:unknown){super(`PRIVATE_STORAGE_WRITE_UNCONFIRMED${cause instanceof Error?`: ${cause.message}`:""}`,{cause});} }
export async function scopedPrivateKey(key:string,graphId:string|null):Promise<string>{return prefix+await sha256(JSON.stringify([key,graphId]));}
/** Bounded filenames; exact identity stays in the verified private payload.
 * Empty v1 values are tombstones and must not resurrect a legacy pending call. */
export async function readScopedPrivateItem(storage:Storage,key:string,graphId:string|null,check:()=>void=()=>{}):Promise<unknown>{
  const path=await scopedPrivateKey(key,graphId);check();const raw=await readOptionalPrivateItem(storage,path);check();
  if(raw!==null&&raw!==undefined){
    if(typeof raw!=="string")throw Error("SCOPED_PRIVATE_STATE_INVALID");
    let value:unknown;try{value=JSON.parse(raw);}catch{throw Error("SCOPED_PRIVATE_STATE_INVALID");}
    if(!value||typeof value!=="object"||Array.isArray(value))throw Error("SCOPED_PRIVATE_STATE_INVALID");
    const v=value as Record<string,unknown>;
    if(Object.keys(v).some(k=>!["schemaVersion","key","graphId","text"].includes(k))||v.schemaVersion!==1||v.key!==key||v.graphId!==graphId||typeof v.text!=="string")throw Error("SCOPED_PRIVATE_STATE_INVALID");return v.text;
  }
  const legacy=`${key}:${encodeURIComponent(graphId??"")}`;
  // These names cannot exist on the observed Desktop filesystem. Do not cause
  // ENAMETOOLONG trying to read a legacy record which could never be saved.
  if(new TextEncoder().encode(legacy).length>255)return null;
  check();const old=await readOptionalPrivateItem(storage,legacy);check();if(old!==null&&old!==undefined&&typeof old!=="string")throw Error("SCOPED_PRIVATE_STATE_INVALID");return old;
}
export async function writeScopedPrivateItem(storage:Storage,key:string,graphId:string|null,text:string,check:()=>void=()=>{}):Promise<void>{
  const path=await scopedPrivateKey(key,graphId),raw=JSON.stringify({schemaVersion:1,key,graphId,text});check();
  try{await storage.setItem(path,raw);}catch(error){throw new PrivateWriteUnconfirmedError(error);}check();
  let observed:unknown;try{observed=await readOptionalPrivateItem(storage,path);}catch(error){throw new PrivateWriteUnconfirmedError(error);}check();
  if(observed!==raw)throw new PrivateWriteUnconfirmedError();
}
