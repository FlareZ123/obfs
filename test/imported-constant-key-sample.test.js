'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {neutralizeHashedNames}=require('../sims/offline-normalize');
const {atomicWrite}=require('../src/atomic');

const root=path.join(__dirname,'..','examples','imported-constant-key');
const names=['state.mjs','main.mjs'];
/** @param {'before'|'after'} variant @returns {{path:string,sourceType:'module',code:string}[]} */
function sources(variant) {
  return names.map(name=>({path:name,sourceType:'module',
    code:readFileSync(path.join(root,variant,name),'utf8')}));
}

/** @param {ReturnType<typeof sources>} files @returns {Promise<{status:number|null,stdout:string,stderr:string}>} */
async function run(files) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-key-sample-'));
  try {
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const processResult=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{encoding:'utf8'});
    return {status:processResult.status,stdout:processResult.stdout,stderr:processResult.stderr};
  } finally {await fs.rm(dir,{recursive:true,force:true});}
}

test('published COO owner and imported key are exactly current compiler output',()=>{
  const input=sources('before');
  const output=obfuscateFiles(input,{mode:'coo',closedWorld:true,
    seed:'imported-constant-key-sample',strings:false,identifiers:false});
  assert.equal(output.crossFile.objects,1);
  assert.equal(output.crossFile.properties,2);
  assert.deepEqual(output.files.map(file=>file.code),sources('after').map(file=>file.code));
});

test('real original and generated ESM graph preserve import and global key contracts',async()=>{
  const original=await run(sources('before'));
  const compiled=await run(sources('after'));
  assert.equal(original.status,0,original.stderr);
  assert.equal(compiled.status,0,compiled.stderr);
  assert.equal(compiled.stdout,original.stdout);
  assert.equal(original.stdout.trim(),'11 12');
  const after=sources('after');
  assert.match(after[0].code,/_p[a-f0-9]{12}/u);
  assert.match(after[1].code,/globalThis\.secretField=12/u);
  assert.match(after[1].code,/globalThis\[property\]/u);
  assert.doesNotMatch(after[1].code,/alias\[property\]/u);
});

test('seedless attacker normalizes the two hashed ESM fields without original sources',async()=>{
  const original=await run(sources('before'));
  const attack=neutralizeHashedNames(sources('after'));
  assert.equal(attack.properties,2);
  assert.equal(await run(/** @type {ReturnType<typeof sources>} */ (attack.files)).then(
    result=>result.stdout),original.stdout);
});
