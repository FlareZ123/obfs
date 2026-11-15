'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { transform } = require('../lib/transform');

/** @param {string} code */
function runScript(code) {
  const out = [];
  vm.runInNewContext(code, { console: { log: (...args) => out.push(args.join(' ')) } });
  return out.join('\n');
}
/** @param {Record<string,string>} files @param {{closedWorld?:boolean}} [opts] */
function compare(files, opts = {}) {
  const out = transform(files, {closedWorld:true, ...opts});
  for (const name of Object.keys(files)) assert.equal(runScript(files[name]), runScript(out.files[name]), name);
  return out;
}

test('private own properties and string literals across aliases', () => {
  const out = compare({ 'a.js': `const obj={hidden:41, "label":"ok"};const alias=obj; console.log(alias.hidden+1,obj["label"]);` });
  assert.equal(out.renamed, 2);
  assert.ok(!out.files['a.js'].includes('alias.hidden'));
});

test('interprocedural parameter forwarding and returns', () => {
  const out = compare({'a.js': `function id(x) { return x; } function read(y) { return y.secret; } const item={secret:3};const alias=id(item);console.log(read(alias));`});
  assert.equal(out.renamed, 1);
});

test('dynamic bracket access blocks object', () => {
  const code = `const a={private:3};const k='private';console.log(a[k]);`;
  const out = compare({'a.js':code});
  assert.equal(out.renamed,0);
});

test('escaping as unknown function argument blocks object', () => {
  const code = `const a={private:3};console.log(Object.keys(a).join(','),a.private);`;
  const out = compare({'a.js':code});
  assert.equal(out.renamed,0);
});

test('escaping as exported binding blocks object', () => {
  const out = transform({'a.mjs':'export const obj={private:7}; console.log(obj.private);'});
  assert.equal(out.renamed,0);
});

test('eval disables all property renames', () => {
  const source = `const a={private:2};console.log(eval('a.private'));`;
  const out = compare({'a.js':source});
  assert.equal(out.renamed,0);
});

test('unknown / inherited property blocks candidates', () => {
  const out = compare({'a.js':`const a={private:2};console.log(a.private, typeof a.toString);`});
  assert.equal(out.renamed,0);
});

test('mutation through aliases retains behavior', () => {
  const out=compare({'a.js':`const a={private:2};const b=a;b.private++;console.log(a.private);`});
  assert.equal(out.renamed,1);
});

test('shorthand and spread are left alone', () => {
  const source=`const privateKey=3;const a={privateKey};const b={...a};console.log(b.privateKey);`;
  const out=compare({'a.js':source});
  assert.equal(out.renamed,0);
});

