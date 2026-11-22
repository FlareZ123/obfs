'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/** @type {SourceFile} */
const watched={path:'watched.mjs',sourceType:'module',
  code:'const recordA={privateA:17};const valueA=recordA.privateA;export function watched(){return valueA;}'};
/** @type {SourceFile} */
const independent={path:'independent.mjs',sourceType:'module',
  code:'const recordB={privateB:23,otherB:19};const valueB=recordB.privateB;export function unrelated(){return valueB;}'};
/** @type {SourceFile} */
const another={path:'another.mjs',sourceType:'module',
  code:'const recordC={privateC:43};const valueC=recordC.privateC;export function third(){return valueC;}'};
/** @type {SourceFile} */
const entry={path:'entry.mjs',sourceType:'module',code:
  'import {watched} from "./watched.mjs";import {unrelated} from "./independent.mjs";'+
  'import {third} from "./another.mjs";console.log(JSON.stringify({source:watched.toString(),a:unrelated(),b:third()}));'};
const outside='import {unrelated} from "./independent.mjs";'+
  'console.log(JSON.stringify([Function.prototype.toString.call(unrelated),unrelated()]));';

/**
 * Write the compiled group plus a consumer that is intentionally not supplied
 * to the obfuscator, then run one of those modules.
 * @param {SourceFile[]} files
 * @param {string} scriptPath
 * @param {string} script
 * @returns {Promise<string>}
 */
async function execute(files,scriptPath,script) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-island-external-callable-'));
  try {
    for(const file of files) {
      const target=path.join(root,file.path);
      await fs.mkdir(path.dirname(target),{recursive:true});
      await fs.writeFile(target,String(file.code),'utf8');
    }
    const target=path.join(root,scriptPath);
    await fs.writeFile(target,script,'utf8');
    const child=spawnSync(process.execPath,[target],{cwd:root,encoding:'utf8',timeout:10000});
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return child.stdout.trim();
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}

for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
  test('primitive-leaf island preserves externally observed exported callable source: '+mode,async()=>{
    /** @type {SourceFile[]} */
    const originals=[watched,independent,another,entry];
    const options={mode,closedWorld:true,seed:'external-island-source-'+mode,strings:false,identifiers:false};
    const result=obfuscateFiles(originals,{
      ...options,experimentalSourceObserverIslands:['independent.mjs','another.mjs']
    });
    const byPath=new Map(result.files.map(file=>[file.path,file]));
    assert.ok((byPath.get('independent.mjs')?.metrics.properties??0)>=1,
      'the selected primitive leaf must undergo a genuine property rewrite');
    assert.ok((byPath.get('another.mjs')?.metrics.properties??0)>=1);
    assert.equal(result.crossFile.properties,0);
    assert.equal(result.files.reduce((n,file)=>n+file.metrics.bindings,0),0);
    assert.equal(result.files.reduce((n,file)=>n+file.metrics.literals,0),0);
    const expectedEntry=await execute(originals,'entry.mjs',entry.code);
    const actualEntry=await execute(result.files,'entry.mjs',entry.code);
    assert.equal(actualEntry,expectedEntry);
    const expectedExternal=await execute(originals,'outside.mjs',outside);
    const actualExternal=await execute(result.files,'outside.mjs',outside);
    assert.equal(actualExternal,expectedExternal,
      'external Function.prototype.toString.call must observe identical source');
    assert.equal(JSON.parse(actualExternal)[1],23);
    assert.equal(JSON.parse(actualExternal)[0],'function unrelated(){return valueB;}');
  });
}

module.exports={execute};
