'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,code:string,sourceType:'module'}} ModuleFile */

/**
 * A deterministic, source-closed ESM owner graph with distinct ownership,
 * alias, reflection, and dynamic-key paths. The direct case is a genuine
 * positive field-rewrite target; others are adversarial parity controls.
 * @param {number} seed
 * @param {string} shape
 * @returns {ModuleFile[]}
 */
function graph(seed,shape) {
  const left=(Math.imul(seed+11,0x9e3779b9)>>>0);
  const right=(Math.imul(seed+19,0x85ebca6b)>>>0);
  // Use a source-pinned 1-field positive record graph from the established
  // closed-world reader proof; an exported two-field object printed through
  // process.stdout is not itself an admitted positive-yield contract.
  if(shape==='direct')return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:'+left+'};'},
    {path:'record.mjs',sourceType:'module',code:[
      "const schema={externalFormat:'audit-v1',auditCount:3};",
      'export function inspectRecord(key){',
      '  return {keys:Reflect.ownKeys(schema).sort(),',
      '    value:schema[key],',
      '    enumerable:Object.getOwnPropertyDescriptor(schema,"externalFormat")?.enumerable===true};',
      '}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      "import {state} from './state.mjs';",
      "import {inspectRecord} from './record.mjs';",
      "const result=[inspectRecord('externalFormat'),inspectRecord('auditCount')];",
      'console.log(JSON.stringify([state.secretField,result]));'
    ].join('\n')}
  ];
  /** @type {ModuleFile[]} */
  const files=[{
    path:'owner.mjs',sourceType:'module',
    code:'export const record={secretField:'+left+',auxiliaryField:'+right+'};'
  }];
  /** @type {string[]} */
  const statements=["import {record} from './owner.mjs';"];
  if(shape==='repeated-alias'){
    statements.push('const first=record;const second=first;');
    statements.push('const outcome=[second.secretField,record.auxiliaryField];');
  }else if(shape==='identity-import'){
    files.push({path:'relay.mjs',sourceType:'module',
      code:'export function identity(value){return value;}'});
    statements.push("import {identity} from './relay.mjs';");
    statements.push('const returned=identity(record);');
    statements.push('const outcome=[returned.secretField,record.auxiliaryField];');
  }else if(shape==='returned-owner'){
    files.push({path:'relay.mjs',sourceType:'module',code:[
      "import {record} from './owner.mjs';",
      'export function owner(){return record;}'
    ].join('\n')});
    statements.push("import {owner} from './relay.mjs';");
    statements.push('const outcome=[owner().secretField,owner().auxiliaryField];');
  }else if(shape==='computed-key'){
    statements.push("const key=['secret','Field'].join('');");
    statements.push('const outcome=[record[key],record.auxiliaryField];');
  }else if(shape==='own-keys'){
    statements.push('const outcome=[Object.keys(record),record.secretField];');
  }else if(shape==='descriptor'){
    statements.push("const property=Object.getOwnPropertyDescriptor(record,'secretField');");
    statements.push('const outcome=[property.value,property.enumerable,record.auxiliaryField];');
  }else if(shape==='external-observer'){
    statements.push('const outcome=[globalThis.EXTERNAL_OBSERVER(record),record.secretField];');
  }else if(shape==='proxy-reflection'){
    statements.push("const wrapped=new Proxy(record,{get:(owner,key)=>Reflect.get(owner,key)});");
    statements.push('const outcome=[Reflect.ownKeys(wrapped),wrapped.secretField];');
  }else throw new TypeError('Unknown graph shape: '+shape);
  statements.push('process.stdout.write(JSON.stringify(outcome)+"\\n");');
  files.push({path:'entry.mjs',sourceType:'module',code:statements.join('\n')});
  return files;
}

/**
 * Execute each graph in a fresh real Node ESM loader, not by evaluating
 * transformed snippets inside the obfuscator process.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @param {boolean} [withHost]
 * @returns {Promise<string>}
 */
async function execute(files,withHost=false) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-agent20-prop-flow-'));
  try {
    for(const file of files){
      const target=path.join(dir,file.path);
      await fs.mkdir(path.dirname(target),{recursive:true});
      await fs.writeFile(target,file.code);
    }
    const preloader=path.join(dir,'host.cjs');
    if(withHost)await fs.writeFile(preloader,
      'globalThis.EXTERNAL_OBSERVER=(value)=>Object.keys(value).sort();');
    const args=withHost?['--require',preloader,path.join(dir,'entry.mjs')]:
      [path.join(dir,'entry.mjs')];
    const run=spawnSync(process.execPath,args,{
      encoding:'utf8',timeout:10000
    });
    assert.equal(run.status,0,'Real Node ESM loader failed: '+run.stderr);
    assert.equal(run.stderr,'');
    return run.stdout;
  }finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
}

test('cross-file ESM owner alias/return/reflection matrix preserves real Node semantics',async()=>{
  /** @type {Array<'coo'|'sno'|'sco'>} */
  const modes=['coo','sno','sco'];
  const shapes=[
    'direct','repeated-alias','identity-import','returned-owner',
    'computed-key','own-keys','descriptor','proxy-reflection',
    'external-observer'
  ];
  const seeds=[0,1,7,65537];
  /** @type {Record<string,number>} */
  const positive={coo:0,sno:0,sco:0};
  let comparisons=0;
  for(const shape of shapes){
    for(const seed of seeds){
      const files=graph(seed,shape);
      const withHost=shape==='external-observer';
      const native=await execute(files,withHost);
      assert.notEqual(native,'');
      for(const mode of modes){
        const compiled=obfuscateFiles(files,{
          mode,seed:'agent20-flow-matrix/'+shape+'/'+seed,
          closedWorld:true,strings:false,identifiers:false,properties:true
        });
        assert.equal(compiled.files.length,files.length);
        const changed=await execute(compiled.files,withHost);
        assert.equal(changed,native,mode+' '+shape+' '+seed+
          ' real ESM output mismatch');
        if(shape==='direct')positive[mode]+=compiled.crossFile.properties;
        if(shape==='external-observer')assert.equal(compiled.crossFile.properties,0,
          'Opaque host callback can reflect private owner keys');
        comparisons++;
      }
    }
  }
  // A safety-only no-op compiler trivially passes parity checks. Require
  // nonzero private-field renaming separately from adversarial refusals.
  for(const mode of modes)
    assert.ok(positive[mode]>0,mode+' failed to rewrite any positive owner field');
  assert.equal(comparisons,modes.length*shapes.length*seeds.length);
});
