'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {reconstructPublicMath}=require('../sims/polyvariant-app-static-clone');

test('source-only reconstructed native math replaces the published COO module in a full offline ESM application',async()=>{
  const publishedRoot=path.join(__dirname,'../examples/polyvariant-app/generated');
  const originalRoot=path.join(__dirname,'../examples/polyvariant-app/native');
  // Reconstruction receives ONLY published math. Original source is consulted
  // afterward as a held-out, independent test oracle.
  const distributedMath=await fs.readFile(path.join(publishedRoot,'math.mjs'),'utf8');
  const recovered=reconstructPublicMath(distributedMath);
  assert.deepEqual(recovered.functions.map(item=>item.name),['round1','round2','round3']);
  assert.ok(recovered.functions.every(item=>item.paths===2));
  assert.notEqual(recovered.code,distributedMath);
  assert.ok(recovered.reconstructedBytes<recovered.publishedBytes);
  assert.doesNotMatch(recovered.code,/_af_[a-f0-9]{14}|_ap_input_[a-f0-9]{14}/u);
  assert.match(recovered.code,/export function digest/u);

  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-static-rebuilt-app-'));
  try {
    // Clone reads the public entry and state files, but no published
    // protected-function implementation is available in its runtime graph.
    for(const name of ['state.mjs','entry.mjs']){
      const source=await fs.readFile(path.join(publishedRoot,name),'utf8');
      await atomicWrite(path.join(root,name),source);
    }
    await atomicWrite(path.join(root,'math.mjs'),recovered.code);
    const [native,published,rebuilt,nativeMath,publishedMath,rebuiltMath]=await Promise.all([
      import(pathToFileURL(path.join(originalRoot,'entry.mjs')).href),
      import(pathToFileURL(path.join(publishedRoot,'entry.mjs')).href),
      import(pathToFileURL(path.join(root,'entry.mjs')).href),
      import(pathToFileURL(path.join(originalRoot,'math.mjs')).href),
      import(pathToFileURL(path.join(publishedRoot,'math.mjs')).href),
      import(pathToFileURL(path.join(root,'math.mjs')).href)
    ]);

    const boundary=[-2147483648,-2147483647,-1,0,1,2,2147483646,2147483647,
      0x12345678|0,-0];
    let typedChecks=0;
    for(const name of ['round1','round2','round3']){
      for(let i=0;i<4096;i++){
        const value=i<boundary.length?boundary[i]:
          Math.imul((i^0x5a8c31ed)|0,0x9e3779b1)|0;
        const expected=nativeMath[name](value);
        assert.ok(Object.is(publishedMath[name](value),expected),
          'published typed '+name+'/'+i);
        assert.ok(Object.is(rebuiltMath[name](value),expected),
          'rebuilt typed '+name+'/'+i);
        typedChecks++;
      }
    }

    let seed=0x21a3b4c5;
    /** @returns {number} */
    const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return seed;};
    let sessions=0,events=0;
    for(let trial=0;trial<96;trial++){
      const count=1+(next()>>>0)%24;
      const records=[];
      for(let i=0;i<count;i++){
        const kind=['open','tick','résumé','終','close','pause'][(next()>>>0)%6];
        const integer=next();
        records.push({
          kind,
          payload:(i%3===0?String(integer):i%3===1?'β終'+integer:integer)
        });
      }
      const initial=next();
      const nativeTrace=[],publishedTrace=[],rebuiltTrace=[];
      const expected=native.runScenario(initial,records,{
        emit(value){nativeTrace.push(value);}
      });
      const distributed=published.runScenario(initial,records,{
        emit(value){publishedTrace.push(value);}
      });
      const actual=rebuilt.runScenario(initial,records,{
        emit(value){rebuiltTrace.push(value);}
      });
      assert.equal(distributed,expected,'published trial '+trial);
      assert.equal(actual,expected,'rebuilt trial '+trial);
      assert.deepEqual(publishedTrace,nativeTrace,'published host trace '+trial);
      assert.deepEqual(rebuiltTrace,nativeTrace,'rebuilt host trace '+trial);
      assert.equal(rebuiltTrace.length,count);
      sessions++;
      events+=count;
    }
    assert.equal(typedChecks,12288);
    assert.equal(sessions,96);
    console.log('STATIC_POLYVARIANT_APP_REBUILD '+JSON.stringify({
      recoveredFunctions:recovered.functions,
      publishedBytes:recovered.publishedBytes,
      reconstructedBytes:recovered.reconstructedBytes,
      attackerParseMs:recovered.attackMs,
      typedChecks,sessions,events,
      rebuiltUsesPublishedProtectedFunctions:false
    }));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
