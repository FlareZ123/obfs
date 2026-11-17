'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src/core');
const {atomicWrite}=require('../src/atomic');
const {normalizePublicIsland}=require('../sims/source-island-public-normalizer');

/** @typedef {import('../src/core').SourceFile} SourceFile */
/** @typedef {{index:number,key:string,alternate:string,value:string|number|boolean|null,
 * alternateValue:string|number|boolean|null,computed:boolean}} Variant */

/** @type {Variant[]} */
const VARIANTS=[
  {index:0,key:'alpha',alternate:'beta',value:23,alternateValue:17,computed:false},
  {index:1,key:'secret_field',alternate:'other_field',value:0,alternateValue:true,computed:true},
  {index:2,key:'π',alternate:'Ω',value:'π-value',alternateValue:false,computed:false},
  {index:3,key:'文',alternate:'字',value:null,alternateValue:'word',computed:true},
  {index:4,key:'with spaces',alternate:'quote\"',value:'foo',alternateValue:8,computed:true},
  {index:5,key:'x-y',alternate:'z/w',value:false,alternateValue:64,computed:true},
  {index:6,key:'field0',alternate:'field9',value:true,alternateValue:0,computed:false},
  {index:7,key:'number',alternate:'sibling',value:98247,alternateValue:'v',computed:true},
  {index:8,key:'🙂',alternate:'💡',value:'emoji',alternateValue:'signal',computed:true},
  {index:9,key:'k0',alternate:'k1',value:4,alternateValue:0,computed:true},
  {index:10,key:'_pdeadbeef',alternate:'x2',value:7,alternateValue:'safe',computed:false},
  {index:11,key:'literal\\slash',alternate:'apostrophe\'',value:'\\t',alternateValue:null,computed:true}
];

/** @param {Variant} item @returns {SourceFile[]} */
function makeFiles(item) {
  const owner=JSON.stringify(item.key);
  const other=JSON.stringify(item.alternate);
  const access=item.computed ? 'recordB['+owner+']' : 'recordB.'+item.key;
  return [
    {path:'watched.mjs',sourceType:'module',
      code:'const recordA={privateA:17};const valueA=recordA.privateA;export function watched(){return valueA;}'},
    {path:'independent.mjs',sourceType:'module',
      code:'const recordB={'+owner+':'+JSON.stringify(item.value)+','+
        other+':'+JSON.stringify(item.alternateValue)+'};'+
        'const valueB='+access+';export function unrelated(){return valueB;}'},
    {path:'entry.mjs',sourceType:'module',
      code:'import {watched} from "./watched.mjs";'+
        'import {unrelated} from "./independent.mjs";'+
        'console.log(JSON.stringify({source:watched.toString(),value:unrelated()}));'}
  ];
}

/**
 * @param {SourceFile[]} files
 * @returns {Promise<string>}
 */
async function run(files) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-island-grid-'));
  try {
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(root,'entry.mjs')],{
      cwd:root,encoding:'utf8',timeout:10000
    });
    assert.equal(child.status,0,child.stderr || child.error?.message);
    return child.stdout.trim();
  }finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('12 held-out primitive-own-record ESM cases retain source parity across COO/SCO/SNO and public normalization',async ()=>{
  let protectedFields=0;
  let normalizedFields=0;
  let cases=0;
  for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
    for(const variant of VARIANTS) {
      const files=makeFiles(variant);
      const native=await run(files);
      const result=obfuscateFiles(files,{
        mode,closedWorld:true,seed:'island-held-out-'+variant.index+'-'+mode,
        strings:false,identifiers:false,experimentalSourceObserverIslands:['independent.mjs']
      });
      const leaf=result.files.find(f=>f.path==='independent.mjs');
      const watched=result.files.find(f=>f.path==='watched.mjs');
      const entry=result.files.find(f=>f.path==='entry.mjs');
      assert.ok(leaf && typeof leaf.code==='string');
      assert.equal(leaf.metrics.properties,2,mode+' / '+variant.index);
      assert.equal(watched?.code,files[0].code);
      assert.equal(entry?.code,files[2].code);
      const transformed=await run(result.files);
      assert.equal(transformed,native,mode+' / '+variant.index+' transformed mismatch');
      const attack=normalizePublicIsland(/** @type {string} */(leaf.code));
      assert.equal(attack.properties,2,mode+' / '+variant.index);
      const reconstructed=result.files.map(f=>f.path==='independent.mjs' ?
        {...f,code:attack.code} : f);
      assert.equal(await run(reconstructed),native,
        mode+' / '+variant.index+' public normalizer mismatch');
      assert.deepEqual(JSON.parse(native),{
        source:'function watched(){return valueA;}',value:variant.value
      });
      protectedFields+=leaf.metrics.properties;
      normalizedFields+=attack.properties;
      cases++;
    }
  }
  assert.equal(cases,36);
  assert.equal(protectedFields,72);
  assert.equal(normalizedFields,protectedFields);
  console.log('SOURCE_ISLAND_HELDOUT '+JSON.stringify({
    cases,protectedFields,normalizedFields,modeCount:3
  }));
});
