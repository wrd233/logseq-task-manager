#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { runWorkspaceCli } from "./workspace-cli.ts";
const args=process.argv.slice(2);
process.exitCode=await runWorkspaceCli(args.length ? args : ["workspace","serve"],{out:console.log,err:console.error,readInput:async path=>{
  if(path!=="-")return readFile(path,"utf8");
  const chunks:Buffer[]=[];let size=0;for await(const chunk of process.stdin){const bytes=Buffer.from(chunk);size+=bytes.length;if(size>1_048_576)throw new Error("INPUT_TOO_LARGE");chunks.push(bytes);}return Buffer.concat(chunks).toString("utf8");
}});
