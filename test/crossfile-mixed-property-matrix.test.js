'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/**
 * Construct a deterministic, closed six-module ESM property-flow matrix.
 * Every owner has a distinct key, preventing one unsafe case from masking
 * unrelated safe cases through an accidental shared property spelling.
 *
 * @returns {ModuleFile[]}
 */
function mixedGraph() {
  /** @type {string[][]} */
  const modules=Array.from({length:6},()=>[]);
  /** @type {string[][]} */
  const imported=Array.from({length:6},()=>[]);
  /** @type {string[]} */
  const observations=[];
  for(let i=0;i<96;i++) {
    const group=Math.floor(i/16);
    const record='record'+i;
    const returned='return'+i;
    const key='private'+i;
    const extra='other'+i;
    modules[group].push(
      `export const ${record}={${key}:${i+11},${extra}:${i*2+1}};`,
      `export function ${returned}(){return ${record};}`
    );
    imported[group].push(record,returned);
    // Proxy handlers must preserve observable dynamic property-key spellings.
    const read=[
      `${record}.${key}`,
      `${returned}().${key}`,
      `Reflect.get(${record},'${key}')`,
      `Object.keys(${record}).join('|')`,
      `Object.hasOwn(${record},'${key}')`,
      `(()=>{const k='${key}';return ${record}[k];})()`,
      `Object.getOwnPropertyDescriptor(${record},'${key}')?.value`,
      `JSON.stringify(${record})`,
      `Object.entries(${record}).map(p=>p.join(':')).join('|')`,
      `Reflect.ownKeys(${record}).map(String).join('|')`,
      `(()=>{const alias=${record};alias.${key}+=3;return ${record}.${key};})()`,
      `(()=>{const {${key}:value}=${record};return value;})()`,
      `(()=>{const receiver=Object.create(${record});return receiver.${key};})()`,
      `(()=>{const clone={...${record}};return clone.${key};})()`,
      `(()=>{const copy=Object.assign({},${record});return Object.keys(copy).join('|');})()`,
      `(()=>{const proxy=new Proxy(${record},{get(t,k,r){return String(k)+':'+Reflect.get(t,k,r)}});return proxy.${key};})()`
    ][i%16];
    observations.push(read);
  }
  /** @type {ModuleFile[]} */
  const files=modules.map((lines,index)=>({
    path:'owners-'+index+'.mjs',sourceType:'module',code:lines.join('\n')
  }));
  const imports=imported.map((names,index)=>
    `import {${names.join(',')}} from './owners-${index}.mjs';`);
  files.push({
    path:'entry.mjs',sourceType:'module',
    code:imports.join('\n')+'\nconsole.log(JSON.stringify([\n'+
      observations.join(',\n')+'\n]));\n'
  });
  return files;
}

/**
 * Execute unchanged .mjs source under the same real Node runtime as the
 * transformed source. Preserve exact stdout, exit code and stderr.
 *
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-cross-matrix-'));
  try {
    for(const file of files) {
      await atomicWrite(path.join(directory,file.path),file.code);
    }
    const result=spawnSync(process.execPath,[path.join(directory,'entry.mjs')],{
      encoding:'utf8',timeout:15000
    });
    if(result.error)throw result.error;
    return {status:result.status,stdout:result.stdout,stderr:result.stderr};
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

test('96-case six-module ESM reflection and alias matrix preserves native behavior',async()=>{
  const original=mixedGraph();
  const baseline=await execute(original);
  assert.equal(baseline.status,0,baseline.stderr);
  const parsed=JSON.parse(baseline.stdout);
  assert.equal(parsed.length,96);
  const transformed=obfuscateFiles(original,{
    mode:'coo',closedWorld:true,seed:'crossfile-mixed-96',
    identifiers:false,strings:false,properties:true
  });
  assert.ok(transformed.crossFile.properties>=1,
    'Mixed graph must retain at least one real cross-file property transformation');
  const actual=await execute(transformed.files);
  assert.deepEqual(actual,baseline,
    'Cross-module property preservation must include own-key and cloned-object observers');
});

test('mixed-graph refusal does not disable independent safe ESM field rewrites',async()=>{
  /** @type {ModuleFile[]} */
  const originals=[
    {path:'state.mjs',sourceType:'module',
      code:'export const state={firstPrivate:13,secondPrivate:29};'},
    {path:'entry.mjs',sourceType:'module',
      code:"import {state} from './state.mjs';console.log(state.firstPrivate+state.secondPrivate);"}
  ];
  const compiled=obfuscateFiles(originals,{
    mode:'coo',closedWorld:true,seed:'crossfile-positive-control',
    identifiers:false,strings:false,properties:true
  });
  assert.ok(compiled.crossFile.properties>=1,
    'Positive control must actually transform at least one proven property');
  assert.deepEqual(await execute(compiled.files),await execute(originals));
});
