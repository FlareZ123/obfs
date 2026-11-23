'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const path=require('node:path');
const {obfuscateFiles}=require('../src');

/**
 * Execute a CommonJS file group in a fresh realm, with a synchronous closed
 * relative-only loader. All JavaScript builtins are realm-local so mutating
 * String.fromCharCode cannot poison the test runner itself.
 * @param {Record<string,string>} files
 * @returns {unknown}
 */
function evaluate(files) {
  const context=vm.createContext({});
  /** @type {Map<string,{exports:unknown}>} */
  const cache=new Map();
  /** @param {string} filename @returns {unknown} */
  function load(filename) {
    const cached=cache.get(filename);
    if(cached)return cached.exports;
    const source=files[filename];
    if(typeof source!=='string')throw new Error('Missing module '+filename);
    const record={exports:{}};
    cache.set(filename,record);
    /** @type {(require:(specifier:string)=>unknown,module:{exports:unknown},exports:unknown)=>unknown} */
    const execute=vm.runInContext('(function(require,module,exports){\n'+
      source+'\n})',context,{timeout:2000});
    /** @param {string} specifier @returns {unknown} */
    const requireLocal=specifier=>{
      if(!specifier.startsWith('./'))throw new Error('Unsafe test specifier');
      const target=path.posix.normalize(path.posix.join(
        path.posix.dirname(filename),specifier));
      return load(target);
    };
    execute(requireLocal,record,record.exports);
    return record.exports;
  }
  return load('entry.cjs');
}

const entry='require("./poison.cjs"); module.exports=require("./target.cjs");';
const target='module.exports="DECODE_ME_PLEASE";';
const mutations=[
  {name:'direct String alias baseline',code:
    'const S=String; S.fromCharCode=function(){return "Q";};'},
  {name:'global ordinary property storing the intrinsic',code:
    'globalThis.aliasString=String; globalThis.aliasString.fromCharCode=function(){return "Q";};'},
  {name:'global getter returning the intrinsic',code:
    'Object.defineProperty(globalThis,"aliasString",{get(){return String;},configurable:true});'+
    'globalThis.aliasString.fromCharCode=function(){return "Q";};'},
  {name:'dynamic global indirect eval',code:
    'const key=["ev","al"].join("");globalThis[key]("String.fromCharCode=function(){return \'Q\'};");'},
  {name:'dynamic global Function constructor',code:
    'const key=["Fun","ction"].join("");globalThis[key]("String.fromCharCode=function(){return \'Q\'};")();'},
  {name:'captured dynamic global evaluator',code:
    'const key=["e","val"].join("");const call=globalThis[key];call("String.fromCharCode=function(){return \'Q\'};");'}
];

/** @param {'coo'|'sno'} mode @param {string} poison */
function compile(mode,poison) {
  return obfuscateFiles([
    {path:'entry.cjs',sourceType:'commonjs',code:entry},
    {path:'poison.cjs',sourceType:'commonjs',code:poison},
    {path:'target.cjs',sourceType:'commonjs',code:target}
  ],{mode,seed:'global-intrinsic-alias-observer',identifiers:false,
    properties:false,strings:true,closedWorld:true});
}

for(const mode of /** @type {const} */ (['coo','sno'])){
  for(const scenario of mutations){
    test(mode+' preserves CJS decoder semantics after '+scenario.name,()=>{
      const native={'entry.cjs':entry,'poison.cjs':scenario.code,'target.cjs':target};
      const result=compile(mode,scenario.code);
      const emitted=Object.fromEntries(result.files.map(file=>
        [file.path,String(file.code)]));
      const originalValue=evaluate(native);
      const compiledValue=evaluate(emitted);
      const count=result.files.reduce((sum,file)=>sum+file.metrics.literals,0);
      const targetLiterals=result.files.find(file=>file.path==='target.cjs')?.metrics.literals;
      assert.equal(compiledValue,originalValue,
        'String decoder changed output after intrinsic mutation; encoded literals='+count+
        '; emitted target='+emitted['target.cjs']);
      assert.equal(targetLiterals,0,
        'A later-target decoder must refuse after earlier intrinsic mutation');
    });
  }
}

test('CJS baseline without intrinsic mutation retains useful string encoding',()=>{
  const native={'entry.cjs':entry,'poison.cjs':'module.exports=1;','target.cjs':target};
  const result=compile('coo',native['poison.cjs']);
  const metrics=result.files.find(file=>file.path==='target.cjs')?.metrics;
  assert.ok(metrics&&metrics.literals>0,
    'The static group should still encode a private ordinary literal');
  const output=Object.fromEntries(result.files.map(file=>[file.path,String(file.code)]));
  assert.equal(evaluate(output),evaluate(native));
});
