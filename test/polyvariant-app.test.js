'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {build}=require('../examples/polyvariant-app/build.cjs');

test('frozen stateful multi-file COO app retains host callbacks, reflection and 96 held-out runs',async()=>{
  const result=await build();
  assert.equal(result.files.length,3);
  assert.equal(result.files[0].metrics.polyvariantFunctions,3);
  assert.equal(result.files[0].metrics.polyvariantPaths,6);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-polyvariant-app-'));
  try {
    for(const file of result.files)await atomicWrite(path.join(dir,file.path),file.code);
    const native=await import(pathToFileURL(path.join(__dirname,
      '../examples/polyvariant-app/native/entry.mjs')).href);
    const guarded=await import(pathToFileURL(path.join(dir,'entry.mjs')).href);
    let seed=0x4fd2ac19;
    /** @returns {number} */
    const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return seed;};
    let matched=0;
    for(let scenario=0;scenario<96;scenario++){
      const count=1+(next()>>>0)%14;
      const records=[];
      for(let index=0;index<count;index++)records.push({
        kind:['start','tick','pause','stop','résumé','unicode終'][((next()>>>0)%6)],
        payload:String(next())+':'+String.fromCharCode(65+((next()>>>0)%26))
      });
      const initial=next();
      const before=[],after=[];
      const a=native.runScenario(initial,records,{emit(record){before.push(record);}});
      const b=guarded.runScenario(initial,records,{emit(record){after.push(record);}});
      assert.equal(b,a,'scenario '+scenario+' functional output');
      assert.deepEqual(after,before,'scenario '+scenario+' external host API');
      const parsed=JSON.parse(b);
      assert.equal(parsed.output.length,count);
      assert.deepEqual(parsed.snapshot.visible,['serial','last','label']);
      assert.equal(parsed.snapshot.reflected,'live');
      assert.equal(parsed.snapshot.serial,count);
      matched++;
    }
    assert.equal(matched,96);
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
});
