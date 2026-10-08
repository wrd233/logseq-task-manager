import {installPreviewBytes} from './fixtures/preview-bytes.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, readdir, rename, stat, rm, copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {contentFixture, deferred} from './fixtures/content-writeback.ts';
import {installContentWriteback} from '../src/features/content-writeback/installer.ts';
import {installMaterialTransfers} from '../src/features/materials/install-transfer.ts';
import {MATERIAL_MIME} from '../src/features/materials/drop.ts';

async function until(probe: () => boolean | Promise<boolean>, label: string): Promise<void> {
  const end = Date.now() + 6000;
  while (Date.now() < end) { if (await probe()) return; await delay(20); }
  assert.fail(label);
}
async function fixture() {
  const restoreBytes = installPreviewBytes(path => readFile(path));
  const c = await contentFixture(), root = await mkdtemp(join(tmpdir(), 'materials-reading-'));
  const workDirectory = join(root, 'work'); await mkdir(workDirectory);
  logseq.settings!.materialsDirectory = workDirectory;
  const opened: string[] = [];
  const apis = {
    openPath: async (path: string): Promise<string> => { opened.push(path); return ''; },
    doAction: async (args: unknown[]) => {
      const [op, ...paths] = args as string[];
      if (op === 'readFile') return readFile(paths[0]!, 'utf8');
      if (op === 'writeFile') return writeFile(paths[1]!, paths[2]!);
      if (op === 'mkdir-recur') return mkdir(paths[0]!, {recursive: true});
      if (op === 'copyDirectory') return copyFile(paths[0]!, paths[1]!, 1);
      if (op === 'rename') return rename(paths[0]!, paths[1]!);
      if (op === 'listdir') return readdir(paths[0]!);
      if (op === 'stat') { const s = await stat(paths[0]!); return {mode: s.mode, size: s.size, dev: s.dev, ino: s.ino, birthtimeMs: s.birthtimeMs}; }
      throw Error(`unsupported fixture operation ${op}`);
    },
  };
  Object.assign(c.browser, {apis});
  const content = installContentWriteback({adapter: c.adapter}); await content.local.authorize(c.root);
  const {WorkView} = await import('../src/features/work-view/controller.ts');
  const {Materials} = await import('../src/features/materials/controller.ts');
  const work = new WorkView(() => {}), materials = new Materials(uuid => work.open(uuid), () => (work.snapshot() as {root: string | null}).root ?? c.root);
  await materials.bindDirectory(c.root, workDirectory);
  installMaterialTransfers(materials, content, {read: scope => content.api.read(scope)}, work);
  const find = (label: string) => Array.from(materials.panel.root.querySelectorAll('button')).find(node => node.textContent === label)!;
  const file = async (path: string) => {
    const result = new c.browser.File([await readFile(path)], path.split('/').at(-1)!);
    Object.defineProperty(result, 'path', {value: path}); return result as unknown as File;
  };
  const event = (type: string, files: File[] = [], internal = '') => {
    const result = new c.browser.Event(type, {bubbles: true, cancelable: true});
    Object.defineProperty(result, 'dataTransfer', {value: {types: internal ? [MATERIAL_MIME] : ['Files'], files, getData: (kind: string) => kind === MATERIAL_MIME ? internal : ''}});
    return result as unknown as Event;
  };
  const joinFiles = async (paths: string[]) => {
    await materials.library(c.root, "", "history");
    const files = await Promise.all(paths.map(file));
    materials.panel.root.querySelector('[data-material-drop-list]')!.dispatchEvent(event('drop', files));
    await until(() => materials.panel.root.textContent!.includes(`已加入 ${paths.length} 份材料`), 'file batch rendered');
    return (await materials.listMaterials(c.root)).materials;
  };
  return {c, root, workDirectory, apis, opened, content, work, materials, find, file, event, joinFiles,
    cleanup: async () => { restoreBytes(); materials.ui.dispose(); work.dispose(); content.dispose(); await delay(20); await c.cleanup(); await rm(root, {recursive: true, force: true}); },
  };
}

