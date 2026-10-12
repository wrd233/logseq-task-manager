import process from 'node:process';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,URL} from 'node:url';

if(process.platform!=='darwin')throw Error('macOS 后台安装器；其他平台可运行 start-collaboration.mjs。');
if(!process.versions.node.startsWith('20.'))throw Error('请用项目的 Node 20 安装后台启动器，DSH 使用自己的 Node 22。');
const label='com.taskcopilot.dsh-collaboration',root=fileURLToPath(new URL('../../../',import.meta.url));
const directory=join(homedir(),'Library/LaunchAgents'),state=process.env.TASK_COPILOT_WORKSPACE_STATE??join(homedir(),'.task-copilot-workspace');
await mkdir(directory,{recursive:true});await mkdir(state,{recursive:true,mode:0o700});
const path=join(directory,`${label}.plist`),xml=s=>s.replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
await writeFile(path,`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(join(root,'apps/dsh-plugin/scripts/start-collaboration.mjs'))}</string><string>--watch</string></array><key>WorkingDirectory</key><string>${xml(root)}</string><key>EnvironmentVariables</key><dict><key>TASK_COPILOT_WORKSPACE_STATE</key><string>${xml(state)}</string></dict><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>StandardOutPath</key><string>${xml(join(state,'starter.log'))}</string><key>StandardErrorPath</key><string>${xml(join(state,'starter.log'))}</string></dict></plist>`,{mode:0o600});
const domain=`gui/${process.getuid()}`;
try{execFileSync('launchctl',['bootout',`${domain}/${label}`],{stdio:'ignore'});}catch{/* First installation has no existing job. */}
execFileSync('launchctl',['bootstrap',domain,path]);
process.stdout.write('本机协作后台启动器已安装；登录后保持工作服务与 DSH 就绪。\n');
