import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {URL} from 'node:url';
import {Window} from 'happy-dom';

test('standalone requirement tree filters, expands, selects and distinguishes enablement from implementation', async () => {
  const html=await readFile(new URL('../../../../docs/integration/requirements.html',import.meta.url),'utf8');
  const window=new Window({url:'file:///requirements.html'});
  try {
    window.document.write(html);
    const script=window.document.querySelector('script:not([type])');
    window.eval(script.textContent);
    assert.equal(window.document.querySelectorAll('.leaf').length,38);
    const search=window.document.getElementById('search');
    search.value='冻结证据';search.dispatchEvent(new window.Event('input'));
    assert.equal(window.document.querySelectorAll('.leaf').length,1);
    window.document.querySelector('.leaf .node-title').click();
    assert.match(window.document.getElementById('detail').textContent,/后续规划/);
    assert.match(window.document.getElementById('detail').textContent,/未提供/);
    search.value='';search.dispatchEvent(new window.Event('input'));
    const status=window.document.getElementById('status-filter');status.value='excluded';status.dispatchEvent(new window.Event('change'));
    assert.equal(window.document.querySelectorAll('.leaf').length,3);
    window.document.getElementById('collapse').click();
    assert.equal(window.document.querySelectorAll('details[open]').length,1);
    window.document.getElementById('expand').click();
    assert.equal(window.document.querySelectorAll('details[open]').length,6);
    const enabled=window.document.getElementById('enabled-filter');enabled.checked=true;enabled.dispatchEvent(new window.Event('change'));
    assert.ok([...window.document.querySelectorAll('.leaf .enable')].every(node=>node.textContent==='默认启用'));
    assert.equal(window.document.getElementById('empty').hidden,true);
  } finally { await window.happyDOM.abort(); }
});
