'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src/core');
const {recoverSymbolKeys}=require('../sims/symbol-key-static-recover');

/** @type {Array<'coo'|'sno'|'sco'>} */
const MODES=['coo','sno','sco'];

/**
 * Observe JSON-compatible output for a CommonJS script in a genuine V8 realm.
 * @param {string} source
 * @returns {string}
 */
function run(source){
  const context=vm.createContext({module:{exports:undefined}});
  vm.runInContext(source,context,{filename:'private-class-symbol.cjs',timeout:2000});
  return JSON.stringify(context.module.exports);
}

/**
 * @param {string} source
 * @param {'coo'|'sno'|'sco'} mode
 * @returns {ReturnType<typeof obfuscateFiles>['files'][number]}
 */
function compile(source,mode){
  return obfuscateFiles([{
    path:'private-class-symbol.cjs',sourceType:'commonjs',code:source
  }],{mode,seed:'private-class-symbol-leaf-v1/'+mode,
    properties:true,experimentalSymbolKeys:true,
    identifiers:false,strings:false}).files[0];
}

const original=[
  "'use strict';",
  'const owner={secretAlpha:23,secretBeta:7};',
  'class Reader{read(){return owner.secretAlpha;}}',
  'const first=new Reader();',
  'const second=new Reader();',
  'module.exports=[first.read(),second.read(),owner.secretBeta];'
].join('\n');

for(const mode of MODES){
  test(mode+': private class leaf admits two native Symbol-key substitutions',()=>{
    const output=compile(original,mode);
    assert.equal(output.metrics.objects,1);
    assert.equal(output.metrics.properties,2);
    assert.equal(output.metrics.symbolKeys,2);
    assert.equal(run(/** @type {string} */(output.code)),run(original));
    assert.doesNotMatch(/** @type {string} */(output.code),/\bsecretAlpha\b|\bsecretBeta\b/u);
    assert.equal((/** @type {string} */(output.code).match(/=Symbol\(\)/gu)??[]).length,2);
    const recovered=recoverSymbolKeys(/** @type {string} */(output.code),'commonjs');
    assert.equal(recovered.keys,2,'Public source-only attacker recovers both Symbol fields');
    assert.equal(run(recovered.code),run(original),'Recovered standalone clone has full behavior');
  });
}

const visible=[
  "'use strict';",
  'const owner={secretAlpha:23,secretBeta:7};',
  'class Reader{read(){return owner.secretAlpha;}}',
  'const first=new Reader();',
  'module.exports=[first.read(),Reader.prototype.read.toString()];'
].join('\n');

for(const mode of MODES){
  test(mode+': visible class method preserves exact native source without Symbol lowering',()=>{
    const output=compile(visible,mode);
    assert.equal(output.metrics.properties,0);
    assert.equal(output.metrics.symbolKeys,0);
    assert.equal(run(/** @type {string} */(output.code)),run(visible));
  });
}
