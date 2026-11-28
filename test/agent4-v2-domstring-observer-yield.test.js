'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource,hasWeakMapPrototypeExposure}=require('../src/ast');

const storage=[
  'const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem");',
  'const captured=new WeakMap();',
  'function inspect(){const privateLocal=29;return privateLocal;}',
  'export function sample(){',
  '  Object.defineProperty(Storage.prototype,"setItem",{',
  '    ...descriptor,value:function(_key,value){captured.set(this,value);}',
  '  });',
  '  localStorage.setItem("k",inspect);',
  '  return inspect();',
  '}'
].join('\n');
const entry="import './mutate.mjs';\nexport {sample} from './storage.mjs';";
const runner=[
  'class Storage {',
  '  constructor(){this.data=new Map();}',
  '  setItem(key,value){this.data.set(String(key),String(value));}',
  '}',
  'globalThis.Storage=Storage;',
  'globalThis.localStorage=new Storage();',
  'let title="";globalThis.document={};',
  'Object.defineProperty(document,"title",{get(){return title;},set(value){title=String(value);}});',
  "const {sample}=await import('./entry.mjs');",
  'const result=sample();',
  'process.stdout.write(JSON.stringify({result,title})+"\\n");'
].join('\n');

/** @typedef {{path:string,sourceType:'module',code:string}} Source */
/**
 * @param {Source[]} files
 * @returns {{result:number,title:string}}
 */
function run(files) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-agent4-v2-dom-'));
  try {
    for(const file of files)fs.writeFileSync(path.join(dir,file.path),file.code,'utf8');
    fs.writeFileSync(path.join(dir,'runner.mjs'),runner,'utf8');
    const r=spawnSync(process.execPath,[path.join(dir,'runner.mjs')],{
      cwd:dir,encoding:'utf8',timeout:15000
    });
    assert.equal(r.status,0,r.stderr||r.error?.message);
    return JSON.parse(r.stdout);
  } finally {
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
const patch=[
  'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
  'const nativeSet=nativePrototype.set;',
  'nativePrototype.set=function(key,value){',
  '  document.title=value;',
  '  return Reflect.apply(nativeSet,this,[key,value]);',
  '};'
].join('\n');
const primitivePatch=patch.replace('document.title=value;','document.title=42;');

const cases=[
  {
    name:'ordinary-unreached-callback',
    setup:'class Ordinary{set(_k,_v){return this;}}const carrier={instance:new Ordinary()};\n'+patch,
    nativeObserved:false,expectYield:true
  },
  {
    name:'ordinary-unreached-primitive-callback',
    setup:'class Ordinary{set(_k,_v){return this;}}const carrier={instance:new Ordinary()};\n'+primitivePatch,
    nativeObserved:false,expectYield:true
  },
  {
    name:'ordinary-reached-source-callback',
    setup:'class Ordinary{set(_k,_v){return this;}}const carrier={instance:new Ordinary()};\n'+patch+
      '\nfunction local(){const localSecret=17;return localSecret;}carrier.instance.set("k",local);',
    nativeObserved:true,expectYield:false
  },
  {
    name:'shared-weakmap-reached-source-callback',
    setup:'const carrier={instance:new WeakMap()};\n'+patch,
    nativeObserved:true,expectYield:false
  }
];

for(const item of cases) {
  test('V2 DOMString setter callback reachability: '+item.name,()=>{
    const mutate=item.setup;
    const ast=parse(mutate,'module');
    const observed=observesFunctionSource(ast);
    const shared=hasWeakMapPrototypeExposure(ast);
    const files=[
      {path:'entry.mjs',sourceType:'module',code:entry},
      {path:'mutate.mjs',sourceType:'module',code:mutate},
      {path:'storage.mjs',sourceType:'module',code:storage}
    ];
    const native=run(files);
    const rows=[];
    for(const mode of ['coo','sco','sno']) {
      const transformed=obfuscateFiles(files,{
        mode,seed:'agent4-v2-dom-'+item.name+'-'+mode,
        properties:false,strings:false,identifiers:true,closedWorld:true
      });
      const out=run(transformed.files.map(file=>({
        path:file.path,sourceType:'module',code:String(file.code)
      })));
      const output=transformed.files.find(file=>file.path==='storage.mjs');
      assert.ok(output);
      rows.push({mode,bindings:output.metrics.bindings,output:out});
      assert.deepEqual(out,native,JSON.stringify({mode,item:item.name,native,out}));
      if(item.expectYield)
        assert.ok(output.metrics.bindings>0,
          'Parity-preserving unobserved function must retain identifier protection');
      else
        assert.equal(output.metrics.bindings,0,
          'Source-sensitive function must not be renamed without whole-graph proof');
    }
    if(item.nativeObserved)
      assert.match(native.title,/privateLocal|localSecret/u);
    else
      assert.equal(native.title,'');
    console.log('V2_DOM_REACH '+JSON.stringify({
      name:item.name,shared,observed,native,rows
    }));
  });
}