test('native preview retains the same byte version and theme while returning to the same work, then closes after the trusted work scope changes without altering the material', async () => {
  const f = await fixture(), {Window} = await import('happy-dom'), child = new Window({url:'about:blank'}), originalOpen = f.c.browser.open;
  let closed = false;
  Object.defineProperty(child,'closed',{get:()=>closed,configurable:true});
  child.close = () => {closed=true;child.dispatchEvent(new child.Event('pagehide'));};
  f.c.browser.open = (() => child) as unknown as typeof f.c.browser.open;
  try {
    const path=join(f.workDirectory,'窗口参考.md'), text='**[注]** 同一原件，同一读取版本。';await writeFile(path,text);
    const [material]=await f.joinFiles([path]);await f.work.open(f.c.root);await f.materials.openDoc(material!.id,f.c.root);
    const mainVersion=f.materials.panel.root.querySelector<HTMLElement>('[data-preview-version]')!.dataset.previewVersion;
    f.find('独立窗口').click();await until(()=>!!child.document.querySelector('[data-preview-version]'),'native view rendered');
    assert.equal((child.document.querySelector('[data-preview-version]') as unknown as HTMLElement).dataset.previewVersion,mainVersion);
    document.documentElement.style.setProperty('--ls-primary-text-color','rgb(12, 34, 56)');
    await until(()=>child.document.documentElement.style.getPropertyValue('--ls-primary-text-color').includes('12'),'native theme tracks workbench');
    await f.materials.panel.close();assert.equal(closed,false,'same work can continue with retained preview');
    await f.work.open(f.c.a);await until(()=>closed,'retained native view closes after explicit work change');
    assert.equal(await readFile(path,'utf8'),text);assert.equal((await f.materials.readMaterial(material!.id)).id,material!.id);
  } finally {f.c.browser.open=originalOpen;await child.happyDOM.abort();await f.cleanup();}
});

test('native material pointer down is claimed before Logseq can blur its draft, while web links keep normal pointer behavior and disposal removes the capture', async () => {
  const f = await fixture();try {
    const input=document.createElement('textarea'), anchor=document.createElement('a');input.value='**[注]** 中文草稿与选区。';anchor.href='longdoc://00000000-0000-4000-8000-000000000000';document.body.append(input,anchor);input.focus();input.setSelectionRange(7,11);
    for(const type of ['pointerdown','mousedown']) {const event=new f.c.browser.MouseEvent(type,{bubbles:true,cancelable:true,button:0});anchor.dispatchEvent(event as unknown as Event);assert.equal(event.defaultPrevented,true);assert.equal(document.activeElement,input);assert.equal(input.selectionStart,7);assert.equal(input.selectionEnd,11);}
    anchor.href='https://example.com/';const web=new f.c.browser.MouseEvent('pointerdown',{bubbles:true,cancelable:true,button:0});anchor.dispatchEvent(web as unknown as Event);assert.equal(web.defaultPrevented,false);
    f.materials.dispose();anchor.href='longdoc://00000000-0000-4000-8000-000000000000';const unloaded=new f.c.browser.MouseEvent('pointerdown',{bubbles:true,cancelable:true,button:0});anchor.dispatchEvent(unloaded as unknown as Event);assert.equal(unloaded.defaultPrevented,false);assert.equal(input.value,'**[注]** 中文草稿与选区。');
  } finally {await f.cleanup();}
});

