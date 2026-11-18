'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {test}=require('node:test');
const {assertReviewedOpaqueAssets}=require('../src/reviewed-assets');

/**
 * Model the trusted indexed manifest contract independent of the implementation.
 * The build selects file records by their numeric indices and compares exact
 * paths and SHA-256 bytes, with no runtime source transformation.
 *
 * @typedef {{path:string,sourceType:string,code:Buffer|string}} FileRecord
 * @typedef {{path:string,sha256:string}} ReviewRecord
 * @param {Buffer|string} code
 * @returns {string}
 */
function hash(code){return createHash('sha256').update(code).digest('hex');}

/** @param {number} initial @returns {()=>number} */
function seeded(initial){
  let state=initial>>>0;
  return ()=>{
    state^=state<<13;
    state^=state>>>17;
    state^=state<<5;
    return state>>>0;
  };
}

/** @template T @param {()=>number} random @param {T[]} files @returns {T[]} */
function shuffled(random,files){
  const copy=files.slice();
  for(let index=copy.length-1;index>0;index--){
    const picked=random()%(index+1);
    [copy[index],copy[picked]]=[copy[picked],copy[index]];
  }
  return copy;
}

/** @param {FileRecord[]} files @returns {ReviewRecord[]} */
function manifest(files){
  return files.filter(file=>file.sourceType==='asset').map(file=>({
    path:file.path,sha256:hash(file.code)
  }));
}

test('256 seeded indexed-review corpora accept exact inputs and reject adversarial variants',()=>{
  const rand=seeded(0x25a551e);
  for(let trial=0;trial<256;trial++){
    const size=2+(rand()%12);
    /** @type {FileRecord[]} */
    const assets=[];
    for(let i=0;i<size;i++){
      const path='asset_'+trial+'_'+i+(rand()%2?'.css':'.txt');
      assets.push({path,sourceType:'asset',
        code:Buffer.from('asset-'+trial+'-'+i+'-'+(rand()>>>0).toString(16),'utf8')});
    }
    const reviewed=manifest(assets);
    const native=shuffled(rand,[...assets,{
      path:'main.cjs',sourceType:'commonjs',code:'module.exports=17;'
    }]);
    assert.doesNotThrow(()=>assertReviewedOpaqueAssets(native,shuffled(rand,reviewed)),
      'valid indexed inventory '+trial);

    const target=rand()%size;
    const first=assets[target];
    const other=assets[(target+1)%size];

    // A stale digest cannot authorize even a single modified byte.
    const stale=native.map(file=>file===first?{
      ...file,code:Buffer.from(file.code)
    }:file);
    const staleRecord=stale.find(file=>file.path===first.path);
    assert.ok(staleRecord&&Buffer.isBuffer(staleRecord.code));
    staleRecord.code[0]^=0x01;
    assert.throws(()=>assertReviewedOpaqueAssets(stale,reviewed),
      /Opaque asset differs from reviewed bytes/,'stale digest '+trial);

    // Duplicating one approved path does not compensate for a missing other.
    const duplicate=native.map(file=>file===other?first:file);
    assert.throws(()=>assertReviewedOpaqueAssets(duplicate,reviewed),
      /Duplicate published opaque asset path/,'duplicate path '+trial);

    const unreviewed=native.map(file=>file===first?
      {...file,path:'unreviewed_'+trial+'.txt'}:file);
    assert.throws(()=>assertReviewedOpaqueAssets(unreviewed,reviewed),
      /Opaque asset not in reviewedOpaqueAssets/,'unreviewed path '+trial);

    const extra=reviewed.concat({path:'extra_'+trial+'.css',
      sha256:hash('approved but never published')});
    assert.throws(()=>assertReviewedOpaqueAssets(native,extra),
      /unused or missing published asset/,'orphan approval '+trial);

    const cased=reviewed.map(record=>record.path===first.path?
      {...record,path:record.path.toUpperCase()}:record);
    assert.throws(()=>assertReviewedOpaqueAssets(native,cased),
      /Opaque asset not in reviewedOpaqueAssets/,'case alias '+trial);

    // Array iterators are caller-owned and cannot alter authority.
    const iteratorManifest=reviewed.slice();
    Object.defineProperty(iteratorManifest,Symbol.iterator,{
      value:function*(){yield {path:'unreviewed_'+trial+'.txt',
        sha256:hash('unreviewed data')};}
    });
    assert.throws(()=>assertReviewedOpaqueAssets(unreviewed,iteratorManifest),
      /Opaque asset not in reviewedOpaqueAssets/,'manifest iterator '+trial);

    const iteratorFiles=native.slice();
    Object.defineProperty(iteratorFiles,Symbol.iterator,{
      value:function*(){yield {path:'unreviewed_'+trial+'.txt',
        sourceType:'asset',code:Buffer.from('unreviewed data')};}
    });
    assert.doesNotThrow(()=>assertReviewedOpaqueAssets(iteratorFiles,reviewed),
      'valid indexed output despite forged iterator '+trial);
  }
});

test('128 seeded read-once record accessors cannot change reviewed identities mid-check',()=>{
  const rand=seeded(0x25fe11e);
  for(let trial=0;trial<128;trial++){
    const path='asset_'+trial+'.txt';
    const code=Buffer.from('approved-'+rand());
    const digest=hash(code);
    const file={path,sourceType:'asset',code};
    const reads={path:0,sha256:0};
    const review={
      get path(){return ++reads.path===1?path:'substituted.txt';},
      get sha256(){return ++reads.sha256===1?digest:hash('substituted');}
    };
    assert.doesNotThrow(()=>assertReviewedOpaqueAssets([file],[review]),'first read '+trial);
    assert.deepEqual(reads,{path:1,sha256:1},'exact accessor reads '+trial);

    const fileReads={path:0,sourceType:0,code:0};
    const dynamicFile={
      get path(){fileReads.path++;return path;},
      get sourceType(){fileReads.sourceType++;return 'asset';},
      get code(){fileReads.code++;return code;}
    };
    assert.doesNotThrow(()=>assertReviewedOpaqueAssets([dynamicFile],[{path,sha256:digest}]));
    assert.deepEqual(fileReads,{path:1,sourceType:1,code:1},'single output read '+trial);
  }
});
