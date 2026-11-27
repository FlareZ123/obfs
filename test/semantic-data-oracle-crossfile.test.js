'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {snapshotDataGraph}=require('../sims/semantic-data-oracle');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */
/** @type {Array<'coo'|'sno'|'sco'>} */
const modes=['coo','sno','sco'];

/** @param {string} expression @param {boolean} bridge @param {boolean} reflect @returns {ModuleFile[]} */
function graph(expression,bridge,reflect) {
  /** @type {ModuleFile[]} */
  const files=[{path:'state.mjs',sourceType:'module',
    code:'export const state={privateAlpha:'+expression+',privateBeta:7};'}];
  if(bridge) {
    files.push({path:'bridge.mjs',sourceType:'module',code:[
      "import {state} from './state.mjs';",
      'export const first=state.privateAlpha;',
      'export const second=state.privateAlpha;',
      'export const bias=state.privateBeta;'
    ].join('\n')});
    files.push({path:'entry.mjs',sourceType:'module',code:
      "import {first,second,bias} from './bridge.mjs';export const result=[first,second,bias];"});
  } else {
    files.push({path:'entry.mjs',sourceType:'module',code:
      "import {state} from './state.mjs';export const result=["+
      (reflect?'Object.keys(state),':'')+'state.privateAlpha,state.privateAlpha,state.privateBeta];'});
  }
  return files;
}

/**
 * The observer lives outside the source graph; it measures the declared export
 * contract after normal native Node ESM import, not internal private keys.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<unknown>}
 */
async function observe(files) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-exact-graph-'));
  try {
    for(const file of files)await fs.writeFile(path.join(root,file.path),file.code);
    const runner=[
      "const {pathToFileURL}=require('node:url');",
      "const {snapshotDataGraph}=require(process.argv[2]);",
      "(async()=>{const {result}=await import(pathToFileURL(process.argv[1]).href);",
      "process.stdout.write(JSON.stringify(snapshotDataGraph(result)));",
      "})().catch(error=>{console.error(error);process.exitCode=1;});"
    ].join('\n');
    const child=spawnSync(process.execPath,[
      '-e',runner,path.join(root,'entry.mjs'),require.resolve('../sims/semantic-data-oracle')
    ],{cwd:root,encoding:'utf8',timeout:15000});
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    return JSON.parse(child.stdout);
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

/** @type {Array<{label:string,expression:string,expected:unknown[],bridge:boolean,reflect:boolean}>} */
const cases=[
  {label:'positive-number',expression:'23',expected:[23,23,7],bridge:false,reflect:false},
  {label:'negative-zero',expression:'-0',expected:[-0,-0,7],bridge:false,reflect:false},
  {label:'nan',expression:'0/0',expected:[NaN,NaN,7],bridge:false,reflect:false},
  {label:'undefined',expression:'void 0',expected:[undefined,undefined,7],bridge:false,reflect:false},
  {label:'bigint',expression:'9007199254740993n',expected:[9007199254740993n,9007199254740993n,7],bridge:false,reflect:false},
  {label:'bridge-negative-zero',expression:'-0',expected:[-0,-0,7],bridge:true,reflect:false},
  {label:'bridge-bigint',expression:'9007199254740993n',expected:[9007199254740993n,9007199254740993n,7],bridge:true,reflect:false},
  {label:'own-key-observer',expression:'-0',expected:[['privateAlpha','privateBeta'],-0,-0,7],bridge:false,reflect:true}
];
const shared={publicValue:-0,publicNull:NaN};
cases.push({label:'shared-record',expression:'{publicValue:-0,publicNull:0/0}',
  expected:[shared,shared,7],bridge:false,reflect:false});
cases.push({label:'bridge-shared-record',expression:'{publicValue:-0,publicNull:0/0}',
  expected:[shared,shared,7],bridge:true,reflect:false});

test('native ESM exact declared-data contract across cross-file property configurations',async()=>{
  /** @type {Array<{label:string,mode:string,rewritten:number}>} */
  const rows=[];
  for(const c of cases){
    const files=graph(c.expression,c.bridge,c.reflect);
    const native=await observe(files);
    assert.deepEqual(native,snapshotDataGraph(c.expected),c.label+': independent expected native graph');
    for(const mode of modes){
      const compiled=obfuscateFiles(files,{mode,closedWorld:true,properties:true,
        strings:false,identifiers:false,seed:'exact-data-crossfile/'+c.label+'/'+mode});
      const emitted=await observe(compiled.files);
      assert.deepEqual(emitted,native,c.label+'/'+mode+': exact declared export parity');
      rows.push({label:c.label,mode,rewritten:compiled.crossFile.properties});
      if(c.reflect)assert.equal(compiled.crossFile.properties,0,
        c.label+'/'+mode+': own-key observer requires refusal');
    }
  }
  process.stdout.write('EXACT_CROSSFILE_DATA '+JSON.stringify(rows)+'\n');
  // Do not allow an all-refused corpus to count as transformed equivalence.
  assert.ok(rows.some(row=>row.label==='positive-number'&&row.rewritten>0),
    'At least one mode must actually rewrite the ordinary positive graph');
});
