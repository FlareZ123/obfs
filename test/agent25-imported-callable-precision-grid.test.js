'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');

/** @typedef {import('../src/core').SourceFile} SourceFile */
/** @typedef {{name:string,code:string}} Shape */

const shapes=[
  {name:'direct-invoke',code:'console.log(inspect());'},
  {name:'local-helper-arg',code:
    'function invoke(fn){return fn();}console.log(invoke(inspect));'},
  {name:'transitive-helper-arg',code:
    'function invoke(fn){return fn();}function relay(fn){return invoke(fn);}console.log(relay(inspect));'},
  {name:'local-constant-call-alias',code:
    'const cb=inspect;console.log(cb());'},
  {name:'locally-contained-record-call',code:
    'const box={fn:inspect};console.log(box.fn());'}
];

/** @param {Shape} shape @returns {SourceFile[]} */
function graph(shape){
  return [
    {path:'logic.mjs',sourceType:'module',
      code:'const owner={secretField:57};export function inspect(){return owner.secretField;}'},
    {path:'entry.mjs',sourceType:'module',
      code:'import {inspect} from "./logic.mjs";'+shape.code}
  ];
}

/** @param {SourceFile[]} files @returns {Promise<number>} */
async function execute(files){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-callable-precision-'));
  try{
    for(const file of files)await fs.writeFile(path.join(dir,file.path),file.code);
    const r=spawnSync(process.execPath,[path.join(dir,'entry.mjs')],{
      encoding:'utf8',timeout:10000
    });
    if(r.error)throw r.error;
    assert.equal(r.status,0,r.stderr);
    return Number(r.stdout.trim());
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

for(const shape of shapes){
  test('non-escaping callable import retains private key rename: '+shape.name,async()=>{
    const originals=graph(shape);
    const candidate=obfuscateFiles(originals,{
      mode:'coo',closedWorld:true,
      seed:'agent25-safe-callable-precision-'+shape.name,
      properties:true,identifiers:false,strings:false
    });
    assert.equal(await execute(originals),57);
    assert.equal(await execute(/** @type {SourceFile[]} */(candidate.files)),57);
    const changed=candidate.files.find(f=>f.path==='logic.mjs');
    assert.ok(changed&&changed.metrics.properties>=1,
      'A closed-world consumer that only calls a nonescaping function must retain real private-field rewriting');
    assert.ok(!String(changed.code).includes('secretField'),
      'Prove actual protected source has been transformed, not merely counted');
  });
}