test('native block hover cannot remount the live editor before a file click; unrelated blocks and finished editing retain host hover behavior', async () => {
  const f = await fixture();try {
    const main=document.createElement('main');main.id='main-content-container';
    const block=document.createElement('div'),other=document.createElement('div'),editor=document.createElement('div'),input=document.createElement('textarea');block.className=other.className='ls-block';editor.className='block-editor';input.value='**[注]** 中文草稿与选区。';editor.append(input);block.append(editor);main.append(block,other);document.body.append(main);input.focus();input.setSelectionRange(7,11);
    let remounts=0,otherHover=0;block.addEventListener('mouseout',()=>{remounts++;editor.replaceChildren(document.createElement('textarea'));});other.addEventListener('mouseout',()=>{otherHover++;});
    const out=()=>new f.c.browser.MouseEvent('mouseout',{bubbles:true}) as unknown as Event;
    input.dispatchEvent(out());assert.equal(remounts,0);assert.equal(input.isConnected,true);assert.equal(document.activeElement,input);assert.equal(input.selectionStart,7);assert.equal(input.selectionEnd,11);
    other.dispatchEvent(out());assert.equal(otherHover,1);
    input.blur();input.dispatchEvent(out());assert.equal(remounts,1,'host hover resumes when the live native editor is no longer focused');
    editor.replaceChildren(input);input.focus();f.materials.dispose();input.dispatchEvent(out());assert.equal(remounts,2,'disposal removes the native hover guard');
  } finally {await f.cleanup();}
});