test('ES module cross-file imports, parameters, and returns', () => {
  const files={
    'source.mjs': 'export const obj = {hidden: 10};',
    'relay.mjs': `export function relay(p) { return p; }`,
    'main.mjs': `import {obj} from './source.mjs'; import {relay} from './relay.mjs'; console.log(relay(obj).hidden);`,
  };
  const out=transform(files,{closedWorld:true});
  assert.ok(out.renamed >= 1,JSON.stringify(out));
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-verify-'));
  try {
    for (const [name,code] of Object.entries(files)) fs.writeFileSync(path.join(dir,name),code);
    const original=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{encoding:'utf8'});
    assert.equal(original.status,0,original.stderr);
    for (const [name,code] of Object.entries(out.files)) fs.writeFileSync(path.join(dir,name),code);
    const obfuscated=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{encoding:'utf8'});
    assert.equal(obfuscated.status,0,obfuscated.stderr);
    assert.equal(obfuscated.stdout,original.stdout);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('function-valued properties are never renamed', () => {
  const source=`const a={secret:7, method: function(){return this.secret;}};console.log(a.method());`;
  const out=compare({'a.js':source});
  assert.equal(out.renamed,0);
});

test('prototype reflection cannot break an own property', () => {
  const source=`const a={secret:7};console.log(a.hasOwnProperty('secret'));`;
  const out=compare({'a.js':source});
  assert.equal(out.renamed,0);
});

test('globally visible classic script bindings are protected by default', () => {
  const source=`const a={secret:7};console.log(a.secret);`;
  const out=transform({'a.js':source});
  assert.equal(out.renamed,0);
  assert.equal(transform({'a.js':source},{closedWorld:true}).renamed,1);
});

test('assignment to browser-visible script binding blocks rename', () => {
  const source=`let exposed; (() => { const a={secret:8};exposed=a; })();console.log(exposed.secret);`;
  const out=compare({'a.js':source},{closedWorld:false});
  assert.equal(out.renamed,0);
});

test('global classic-script helper accepts unknown callers', () => {
  const source=`function expose(o){return o;}(() => { const a={secret:8};console.log(expose(a).secret); })();`;
  const out=compare({'a.js':source},{closedWorld:false});
  assert.equal(out.renamed,0);
});

test('trusted helper passed as callback is not trusted', () => {
  const source=`function helper(p){return p;} const a={secret:1}; const callback=helper; console.log(helper(a).secret);`;
  const out=compare({'a.js':source});
  assert.equal(out.renamed,0);
});

test('duplicate normalized paths are rejected', () => {
  assert.throws(()=>transform({'dir\\a.js':'const a={x:1};','dir/a.js':'const b={y:2};'}),/Duplicate normalized/);
});

test('delete own property may reveal a prototype getter with original key', () => {
  const code='Object.defineProperty(Object.prototype,"secret",{get(){return 42},configurable:true});const a={secret:1};delete a.secret;console.log(a.secret);';
  const out=compare({'a.js':code});
  assert.equal(out.renamed,0);
});

test('indirect global eval through bracket access protects lexical key names', () => {
  const code='const a={secret:11};console.log(globalThis["eval"]("a.secret"));';
  const out=compare({'a.js':code});
  assert.equal(out.renamed,0);
});

test('indirect eval through aliased global and computed key remains protected', () => {
  const code='const a={secret:12};const g=globalThis;const key="ev"+"al";console.log(g[key]("a.secret"));';
  const out=compare({'a.js':code});
  assert.equal(out.renamed,0);
});

test('Function constructor accessed by computed global key preserves script shape', () => {
  const code='const a={secret:13};const f=globalThis["Function"]("return a.secret");console.log(f());';
  const out=compare({'a.js':code});
  assert.equal(out.renamed,0);
});

test('function-valued property rewrite may reflect on this', () => {
  const code='const a={secret:1};a.secret=function(){return Object.keys(this)[0]};console.log(a.secret());';
  const out=compare({'a.js':code});
  assert.equal(out.renamed,0);
});

test('tracked function return passed through implicit arrow remains unchanged', () => {
  const code='const a={"$name":907,other:908};function f(x){return x;}const b=()=>f(a);console.log(b().$name);';
  const out=compare({'a.js':code});
  assert.equal(out.renamed,0);
});

test('namespace import with computed exported binding preserves property names', () => {
  const files={
    'source.mjs':'export const a={secret:20};',
    'main.mjs':'import * as ns from "./source.mjs";console.log(ns["a"].secret);',
  };
  const out=transform(files,{closedWorld:true});
  assert.equal(out.renamed,0);
});

test('dynamic ESM import with computed exported binding preserves property names', () => {
  const files={
    'source.mjs':'export const a={secret:21};',
    'main.mjs':'const ns=await import("./source.mjs");console.log(ns["a"].secret);',
  };
  const out=transform(files,{closedWorld:true});
  assert.equal(out.renamed,0);
});

test('CommonJS require of an ESM namespace protects exported property names', () => {
  const files={
    'source.mjs':'export const a={secret:22};',
    'main.cjs':'const ns=require("./source.mjs");console.log(ns["a"].secret);',
  };
  const out=transform(files,{closedWorld:true});
  assert.equal(out.renamed,0);
});

test('arguments implicit alias blocks unsound parameter renaming', () => {
  const code = 'function f(p){console.log(arguments[0].secret,p.secret);} const a={secret:11};f(a);';
  const out = compare({'a.js':code});
  assert.equal(out.renamed,0);
});

test('rest parameters cannot be treated as ordinary parameters', () => {
  const code='function f(...args){console.log(args[0].secret);} const a={secret:12};f(a);';
  const out=compare({'a.js':code});
  assert.equal(out.renamed,0);
});

test('async identity return is wrapped in Promise', () => {
  const code='async function f(p){return p;} const a={secret:13}; f(a).then(x=>console.log(x.secret));';
  const out=compare({'a.js':code});
  assert.equal(out.renamed,0);
});

test('generator identity return does not preserve value identity', () => {
  const code='function* f(p){return p;} const a={secret:14}; console.log(f(a).next().value.secret);';
  const out=compare({'a.js':code});
  assert.equal(out.renamed,0);
});

test('deterministic transformation', () => {
  const files={'a.js':`const a={private:5};console.log(a.private);`};
  assert.deepEqual(transform(files,{seed:'alpha',closedWorld:true}),transform(files,{seed:'alpha',closedWorld:true}));
  assert.notDeepEqual(transform(files,{seed:'alpha',closedWorld:true}).files,transform(files,{seed:'beta',closedWorld:true}).files);
});
