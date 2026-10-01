import test from 'node:test';
import assert from 'node:assert/strict';
import {displayLevel,savedLevels} from './display.mjs';
test('offline defaults distinguish tasks, notes and unmarked long prose',()=>{
 assert.equal(displayLevel('TODO '+ 'x'.repeat(500)).level,'emphasis');
 assert.equal(displayLevel('**[现状]** 已部署').level,'emphasis');
 assert.equal(displayLevel('【注】 背景').level,'quiet');
 assert.equal(displayLevel('x'.repeat(180)).level,'compact');
 assert.equal(displayLevel('x'.repeat(400)).level,'compact');
 assert.equal(displayLevel('x\n'.repeat(10)).level,'compact');
 assert.equal(displayLevel('普通文字').level,'normal');
});
test('explicit preferences survive changed source, auto restores code decisions',()=>{
 assert.equal(displayLevel('TODO 重要','quiet').level,'quiet');
 assert.equal(displayLevel('x'.repeat(500),'normal').level,'normal');
 assert.equal(displayLevel('x'.repeat(500),'auto').level,'compact');
 assert.equal(displayLevel('x'.repeat(500),'compact',{root:true}).level,'normal');
 assert.deepEqual(savedLevels({a:'quiet',b:'invalid',c:'auto'}),{a:'quiet'});
});
