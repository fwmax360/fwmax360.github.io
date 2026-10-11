import assert from 'node:assert/strict';
import {wrapTitle,textWeight} from './cover-title.mjs';
const titles=[
 'TEE、XBL 与 ABL：从启动链到可信执行环境',
 'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ',
 '深入理解可信执行环境与启动链'.repeat(5),
 'Android VPN 抓包：（VpnService、Reqable）与代理检测对抗',
 '《内存与地址空间》：从 ELF 到 PE 的映射、重定位与调用约定',
 'Binary instrumentation: unpacking, dynamic tracing, and native execution',
];
for(const title of titles){const result=wrapTitle(title);assert(result.lines.length<=4);assert(result.fontSize>=32);assert.equal(result.lines.join('').replace(/\s/g,''),title.replace(/\s/g,''));for(const line of result.lines){assert(textWeight(line)*result.fontSize<=690.01);assert(!/^[，。！？、；：）》】」』]/u.test(line));assert(!/[（《【「『]$/u.test(line));}}
assert.throws(()=>wrapTitle(''),/不能为空/);assert.throws(()=>wrapTitle('可信执行环境'.repeat(40)),/容量/);
console.log(`${titles.length} mixed-script, long-token and punctuation fixtures passed; overcapacity fails explicitly`);
