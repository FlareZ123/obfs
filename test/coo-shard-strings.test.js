'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {shardTopLevelStrings}=require('../workplace/coo-shard-strings');

/** @param {{path:string,code:string}[]} files @param {string} root */
function writeGraph(files,root) {
  for(const file of files) {
    const destination=path.join(root,...file.path.split('/'));
    fs.mkdirSync(path.dirname(destination),{recursive:true});
    fs.writeFileSync(destination,file.code,'utf8');
  }
}

/** @param {string} file @returns {Promise<any>} */
async function esm(file) {
  return import(pathToFileURL(file).href);
}

/** @param {string} source @param {string} seed @returns {ReturnType<typeof shardTopLevelStrings>} */
function compile(source,seed) {
  return shardTopLevelStrings({path:'features/main.mjs',code:source,sourceType:'module'},
    {seed,names:['secret','label']});
}

/**
 * A source-only adversary can recover all string values from the three
 * public shard modules, without running the JS or knowing the build seed.
 * @param {ReturnType<typeof shardTopLevelStrings>} result
 * @returns {string[]}
 */
function offlineRecover(result) {
  const payload=result.files.find(f=>f.path.endsWith('.payload.mjs'));
  const mask=result.files.find(f=>f.path.endsWith('.mask.mjs'));
  const decoder=result.files.find(f=>f.path.endsWith('.decode.mjs'));
  assert.ok(payload&&mask&&decoder);
  /** @param {string} code @param {string} field @returns {any} */
  function extract(code,field) {
    const line=code.split('\n').find(value=>value.startsWith('export const '+field+'=') ||
      value.startsWith('const '+field+'='));
    assert.ok(line);
    return JSON.parse(line.slice(line.indexOf('=')+1,-1));
  }
  const a=/** @type {number[]} */ (extract(payload.code,'a'));
  const b=/** @type {number[]} */ (extract(mask.code,'b'));
  const ranges=/** @type {[number,number][]} */ (extract(decoder.code,'m'));
  const constants=/const p=(\d+),q=(\d+),o=(\d+),s=(\d+);/u.exec(decoder.code);
  assert.ok(constants);
  const [step,shift,odd,salt]=constants.slice(1).map(Number);
  return ranges.map(([start,length])=>{
    let value='';
    for(let i=0;i<length;i++){
      const at=start+i;
      const index=(at*step+shift)%a.length;
      value+=String.fromCharCode((a[index]^b[index]^((at*odd+salt)&65535))&65535);
    }
    return value;
  });
}

test('two public COO shard modules preserve ESM exports and exact UTF-16 values',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'obfs31-shards-'));
  try {
    const secret='Private license phrase: \u0000\ud800\udfff☀️';
    const label='Feature-Matrix-Enabled';
    const source=[
      'export const secret='+JSON.stringify(secret)+';',
      'export const label='+JSON.stringify(label)+';',
      'export function observe(){return [secret,label,secret.length,label.length];}',
      ''
    ].join('\n');
    const compiled=compile(source,'interfile-shard-test-1');
    assert.equal(compiled.sharded,2);
    assert.equal(compiled.codeUnits,secret.length+label.length);
    assert.equal(compiled.files.length,4);
    assert.ok(!compiled.files.some(f=>f.code.includes(secret)));
    const nativeRoot=path.join(root,'native');
    const emittedRoot=path.join(root,'emitted');
    writeGraph([{path:'features/main.mjs',code:source}],nativeRoot);
    writeGraph(compiled.files,emittedRoot);
    const native=await esm(path.join(nativeRoot,'features','main.mjs'));
    const emitted=await esm(path.join(emittedRoot,'features','main.mjs'));
    assert.deepEqual(emitted.observe(),native.observe());
    assert.equal(emitted.secret,secret);
    assert.equal(emitted.label,label);
    // This is a negative static-security control, required by the threat model:
    // a client receiving all emitted files can recover every encoded string.
    assert.deepEqual(offlineRecover(compiled),[secret,label]);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('seed diversity, deterministic output, and safe selected-binding scope',()=>{
  const source=[
    'export const secret="North";',
    'const label="south";',
    'function hidden(){const local="untouched";return local;}',
    'export {hidden};'
  ].join('\n');
  const a=compile(source,'seed/alpha');
  const b=compile(source,'seed/alpha');
  const c=compile(source,'seed/bravo');
  assert.deepEqual(a,b);
  assert.notDeepEqual(a.files.slice(1),c.files.slice(1));
  assert.equal(a.sharded,2);
  assert.deepEqual(offlineRecover(a),['North','south']);
  assert.deepEqual(offlineRecover(c),['North','south']);
  assert.match(a.files[0].code,/const local="untouched"/u);
});

test('unsupported cases decline rather than rewriting arbitrary JS',()=>{
  for(const source of [
    'const secret=1;export {secret};',
    'function inner(){const secret="hidden";return secret;}export {inner};',
    'const secret="";export {secret};',
    'export const secret="a";export const fn=()=>1;fn.toString();'
  ]) {
    const result=compile(source,'decline');
    assert.equal(result.sharded,0,source);
    assert.equal(result.files.length,1);
    assert.equal(result.files[0].code,source);
  }
});

test('invalid names, paths, and ESM metadata are rejected',()=>{
  const source='export const secret="canary";';
  for(const file of ['../up.mjs','C:/absolute.mjs','bad\\name.mjs','CON.mjs','index.js']) {
    assert.throws(()=>shardTopLevelStrings({path:file,code:source,sourceType:'module'},
      {seed:'valid',names:['secret']}),TypeError);
  }
  for(const options of [
    {seed:'',names:['secret']},{seed:'valid',names:[]},
    {seed:'valid',names:['a-b']},{seed:'valid',names:'secret'}
  ]) {
    assert.throws(()=>shardTopLevelStrings({path:'main.mjs',code:source,sourceType:'module'},
      /** @type {any} */ (options)),TypeError);
  }
});
