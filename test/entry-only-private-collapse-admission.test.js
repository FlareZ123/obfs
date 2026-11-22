'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

const OWNER='const privateOwner={hiddenFirst:7,hiddenSecond:5};'+
  'const readPrivate=value=>value.hiddenFirst+value.hiddenSecond;';
const ENTRY='export function publicRun(n){return work(n);}'+
  'function work(n){let total=0;for(let i=0;i<n;i++)total+=readPrivate(privateOwner);return total;}';
const COLLAPSED=OWNER+'\n'+ENTRY;

/** @param {string} source @param {string} name */
async function load(source,name) {
  const specifier='data:text/javascript;base64,'+Buffer.from(source).toString('base64')+
    '#'+name;
  return await import(specifier);
}

test('entry-only ESM private collapse admits safe local property rewriting',async()=>{
  const result=obfuscateFiles([{
    path:'collapsed.mjs',sourceType:'module',code:COLLAPSED
  }],{
    mode:'coo',seed:'closedworld-entry-only-collapse-20261122',
    closedWorld:true,identifiers:false,strings:false,properties:true
  });
  const file=result.files[0];
  const emitted=String(file.code);
  assert.ok(file.metrics.properties>=2,
    'The private owner fields must actually be transformed: '+emitted);
  assert.doesNotMatch(emitted,/\bhiddenFirst\b|\bhiddenSecond\b/u);
  const original=await load(COLLAPSED,'original');
  const obfuscated=await load(emitted,'obfuscated');
  assert.equal(typeof original.publicRun,'function');
  assert.equal(typeof obfuscated.publicRun,'function');
  assert.equal(original.publicRun(1000),12000);
  assert.equal(obfuscated.publicRun(1000),12000);
  assert.equal(String(obfuscated.publicRun),String(original.publicRun),
    'The entry-only public function source must remain byte-identical');
  process.stdout.write('PRIVATE_COLLAPSED_ESM_ADMISSION '+JSON.stringify({
    localProperties:file.metrics.properties,
    nativeValue:original.publicRun(1000),emittedValue:obfuscated.publicRun(1000),
    publicCallableSourceIdentical:true,originalFiles:2,outputFiles:1
  })+'\n');
});
