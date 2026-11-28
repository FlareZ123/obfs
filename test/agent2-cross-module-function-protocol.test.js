'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'module',code:string}} SourceFile */
/**
 * Execute a four-file ESM graph with a native Node host that captures the
 * exact source of a function passed to an earlier-mutated WeakMap prototype.
 * The source modules cannot inspect the runner's implementation.
 * @param {SourceFile[]} files
 * @returns {{result:{value:number},capturedSource:string}}
 */
function run(files) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-cross-protocol-'));
  try {
    for(const file of files)fs.writeFileSync(path.join(directory,file.path),file.code);
    const runner=[
      'class Storage {setItem(key,value){this.key=key;this.value=value;}}',
      'globalThis.Storage=Storage;',
      'globalThis.localStorage=new Storage();',
      'let capture="";globalThis.document={};',
      'Object.defineProperty(document,"title",{get(){return capture;},',
      'set(value){capture=String(value);}});',
      'const {sample}=await import("./entry.mjs");',
      'const result=sample();',
      'process.stdout.write(JSON.stringify({result,capturedSource:capture})+"\\n");'
    ].join('\n');
    fs.writeFileSync(path.join(directory,'runner.mjs'),runner);
    const result=spawnSync(process.execPath,[path.join(directory,'runner.mjs')],{
      encoding:'utf8',timeout:15000,maxBuffer:1024*1024,windowsHide:true
    });
    assert.equal(result.status,0,result.stderr||result.error?.message);
    return JSON.parse(result.stdout);
  }finally{
    fs.rmSync(directory,{recursive:true,force:true});
  }
}

/**
 * A separate pre-evaluated ESM module can override inherited .call semantics
 * without referencing or exporting the later module-local function name.
 * Original Function.prototype.call is restored on the first target call.
 * Other calls preserve argument forwarding; Node startup is unaffected.
 * @param {boolean} hostile
 * @returns {SourceFile[]}
 */
function corpus(hostile) {
  const protocol=hostile?[
    'globalThis.__obfsCallMarker=Object.freeze({});',
    'const original=Function.prototype.call;',
    'Function.prototype.call=function(receiver,...rest){',
    '  if(receiver===globalThis.__obfsCallMarker){',
    '    Function.prototype.call=original;',
    '    return Reflect.apply(this,receiver,[]);',
    '  }',
    '  return Reflect.apply(this,receiver,rest);',
    '};'
  ].join('\n'):'export const benign=true;';
  const mutate=[
    'class Ordinary {}',
    'let carrier={instance:new Ordinary()};',
    'function fill(x=(carrier={instance:new WeakMap()})){}',
    'fill.call(globalThis.__obfsCallMarker,23);',
    'const target=Object.getPrototypeOf(carrier.instance);',
    'const nativeSet=target.set;',
    'target.set=function(key,value){',
    '  document.title=value;',
    '  if(typeof nativeSet==="function")',
    '    return Reflect.apply(nativeSet,this,[key,value]);',
    '};'
  ].join('\n');
  const storage=[
    'const captured=new WeakMap();',
    'function inspect(){const privateLocal=29;return privateLocal;}',
    'export function sample(){',
    '  Object.defineProperty(Storage.prototype,"setItem",{configurable:true,',
    '    value:function(key,value){captured.set(this,value);}});',
    '  localStorage.setItem("private-source-observer",inspect);',
    '  return {value:inspect()};',
    '}'
  ].join('\n');
  return [
    {path:'entry.mjs',sourceType:'module',code:[
      'import "./protocol.mjs";',
      'import "./mutate.mjs";',
      'export {sample} from "./storage.mjs";'
    ].join('\n')},
    {path:'protocol.mjs',sourceType:'module',code:protocol},
    {path:'mutate.mjs',sourceType:'module',code:mutate},
    {path:'storage.mjs',sourceType:'module',code:storage}
  ];
}

for(const hostile of [false,true]) {
  test('cross-module Function.prototype.call mutation preserves source / '+hostile,()=>{
    const files=corpus(hostile);
    const native=run(files);
    assert.deepEqual(native.result,{value:29});
    if(hostile)assert.ok(native.capturedSource.includes('privateLocal'),native.capturedSource);
    else assert.equal(native.capturedSource,'');
    for(const mode of /** @type {const} */(['coo','sco','sno'])) {
      const transformed=obfuscateFiles(files,{
        mode,seed:'agent2-cross-module-call-protocol-'+mode+'-'+hostile,
        properties:false,strings:false,identifiers:true,closedWorld:true
      });
      const result=run(transformed.files.map(file=>({
        path:file.path,sourceType:'module',code:String(file.code)
      })));
      const stored=transformed.files.find(file=>file.path==='storage.mjs');
      assert.ok(stored);
      console.log('AGENT2_CROSS_MODULE_CALL '+JSON.stringify({
        mode,hostile,bindings:stored.metrics.bindings,
        nativeSource:native.capturedSource,emittedSource:result.capturedSource,
        parity:JSON.stringify(native)===JSON.stringify(result)
      }));
      assert.deepEqual(result,native,
        'A sibling module can change inherited call forwarding before a local default');
    }
  });
}
