import { lstat, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { workKey } from '@task-copilot/contracts';
import { authorizedRoot, discoverFiles, scopedPath } from '../../../task-copilot-cli/src/workspace-files.ts';
import { fail, object, text } from './model.mjs';

async function localMaterial(locator) {
  if (!isAbsolute(locator)) return null;
  try {
    const path = await realpath(locator);
    if (path !== resolve(locator)) return null;
    const info = await lstat(path);
    return info.isDirectory() ? 'folder' : info.isFile() ? 'file' : null;
  } catch {
    return null;
  }
}

export function inboxMaterialRoutes({store, catalog, workspaces, nativePicker, openPath}) {
  async function locations() {
    const known = new Map();
    for (const work of await catalog()) {
      if (work.directory) known.set(work.directory, {key:workKey(work.workRef), title:work.title, path:work.directory, context:'工作材料'});
    }
    const registered = workspaces().map(workspace => {
      const row = known.get(workspace.path);
      known.delete(workspace.path);
      return row ?? {key:workspace.id, title:workspace.title, path:workspace.path, context:'DSH 工作区'};
    });
    return [...registered,...known.values()];
  }
  async function rootFor(key) {
    const location = (await locations()).find(row => row.key === key);
    if (!location) fail('INBOX_LOCATION_UNAVAILABLE');
    const root = await authorizedRoot(location.path).catch(()=>fail('INBOX_LOCATION_UNAVAILABLE'));
    return {location,root};
  }
  async function savedMaterial(input) {
    const item = await store.get(input.id);
    if (item.revision !== input.revision) fail('INBOX_CONFLICT');
    const material = Number.isInteger(input.index) && item.materials[input.index];
    if (!material) fail('INBOX_LOCATION_UNAVAILABLE');
    return material;
  }
  return {
    'inbox-locations': async input => {
      object(input, []);
      return {
        rows:(await locations()).map(({key,title,context})=>({key,title,context})),
        native:Boolean(nativePicker()),
      };
    },
    'inbox-location-files': async input => {
      object(input, ['key']);
      const {root} = await rootFor(input.key);
      const result = await discoverFiles(root,[]);
      return {
        rows:result.files.filter(row=>row.kind==='file'&&row.availability==='available').map(row=>({
          key:row.path, title:basename(row.path), context:dirname(row.path)==='.'?'':basename(dirname(row.path)),
        })),
        limited:result.truncated.length>0,
      };
    },
    'inbox-location-material': async input => {
      object(input, ['key','file']);
      const {location,root} = await rootFor(input.key);
      if (input.file===undefined) return {label:location.title.slice(0,300),locator:root};
      const file = await scopedPath(root,text(input.file,4096)).catch(()=>fail('INBOX_LOCATION_UNAVAILABLE'));
      if (await localMaterial(file)!=='file') fail('INBOX_LOCATION_UNAVAILABLE');
      return {label:basename(file),locator:file};
    },
    'inbox-pick-folder': async (input, signal) => {
      object(input, []);
      const picker = nativePicker();
      if (!picker) fail('INBOX_NATIVE_PICKER_UNAVAILABLE');
      const path = await picker.pick(signal);
      if (!path) return null;
      const locator = await realpath(path).catch(()=>fail('INBOX_LOCATION_UNAVAILABLE'));
      if (await localMaterial(locator)!=='folder') fail('INBOX_LOCATION_UNAVAILABLE');
      return {label:basename(locator)||'本机文件夹',locator};
    },
    'inbox-material-status': async input => {
      object(input, ['id','revision']);
      const item = await store.get(input.id);
      if (item.revision !== input.revision) fail('INBOX_CONFLICT');
      return Promise.all(item.materials.map(row=>localMaterial(row.locator)));
    },
    'inbox-open-material': async (input, signal) => {
      object(input, ['id','revision','index']);
      const {locator} = await savedMaterial(input);
      if (!await localMaterial(locator)) fail('INBOX_LOCATION_UNAVAILABLE');
      try { await openPath(locator,false,signal); }
      catch { fail('INBOX_LOCATION_OPEN_FAILED'); }
      return true;
    },
  };
}
