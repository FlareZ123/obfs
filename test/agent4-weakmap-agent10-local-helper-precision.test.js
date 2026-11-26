'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {observesFunctionSource,parse}=require('../src/ast');

const source=[
  'const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem");',
  'const captured=new WeakMap();',
  'function inspect(){const privateLocal=29;return privateLocal;}',
  'function independent(){const independentLocal=7;return independentLocal;}',
  'function hold(map){return map;}',
  'const localMap=hold(new WeakMap());',
  'export function sample(){',
  '  Object.defineProperty(Storage.prototype,"setItem",{',
  '    ...descriptor,',
  '    value:function(_key,value){captured.set(this,value);}',
  '  });',
  '  localStorage.setItem("private-local-helper-control",inspect);',
  '  return {value:inspect(),independent:independent()};',
  '}'
].join('\n');

const runnerSource=[
  'class Storage {',
  '  constructor(){this.data=new Map();}',
  '  setItem(key,value){this.data.set(String(key),String(value));}',
  '}',
  'globalThis.Storage=Storage;',
  'globalThis.localStorage=new Storage();',
  'let documentTitle="initial";',
  'globalThis.document={};',
  'Object.defineProperty(globalThis.document,"title",{',
  '  get(){return documentTitle;},',
  '  set(value){documentTitle=String(value);}',
  '});',
  "const {sample}=await import('./entry.mjs');",
  'const result=sample();',
  'process.stdout.write(JSON.stringify({result,title:document.title})+"\\n");'
].join('\n');

/**
 * @param {string} moduleSource
 * @returns {{result:{value:number,independent:number},title:string}}
 */
function run(moduleSource) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-weakmap-local-helper-'));
  try {
    fs.writeFileSync(path.join(directory,'entry.mjs'),moduleSource,'utf8');
    fs.writeFileSync(path.join(directory,'runner.mjs'),runnerSource,'utf8');
    const child=spawnSync(process.execPath,[path.join(directory,'runner.mjs')],{
      cwd:directory,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return JSON.parse(child.stdout);
  } finally {
    fs.rmSync(directory,{recursive:true,force:true});
  }
}

test('passing a private WeakMap through a local identity helper preserves the safe Storage yield',()=>{
  const observed=observesFunctionSource(parse(source,'module'));
  const compiled=obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:source
  }],{
    mode:'coo',seed:'agent4-private-weakmap-local-helper-yield',
    properties:false,identifiers:true,strings:false
  });
  const app=compiled.files.find(file=>file.path==='entry.mjs');
  assert.ok(app);
  const native=run(source);
  const emitted=run(String(app.code));
  const evidence={observed,metrics:app.metrics,native,emitted,source:app.code};
  assert.equal(observed,false,JSON.stringify(evidence));
  assert.ok(app.metrics.bindings>=2,JSON.stringify(evidence));
  assert.deepEqual(emitted,native);
});