test('long MiniProject and four real files: list joining, trusted report insertion, reading return, rename, alias, history and relocation', async () => {
  const f = await fixture(); try {
    const sample = JSON.parse(await readFile(new URL('./fixtures/materials-reading-source.json', import.meta.url), 'utf8')) as {blocks: Array<{exampleId: string; depth: number; text: string}>};
    f.c.blocks.delete(f.c.a); f.c.blocks.delete(f.c.b); f.c.blocks.get(f.c.root)!.children = [];
    f.c.blocks.get(f.c.root)!.content = sample.blocks[0]!.text;
    const parents = [f.c.root], ids = new Map<string, string>([['b00', f.c.root]]);
    for (const block of sample.blocks.slice(1)) { const node = f.c.add(block.text, parents[block.depth - 1]); parents[block.depth] = node.uuid; ids.set(block.exampleId, node.uuid); }
    assert.equal(ids.size, 93);
    const paths = [join(f.workDirectory, '研究说明.md'), join(f.workDirectory, '访谈纪要.pdf'), join(f.root, '来源一.md'), join(f.root, '来源二.md')];
    await writeFile(paths[0]!, '# 研究说明\n\n真实 Markdown 材料。');
    await writeFile(paths[1]!, '%PDF-1.4\nsynthetic binary fixture');
    await writeFile(paths[2]!, '相同正文，独立来源'); await writeFile(paths[3]!, '相同正文，独立来源');
    const before = JSON.stringify([...f.c.blocks.values()]);
    const views = await f.joinFiles(paths);
    assert.equal(views.length, 4); assert.equal(new Set(views.map(view => view.id)).size, 4);
    assert.equal(JSON.stringify([...f.c.blocks.values()]), before); assert.equal(f.c.counts().inserts, 0);
    const material = views.find(view => view.path === paths[0])!;
    const replacements = new Map([['interview-notes', views.find(view => view.path === paths[1])!.id], ['reading-notes', material.id], ['reference-guide', material.id], ['source-a', views.find(view => view.title === '来源一')!.id], ['source-b', views.find(view => view.title === '来源二')!.id]]);
    for (const block of f.c.blocks.values()) block.content = block.content.replace(/longdoc:\/\/([\w-]+)/g, (_all, key: string) => `longdoc://${replacements.get(key) ?? material.id}`);
    const alias = f.c.add(`[我的阅读说明](longdoc://${material.id})`);
    const sourceBefore = JSON.stringify([...f.c.blocks.values()]);
    await f.work.open(f.c.root); assert.equal((await f.work.reportAPI.setMode('report')).ok, true);
    const parent = ids.get('b01')!;
    const body = document.querySelector<HTMLElement>(`.wb-row[data-uuid="${parent}"] .wb-body`)!;
    body.dispatchEvent(f.event('dragover', [], JSON.stringify({schemaVersion: 1, materialId: material.id, scope: f.c.scope})));
    await until(() => !!body.querySelector('.wb-material-drop-hint')?.textContent?.includes('在该段下'), 'verified child hover');
    body.dispatchEvent(f.event('drop', [], JSON.stringify({schemaVersion: 1, materialId: material.id, scope: f.c.scope})));
    const recordPath = join(f.workDirectory, '.longdoc', `${material.id}.json`);
    await until(async () => JSON.parse(await readFile(recordPath, 'utf8')).references?.[0]?.status === 'synced', 'report child committed');
    const record = JSON.parse(await readFile(recordPath, 'utf8')), child = record.references[0].target.blockUuid;
    assert.equal(f.c.counts().inserts, 1); assert.equal(f.c.blocks.get(child)!.content.split('\n')[0], material.reference);
    assert.notEqual(JSON.stringify([...f.c.blocks.values()]), sourceBefore);
    assert.equal((await f.content.api.result(record.references[0].patch.requestId))!.record.items[0]!.status, 'APPLIED_VERIFIED');
    await f.work.refresh();
    const row = document.querySelector<HTMLElement>(`.wb-row[data-uuid="${parent}"]`)!; row.click(); row.focus();
    await f.materials.library(f.c.root, "", "history"); f.materials.panel.root.querySelector<HTMLButtonElement>(`[data-material-id="${material.id}"]`)!.click();
    await until(() => !!f.materials.panel.root.querySelector('.wb-reading'), 'Markdown reading');
    assert.equal(f.materials.panel.root.querySelector<HTMLElement>('.wb-editor')!.hidden, true);
    await f.materials.ui.returnToBody(); assert.equal((f.work.snapshot() as {view: {selected: string}}).view.selected, parent);
    assert.equal((await f.work.reportAPI.read()).mode, 'report');
    await f.materials.library(f.c.root, "", "history"); f.find('改文件名').click();
    await until(() => !!f.materials.panel.root.querySelector('input[aria-label="文件名称（保留扩展名）"]'), 'rename form');
    // Choose this material's action; the list includes four independent entries.
    f.find('取消').click();
    f.materials.panel.root.querySelector(`[data-material-id="${material.id}"]`)!.parentElement!.querySelectorAll<HTMLButtonElement>('details button')[1]!.click();
    await until(() => !!f.materials.panel.root.querySelector('input[aria-label="文件名称（保留扩展名）"]'), 'selected rename');
    f.materials.panel.root.querySelector<HTMLInputElement>('input[aria-label="文件名称（保留扩展名）"]')!.value = '研究终稿'; f.find('保存').click();
    await until(async () => { const view=await f.materials.readMaterial(material.id);return view.path===join(f.workDirectory,'研究终稿.md') && f.c.blocks.get(child)!.content.split('\n')[0]===view.reference; }, 'generated label follows the full filename');
    await until(() => !f.materials.panel.root.querySelector('.wb-material-rename') && !!f.materials.panel.root.querySelector(`[data-material-row="${material.id}"] .wb-material-feedback`)?.textContent?.includes('已改名'), 'rename UI completion before external rename');
    assert.equal(f.c.blocks.get(alias.uuid)!.content, `[我的阅读说明](longdoc://${material.id})`);
    const path = join(f.workDirectory, '研究终稿.md'); assert.equal(await readFile(path, 'utf8'), '# 研究说明\n\n真实 Markdown 材料。');
    const version = (await f.materials.readMaterial(material.id)).version;
    await rename(path, join(f.workDirectory, '外部研究.md'));
    await f.materials.library(f.c.root, "", "history"); assert.equal((await f.materials.readMaterial(material.id)).path, join(f.workDirectory, '外部研究.md'));
    await until(async () => f.c.blocks.get(child)!.content.split('\n')[0] === (await f.materials.readMaterial(material.id)).reference, 'external identity rename follows the full filename');
    assert.equal((await f.materials.readMaterial(material.id)).version, version);
    const elsewhere = join(f.root, '另处研究.md'); await rename(join(f.workDirectory, '外部研究.md'), elsewhere);
    await f.materials.ui.open(material.id); assert.match(f.materials.panel.root.textContent!, /文件失联/);
    assert.equal(f.c.blocks.get(alias.uuid)!.content, `[我的阅读说明](longdoc://${material.id})`);
    f.find('重新定位').click(); await until(() => !!f.materials.panel.root.querySelector('input[aria-label="重新定位到文件绝对路径"]'), 'relocation form');
    f.materials.panel.root.querySelector<HTMLInputElement>('input[aria-label="重新定位到文件绝对路径"]')!.value = elsewhere; f.find('保存').click();
    await until(async () => (await f.materials.readMaterial(material.id)).availability === 'available', 'relocated exact identity');
    const relocated = await f.materials.readMaterial(material.id); assert.equal(relocated.id, material.id); assert.equal(relocated.path, elsewhere); assert.equal(relocated.version, version);
    assert.equal(f.c.blocks.get(alias.uuid)!.content, `[我的阅读说明](longdoc://${material.id})`);
  } finally { await f.cleanup(); }
});

