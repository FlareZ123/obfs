'use strict';
// Native-only ESM reference for Agent 3's WeakMap carrier differential.
// node agents/agent50/weakmap-cfg-native-controls-20261127.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
/** @type {Array<[string,string,string,[boolean,boolean]]>} Expected nonshared, flag=true then false. */
const cases = [
  ['unknown-branch-preserves', 'const carrier={instance:new WeakMap()}; if(flag) carrier.instance=new Ordinary();', 'carrier.instance', [true,false]],
  ['both-branches-kill', 'const carrier={instance:new WeakMap()}; if(flag) carrier.instance=new Ordinary(); else carrier.instance=new Ordinary();', 'carrier.instance', [true,true]],
  ['finally-kills', 'const carrier={instance:new WeakMap()}; try{if(flag) throw 1;}catch{}finally{carrier.instance=new Ordinary();}', 'carrier.instance', [true,true]],
  ['catch-sees-prewrite', 'const carrier={instance:new WeakMap()}; try{carrier.instance=maybeThrow(flag);}catch{}', 'carrier.instance', [true,false]],
  ['alias-write-preserves', 'const carrier={instance:new WeakMap()}; const alias=carrier; if(flag) alias.instance=new Ordinary();', 'carrier.instance', [true,false]],
  ['alias-write-kills', 'const carrier={instance:new WeakMap()}; const alias=carrier; alias.instance=new Ordinary();', 'carrier.instance', [true,true]],
  ['switch-fallthrough-kills','const carrier={instance:new WeakMap()}; switch(+flag){case 0: carrier.instance=new WeakMap(); case 1: carrier.instance=new Ordinary();}', 'carrier.instance', [true,true]],
  ['switch-break-preserves','const carrier={instance:new WeakMap()}; switch(+flag){case 0: break; case 1: carrier.instance=new Ordinary();}', 'carrier.instance', [true,false]],
  ['rest-snapshot-preserves','const carrier={instance:new WeakMap(),drop:0}; const {drop,...rest}=carrier; carrier.instance=new Ordinary();','rest.instance',[false,false]],
  ['rest-snapshot-kills','const carrier={instance:new WeakMap(),drop:0}; carrier.instance=new Ordinary(); const {drop,...rest}=carrier;','rest.instance',[true,true]],
  ['function-outer-kills','const carrier={instance:new WeakMap()}; function replace(){carrier.instance=new Ordinary();} replace();','carrier.instance',[true,true]],
  ['function-conditional-preserves','const carrier={instance:new WeakMap()}; function replace(){if(flag) carrier.instance=new Ordinary();} replace();','carrier.instance',[true,false]],
];
const storage = `const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem");
const captured=new WeakMap();
function inspect(){const privateLocal=29;return privateLocal;}
function independent(){const independentLocal=7;return independentLocal;}
export function sample(){Object.defineProperty(Storage.prototype,"setItem",{...descriptor,value:function(_key,value){captured.set(this,value);}});localStorage.setItem("storage-prototype-override",inspect);return {value:inspect(),independent:independent()};}`;
const runner = `class Storage{constructor(){this.data=new Map();}setItem(key,value){this.data.set(String(key),String(value));}}
globalThis.Storage=Storage;globalThis.localStorage=new Storage();globalThis.flag=process.argv[2]==='true';let title='';globalThis.document={};Object.defineProperty(document,'title',{get(){return title;},set(value){title=String(value);}});const {sample,nativeShared}=await import('./entry.mjs');console.log(JSON.stringify({nativeShared,result:sample(),capturedSource:document.title}));`;
for (const [name,setup,access,expected] of cases) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'agent50-cfg-'));
  try {
    fs.writeFileSync(path.join(directory,'entry.mjs'), "export {nativeShared} from './mutate.mjs'; export {sample} from './storage.mjs';");
    fs.writeFileSync(path.join(directory,'storage.mjs'), storage);
    fs.writeFileSync(path.join(directory,'runner.mjs'), runner);
    fs.writeFileSync(path.join(directory,'mutate.mjs'), `class Ordinary{}; function maybeThrow(flag){if(!flag)throw 1;return new Ordinary();} ${setup}
const proto=Object.getPrototypeOf(${access});export const nativeShared=proto===WeakMap.prototype;const nativeSet=proto.set;proto.set=function(key,value){document.title=value;return Reflect.apply(nativeSet,this,[key,value]);};`);
    const actual=[true,false].map((flag,index)=>{
      const child=spawnSync(process.execPath,[path.join(directory,'runner.mjs'),String(flag)],{encoding:'utf8',timeout:15000});
      assert.equal(child.status,0,child.stderr||child.error?.message);
      const result=JSON.parse(child.stdout);
      assert.equal(!result.nativeShared,expected[index]);
      assert.deepEqual(result.result,{value:29,independent:7});
      assert.equal(result.capturedSource,result.nativeShared?'function inspect(){const privateLocal=29;return privateLocal;}':'');
      return result.nativeShared;
    });
    console.log(JSON.stringify({name,sharedWhenTrue:actual[0],sharedWhenFalse:actual[1]}));
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
}
console.log('24/24 native ESM prototype, exact source and value checks passed');
