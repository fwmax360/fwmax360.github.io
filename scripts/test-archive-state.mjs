import assert from 'node:assert/strict';
import {test} from 'node:test';
import {archiveStateUrl,readArchiveState} from '../src/lib/archive-state.ts';
const categories=['Android','Binary'];const series=['抓包实战','逆向基础'];
test('Chinese filter values round-trip without losing unrelated query or hash',()=>{
 const base=new URL('https://example.test/archive/?campaign=hello%20world#month-2026-10');
 const state={category:'Android',series:'抓包实战',density:'compact'};
 const url=archiveStateUrl(base,state);
 assert.deepEqual(readArchiveState(url,categories,series),state);
 assert.equal(url.searchParams.get('campaign'),'hello world');assert.equal(url.hash,base.hash);assert.equal(base.searchParams.has('category'),false);
});
test('Unknown filters fall back and normalization removes only owned keys',()=>{
 const url=new URL('https://example.test/archive/?category=invalid&series=unknown&density=bad&campaign=keep#year-2026');
 const state=readArchiveState(url,categories,series);
 assert.deepEqual(state,{category:'',series:'',density:'editorial'});
 const normalized=archiveStateUrl(url,state);assert.equal(normalized.search,'?campaign=keep');assert.equal(normalized.hash,'#year-2026');
});
test('Reset strips defaults; duplicate values collapse to one declared value',()=>{
 const url=new URL('https://example.test/archive/?category=Android&category=Binary&density=compact');
 assert.equal(readArchiveState(url,categories,series).category,'Android');
 const next=archiveStateUrl(url,{category:'Binary',series:'',density:'editorial'});assert.deepEqual(next.searchParams.getAll('category'),['Binary']);assert(!next.searchParams.has('density'));
 const empty=archiveStateUrl(next,{category:'',series:'',density:'editorial'});assert.equal(empty.search,'');
});