test('summary is optional record metadata: search, clearing and file rename preserve content, links and permissions', async () => {
  const f = await fixture(); try {
    const path = join(f.workDirectory, '参考.md'); await writeFile(path, '原始文件正文');
    const [view] = await f.joinFiles([path]);
    f.find('写概述').click(); await until(() => !!f.materials.panel.root.querySelector('input[aria-label="一句话概述"]'), 'summary input');
    f.materials.panel.root.querySelector<HTMLInputElement>('input[aria-label="一句话概述"]')!.value = '访谈第一轮的记录'; f.find('保存').click();
    await until(async () => (await f.materials.readMaterial(view!.id)).summary === '访谈第一轮的记录', 'summary stored');
    const described = await f.materials.readMaterial(view!.id); assert.equal(described.reference, view!.reference); assert.equal(described.version, view!.version); assert.deepEqual(described.capabilities.edit, {user: false, agent: false});
    assert.equal((await f.materials.listMaterials(f.c.root, '第一轮')).materials[0]!.id, view!.id);
    await f.materials.library(f.c.root, "", "history"); f.find('改文件名').click(); await until(() => !!f.materials.panel.root.querySelector('input[aria-label="文件名称（保留扩展名）"]'), 'rename');
    f.materials.panel.root.querySelector<HTMLInputElement>('input[aria-label="文件名称（保留扩展名）"]')!.value = '访谈参考'; f.find('保存').click();
    await until(async () => (await f.materials.readMaterial(view!.id)).title === '访谈参考', 'file renamed');
    assert.equal((await f.materials.readMaterial(view!.id)).summary, '访谈第一轮的记录'); assert.equal(await readFile(join(f.workDirectory, '访谈参考.md'), 'utf8'), '原始文件正文');
    await f.materials.library(f.c.root, "", "history"); f.find('写概述').click(); await until(() => !!f.materials.panel.root.querySelector('input[aria-label="一句话概述"]'), 'clear summary');
    f.materials.panel.root.querySelector<HTMLInputElement>('input[aria-label="一句话概述"]')!.value = ''; f.find('保存').click();
    await until(async () => !(await f.materials.readMaterial(view!.id)).summary, 'empty summary removes metadata');
    assert.equal((await f.materials.readMaterial(view!.id)).title, '访谈参考'); assert.equal(f.c.counts().inserts, 0);
  } finally { await f.cleanup(); }
});

