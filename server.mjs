import http from 'node:http';import {readFile,appendFile} from 'node:fs/promises';
const {port,token}=JSON.parse(await readFile(new URL('./runtime.json',import.meta.url),'utf8'));const commands=new Set(),viewOps=new Set();const peers=new Set();let snapshot=null;let telemetry=[],acks=[],commandResults=[],viewResults=[];
const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1');res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Cache-Control','no-store');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return}
  if(u.pathname==='/'||u.pathname==='/external.js'){const filename=u.pathname==='/'?'external.html':'external.js';res.setHeader('Content-Type',filename.endsWith('.js')?'text/javascript':'text/html');res.end(await readFile(new URL('./dist/'+filename,import.meta.url)));return}
  if(req.headers.authorization!=='Bearer '+token&&u.searchParams.get('token')!==token){res.writeHead(401);res.end();return}
  if(req.method==='GET'&&u.pathname==='/commands'){res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});commands.add(res);req.on('close',()=>commands.delete(res));return}
  if(req.method==='GET'&&u.pathname==='/view-ops'){res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});viewOps.add(res);req.on('close',()=>viewOps.delete(res));return}
  if(req.method==='GET'&&u.pathname==='/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});peers.add(res);if(snapshot)res.write('data: '+JSON.stringify(snapshot)+'\n\n');req.on('close',()=>peers.delete(res));return}
  if(req.method==='GET'&&u.pathname==='/inspect'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({snapshot,telemetry,acks,commandResults,viewResults,commands:commands.size,viewOps:viewOps.size,peers:peers.size}));return}
  if(req.method==='POST'&&['/snapshot','/telemetry','/ack','/command','/command-result','/view-ops','/view-result'].includes(u.pathname)){
    let body='';for await(const chunk of req){body+=chunk;if(body.length>2_000_000){res.writeHead(413);res.end();return}}let data;try{data=JSON.parse(body)}catch{res.writeHead(400);res.end();return}
    if(u.pathname==='/command'){if(!commands.size){res.writeHead(503);res.end();return}for(const peer of commands)peer.write('data: '+JSON.stringify(data)+'\n\n')}
    if(u.pathname==='/view-ops'){if(!viewOps.size){res.writeHead(503);res.end();return}for(const peer of viewOps)peer.write('data: '+JSON.stringify(data)+'\n\n')}
    if(u.pathname==='/view-result'){viewResults.push(data);viewResults=viewResults.slice(-100)}
    if(u.pathname==='/command-result'){commandResults.push(data);commandResults=commandResults.slice(-50)}
    if(u.pathname==='/snapshot'){if(!snapshot||data.instance!==snapshot.instance||data.seq>snapshot.seq){snapshot=data;for(const peer of peers)peer.write('data: '+JSON.stringify(snapshot)+'\n\n')}}
    if(u.pathname==='/telemetry'){telemetry.push(data);telemetry=telemetry.slice(-300)}
    if(u.pathname==='/ack'){acks.push(data);acks=acks.slice(-500)}
    res.writeHead(204);res.end();return
  }res.writeHead(404);res.end();
});
server.listen(port,'127.0.0.1',()=>console.log(`Preview relay listening on 127.0.0.1:${port} (content in memory only)`));
