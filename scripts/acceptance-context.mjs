// Explicit selection of an owned development or outside-repository ZIP instance.
// This changes helper paths only; it never grants plugin capabilities.
import {readFileSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import process from 'node:process';
const sha=value=>createHash('sha256').update(value).digest('hex');
export function acceptanceRoot(repo) {
  const index=process.argv.indexOf('--package');
  if(index<0)return join(repo,'tmp/reading-desktop');
  const name=process.argv[index+1];if(!name||!/^[a-z][a-z0-9-]{3,70}$/u.test(name))throw Error('Explicit owned package instance name required');
  const root=join(homedir(),'Library/Caches/task-copilot-package-acceptance',name),m=JSON.parse(readFileSync(join(root,'manifest.json')));
  if(realpathSync(root)!==root||m.root!==root||!m.ownerToken||m.plugin!==join(root,'installation/task-copilot-workbench'))throw Error('Owned package identity required');
  for(const key of ['graph','work','home','profile','channel','evidence'])if(m[key]!==join(root,key)||realpathSync(m[key])!==m[key])throw Error('Owned package paths changed');
  const identity=JSON.parse(readFileSync(join(m.plugin,'build-identity.json')));
  if(identity.builtFromDirtyTree||identity.commit!==m.identity.commit||sha(readFileSync(join(root,'installation.zip')))!==m.zipHash)throw Error('Actual clean package identity changed');
  for(const [path,hash]of Object.entries(identity.files)){
    const actual=resolve(m.plugin,path);if(!path.startsWith('dist/')||path.split('/').includes('..')||realpathSync(actual)!==actual||sha(readFileSync(actual))!==hash)throw Error('Installed package resource changed');
  }
  return root;
}
export function acceptancePlugin(m,repo) {return m.ownerToken?m.plugin===join(m.root,'installation/task-copilot-workbench'):m.plugin.startsWith(repo+'/apps/');}
export function acceptanceRuntime(m) {return m.ownerToken?{developmentDirectory:false,outsideRepository:true,commit:m.identity.commit,zipHash:m.zipHash}:{developmentDirectory:true,outsideRepository:false};}