test('same-name conflict and permission failure retain the rename input and never overwrite another file', async () => {
  const f = await fixture(); try {
    const path = join(f.workDirectory, '原件.md'), conflict = join(f.workDirectory, '重名.md'); await writeFile(path, 'original'); await writeFile(conflict, 'other');
    const [view] = await f.joinFiles([path]); f.find('改文件名').click();
    await until(() => !!f.materials.panel.root.querySelector('input[aria-label="文件名称（保留扩展名）"]'), 'rename');
    const input = f.materials.panel.root.querySelector<HTMLInputElement>('input[aria-label="文件名称（保留扩展名）"]')!; input.value = '重名'; f.find('保存').click();
    await until(() => !input.readOnly && !!input.closest('form')!.querySelector('.wb-error')?.textContent, 'conflict returned');
    assert.equal(input.value, '重名'); assert.equal(await readFile(path, 'utf8'), 'original'); assert.equal(await readFile(conflict, 'utf8'), 'other');
    const call = f.apis.doAction; f.apis.doAction = async args => { if (args[0] === 'rename') throw Error('EACCES'); return call(args); };
    input.value = '待保存名称'; f.find('保存').click(); await until(() => !input.readOnly && input.closest('form')!.textContent!.includes('EACCES'), 'permission failure visible');
    assert.equal(input.value, '待保存名称'); assert.equal((await f.materials.readMaterial(view!.id)).path, path);
    f.apis.doAction = call; f.find('保存').click(); await until(async () => (await f.materials.readMaterial(view!.id)).title === '待保存名称', 'retry without new material');
    assert.equal((await f.materials.listMaterials(f.c.root)).materials.length, 1);
  } finally { await f.cleanup(); }
});

test('damaged image clicks report builtin preview failure and explicit external opening reports application failure truthfully', async () => {
  const f = await fixture(); try {
    const path = join(f.workDirectory, '原始图片.png'); await writeFile(path, Buffer.from([137, 80, 78, 71]));
    await f.joinFiles([path]);
    assert.equal(f.materials.panel.root.querySelector('input[type=file]'), null);
    assert.equal(f.find('加入材料'), undefined);
    await until(async () => (await f.materials.listMaterials(f.c.root)).materials.length === 1, 'picker result');
    const view = (await f.materials.listMaterials(f.c.root)).materials[0]!;
    await f.materials.library(f.c.root, "", "history"); f.materials.panel.root.querySelector<HTMLButtonElement>(`[data-material-id="${view.id}"]`)!.click();
    await until(() => f.materials.panel.root.textContent!.includes('图片格式或尺寸无法核验'), 'damaged image preview feedback'); assert.equal(f.opened.length, 0); f.find('外部打开').click(); await until(() => f.opened.length === 1, 'explicit external app request'); assert.equal(f.opened[0], path); assert.equal(view.content, null); assert.equal(f.c.counts().inserts, 0);
    assert.deepEqual(view.capabilities.edit, {user: false, agent: false}); assert.equal(await readFile(path).then(bytes => bytes.toString('hex')), '89504e47');
    f.apis.openPath = async () => 'no default application'; f.find('外部打开').click();
    await until(() => f.materials.panel.root.textContent!.includes('no default application'), 'application error');
    assert.doesNotMatch(f.materials.panel.root.querySelector('.wb-status')!.textContent!, /已交给默认应用/);
  } finally { await f.cleanup(); }
});

test('batch partial failure retains imported file without any Graph insertion; stale clipboard completion does not appear in another work', async () => {
  const f = await fixture(), previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator'); try {
    const path = join(f.workDirectory, '成功.md'); await writeFile(path, 'saved');
    await f.materials.library(f.c.root, "", "history");
    const rejected = new f.c.browser.File(['missing'], '不存在.md'); Object.defineProperty(rejected, 'path', {value: join(f.workDirectory, '不存在.md')});
    f.materials.panel.root.querySelector('[data-material-drop-list]')!.dispatchEvent(f.event('drop', [await f.file(path), rejected as unknown as File]));
    await until(() => f.materials.panel.root.textContent!.includes('不存在.md 未加入'), 'partial batch result');
    assert.equal((await f.materials.listMaterials(f.c.root)).materials.length, 1); assert.equal(f.c.counts().inserts, 0);
    const gate = deferred<void>(), entered = deferred<void>();
    Object.defineProperty(f.c.browser.navigator, 'clipboard', {configurable: true, value: {writeText: async () => { entered.resolve(); await gate.promise; }}});
    Object.defineProperty(globalThis, 'navigator', {configurable: true, value: f.c.browser.navigator});
    f.find('复制链接').click(); await entered.promise;
    const second = f.c.add('**[MiniProject]** 另一工作 #MiniProject'); await f.materials.library(second.uuid, "", "history"); gate.resolve(); await delay(30);
    assert.equal(f.materials.panel.root.querySelector('textarea[aria-label="材料链接"]'), null);
    assert.doesNotMatch(f.materials.panel.root.querySelector('.wb-status')!.textContent!, /已复制材料/);
  } finally { if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator); else Reflect.deleteProperty(globalThis, 'navigator'); await f.cleanup(); }
});

test('failed report insertion keeps associated material and visible selectable fallback, never reimports on recovery', async () => {
  const f = await fixture(); try {
    const path = join(f.workDirectory, '保留材料.md'); await writeFile(path, 'retained original'); await f.work.open(f.c.root);
    const body = document.querySelector<HTMLElement>(`.wb-row[data-uuid="${f.c.a}"] .wb-body`)!;
    f.c.onInsert(async () => { throw Error('lost insertion reply'); });
    body.dispatchEvent(f.event('drop', [await f.file(path)]));
    await until(() => !!document.querySelector('[data-material-continuation]'), 'partial source continuation');
    const continuation = document.querySelector<HTMLElement>('[data-material-continuation]')!;
    Object.defineProperty(f.c.browser.navigator, 'clipboard', {configurable: true, value: {writeText: async () => {throw Error('denied');}}});
    continuation.querySelector<HTMLButtonElement>('button')!.click();
    await until(() => continuation.textContent!.includes('复制未完成'), 'visible clipboard failure on report');
    assert.equal(continuation.querySelector('textarea'), null);
    assert.equal((await f.materials.listMaterials(f.c.root)).materials.length, 1); assert.equal(await readFile(path, 'utf8'), 'retained original');
    // Unknown SDK result remains a Journal query; retry must not duplicate the child already committed by the host.
    const retry = Array.from(continuation.querySelectorAll('button')).find(node => node.textContent === '重新核验并补插子块')!; retry.click();
    await delay(100); assert.equal(f.c.counts().inserts, 1); assert.equal((await f.materials.listMaterials(f.c.root)).materials.length, 1);
  } finally { await f.cleanup(); }
});

test('summary form refuses submission during composition and installed material listeners and styles dispose', async () => {
  const f = await fixture(); try {
    const path = join(f.workDirectory, '输入.md'); await writeFile(path, 'original'); const [view] = await f.joinFiles([path]);
    f.find('写概述').click(); await until(() => !!f.materials.panel.root.querySelector('input[aria-label="一句话概述"]'), 'composition form');
    const input = f.materials.panel.root.querySelector<HTMLInputElement>('input[aria-label="一句话概述"]')!; input.value = '中文输入';
    input.dispatchEvent(new f.c.browser.Event('compositionstart', {bubbles: true}) as unknown as Event); f.find('保存').click(); await delay(30);
    assert.equal((await f.materials.readMaterial(view!.id)).summary, undefined);
    input.dispatchEvent(new f.c.browser.Event('compositionend', {bubbles: true}) as unknown as Event); f.find('保存').click();
    await until(async () => (await f.materials.readMaterial(view!.id)).summary === '中文输入', 'composition completion');
    const subscriptions = f.c.counts().graphSubscriptions;
    f.materials.ui.dispose(); assert.equal(document.querySelector('[data-material-reading-style]'), null);
    assert.equal(f.c.counts().graphSubscriptions, subscriptions - 1);
  } finally { await f.cleanup(); }
});
